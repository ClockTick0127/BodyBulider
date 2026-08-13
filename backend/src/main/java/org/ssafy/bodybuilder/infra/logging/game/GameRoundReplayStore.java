package org.ssafy.bodybuilder.infra.logging.game;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class GameRoundReplayStore {

    private static final String PREFIX = "obs:v1:replay:game:";
    private static final Duration ACTIVE_TTL = Duration.ofHours(24);
    private static final Duration ARCHIVED_TTL = Duration.ofHours(1);

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    public void save(UUID gameSessionId, GameRoundReplay replay) {
        String indexKey = indexKey(gameSessionId);
        redisTemplate.opsForValue().set(
                replayKey(gameSessionId, replay.roundNo()),
                serialize(replay),
                ACTIVE_TTL
        );
        redisTemplate.opsForSet().add(indexKey, replay.roundNo());
        redisTemplate.expire(indexKey, ACTIVE_TTL);
    }

    public List<GameRoundReplay> readAll(UUID gameSessionId) {
        Set<Object> rawRoundNos = redisTemplate.opsForSet()
                .members(indexKey(gameSessionId));
        if (rawRoundNos == null || rawRoundNos.isEmpty()) {
            return List.of();
        }
        return rawRoundNos.stream()
                .map(Object::toString)
                .map(Integer::parseInt)
                .sorted()
                .map(roundNo -> redisTemplate.opsForValue().get(
                        replayKey(gameSessionId, roundNo)
                ))
                .filter(java.util.Objects::nonNull)
                .map(this::deserialize)
                .sorted(Comparator.comparing(GameRoundReplay::roundNo))
                .toList();
    }

    public void markArchived(UUID gameSessionId, List<GameRoundReplay> replays) {
        redisTemplate.expire(indexKey(gameSessionId), ARCHIVED_TTL);
        replays.forEach(replay -> redisTemplate.expire(
                replayKey(gameSessionId, replay.roundNo()),
                ARCHIVED_TTL
        ));
    }

    private String serialize(GameRoundReplay replay) {
        try {
            return objectMapper.writeValueAsString(replay);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize round replay", exception);
        }
    }

    private GameRoundReplay deserialize(Object raw) {
        try {
            return objectMapper.readValue(raw.toString(), GameRoundReplay.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize round replay", exception);
        }
    }

    private String indexKey(UUID gameSessionId) {
        return PREFIX + gameSessionId + ":rounds";
    }

    private String replayKey(UUID gameSessionId, Integer roundNo) {
        return PREFIX + gameSessionId + ":round:" + roundNo;
    }
}
