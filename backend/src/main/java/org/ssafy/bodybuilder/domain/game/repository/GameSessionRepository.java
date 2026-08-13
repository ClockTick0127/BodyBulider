package org.ssafy.bodybuilder.domain.game.repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.time.LocalDateTime;
import org.ssafy.bodybuilder.domain.game.model.GameSession;
import org.ssafy.bodybuilder.domain.game.model.GamePoseSubmission;
import org.ssafy.bodybuilder.domain.game.model.GameSimulationInput;
import org.ssafy.bodybuilder.domain.game.model.GameStatus;
import org.ssafy.bodybuilder.domain.game.model.RoundPoseSnapshot;

public interface GameSessionRepository {
    void commitGameStart(
            GameSession gameSession,
            Map<UUID, Integer> participantSlots
    );

    void enqueueCaptureRequest(
            UUID gameSessionId,
            Integer playerNo,
            Integer captureNo
    );

    GamePoseSubmission savePose(
            UUID roomSessionId,
            UUID gameSessionId,
            UUID userId,
            Integer captureNo,
            List<List<Double>> points
    );

    boolean resolveTimedOutCapture(
            UUID gameSessionId,
            Integer playerNo,
            Integer captureNo
    );

    Optional<GameSimulationInput> claimReadySimulation(
            UUID roomSessionId,
            UUID gameSessionId
    );

    /**
     * 물길 브로드캐스트용 현재 라운드 포즈 스냅샷 (읽기 전용).
     * 세션이 없거나 PLAYING이 아니면 empty.
     * (개발명세서_BE_물기믹_유니온물길 BE-WATER-04·05)
     */
    Optional<RoundPoseSnapshot> findRoundPoseSnapshot(UUID gameSessionId);

    void moveToNextRound(
            UUID gameSessionId,
            Integer stageId,
            Integer nextRoundNo,
            Long accumulatedPlayTimeMs
    );

    void saveRoundPlayTime(UUID gameSessionId, Integer roundId, Long playTimeMs);

    Map<Integer, Long> findRoundPlayTimes(UUID gameSessionId);

    void finishGame(
            UUID gameSessionId,
            GameStatus status,
            LocalDateTime endedAt
    );
}
