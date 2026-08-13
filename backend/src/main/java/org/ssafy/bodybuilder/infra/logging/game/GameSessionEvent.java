package org.ssafy.bodybuilder.infra.logging.game;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.UUID;

public record GameSessionEvent(
        UUID eventId,
        String eventType,
        String messageType,
        String severity,
        String direction,
        String result,
        UUID actorId,
        JsonNode summary,
        Long payloadSizeBytes,
        Long durationMs,
        UUID errorId,
        LocalDateTime occurredAt,
        LocalDateTime serverReceivedAt,
        short schemaVersion
) {
}
