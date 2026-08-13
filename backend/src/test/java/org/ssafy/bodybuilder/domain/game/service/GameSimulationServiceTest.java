package org.ssafy.bodybuilder.domain.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ScheduledFuture;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameResultPayload;
import org.ssafy.bodybuilder.domain.game.message.payload.GameRoundStartPayload;
import org.ssafy.bodybuilder.domain.game.message.payload.GameSimulationPayload;
import org.ssafy.bodybuilder.domain.game.model.GameSimulationInput;
import org.ssafy.bodybuilder.domain.game.model.SimulationParticipant;
import org.ssafy.bodybuilder.domain.game.model.GameStatus;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsSimulator;
import org.ssafy.bodybuilder.domain.game.physics.SimulationResult;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.domain.record.model.StageRecord;
import org.ssafy.bodybuilder.domain.record.repository.StageRecordRepository;
import org.ssafy.bodybuilder.domain.record.repository.RoundRecordRepository;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionArchiveService;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;
import org.ssafy.bodybuilder.infra.logging.game.GameExecutionFailedEvent;
import org.ssafy.bodybuilder.infra.logging.game.GameRoundReplay;
import org.ssafy.bodybuilder.infra.logging.game.GameRoundReplayStore;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.TaskScheduler;

@ExtendWith(MockitoExtension.class)
class GameSimulationServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-29T00:01:00Z");
    private static final ZoneId ZONE_ID = ZoneId.of("Asia/Seoul");

    @Mock GameSessionRepository gameSessionRepository;
    @Mock StageRoundRepository stageRoundRepository;
    @Mock StageRepository stageRepository;
    @Mock WaterFlowBroadcastService waterFlowBroadcastService;
    @Mock PhysicsSimulator physicsSimulator;
    @Mock GameMessagePublisher gameMessagePublisher;
    @Mock GameCaptureScheduler gameCaptureScheduler;
    @Mock TaskScheduler taskScheduler;
    @Mock StageRecordRepository stageRecordRepository;
    @Mock RoundRecordRepository roundRecordRepository;
    @Mock RoomLockManager roomLockManager;
    @Mock RoomSessionRepository roomSessionRepository;
    @Mock GameSessionEventRecorder gameSessionEventRecorder;
    @Mock GameSessionArchiveService gameSessionArchiveService;
    @Mock GameRoundReplayStore gameRoundReplayStore;
    @Mock ApplicationEventPublisher applicationEventPublisher;
    @Mock ScheduledFuture<?> scheduledFuture;
    @Mock StageRound round;
    @Mock StageRound nextRound;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private Clock clock;
    private GameSimulationService gameSimulationService;

    @BeforeEach
    void setUp() {
        clock = Clock.fixed(NOW, ZONE_ID);
        lenient().when(roomLockManager.withLock(any(), any())).thenAnswer(invocation -> {
            Supplier<?> supplier = invocation.getArgument(1);
            return supplier.get();
        });
        gameSimulationService = new GameSimulationService(
                gameSessionRepository,
                stageRoundRepository,
                physicsSimulator,
                gameMessagePublisher,
                gameCaptureScheduler,
                taskScheduler,
                clock,
                stageRecordRepository,
                roundRecordRepository,
                roomLockManager,
                roomSessionRepository,
                gameSessionEventRecorder,
                gameSessionArchiveService,
                gameRoundReplayStore,
                applicationEventPublisher,
                stageRepository,
                waterFlowBroadcastService
        );
    }

    @Test
    void keepsSimulationClaimAndPublishesFailureEventWhenSimulationFails() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        GameSimulationInput input = input(1);
        RuntimeException failure = new RuntimeException("map lookup failed");
        when(gameSessionRepository.claimReadySimulation(roomSessionId, gameSessionId))
                .thenReturn(Optional.of(input));
        when(stageRoundRepository.findByStageIdAndRoundNo(1, 1))
                .thenThrow(failure);

        gameSimulationService.simulateIfReady(roomSessionId, gameSessionId);

        ArgumentCaptor<GameExecutionFailedEvent> eventCaptor =
                ArgumentCaptor.forClass(GameExecutionFailedEvent.class);
        verify(applicationEventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue()).isEqualTo(new GameExecutionFailedEvent(
                roomSessionId,
                gameSessionId,
                failure,
                "SIMULATION"
        ));
    }

    @Test
    void startsSecondRoundAfterSuccessfulFirstRoundPlayback() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        GameSimulationInput input = input(1);
        var currentMapConfig = objectMapper.createObjectNode();
        var nextMapConfig = objectMapper.createObjectNode();
        SimulationResult result = result(true);
        when(gameSessionRepository.claimReadySimulation(roomSessionId, gameSessionId))
                .thenReturn(Optional.of(input));
        when(stageRoundRepository.findByStageIdAndRoundNo(1, 1))
                .thenReturn(Optional.of(round));
        when(stageRoundRepository.findByStageIdAndRoundNo(1, 2))
                .thenReturn(Optional.of(nextRound));
        when(round.getMapConfig()).thenReturn(currentMapConfig);
        when(nextRound.getId()).thenReturn(2);
        when(nextRound.getRoundNo()).thenReturn(2);
        when(nextRound.getMapConfig()).thenReturn(nextMapConfig);
        when(physicsSimulator.simulate(currentMapConfig, input.poses()))
                .thenReturn(result);
        doReturn(scheduledFuture).when(taskScheduler)
                .schedule(any(Runnable.class), any(Instant.class));

        gameSimulationService.simulateIfReady(roomSessionId, gameSessionId);

        verify(gameMessagePublisher).publishGameMessage(
                GameMessageType.GAME_SIMULATING_RESPONSE,
                roomSessionId,
                gameSessionId,
                new GameSimulationPayload(
                        result.intervalMs(),
                        result.points(),
                        true,
                        result.grounded()
                )
        );
        verify(gameRoundReplayStore).save(
                gameSessionId,
                GameRoundReplay.of(
                        input.roundNo(),
                        input.poses(),
                        result.intervalMs(),
                        result.points(),
                        result.result()
                )
        );
        ArgumentCaptor<Instant> startAtCaptor = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Runnable> completionCaptor = ArgumentCaptor.forClass(Runnable.class);
        verify(taskScheduler).schedule(
                completionCaptor.capture(),
                startAtCaptor.capture()
        );
        assertThat(startAtCaptor.getValue()).isEqualTo(NOW.plusMillis(100));

        completionCaptor.getValue().run();

        verify(gameSessionRepository).moveToNextRound(
                gameSessionId,
                1,
                2,
                100L
        );
        verify(gameMessagePublisher).publishGameMessage(
                GameMessageType.GAME_ROUND_START_RESPONSE,
                roomSessionId,
                gameSessionId,
                GameRoundStartPayload.of(1, nextRound, List.of())
        );
        verify(gameCaptureScheduler).start(
                roomSessionId,
                gameSessionId,
                List.of(1, 2)
        );
        verify(gameSessionRepository, never()).finishGame(
                any(),
                any(),
                any()
        );
    }

    @Test
    void sendsOneStarResultWhenSecondRoundFails() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        GameSimulationInput input = input(2);
        SimulationResult result = result(false);
        Runnable completion = simulateAndCaptureCompletion(
                roomSessionId,
                gameSessionId,
                input,
                result
        );

        completion.run();

        LocalDateTime endedAt = LocalDateTime.ofInstant(NOW, ZONE_ID);
        verify(gameSessionRepository).finishGame(
                gameSessionId,
                GameStatus.FAILED,
                endedAt
        );
        verify(gameMessagePublisher).publishGameMessage(
                GameMessageType.GAME_RESULT_RESPONSE,
                roomSessionId,
                gameSessionId,
                new GameResultPayload(1, 200L, false)
        );
        assertSavedStageRecords(input, 200L, false);
        verify(gameSessionRepository, never())
                .moveToNextRound(any(), any(), any(), any());
        verify(gameCaptureScheduler, never()).start(any(), any(), any());
    }

    @Test
    void sendsThreeStarResultWhenThirdRoundSucceeds() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        GameSimulationInput input = input(3);
        SimulationResult result = result(true);
        Runnable completion = simulateAndCaptureCompletion(
                roomSessionId,
                gameSessionId,
                input,
                result
        );

        completion.run();

        LocalDateTime endedAt = LocalDateTime.ofInstant(NOW, ZONE_ID);
        verify(gameSessionRepository).finishGame(
                gameSessionId,
                GameStatus.CLEARED,
                endedAt
        );
        verify(gameMessagePublisher).publishGameMessage(
                GameMessageType.GAME_RESULT_RESPONSE,
                roomSessionId,
                gameSessionId,
                new GameResultPayload(3, 300L, true)
        );
        assertSavedStageRecords(input, 300L, true);
        verify(stageRoundRepository, never()).findByStageIdAndRoundNo(1, 4);
    }

    @Test
    void doesNothingUntilAllFourPosesAreReady() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        when(gameSessionRepository.claimReadySimulation(roomSessionId, gameSessionId))
                .thenReturn(Optional.empty());

        gameSimulationService.simulateIfReady(roomSessionId, gameSessionId);

        verify(gameMessagePublisher, never())
                .publishGameMessage(any(), any(), any(), any());
        verify(taskScheduler, never()).schedule(
                any(Runnable.class),
                any(Instant.class)
        );
    }

    private Runnable simulateAndCaptureCompletion(
            UUID roomSessionId,
            UUID gameSessionId,
            GameSimulationInput input,
            SimulationResult result
    ) {
        var mapConfig = objectMapper.createObjectNode();
        when(gameSessionRepository.claimReadySimulation(roomSessionId, gameSessionId))
                .thenReturn(Optional.of(input));
        when(stageRoundRepository.findByStageIdAndRoundNo(1, input.roundNo()))
                .thenReturn(Optional.of(round));
        when(round.getMapConfig()).thenReturn(mapConfig);
        when(physicsSimulator.simulate(mapConfig, input.poses()))
                .thenReturn(result);
        doReturn(scheduledFuture).when(taskScheduler)
                .schedule(any(Runnable.class), any(Instant.class));

        gameSimulationService.simulateIfReady(roomSessionId, gameSessionId);

        ArgumentCaptor<Runnable> completionCaptor = ArgumentCaptor.forClass(Runnable.class);
        verify(taskScheduler).schedule(
                completionCaptor.capture(),
                any(Instant.class)
        );
        return completionCaptor.getValue();
    }

    private GameSimulationInput input(int roundNo) {
        List<List<Double>> pose = List.of(
                List.of(0.1, 0.2),
                List.of(0.8, 0.4)
        );
        return new GameSimulationInput(
                1,
                roundNo,
                LocalDateTime.ofInstant(NOW.minusSeconds(60), ZONE_ID),
                (roundNo - 1L) * 100L,
                List.of(
                        new SimulationParticipant(
                                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                                1
                        ),
                        new SimulationParticipant(
                                UUID.fromString("00000000-0000-4000-8000-000000000002"),
                                2
                        )
                ),
                List.of(pose, pose, pose, pose)
        );
    }

    @SuppressWarnings("unchecked")
    private void assertSavedStageRecords(
            GameSimulationInput input,
            long elapsedTimeMs,
            boolean cleared
    ) {
        ArgumentCaptor<Iterable<StageRecord>> recordsCaptor =
                ArgumentCaptor.forClass(Iterable.class);
        verify(stageRecordRepository).saveAll(recordsCaptor.capture());

        assertThat(recordsCaptor.getValue())
                .extracting(
                        StageRecord::getUserId,
                        StageRecord::getStageId,
                        StageRecord::getStagePlayTimeMs,
                        StageRecord::isClear
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                input.participants().get(0).participantId(),
                                input.stageId(),
                                elapsedTimeMs,
                                cleared
                        ),
                        org.assertj.core.groups.Tuple.tuple(
                                input.participants().get(1).participantId(),
                                input.stageId(),
                                elapsedTimeMs,
                                cleared
                        )
                );
    }

    private SimulationResult result(boolean success) {
        return new SimulationResult(
                50,
                List.of(
                        List.of(90.0, 870.0, 190.0, 0.0),
                        List.of(95.0, 870.0, 190.0, 0.0),
                        List.of(99.5, 871.0, 190.0, 20.0)
                ),
                success
        );
    }

    @Test
    void resetsRoomStateToWaitingWhenGameCompletes() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        UUID hostId = UUID.randomUUID();
        UUID guestId = UUID.randomUUID();

        RoomSession room = new RoomSession(roomSessionId, "CODE1", hostId, "Host");
        room.addParticipant(guestId, "Guest", false);
        room.getParticipants().get(guestId).updateReady(true);
        room.startGame(gameSessionId);

        assertThat(room.getState()).isEqualTo(RoomSession.RoomState.PLAYING);
        assertThat(room.getCurrentGameSessionId()).isEqualTo(gameSessionId);

        when(roomSessionRepository.findRoomById(roomSessionId)).thenReturn(Optional.of(room));

        GameSimulationInput input = input(3);
        SimulationResult result = result(true);
        Runnable completion = simulateAndCaptureCompletion(
                roomSessionId,
                gameSessionId,
                input,
                result
        );

        completion.run();

        assertThat(room.getState()).isEqualTo(RoomSession.RoomState.FINISHED);
        assertThat(room.getCurrentGameSessionId()).isNull();
        assertThat(room.getParticipants().get(hostId).isReady()).isTrue();
        assertThat(room.getParticipants().get(guestId).isReady()).isTrue();
        verify(roomSessionRepository).saveRoom(room);
    }
}
