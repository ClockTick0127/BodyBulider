package org.ssafy.bodybuilder.domain.room.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RoomSessionRepositoryTest {

    @InjectMocks
    private RoomSessionRepository roomSessionRepository;

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

    @Mock
    private SetOperations<String, Object> setOperations;

    @Mock
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        given(redisTemplate.opsForValue()).willReturn(valueOperations);
        given(redisTemplate.opsForSet()).willReturn(setOperations);
    }

    @Test
    @DisplayName("saveRoom - 비밀방이어도 WAITING 상태이고 정원이 남아있으면 rooms:waiting 레디스 세트에 추가된다")
    void saveRoom_secretRoom_addedToWaitingRoomsSet() {
        UUID roomId = UUID.randomUUID();
        UUID hostId = UUID.randomUUID();
        RoomSession secretRoom = new RoomSession(roomId, "CODE", "비밀방", "1234", hostId, "host");

        roomSessionRepository.saveRoom(secretRoom);

        verify(setOperations).add("rooms:waiting", roomId.toString());
    }

    @Test
    @DisplayName("findAllWaitingRooms - 비밀방이어도 WAITING 상태이면 대기방 목록에 포함된다")
    void findAllWaitingRooms_includesSecretRooms() {
        UUID roomId = UUID.randomUUID();
        UUID hostId = UUID.randomUUID();
        RoomSession secretRoom = new RoomSession(roomId, "CODE", "비밀방", "1234", hostId, "host");

        given(setOperations.members("rooms:waiting")).willReturn(Set.of(roomId.toString()));
        given(valueOperations.multiGet(List.of("room:" + roomId))).willReturn(List.of(secretRoom));

        List<RoomSession> result = roomSessionRepository.findAllWaitingRooms();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).isSecret()).isTrue();
        assertThat(result.get(0).getRoomId()).isEqualTo(roomId);
    }
}
