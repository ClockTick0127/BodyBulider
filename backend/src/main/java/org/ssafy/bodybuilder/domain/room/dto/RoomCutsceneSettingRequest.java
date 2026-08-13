package org.ssafy.bodybuilder.domain.room.dto;

import jakarta.validation.constraints.NotNull;

public record RoomCutsceneSettingRequest(
        @NotNull(message = "컷씬 사용 여부는 필수입니다.") Boolean enabled
) {
}
