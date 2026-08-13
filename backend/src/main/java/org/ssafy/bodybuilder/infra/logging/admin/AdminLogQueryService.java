package org.ssafy.bodybuilder.infra.logging.admin;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.ByteBuffer;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ActiveGame;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ArchivedGame;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ErrorDetail;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ErrorSummary;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.SessionEvent;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.RoundReplay;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEvent;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventStore;
import org.ssafy.bodybuilder.infra.logging.game.GameRoundReplayStore;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.ErrorDetailJpaRepository;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.GameRoundReplayJpaRepository;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.GameSessionJpaRepository;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.SessionEventJpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class AdminLogQueryService {

    private final ObjectMapper objectMapper;
    private final GameSessionEventStore eventStore;
    private final GameRoundReplayStore roundReplayStore;
    private final GameSessionJpaRepository gameSessionRepository;
    private final SessionEventJpaRepository sessionEventRepository;
    private final GameRoundReplayJpaRepository roundReplayRepository;
    private final ErrorDetailJpaRepository errorDetailRepository;

    public List<ActiveGame> getActiveGames() {
        return eventStore.findActiveGameIds().stream()
                .limit(100)
                .map(this::toActiveGame)
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    public List<ArchivedGame> getArchivedGames(int requestedLimit) {
        return gameSessionRepository.findArchivedGames(
                        boundedLimit(requestedLimit)
                ).stream()
                .map(projection -> new ArchivedGame(
                        uuid(projection.getGameSessionId()),
                        uuid(projection.getRoomSessionId()),
                        projection.getRoomCode(),
                        projection.getRoomTitle(),
                        projection.getStageId(),
                        projection.getFinalStatus(),
                        projection.getGameResult(),
                        projection.getStartedAt(),
                        projection.getEndedAt()
                ))
                .toList();
    }

    public List<SessionEvent> getSessionEvents(
            UUID gameSessionId,
            int requestedLimit
    ) {
        int limit = Math.min(Math.max(requestedLimit, 1), 500);
        List<GameSessionEvent> liveEvents = eventStore.readAll(gameSessionId);
        if (!liveEvents.isEmpty()) {
            return IntStream.range(0, Math.min(liveEvents.size(), limit))
                    .mapToObj(index -> toSessionEvent(
                            liveEvents.get(index),
                            index + 1L
                    ))
                    .toList();
        }
        return sessionEventRepository.findSessionEvents(
                        uuidBytes(gameSessionId),
                        limit
                ).stream()
                .map(projection -> new SessionEvent(
                        projection.getSequenceNo(),
                        uuid(projection.getEventId()),
                        projection.getEventType(),
                        projection.getMessageType(),
                        projection.getSeverity(),
                        projection.getDirection(),
                        projection.getResult(),
                        uuid(projection.getActorId()),
                        json(projection.getSummary()),
                        projection.getPayloadSizeBytes(),
                        projection.getDurationMs(),
                        uuid(projection.getErrorId()),
                        projection.getOccurredAt(),
                        projection.getServerReceivedAt()
                ))
                .toList();
    }

    public List<RoundReplay> getRoundReplays(UUID gameSessionId) {
        try {
            var liveReplays = roundReplayStore.readAll(gameSessionId);
            if (!liveReplays.isEmpty()) {
                return liveReplays.stream()
                        .map(replay -> new RoundReplay(
                                replay.roundNo(),
                                objectMapper.valueToTree(replay.poses()),
                                objectMapper.valueToTree(replay.simulation())
                        ))
                        .toList();
            }
        } catch (RuntimeException exception) {
            log.warn(
                    "Failed to read live round replays. Falling back to archive. "
                            + "gameSessionId={}",
                    gameSessionId,
                    exception
            );
        }
        return roundReplayRepository.findRoundReplays(
                        uuidBytes(gameSessionId)
                ).stream()
                .map(projection -> new RoundReplay(
                        projection.getRoundNo(),
                        json(projection.getPoses()),
                        json(projection.getSimulation())
                ))
                .toList();
    }

    private SessionEvent toSessionEvent(
            GameSessionEvent event,
            long sequenceNo
    ) {
        return new SessionEvent(
                sequenceNo,
                event.eventId(),
                event.eventType(),
                event.messageType(),
                event.severity(),
                event.direction(),
                event.result(),
                event.actorId(),
                event.summary(),
                event.payloadSizeBytes(),
                event.durationMs(),
                event.errorId(),
                event.occurredAt(),
                event.serverReceivedAt()
        );
    }

    public List<ErrorSummary> getErrors(int requestedLimit) {
        return errorDetailRepository.findErrorSummaries(
                        boundedLimit(requestedLimit)
                ).stream()
                .map(projection -> new ErrorSummary(
                        uuid(projection.getErrorId()),
                        projection.getSource(),
                        projection.getSeverity(),
                        projection.getErrorCode(),
                        projection.getMessage(),
                        uuid(projection.getRoomSessionId()),
                        uuid(projection.getGameSessionId()),
                        projection.getCreatedAt()
                ))
                .toList();
    }

    public ErrorDetail getError(UUID errorId) {
        return errorDetailRepository.findActiveDetail(uuidBytes(errorId))
                .map(projection -> new ErrorDetail(
                        uuid(projection.getErrorId()),
                        projection.getSource(),
                        projection.getSeverity(),
                        projection.getErrorCode(),
                        projection.getExceptionClass(),
                        projection.getMessage(),
                        projection.getStackTrace(),
                        uuid(projection.getRoomSessionId()),
                        uuid(projection.getGameSessionId()),
                        uuid(projection.getUserId()),
                        projection.getRequestId(),
                        projection.getTraceId(),
                        uuid(projection.getEventId()),
                        json(projection.getContext()),
                        projection.getCreatedAt(),
                        projection.getExpiresAt()
                ))
                .orElseThrow(() -> new GlobalException(ErrorCode.LOG_NOT_FOUND));
    }

    private ActiveGame toActiveGame(UUID gameSessionId) {
        List<GameSessionEvent> events = eventStore.readAll(gameSessionId);
        if (events.isEmpty()) {
            return null;
        }
        GameSessionEvent started = events.stream()
                .filter(event -> "GAME_STARTED".equals(event.eventType()))
                .findFirst()
                .orElse(null);
        if (started == null) {
            return null;
        }
        GameSessionEvent latest = events.getLast();
        JsonNode summary = started.summary();
        return new ActiveGame(
                gameSessionId,
                UUID.fromString(summary.path("roomSessionId").asText()),
                summary.path("roomCode").asText(),
                summary.path("roomTitle").asText(),
                summary.path("stageId").asInt(),
                summary.path("participantCount").asInt(),
                latest.eventType(),
                LocalDateTime.parse(summary.path("startedAt").asText()),
                latest.serverReceivedAt()
        );
    }

    private int boundedLimit(int requestedLimit) {
        return Math.min(Math.max(requestedLimit, 1), 100);
    }

    private JsonNode json(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof JsonNode jsonNode) {
            return jsonNode;
        }
        String value = raw instanceof byte[] bytes
                ? new String(bytes, java.nio.charset.StandardCharsets.UTF_8)
                : raw.toString();
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException exception) {
            return objectMapper.createObjectNode().put("unreadable", true);
        }
    }

    private UUID uuid(byte[] bytes) {
        if (bytes == null) {
            return null;
        }
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        return new UUID(buffer.getLong(), buffer.getLong());
    }

    private byte[] uuidBytes(UUID value) {
        ByteBuffer buffer = ByteBuffer.allocate(16);
        buffer.putLong(value.getMostSignificantBits());
        buffer.putLong(value.getLeastSignificantBits());
        return buffer.array();
    }
}
