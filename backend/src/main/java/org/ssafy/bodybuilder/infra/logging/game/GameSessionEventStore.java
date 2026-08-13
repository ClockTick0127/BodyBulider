package org.ssafy.bodybuilder.infra.logging.game;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class GameSessionEventStore {

    private static final String STREAM_PREFIX = "obs:v1:events:game:";
    private static final String ACTIVE_GAMES_KEY = "obs:v1:active:games";
    private static final Duration ACTIVE_TTL = Duration.ofHours(24);
    private static final Duration ARCHIVED_TTL = Duration.ofHours(1);
    private static final long MAX_STREAM_LENGTH = 128L;

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    public void start(UUID gameSessionId, GameSessionEvent event) {
        append(gameSessionId, event);
    }

    public void append(UUID gameSessionId, GameSessionEvent event) {
        String key = streamKey(gameSessionId);
        try {
            String json = objectMapper.writeValueAsString(event);
            MapRecord<String, String, String> record = StreamRecords.newRecord()
                    .in(key)
                    .ofMap(Map.of("data", json));
            redisTemplate.opsForStream().add(record);
            redisTemplate.opsForStream().trim(key, MAX_STREAM_LENGTH, true);
            redisTemplate.expire(key, ACTIVE_TTL);
            redisTemplate.opsForZSet().add(
                    ACTIVE_GAMES_KEY,
                    gameSessionId.toString(),
                    event.serverReceivedAt().atZone(java.time.ZoneId.systemDefault())
                            .toInstant()
                            .toEpochMilli()
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize game session event", exception);
        }
    }

    public List<GameSessionEvent> readAll(UUID gameSessionId) {
        List<MapRecord<String, Object, Object>> records =
                redisTemplate.opsForStream().range(
                        streamKey(gameSessionId),
                        Range.unbounded()
                );
        if (records == null) {
            return List.of();
        }
        return records.stream()
                .map(record -> record.getValue().get("data"))
                .map(this::deserialize)
                .toList();
    }

    public List<UUID> findActiveGameIds() {
        var members = redisTemplate.opsForZSet().range(ACTIVE_GAMES_KEY, 0, -1);
        if (members == null) {
            return List.of();
        }
        return members.stream()
                .map(Object::toString)
                .map(UUID::fromString)
                .toList();
    }

    public void markArchived(UUID gameSessionId) {
        redisTemplate.opsForZSet().remove(ACTIVE_GAMES_KEY, gameSessionId.toString());
        redisTemplate.expire(streamKey(gameSessionId), ARCHIVED_TTL);
    }

    public void removeActive(UUID gameSessionId) {
        redisTemplate.opsForZSet().remove(ACTIVE_GAMES_KEY, gameSessionId.toString());
    }

    private GameSessionEvent deserialize(Object raw) {
        try {
            return objectMapper.readValue(String.valueOf(raw), GameSessionEvent.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize game session event", exception);
        }
    }

    private String streamKey(UUID gameSessionId) {
        return STREAM_PREFIX + gameSessionId;
    }
}
