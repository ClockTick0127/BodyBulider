package org.ssafy.bodybuilder.domain.game.util;

import java.time.Duration;
import java.util.Collections;
import java.util.UUID;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;
//Redis 이용한 방 단위 분산 락 관리자

@Component
@RequiredArgsConstructor
public class RoomLockManager {
    private static final Duration LOCK_TTL = Duration.ofSeconds(10);
    private static final DefaultRedisScript<Long> UNLOCK_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] " +
                    "then return redis.call('del', KEYS[1]) else return 0 end",
            Long.class
    );

    private final StringRedisTemplate stringRedisTemplate;

    private static final int DEFAULT_MAX_RETRIES = 5;
    private static final long DEFAULT_RETRY_INTERVAL_MS = 30L;

    public <T> T withLock(UUID roomSessionId, Supplier<T> operation) {
        return withLockWithRetry(roomSessionId, operation, DEFAULT_MAX_RETRIES, DEFAULT_RETRY_INTERVAL_MS);
    }

    public <T> T withLockWithRetry(UUID roomSessionId, Supplier<T> operation, int maxRetries, long retryIntervalMs) {
        String key = "lock:room:" + roomSessionId;
        String token = UUID.randomUUID().toString();

        for (int attempt = 0; attempt < maxRetries; attempt++) {
            boolean acquired = Boolean.TRUE.equals(
                    stringRedisTemplate.opsForValue().setIfAbsent(key, token, LOCK_TTL));
            if (acquired) {
                try {
                    return operation.get();
                } finally {
                    stringRedisTemplate.execute(UNLOCK_SCRIPT, Collections.singletonList(key), token);
                }
            }

            if (attempt < maxRetries - 1) {
                try {
                    Thread.sleep(retryIntervalMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new GlobalException(ErrorCode.ROOM_OPERATION_BUSY);
                }
            }
        }

        throw new GlobalException(ErrorCode.ROOM_OPERATION_BUSY);
    }
}
