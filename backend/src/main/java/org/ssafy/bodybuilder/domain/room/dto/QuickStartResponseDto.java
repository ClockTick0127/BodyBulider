package org.ssafy.bodybuilder.domain.room.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuickStartResponseDto {
    private UUID roomId;
    private String roomCode;
    private String title;

    @Getter(onMethod_ = {@JsonProperty("isSecret")})
    private boolean isSecret;

    private int slotId;

    @Getter(onMethod_ = {@JsonProperty("isHost")})
    private boolean isHost;

    private Integer selectedStageId;

    @Getter(onMethod_ = {@JsonProperty("cutscenesEnabled")})
    private boolean cutscenesEnabled;

    private List<RoomParticipantDto> participants;
}
