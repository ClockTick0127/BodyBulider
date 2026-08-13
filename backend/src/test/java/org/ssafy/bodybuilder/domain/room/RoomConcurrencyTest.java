package org.ssafy.bodybuilder.domain.room;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.room.dto.RoomJoinRequest;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.domain.room.service.RoomService;
import org.ssafy.bodybuilder.domain.room.util.RoomCodeGenerator;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.model.User;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class RoomConcurrencyTest {

    @InjectMocks
    private RoomService roomService;

    @Mock
    private RoomSessionRepository roomSessionRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Mock
    private RoomLockManager roomLockManager;

    @Mock
    private RoomCodeGenerator roomCodeGenerator;

    @BeforeEach
    void setUp() {
        lenient().when(roomLockManager.withLock(any(), any())).thenAnswer(invocation -> {
            Supplier<?> supplier = invocation.getArgument(1);
            synchronized (this) {
                return supplier.get();
            }
        });
    }

    @Test
    @DisplayName("동시성 테스트 - 1자리 남은 방에 10개의 스레드가 동시 입장 시 1개만 성공하고 정원을 초과하지 않는다")
    void joinRoom_concurrentRequests_onlyOneSucceeds() throws InterruptedException {
        // Given: 이미 3명이 참가해 1자리 남은 방
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        String roomCode = "CONC";

        RoomSession room = new RoomSession(roomId, roomCode, "동시성 테스트 방", null, hostId, "host");
        room.addParticipant(UUID.randomUUID(), "user2", false);
        room.addParticipant(UUID.randomUUID(), "user3", false);
        // 인원: 3명 (Max: 4명)

        given(roomSessionRepository.findRoomByCode(roomCode)).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        int threadCount = 10;
        ExecutorService executorService = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch endLatch = new CountDownLatch(threadCount);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger roomFullExceptionCount = new AtomicInteger(0);
        List<UUID> userIds = new ArrayList<>();

        for (int i = 0; i < threadCount; i++) {
            UUID userId = UUID.randomUUID();
            userIds.add(userId);
            User user = User.of("concurrent_user_" + i);
            given(userRepository.findById(userId)).willReturn(Optional.of(user));
        }

        // When: 10개 스레드가 동시 joinRoom 호출
        for (int i = 0; i < threadCount; i++) {
            final UUID userId = userIds.get(i);
            executorService.submit(() -> {
                try {
                    startLatch.await();
                    roomService.joinRoom(userId, new RoomJoinRequest(roomCode, null));
                    successCount.incrementAndGet();
                } catch (GlobalException e) {
                    if (e.getErrorCode() == ErrorCode.ROOM_FULL || e.getErrorCode() == ErrorCode.ROOM_OPERATION_BUSY) {
                        roomFullExceptionCount.incrementAndGet();
                    }
                } catch (Exception ignored) {
                } finally {
                    endLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        endLatch.await();
        executorService.shutdown();

        // Then: 정확히 1개 스레드만 성공하고 인원수는 4명
        assertThat(successCount.get()).isEqualTo(1);
        assertThat(roomFullExceptionCount.get()).isEqualTo(9);
        assertThat(room.getParticipants()).hasSize(4);
    }
}
