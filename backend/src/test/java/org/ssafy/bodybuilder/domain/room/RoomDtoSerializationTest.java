package org.ssafy.bodybuilder.domain.room;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.ssafy.bodybuilder.domain.room.dto.QuickStartResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomParticipantDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomSummaryDto;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class RoomDtoSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("RoomSummaryDto Jackson 직렬화 시 isSecret 단일 키만 생성되어야 한다")
    void testRoomSummaryDtoSerialization() throws JsonProcessingException {
        RoomSummaryDto dto = RoomSummaryDto.builder()
                .roomId(UUID.randomUUID())
                .roomCode("ABCDEF")
                .title("테스트방")
                .isSecret(true)
                .currentCapacity(1)
                .maxCapacity(4)
                .hostNickname("방장")
                .build();

        String json = objectMapper.writeValueAsString(dto);

        assertThat(json).contains("\"isSecret\":true");
        assertThat(json).doesNotContain("\"secret\":");
    }

    @Test
    @DisplayName("QuickStartResponseDto Jackson 직렬화 시 isSecret, isHost 단일 키만 생성되어야 한다")
    void testQuickStartResponseDtoSerialization() throws JsonProcessingException {
        QuickStartResponseDto dto = QuickStartResponseDto.builder()
                .roomId(UUID.randomUUID())
                .roomCode("ABCDEF")
                .title("테스트방")
                .isSecret(true)
                .slotId(1)
                .isHost(true)
                .cutscenesEnabled(true)
                .build();

        String json = objectMapper.writeValueAsString(dto);

        assertThat(json).contains("\"isSecret\":true");
        assertThat(json).contains("\"isHost\":true");
        assertThat(json).contains("\"cutscenesEnabled\":true");
        assertThat(json).doesNotContain("\"secret\":");
        assertThat(json).doesNotContain("\"host\":");
    }

    @Test
    @DisplayName("RoomParticipantDto Jackson 직렬화 시 isHost, isReady 단일 키만 생성되어야 한다")
    void testRoomParticipantDtoSerialization() throws JsonProcessingException {
        RoomParticipantDto dto = RoomParticipantDto.builder()
                .userId(UUID.randomUUID())
                .nickname("유저1")
                .slotId(1)
                .isHost(true)
                .isReady(true)
                .build();

        String json = objectMapper.writeValueAsString(dto);

        assertThat(json).contains("\"isHost\":true");
        assertThat(json).contains("\"isReady\":true");
        assertThat(json).doesNotContain("\"host\":");
        assertThat(json).doesNotContain("\"ready\":");
    }
}
