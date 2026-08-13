package org.ssafy.bodybuilder.domain.game.websocket;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GameMessageDeduplicator {

    private static final Duration PROCESSING_TTL = Duration.ofSeconds(30);
    private static final Duration COMPLETED_TTL = Duration.ofHours(2);
    private static final String KEY_PREFIX = "game:processed-event:";
    private static final String PROCESSING_PREFIX = "PROCESSING:";
    private static final String COMPLETED_VALUE = "COMPLETED";


    //COMPLETED_TTL만큼 만료시간을 설정하고, 값을 저장합니다.
    private static final DefaultRedisScript<Long> COMPLETE_SCRIPT =
            new DefaultRedisScript<>(
                    "if redis.call('get', KEYS[1]) == ARGV[1] then "
                            + "redis.call('psetex', KEYS[1], ARGV[2], ARGV[3]); "
                            + "return 1 "
                            + "else return 0 end",
                    Long.class
            );

    //값 확인과 삭제를 원자적으로 하기위한 Lua Script
    //Redis에서 keys[1]을 가져와서 processingvalue와 동일한지 확인한다.
    //get과 delete사이에 끼어들 여지를 없애기위함
    private static final DefaultRedisScript<Long> RELEASE_SCRIPT =
            new DefaultRedisScript<>(
                    "if redis.call('get', KEYS[1]) == ARGV[1] then "
                            + "return redis.call('del', KEYS[1]) "
                            + "else return 0 end",
                    Long.class
            );

    private final StringRedisTemplate stringRedisTemplate;

    ///시작을 시도합니다.
    public Optional<ProcessingClaim> tryStart(String requesterId, UUID eventId) {
        String key = eventKey(requesterId, eventId);
        String processingValue = PROCESSING_PREFIX + UUID.randomUUID();

        //key값이 없을때만 저장합니다.
        //key값이 없으면 ProcessingValue를 저장하고 true반환
        //key값이 있으면 아무것도 저장하지 않고 false 반환
        boolean started = Boolean.TRUE.equals(
                stringRedisTemplate.opsForValue()
                        .setIfAbsent(key, processingValue, PROCESSING_TTL)
        );


        return started
                ? Optional.of(new ProcessingClaim(key, processingValue))
                : Optional.empty();
    }

    public boolean complete(ProcessingClaim claim) {
        Long result = stringRedisTemplate.execute(
                COMPLETE_SCRIPT,
                java.util.List.of(claim.key()),
                claim.processingValue(),
                String.valueOf(COMPLETED_TTL.toMillis()),
                COMPLETED_VALUE
        );
        return Long.valueOf(1L).equals(result);
    }

    //내가 잡은 처리 권한일 맞을떄만 Redis key를 삭제해서 선점을 해제하는 코드
    public boolean release(ProcessingClaim claim) {
        Long result = stringRedisTemplate.execute(
                RELEASE_SCRIPT,
                java.util.List.of(claim.key()),
                claim.processingValue()
        );
        return Long.valueOf(1L).equals(result);
    }

    //event를 식별할 key를 만듭니다.
    private String eventKey(String requesterId, UUID eventId) {
        return KEY_PREFIX + requesterId + ":" + eventId;
    }


    public record ProcessingClaim(String key, String processingValue) {
    }
}
