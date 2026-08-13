package org.ssafy.bodybuilder.domain.game.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;

@ExtendWith(MockitoExtension.class)
class RoomLockManagerTest {

    @InjectMocks
    private RoomLockManager roomLockManager;

    @Mock
    private StringRedisTemplate stringRedisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @BeforeEach
    void setUp() {
        given(stringRedisTemplate.opsForValue()).willReturn(valueOperations);
    }

    @Test
    @DisplayName("첫 번째 시도에 락을 획득하면 연산을 즉시 실행하고 락을 해제한다.")
    void withLock_SuccessOnFirstAttempt() {
        // given
        UUID roomId = UUID.randomUUID();
        given(valueOperations.setIfAbsent(anyString(), anyString(), any())).willReturn(true);

        // when
        String result = roomLockManager.withLock(roomId, () -> "SUCCESS");

        // then
        assertThat(result).isEqualTo("SUCCESS");
    }

    @Test
    @DisplayName("첫 시도 실패 후 재시도 시 락 획득에 성공하면 연산이 정상 실행된다.")
    void withLock_SuccessOnRetry() {
        // given
        UUID roomId = UUID.randomUUID();
        given(valueOperations.setIfAbsent(anyString(), anyString(), any()))
                .willReturn(false) // 첫 시도 실패
                .willReturn(true);  // 두 번째 시도 성공

        // when
        String result = roomLockManager.withLockWithRetry(roomId, () -> "RETRY_SUCCESS", 3, 10L);

        // then
        assertThat(result).isEqualTo("RETRY_SUCCESS");
    }

    @Test
    @DisplayName("최대 재시도 횟수까지 락을 획득하지 못하면 GlobalException(ROOM_OPERATION_BUSY)을 발생시킨다.")
    void withLock_FailAfterMaxRetries() {
        // given
        UUID roomId = UUID.randomUUID();
        given(valueOperations.setIfAbsent(anyString(), anyString(), any())).willReturn(false);

        // when & then
        assertThatThrownBy(() -> roomLockManager.withLockWithRetry(roomId, () -> "FAIL", 3, 10L))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ROOM_OPERATION_BUSY);
    }
}
