package org.ssafy.bodybuilder.infra.logging.game;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLiveEventPublisher;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class GameSessionEventRecorder {

    private final GameSessionEventStore eventStore;
    private final ObjectMapper objectMapper;
    private final Clock gameClock;
    private final AdminLiveEventPublisher liveEventPublisher;

    public GameSessionEvent start(
            UUID gameSessionId,
            LocalDateTime occurredAt,
            Map<String, Object> summary
    ) {
        GameSessionEvent event = create(
                "GAME_STARTED",
                GameMessageType.GAME_START_RESPONSE,
                "INFO",
                "INTERNAL",
                "SUCCESS",
                null,
                summary,
                null,
                null,
                occurredAt
        );
        try {
            eventStore.start(gameSessionId, event);
            publishSafely(gameSessionId, event);
        } catch (RuntimeException exception) {
            log.error(
                    "[GameSessionEventRecorder] Failed to record GAME_STARTED. gameSessionId={}",
                    gameSessionId,
                    exception
            );
        }
        return event;
    }

    public GameSessionEvent record(
            UUID gameSessionId,
            String eventType,
            GameMessageType messageType,
            String direction,
            String result,
            UUID actorId,
            Map<String, Object> summary,
            Long payloadSizeBytes,
            Long durationMs,
            LocalDateTime occurredAt
    ) {
        return record(
                gameSessionId,
                eventType,
                messageType,
                "INFO",
                direction,
                result,
                actorId,
                summary,
                payloadSizeBytes,
                durationMs,
                occurredAt
        );
    }

    public GameSessionEvent recordWarning(
            UUID gameSessionId,
            String eventType,
            GameMessageType messageType,
            String direction,
            String result,
            UUID actorId,
            Map<String, Object> summary,
            Long payloadSizeBytes,
            Long durationMs,
            LocalDateTime occurredAt
    ) {
        return record(
                gameSessionId,
                eventType,
                messageType,
                "WARN",
                direction,
                result,
                actorId,
                summary,
                payloadSizeBytes,
                durationMs,
                occurredAt
        );
    }

    private GameSessionEvent record(
            UUID gameSessionId,
            String eventType,
            GameMessageType messageType,
            String severity,
            String direction,
            String result,
            UUID actorId,
            Map<String, Object> summary,
            Long payloadSizeBytes,
            Long durationMs,
            LocalDateTime occurredAt
    ) {
        GameSessionEvent event = create(
                eventType,
                messageType,
                severity,
                direction,
                result,
                actorId,
                summary,
                payloadSizeBytes,
                durationMs,
                occurredAt
        );
        try {
            eventStore.append(gameSessionId, event);
            publishSafely(gameSessionId, event);
        } catch (RuntimeException exception) {
            log.error(
                    "[GameSessionEventRecorder] Failed to record event. gameSessionId={}, eventType={}",
                    gameSessionId,
                    eventType,
                    exception
            );
        }
        return event;
    }

    public GameSessionEvent recordError(
            UUID gameSessionId,
            UUID errorId,
            String errorCode,
            LocalDateTime occurredAt
    ) {
        LocalDateTime receivedAt = LocalDateTime.now(gameClock);
        GameSessionEvent event = new GameSessionEvent(
                UUID.randomUUID(),
                "GAME_ERROR",
                GameMessageType.GAME_ERROR.name(),
                "ERROR",
                "INTERNAL",
                "FAILED",
                null,
                objectMapper.valueToTree(Map.of(
                        "errorCode", errorCode == null ? "INTERNAL_ERROR" : errorCode
                )),
                null,
                null,
                errorId,
                occurredAt == null ? receivedAt : occurredAt,
                receivedAt,
                (short) 1
        );
        try {
            eventStore.append(gameSessionId, event);
            publishSafely(gameSessionId, event);
        } catch (RuntimeException exception) {
            log.error(
                    "[GameSessionEventRecorder] Failed to record GAME_ERROR. gameSessionId={}",
                    gameSessionId,
                    exception
            );
        }
        return event;
    }

    private void publishSafely(UUID gameSessionId, GameSessionEvent event) {
        try {
            liveEventPublisher.publish(gameSessionId, event);
        } catch (RuntimeException exception) {
            log.warn(
                    "[GameSessionEventRecorder] Failed to publish admin event. "
                            + "gameSessionId={}, eventType={}",
                    gameSessionId,
                    event.eventType(),
                    exception
            );
        }
    }

    private GameSessionEvent create(
            String eventType,
            GameMessageType messageType,
            String severity,
            String direction,
            String result,
            UUID actorId,
            Map<String, Object> summary,
            Long payloadSizeBytes,
            Long durationMs,
            LocalDateTime occurredAt
    ) {
        LocalDateTime receivedAt = LocalDateTime.now(gameClock);
        return new GameSessionEvent(
                UUID.randomUUID(),
                eventType,
                messageType == null ? null : messageType.name(),
                severity,
                direction,
                result,
                actorId,
                objectMapper.valueToTree(summary == null ? Map.of() : summary),
                payloadSizeBytes,
                durationMs,
                null,
                occurredAt == null ? receivedAt : occurredAt,
                receivedAt,
                (short) 1
        );
    }
}
