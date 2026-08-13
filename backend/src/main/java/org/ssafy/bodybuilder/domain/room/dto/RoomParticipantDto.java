package org.ssafy.bodybuilder.domain.room.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.ssafy.bodybuilder.domain.room.model.Participant;

import java.util.UUID;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoomParticipantDto {
    private UUID userId;
    private String nickname;
    private int slotId;

    @Getter(onMethod_ = {@JsonProperty("isHost")})
    private boolean isHost;

    @Getter(onMethod_ = {@JsonProperty("isReady")})
    private boolean isReady;

    public static RoomParticipantDto from(Participant participant) {
        if (participant == null) return null;
        return RoomParticipantDto.builder()
                .userId(participant.getUserId())
                .nickname(participant.getNickname())
                .slotId(participant.getSlotId())
                .isHost(participant.isHost())
                .isReady(participant.isReady())
                .build();
    }
}
