package org.ssafy.bodybuilder.domain.game.websocket;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

class GameMessageDeduplicatorTest {

    @Mock StringRedisTemplate stringRedisTemplate;
    @Mock ValueOperations<String, String> valueOperations;

    private GameMessageDeduplicator deduplicator;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        given(stringRedisTemplate.opsForValue()).willReturn(valueOperations);
        deduplicator = new GameMessageDeduplicator(stringRedisTemplate);
    }

    @Test
    void startsProcessingOnlyWhenRedisKeyDoesNotExist() {
        String requesterId = UUID.randomUUID().toString();
        UUID eventId = UUID.randomUUID();
        String key = "game:processed-event:" + requesterId + ":" + eventId;
        given(valueOperations.setIfAbsent(
                eq(key),
                any(String.class),
                eq(Duration.ofSeconds(30))
        )).willReturn(true, false);

        Optional<GameMessageDeduplicator.ProcessingClaim> first =
                deduplicator.tryStart(requesterId, eventId);
        Optional<GameMessageDeduplicator.ProcessingClaim> second =
                deduplicator.tryStart(requesterId, eventId);

        assertThat(first).isPresent();
        assertThat(first.orElseThrow().key()).isEqualTo(key);
        assertThat(first.orElseThrow().processingValue())
                .startsWith("PROCESSING:");
        assertThat(second).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void completesOnlyTheOwnedProcessingClaim() {
        var claim = new GameMessageDeduplicator.ProcessingClaim(
                "event-key",
                "PROCESSING:token"
        );
        given(stringRedisTemplate.execute(
                any(RedisScript.class),
                eq(List.of(claim.key())),
                eq(claim.processingValue()),
                eq(String.valueOf(Duration.ofHours(2).toMillis())),
                eq("COMPLETED")
        )).willReturn(1L);

        assertThat(deduplicator.complete(claim)).isTrue();

        ArgumentCaptor<RedisScript<Long>> scriptCaptor =
                ArgumentCaptor.forClass(RedisScript.class);
        verify(stringRedisTemplate).execute(
                scriptCaptor.capture(),
                eq(List.of(claim.key())),
                eq(claim.processingValue()),
                eq(String.valueOf(Duration.ofHours(2).toMillis())),
                eq("COMPLETED")
        );
        assertThat(scriptCaptor.getValue().getScriptAsString())
                .contains("psetex");
    }

    @Test
    @SuppressWarnings("unchecked")
    void releasesOnlyTheOwnedProcessingClaim() {
        var claim = new GameMessageDeduplicator.ProcessingClaim(
                "event-key",
                "PROCESSING:token"
        );
        given(stringRedisTemplate.execute(
                any(RedisScript.class),
                eq(List.of(claim.key())),
                eq(claim.processingValue())
        )).willReturn(1L);

        assertThat(deduplicator.release(claim)).isTrue();

        ArgumentCaptor<RedisScript<Long>> scriptCaptor =
                ArgumentCaptor.forClass(RedisScript.class);
        verify(stringRedisTemplate).execute(
                scriptCaptor.capture(),
                eq(List.of(claim.key())),
                eq(claim.processingValue())
        );
        assertThat(scriptCaptor.getValue().getScriptAsString())
                .contains("del");
    }
}
