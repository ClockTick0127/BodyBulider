package org.ssafy.bodybuilder.domain.game.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRepository;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;

/**
 * STEP 6 #16 — 게임 시작 시점에 커스텀 맵 play_count를 올린다.
 *
 * <p>공식 스테이지는 custom_maps에 행이 없어 같은 UPDATE가 0건으로 끝나므로
 * is_official을 따로 조회하지 않는다.
 */
@ExtendWith(MockitoExtension.class)
class GameStartCustomMapPlayCountTest {

    @Mock RoomSessionRepository roomSessionRepository;
    @Mock GameSessionRepository gameSessionRepository;
    @Mock StageRepository stageRepository;
    @Mock StageRoundRepository stageRoundRepository;
    @Mock RoomLockManager roomLockManager;
    @Mock GameMessagePublisher gameMessagePublisher;
    @Mock GameCaptureScheduler gameCaptureScheduler;
    @Mock GameSessionEventRecorder gameSessionEventRecorder;
    @Mock CustomMapRepository customMapRepository;
    @Mock WaterFlowBroadcastService waterFlowBroadcastService;
    @Mock StageRound firstRound;

    private GameStartService gameStartService;
    private UUID roomId;
    private UUID ownerId;
    private RoomSession room;

    @BeforeEach
    void setUp() {
        gameStartService = new GameStartService(
                roomSessionRepository,
                gameSessionRepository,
                stageRepository,
                stageRoundRepository,
                roomLockManager,
                gameMessagePublisher,
                gameCaptureScheduler,
                gameSessionEventRecorder,
                customMapRepository,
                waterFlowBroadcastService
        );
        roomId = UUID.randomUUID();
        ownerId = UUID.randomUUID();
        room = new RoomSession(roomId, "CODE", ownerId, "owner");
        room.addParticipant(UUID.randomUUID(), "guest", false).toggleReady();

        lenient().when(roomLockManager.withLock(eq(roomId), any())).thenAnswer(invocation -> {
            Supplier<?> operation = invocation.getArgument(1);
            return operation.get();
        });
    }

    @Test
    @DisplayName("커스텀 맵으로 게임을 시작하면 play_count를 1 올린다")
    void increasesPlayCountForCustomStage() {
        startGameWith(10000);

        verify(customMapRepository).increasePlayCount(10000);
    }

    @Test
    @DisplayName("공식 맵도 같은 UPDATE를 타지만 대상 행이 없어 통계가 변하지 않는다")
    void officialStageUpdateAffectsNoRow() {
        startGameWith(1);

        verify(customMapRepository).increasePlayCount(1);
    }

    private void startGameWith(int stageId) {
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));
        when(stageRepository.existsById(stageId)).thenReturn(true);
        when(stageRoundRepository.findByStageIdAndRoundNo(stageId, 1))
                .thenReturn(Optional.of(firstRound));
        when(firstRound.getId()).thenReturn(stageId * 10 + 1);
        when(firstRound.getRoundNo()).thenReturn(1);
        when(firstRound.getMapConfig()).thenReturn(
                new ObjectMapper().createObjectNode().put("mapNo", 11)
        );

        gameStartService.startGame(roomId, ownerId, stageId);
    }
}
