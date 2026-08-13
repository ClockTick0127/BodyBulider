package org.ssafy.bodybuilder.infra.logging.game;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.model.GameStatus;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.service.GameCaptureScheduler;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.infra.logging.error.ErrorDetailRecorder;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class GameTerminationService {

    private static final String TERMINATION_KEY_PREFIX = "obs:v1:termination:game:";
    private static final Duration TERMINATION_CLAIM_TTL = Duration.ofHours(3);

    private final RedisTemplate<String, Object> redisTemplate;
    private final ErrorDetailRecorder errorDetailRecorder;
    private final GameSessionEventRecorder eventRecorder;
    private final GameSessionArchiveService archiveService;
    private final GameSessionRepository gameSessionRepository;
    private final GameCaptureScheduler gameCaptureScheduler;
    private final GameMessagePublisher gameMessagePublisher;
    private final RoomLockManager roomLockManager;
    private final RoomSessionRepository roomSessionRepository;
    private final Clock gameClock;

    public void terminateWithError(
            UUID roomSessionId,
            UUID gameSessionId,
            RuntimeException exception,
            String source
    ) {
        if (roomSessionId == null || gameSessionId == null) {
            log.error("[GameTerminationService] Missing session id", exception);
            return;
        }
        if (!claim(gameSessionId)) {
            return;
        }

        LocalDateTime endedAt = LocalDateTime.now(gameClock);
        String errorCode = exception instanceof GlobalException globalException
                ? globalException.getErrorCode().getCode()
                : "C004";
        gameCaptureScheduler.stop(gameSessionId);
        try {
            gameSessionRepository.finishGame(gameSessionId, GameStatus.ERROR, endedAt);
        } catch (RuntimeException finishException) {
            log.error(
                    "[GameTerminationService] Failed to mark game ERROR. gameSessionId={}",
                    gameSessionId,
                    finishException
            );
        }
        resetRoom(roomSessionId);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("errorCode", errorCode);
        payload.put("message", "게임 처리 중 오류가 발생했습니다.");
        try {
            gameMessagePublisher.publishGameMessage(
                    GameMessageType.GAME_ERROR,
                    roomSessionId,
                    gameSessionId,
                    payload
            );
        } catch (RuntimeException publishException) {
            log.error(
                    "[GameTerminationService] Failed to publish GAME_ERROR. gameSessionId={}",
                    gameSessionId,
                    publishException
            );
        }

        Optional<UUID> errorId = errorDetailRecorder.record(
                source,
                exception,
                errorCode,
                roomSessionId,
                gameSessionId,
                null,
                null,
                Map.of("operation", "GAME_TERMINATION")
        );
        eventRecorder.recordError(
                gameSessionId,
                errorId.orElse(null),
                errorCode,
                endedAt
        );
        archiveService.archive(
                gameSessionId,
                roomSessionId,
                "ERROR",
                null,
                endedAt
        );
    }

    public void terminateAborted(
            UUID roomSessionId,
            UUID gameSessionId,
            String reason
    ) {
        if (roomSessionId == null || gameSessionId == null || !claim(gameSessionId)) {
            return;
        }
        LocalDateTime endedAt = LocalDateTime.now(gameClock);
        eventRecorder.record(
                gameSessionId,
                "GAME_ABORTED",
                null,
                "INTERNAL",
                "FAILED",
                null,
                Map.of(
                        "finalStatus", "ABORTED",
                        "reason", reason == null ? "UNKNOWN" : reason
                ),
                null,
                null,
                endedAt
        );
        gameCaptureScheduler.stop(gameSessionId);
        try {
            gameSessionRepository.finishGame(gameSessionId, GameStatus.ABORTED, endedAt);
        } catch (RuntimeException exception) {
            log.error(
                    "[GameTerminationService] Failed to mark game ABORTED. gameSessionId={}",
                    gameSessionId,
                    exception
            );
        }
        resetRoom(roomSessionId);
        archiveService.archive(
                gameSessionId,
                roomSessionId,
                "ABORTED",
                null,
                endedAt
        );
    }

    private boolean claim(UUID gameSessionId) {
        try {
            return Boolean.TRUE.equals(redisTemplate.opsForValue().setIfAbsent(
                    TERMINATION_KEY_PREFIX + gameSessionId,
                    true,
                    TERMINATION_CLAIM_TTL
            ));
        } catch (RuntimeException exception) {
            log.error(
                    "[GameTerminationService] Failed to claim termination. gameSessionId={}",
                    gameSessionId,
                    exception
            );
            return true;
        }
    }

    private void resetRoom(UUID roomSessionId) {
        try {
            roomLockManager.withLock(roomSessionId, () -> {
                roomSessionRepository.findRoomById(roomSessionId).ifPresent(room -> {
                    room.finishGame();
                    roomSessionRepository.saveRoom(room);
                });
                return null;
            });
        } catch (RuntimeException exception) {
            log.error(
                    "[GameTerminationService] Failed to reset room. roomSessionId={}",
                    roomSessionId,
                    exception
            );
        }
    }
}
