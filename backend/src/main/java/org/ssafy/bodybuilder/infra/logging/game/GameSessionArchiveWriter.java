package org.ssafy.bodybuilder.infra.logging.game;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.ByteBuffer;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.GameRoundReplayJpaRepository;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.GameSessionJpaRepository;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.SessionEventJpaRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class GameSessionArchiveWriter {

    private final GameSessionJpaRepository gameSessionRepository;
    private final SessionEventJpaRepository sessionEventRepository;
    private final GameRoundReplayJpaRepository roundReplayRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public void archive(
            UUID gameSessionId,
            UUID roomSessionId,
            String roomCode,
            String roomTitle,
            int stageId,
            String finalStatus,
            String gameResult,
            LocalDateTime startedAt,
            LocalDateTime endedAt,
            List<GameSessionEvent> events,
            List<GameRoundReplay> roundReplays
    ) {
        byte[] gameSessionIdBytes = uuidBytes(gameSessionId);
        gameSessionRepository.insertIfAbsent(
                gameSessionIdBytes,
                uuidBytes(roomSessionId),
                roomCode,
                roomTitle,
                stageId,
                finalStatus,
                gameResult,
                startedAt,
                endedAt
        );

        for (int index = 0; index < events.size(); index++) {
            GameSessionEvent event = events.get(index);
            sessionEventRepository.insertIfAbsent(
                    gameSessionIdBytes,
                    index + 1L,
                    uuidBytes(event.eventId()),
                    event.eventType(),
                    event.messageType(),
                    event.severity(),
                    event.direction(),
                    event.result(),
                    uuidBytes(event.actorId()),
                    event.summary().toString(),
                    event.payloadSizeBytes(),
                    event.durationMs(),
                    uuidBytes(event.errorId()),
                    event.occurredAt(),
                    event.serverReceivedAt(),
                    event.schemaVersion()
            );
        }

        for (GameRoundReplay replay : roundReplays) {
            roundReplayRepository.insertIfAbsent(
                    gameSessionIdBytes,
                    replay.roundNo(),
                    json(replay.poses()),
                    json(replay.simulation())
            );
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize round replay", exception);
        }
    }

    private byte[] uuidBytes(UUID value) {
        if (value == null) {
            return null;
        }
        ByteBuffer buffer = ByteBuffer.allocate(16);
        buffer.putLong(value.getMostSignificantBits());
        buffer.putLong(value.getLeastSignificantBits());
        return buffer.array();
    }
}
