package org.ssafy.bodybuilder.infra.logging.admin;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.UUID;

public final class AdminLogResponses {

    private AdminLogResponses() {
    }

    public record ActiveGame(
            UUID gameSessionId,
            UUID roomSessionId,
            String roomCode,
            String roomTitle,
            Integer stageId,
            Integer participantCount,
            String latestEventType,
            LocalDateTime startedAt,
            LocalDateTime lastEventAt
    ) {
    }

    public record ArchivedGame(
            UUID gameSessionId,
            UUID roomSessionId,
            String roomCode,
            String roomTitle,
            Integer stageId,
            String finalStatus,
            String gameResult,
            LocalDateTime startedAt,
            LocalDateTime endedAt
    ) {
    }

    public record SessionEvent(
            Long sequenceNo,
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
            LocalDateTime serverReceivedAt
    ) {
    }

    public record RoundReplay(
            Integer roundNo,
            JsonNode poses,
            JsonNode simulation
    ) {
    }

    public record ErrorSummary(
            UUID errorId,
            String source,
            String severity,
            String errorCode,
            String message,
            UUID roomSessionId,
            UUID gameSessionId,
            LocalDateTime createdAt
    ) {
    }

    public record ErrorDetail(
            UUID errorId,
            String source,
            String severity,
            String errorCode,
            String exceptionClass,
            String message,
            String stackTrace,
            UUID roomSessionId,
            UUID gameSessionId,
            UUID userId,
            String requestId,
            String traceId,
            UUID eventId,
            JsonNode context,
            LocalDateTime createdAt,
            LocalDateTime expiresAt
    ) {
    }
}
