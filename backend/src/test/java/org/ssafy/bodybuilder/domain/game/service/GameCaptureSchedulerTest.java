package org.ssafy.bodybuilder.domain.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ScheduledFuture;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameCapturingRequestPayload;
import org.ssafy.bodybuilder.domain.game.event.GameCaptureTimedOutEvent;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.util.PlayerPlacementAllocator;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.TaskScheduler;

@ExtendWith(MockitoExtension.class)
class GameCaptureSchedulerTest {

    @Mock TaskScheduler taskScheduler;
    @Mock GameMessagePublisher gameMessagePublisher;
    @Mock GameSessionRepository gameSessionRepository;
    @Mock ApplicationEventPublisher applicationEventPublisher;
    @Mock GameSessionEventRecorder gameSessionEventRecorder;
    @Mock ScheduledFuture<?> scheduledFuture;

    private GameCaptureScheduler gameCaptureScheduler;

    @BeforeEach
    void setUp() {
        gameCaptureScheduler = new GameCaptureScheduler(
                taskScheduler,
                gameMessagePublisher,
                gameSessionRepository,
                applicationEventPublisher,
                gameSessionEventRecorder
        );
    }

    @ParameterizedTest
    @MethodSource("playerCycles")
    void startsAfterFiveSecondsAndCyclesPlayersForFourRequests(
            List<Integer> playerNos,
            List<Integer> expectedPlayers
    ) {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        expectedPlayers = PlayerPlacementAllocator.allocate(gameSessionId, playerNos);
        ArgumentCaptor<Runnable> taskCaptor = ArgumentCaptor.forClass(Runnable.class);
        ArgumentCaptor<Instant> firstExecutionCaptor = ArgumentCaptor.forClass(Instant.class);
        Instant beforeStart = Instant.now();
        doReturn(scheduledFuture).when(taskScheduler).scheduleAtFixedRate(
                taskCaptor.capture(),
                firstExecutionCaptor.capture(),
                eq(Duration.ofMillis(3_600))
        );

        gameCaptureScheduler.start(
                roomSessionId,
                gameSessionId,
                playerNos
        );

        assertThat(firstExecutionCaptor.getValue())
                .isBetween(
                        beforeStart.plusSeconds(5),
                        Instant.now().plusSeconds(5)
                );

        Runnable captureTask = taskCaptor.getValue();
        captureTask.run();
        captureTask.run();
        captureTask.run();
        verify(scheduledFuture, never()).cancel(false);
        captureTask.run();

        ArgumentCaptor<GameCapturingRequestPayload> payloadCaptor =
                ArgumentCaptor.forClass(GameCapturingRequestPayload.class);
        verify(gameMessagePublisher, times(4)).publishGameMessage(
                eq(GameMessageType.GAME_CAPTURING_REQUEST),
                eq(roomSessionId),
                eq(gameSessionId),
                payloadCaptor.capture()
        );
        assertThat(payloadCaptor.getAllValues())
                .extracting(GameCapturingRequestPayload::player)
                .containsExactlyElementsOf(expectedPlayers);
        assertThat(payloadCaptor.getAllValues())
                .extracting(GameCapturingRequestPayload::captureNo)
                .containsExactly(1, 2, 3, 4);
        InOrder requestOrder = inOrder(gameSessionRepository, gameMessagePublisher);
        for (int index = 0; index < expectedPlayers.size(); index++) {
            int captureNo = index + 1;
            int playerNo = expectedPlayers.get(index);
            requestOrder.verify(gameSessionRepository).enqueueCaptureRequest(
                    gameSessionId,
                    playerNo,
                    captureNo
            );
            requestOrder.verify(gameMessagePublisher).publishGameMessage(
                    GameMessageType.GAME_CAPTURING_REQUEST,
                    roomSessionId,
                    gameSessionId,
                    new GameCapturingRequestPayload(
                            playerNo,
                            captureNo,
                            3_200
                    )
            );
        }
        verify(scheduledFuture).cancel(false);

        captureTask.run();
        verify(gameMessagePublisher, times(4))
                .publishGameMessage(any(), any(), any(), any());
        verify(scheduledFuture).cancel(false);
    }

    @Test
    void doesNotScheduleWithoutPlayers() {
        gameCaptureScheduler.start(
                UUID.randomUUID(),
                UUID.randomUUID(),
                List.of()
        );

        verify(taskScheduler, never()).scheduleAtFixedRate(
                any(Runnable.class),
                any(Instant.class),
                any(Duration.class)
        );
        verify(gameSessionRepository, never())
                .enqueueCaptureRequest(any(), any(), any());
    }

    @Test
    void acceptsCustomInitialDelayForAStartCutscene() {
        ArgumentCaptor<Instant> firstExecutionCaptor = ArgumentCaptor.forClass(Instant.class);
        Instant beforeStart = Instant.now();
        doReturn(scheduledFuture).when(taskScheduler).scheduleAtFixedRate(
                any(Runnable.class),
                firstExecutionCaptor.capture(),
                eq(Duration.ofMillis(3_600))
        );

        gameCaptureScheduler.start(
                UUID.randomUUID(),
                UUID.randomUUID(),
                List.of(1),
                16_000
        );

        assertThat(firstExecutionCaptor.getValue()).isBetween(
                beforeStart.plusSeconds(16),
                Instant.now().plusSeconds(16)
        );
    }

    @Test
    void resolvesMissingPoseAfterCaptureDurationAndGracePeriod() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        ArgumentCaptor<Runnable> requestCaptor =
                ArgumentCaptor.forClass(Runnable.class);
        ArgumentCaptor<Runnable> timeoutCaptor =
                ArgumentCaptor.forClass(Runnable.class);
        ArgumentCaptor<Instant> timeoutAtCaptor =
                ArgumentCaptor.forClass(Instant.class);
        doReturn(scheduledFuture).when(taskScheduler).scheduleAtFixedRate(
                requestCaptor.capture(),
                any(Instant.class),
                eq(Duration.ofMillis(3_600))
        );
        doReturn(scheduledFuture).when(taskScheduler).schedule(
                timeoutCaptor.capture(),
                timeoutAtCaptor.capture()
        );
        org.mockito.Mockito.when(
                gameSessionRepository.resolveTimedOutCapture(
                        gameSessionId,
                        1,
                        1
                )
        ).thenReturn(true);
        Instant beforeRequest = Instant.now();

        gameCaptureScheduler.start(
                roomSessionId,
                gameSessionId,
                List.of(1)
        );
        requestCaptor.getValue().run();
        timeoutCaptor.getValue().run();

        assertThat(timeoutAtCaptor.getValue()).isBetween(
                beforeRequest.plusMillis(4_200),
                Instant.now().plusMillis(4_200)
        );
        verify(gameSessionRepository).resolveTimedOutCapture(
                gameSessionId,
                1,
                1
        );
        verify(gameSessionEventRecorder).recordWarning(
                eq(gameSessionId),
                eq("POSE_CAPTURE_TIMED_OUT"),
                eq(GameMessageType.GAME_CAPTURING_RESPONSE),
                eq("INTERNAL"),
                eq("FAILED"),
                org.mockito.ArgumentMatchers.isNull(),
                eq(java.util.Map.of(
                        "captureNo", 1,
                        "playerNo", 1,
                        "primaryReason", "CLIENT_RESPONSE_NOT_RECEIVED"
                )),
                org.mockito.ArgumentMatchers.isNull(),
                org.mockito.ArgumentMatchers.isNull(),
                any()
        );
        verify(applicationEventPublisher).publishEvent(
                new GameCaptureTimedOutEvent(
                        roomSessionId,
                        gameSessionId
                )
        );
    }

    private static Stream<Arguments> playerCycles() {
        return Stream.of(
                Arguments.of(List.of(1), List.of(1, 1, 1, 1)),
                Arguments.of(List.of(1, 2), List.of(1, 2, 1, 2)),
                Arguments.of(List.of(1, 2, 3), List.of(1, 2, 3, 1)),
                Arguments.of(List.of(1, 2, 3, 4), List.of(1, 2, 3, 4))
        );
    }
}
