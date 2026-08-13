package org.ssafy.bodybuilder.domain.room.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class RoomStageChangeRequest {

    @NotNull(message = "스테이지 ID는 필수입니다.")
    private Integer stageId;
}
