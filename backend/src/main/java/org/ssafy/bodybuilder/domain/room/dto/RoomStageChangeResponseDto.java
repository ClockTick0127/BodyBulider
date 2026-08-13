package org.ssafy.bodybuilder.domain.room.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoomStageChangeResponseDto {

    private UUID roomId;
    private String roomCode;
    private Integer selectedStageId;
}
