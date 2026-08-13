package org.ssafy.bodybuilder.domain.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameResultPayload;
import org.ssafy.bodybuilder.domain.game.model.GameSimulationInput;
import org.ssafy.bodybuilder.domain.game.model.SimulationParticipant;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsSimulator;
import org.ssafy.bodybuilder.domain.game.physics.SimulationResult;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.domain.record.repository.StageRecordRepository;
import org.ssafy.bodybuilder.domain.record.repository.RoundRecordRepository;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.infra.logging.game.GameExecutionFailedEvent;
import org.ssafy.bodybuilder.infra.logging.game.GameRoundReplayStore;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionArchiveService;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.TaskScheduler;

/**
 * STEP 6 #6(기록 미오염), #7(1라운드 클리어 + 별 3개).
 *
 * <p>기존 GameSimulationServiceTest는 공식 맵 경로를 지키는 회귀 방어선이므로 손대지 않고,
 * 커스텀 맵(is_official = false) 분기만 여기서 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class GameSimulationCustomMapTest {

    private static final Instant NOW = Instant.parse("2026-07-29T00:01:00Z");
    private static final ZoneId ZONE_ID = ZoneId.of("Asia/Seoul");
    private static final int CUSTOM_STAGE_ID = 10000;

    @Mock GameSessionRepository gameSessionRepository;
    @Mock StageRoundRepository stageRoundRepository;
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
    @Mock StageRepository stageRepository;
    @Mock WaterFlowBroadcastService waterFlowBroadcastService;
    @Mock ScheduledFuture<?> scheduledFuture;
    @Mock StageRound round;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private GameSimulationService gameSimulationService;

    @BeforeEach
    void setUp() {
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
                Clock.fixed(NOW, ZONE_ID),
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
    @DisplayName("커스텀 맵 1라운드를 클리어해도 예외 없이 끝나고 별 3개를 준다")
    void customMapClearGivesThreeStarsWithoutException() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        GameSimulationInput input = input();
        when(stageRoundRepository.findByStageIdAndRoundNo(CUSTOM_STAGE_ID, 2))
                .thenReturn(Optional.empty());

        Runnable completion = simulateAndCapture(roomSessionId, gameSessionId, input, true);
        completion.run();

        verify(gameMessagePublisher).publishGameMessage(
                GameMessageType.GAME_RESULT_RESPONSE,
                roomSessionId,
                gameSessionId,
                new GameResultPayload(3, 100L, true)
        );
        verify(applicationEventPublisher, never()).publishEvent(any(GameExecutionFailedEvent.class));
    }

    @Test
    @DisplayName("커스텀 맵은 클리어해도 stage_records를 남기지 않는다 (기록·랭킹 미오염)")
    void customMapDoesNotWriteStageRecords() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        when(stageRoundRepository.findByStageIdAndRoundNo(CUSTOM_STAGE_ID, 2))
                .thenReturn(Optional.empty());

        simulateAndCapture(roomSessionId, gameSessionId, input(), true).run();

        verify(stageRecordRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("커스텀 맵 실패는 별 0개다 (공식 맵의 roundNo - 1 규칙을 타지 않는다)")
    void customMapFailureGivesZeroStars() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();

        simulateAndCapture(roomSessionId, gameSessionId, input(), false).run();

        verify(gameMessagePublisher).publishGameMessage(
                GameMessageType.GAME_RESULT_RESPONSE,
                roomSessionId,
                gameSessionId,
                new GameResultPayload(0, 100L, false)
        );
        verify(stageRecordRepository, never()).saveAll(any());
    }

    private Runnable simulateAndCapture(
            UUID roomSessionId,
            UUID gameSessionId,
            GameSimulationInput input,
            boolean cleared
    ) {
        var mapConfig = objectMapper.createObjectNode();
        when(gameSessionRepository.claimReadySimulation(roomSessionId, gameSessionId))
                .thenReturn(Optional.of(input));
        when(stageRoundRepository.findByStageIdAndRoundNo(CUSTOM_STAGE_ID, 1))
                .thenReturn(Optional.of(round));
        when(round.getMapConfig()).thenReturn(mapConfig);
        when(stageRepository.findById(CUSTOM_STAGE_ID)).thenReturn(Optional.of(customStage()));
        when(physicsSimulator.simulate(mapConfig, input.poses())).thenReturn(result(cleared));
        doReturn(scheduledFuture).when(taskScheduler)
                .schedule(any(Runnable.class), any(Instant.class));

        gameSimulationService.simulateIfReady(roomSessionId, gameSessionId);

        ArgumentCaptor<Runnable> completionCaptor = ArgumentCaptor.forClass(Runnable.class);
        ArgumentCaptor<Instant> startAtCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(taskScheduler).schedule(completionCaptor.capture(), startAtCaptor.capture());
        assertThat(LocalDateTime.ofInstant(startAtCaptor.getValue(), ZONE_ID)).isNotNull();
        return completionCaptor.getValue();
    }

    private Stage customStage() {
        return Stage.builder()
                .id(CUSTOM_STAGE_ID)
                .name("[UGC] 하늘 위의 도전 #abcd1234")
                .description("유저 설명")
                .difficulty("중")
                .isOfficial(false)
                .build();
    }

    private GameSimulationInput input() {
        List<List<Double>> pose = List.of(List.of(0.1, 0.2));
        return new GameSimulationInput(
                CUSTOM_STAGE_ID,
                1,
                LocalDateTime.ofInstant(NOW, ZONE_ID),
                0L,
                List.of(
                        new SimulationParticipant(
                                UUID.fromString("00000000-0000-4000-8000-000000000001"), 1),
                        new SimulationParticipant(
                                UUID.fromString("00000000-0000-4000-8000-000000000002"), 2)
                ),
                List.of(pose, pose, pose, pose)
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
}
