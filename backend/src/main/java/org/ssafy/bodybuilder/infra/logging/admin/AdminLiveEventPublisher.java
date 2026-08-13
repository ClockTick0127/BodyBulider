package org.ssafy.bodybuilder.infra.logging.admin;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ActiveGame;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ArchivedGame;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ErrorSummary;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEvent;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventStore;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AdminLiveEventPublisher {

    private final SimpMessagingTemplate messagingTemplate;
    private final GameSessionEventStore eventStore;

    public void publish(UUID gameSessionId, GameSessionEvent event) {
        AdminGameEvent payload = new AdminGameEvent(gameSessionId, event);
        messagingTemplate.convertAndSend(
                "/topic/admin/sessions/" + gameSessionId,
                payload
        );
        if (isTerminal(event.eventType())) {
            return;
        }
        messagingTemplate.convertAndSend(
                "/topic/admin/sessions",
                sessionDelta(gameSessionId, event)
        );
    }

    public void publishArchived(UUID gameSessionId, GameSessionEvent terminal) {
        if (!isTerminal(terminal.eventType())) {
            throw new IllegalArgumentException(
                    "Terminal event required for archived delta: " + terminal.eventType()
            );
        }
        messagingTemplate.convertAndSend(
                "/topic/admin/sessions",
                sessionDelta(gameSessionId, terminal)
        );
    }

    public void publishErrorCreated(ErrorSummary error) {
        messagingTemplate.convertAndSend(
                "/topic/admin/errors",
                new AdminErrorDelta("ERROR_CREATED", error)
        );
    }

    private AdminSessionDelta sessionDelta(
            UUID gameSessionId,
            GameSessionEvent latest
    ) {
        List<GameSessionEvent> events = eventStore.readAll(gameSessionId);
        GameSessionEvent started = events.stream()
                .filter(event -> "GAME_STARTED".equals(event.eventType()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "GAME_STARTED is missing for admin delta: " + gameSessionId
                ));
        JsonNode startSummary = started.summary();
        UUID roomSessionId = UUID.fromString(requiredText(
                startSummary,
                "roomSessionId"
        ));
        String roomCode = requiredText(startSummary, "roomCode");
        String roomTitle = requiredText(startSummary, "roomTitle");
        int stageId = startSummary.path("stageId").asInt();
        LocalDateTime startedAt = LocalDateTime.parse(requiredText(
                startSummary,
                "startedAt"
        ));

        if (isTerminal(latest.eventType())) {
            String finalStatus = latest.summary().path("finalStatus").asText();
            if (finalStatus.isBlank()) {
                finalStatus = switch (latest.eventType()) {
                    case "GAME_COMPLETED" -> "COMPLETED";
                    case "GAME_ERROR" -> "ERROR";
                    default -> "ABORTED";
                };
            }
            ArchivedGame archivedGame = new ArchivedGame(
                    gameSessionId,
                    roomSessionId,
                    roomCode,
                    roomTitle,
                    stageId,
                    finalStatus,
                    latest.summary().path("gameResult").asText(null),
                    startedAt,
                    latest.occurredAt()
            );
            return new AdminSessionDelta(
                    "SESSION_ARCHIVED",
                    gameSessionId,
                    null,
                    archivedGame,
                    latest.eventId(),
                    latest.serverReceivedAt()
            );
        }

        ActiveGame activeGame = new ActiveGame(
                gameSessionId,
                roomSessionId,
                roomCode,
                roomTitle,
                stageId,
                startSummary.path("participantCount").asInt(),
                latest.eventType(),
                startedAt,
                latest.serverReceivedAt()
        );
        return new AdminSessionDelta(
                "GAME_STARTED".equals(latest.eventType())
                        ? "SESSION_CREATED"
                        : "SESSION_UPDATED",
                gameSessionId,
                activeGame,
                null,
                latest.eventId(),
                latest.serverReceivedAt()
        );
    }

    private boolean isTerminal(String eventType) {
        return "GAME_COMPLETED".equals(eventType)
                || "GAME_ERROR".equals(eventType)
                || "GAME_ABORTED".equals(eventType);
    }

    private String requiredText(JsonNode summary, String field) {
        JsonNode value = summary == null ? null : summary.get(field);
        if (value == null || value.isNull() || value.asText().isBlank()) {
            throw new IllegalStateException(
                    "Required admin delta field is missing: " + field
            );
        }
        return value.asText();
    }

    public record AdminGameEvent(
            UUID gameSessionId,
            GameSessionEvent event
    ) {
    }

    public record AdminSessionDelta(
            String type,
            UUID gameSessionId,
            ActiveGame activeGame,
            ArchivedGame archivedGame,
            UUID eventId,
            LocalDateTime serverReceivedAt
    ) {
    }

    public record AdminErrorDelta(
            String type,
            ErrorSummary error
    ) {
    }
}
