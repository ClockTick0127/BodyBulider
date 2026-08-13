package org.ssafy.bodybuilder.domain.room.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoomSummaryDto {
    private UUID roomId;
    private String roomCode;
    private String title;

    @Getter(onMethod_ = {@JsonProperty("isSecret")})
    private boolean isSecret;
    private int currentCapacity;
    private int maxCapacity;
    private String hostNickname;
}
