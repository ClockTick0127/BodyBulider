package org.ssafy.bodybuilder.domain.room.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomSessionTest {

    @Test
    @DisplayName("방 생성 - 첫 번째 사용자는 슬롯 1번에 배정되고 방장 권한을 갖는다")
    void createRoom_assignsSlot1AndHost() {
        UUID roomId = UUID.randomUUID();
        UUID firstUserId = UUID.randomUUID();
        String nickname = "host_user";

        RoomSession room = new RoomSession(roomId, "TEST", firstUserId, nickname);

        assertThat(room.getRoomId()).isEqualTo(roomId);
        assertThat(room.getRoomCode()).isEqualTo("TEST");
        assertThat(room.getHostUserId()).isEqualTo(firstUserId);

        Participant participant = room.getParticipants().get(firstUserId);
        assertThat(participant).isNotNull();
        assertThat(participant.getSlotId()).isEqualTo(1);
        assertThat(participant.isHost()).isTrue();
    }

    @Test
    @DisplayName("비밀방 생성 및 비밀번호 검증 테스트")
    void createSecretRoom_verifiesPassword() {
        UUID hostId = UUID.randomUUID();
        RoomSession room = new RoomSession(UUID.randomUUID(), "TEST", "비밀방", "1234", hostId, "host");

        assertThat(room.isSecret()).isTrue();
        assertThat(room.getTitle()).isEqualTo("비밀방");
        assertThat(room.verifyPassword("1234")).isTrue();
        assertThat(room.verifyPassword("wrong")).isFalse();
        assertThat(room.verifyPassword(null)).isFalse();
    }

    @Test
    @DisplayName("공개방 생성 시 비밀번호 검증은 항상 true를 반환한다")
    void createPublicRoom_verifyPasswordAlwaysTrue() {
        UUID hostId = UUID.randomUUID();
        RoomSession room = new RoomSession(UUID.randomUUID(), "TEST", "공개방", null, hostId, "host");

        assertThat(room.isSecret()).isFalse();
        assertThat(room.verifyPassword(null)).isTrue();
        assertThat(room.verifyPassword("anything")).isTrue();
    }

    @Test
    @DisplayName("참가자 추가 - 두 번째 참가자는 슬롯 2번에 배정되고 방장이 아니다")
    void addParticipant_assignsNextSlotAndNotHost() {
        UUID hostId = UUID.randomUUID();
        RoomSession room = new RoomSession(UUID.randomUUID(), "TEST", hostId, "host");

        UUID user2Id = UUID.randomUUID();
        Participant p2 = room.addParticipant(user2Id, "user2", false);

        assertThat(p2.getSlotId()).isEqualTo(2);
        assertThat(p2.isHost()).isFalse();
        assertThat(room.getParticipants()).hasSize(2);
    }

    @Test
    @DisplayName("참가자 추가 - 정원(4명) 초과 시 IllegalStateException 발생")
    void addParticipant_exceedsCapacity_throwsException() {
        UUID hostId = UUID.randomUUID();
        RoomSession room = new RoomSession(UUID.randomUUID(), "TEST", hostId, "host");

        for (int i = 2; i <= 4; i++) {
            room.addParticipant(UUID.randomUUID(), "user" + i, false);
        }
        assertThat(room.isFull()).isTrue();

        UUID fifthUserId = UUID.randomUUID();
        assertThatThrownBy(() -> room.addParticipant(fifthUserId, "user5", false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("방의 정원이 가득 찼습니다.");
    }

    @Test
    @DisplayName("참가자 퇴장 - 방장이 퇴장하면 다음 참가자에게 방장 권한이 이관된다")
    void removeParticipant_hostLeaves_transfersHostToNextParticipant() {
        UUID hostId = UUID.randomUUID();
        RoomSession room = new RoomSession(UUID.randomUUID(), "TEST", hostId, "host");

        UUID user2Id = UUID.randomUUID();
        room.addParticipant(user2Id, "user2", false);

        room.removeParticipant(hostId);

        assertThat(room.getParticipants()).hasSize(1);
        assertThat(room.getHostUserId()).isEqualTo(user2Id);
        assertThat(room.getParticipants().get(user2Id).isHost()).isTrue();
    }

    @Test
    @DisplayName("참가자 퇴장 - 퇴장한 참가자의 슬롯 번호는 다시 비어있는 상태가 된다")
    void removeParticipant_freesSlotNumber() {
        UUID hostId = UUID.randomUUID();
        RoomSession room = new RoomSession(UUID.randomUUID(), "TEST", hostId, "host");

        UUID user2Id = UUID.randomUUID();
        room.addParticipant(user2Id, "user2", false);

        room.removeParticipant(user2Id);

        UUID user3Id = UUID.randomUUID();
        Participant p3 = room.addParticipant(user3Id, "user3", false);

        assertThat(p3.getSlotId()).isEqualTo(2);
    }
}
