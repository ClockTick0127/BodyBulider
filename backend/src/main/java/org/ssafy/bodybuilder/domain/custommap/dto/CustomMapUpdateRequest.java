package org.ssafy.bodybuilder.domain.custommap.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 창작마당 맵 수정 요청.
 *
 * <p>title은 수정 대상이 아니다. stages.name(UNIQUE)까지 함께 갱신해야 하는데
 * Stage 엔티티에 이름 변경 메서드가 없다. (Phase 2 과제)
 *
 * <p>map_config가 바뀌면 이전 클리어 검증은 무효다. 따라서 공개 상태로 저장하려면
 * 이미 공개된 맵이라도 poses를 다시 제출해 재검증을 받아야 한다.
 */
public record CustomMapUpdateRequest(
        @NotBlank(message = "설명은 필수입니다.")
        @Size(max = 255, message = "설명은 255자 이하여야 합니다.")
        String description,

        @NotBlank(message = "난이도는 필수입니다.")
        String difficulty,

        @NotNull(message = "palette는 필수입니다.")
        List<String> palette,

        @JsonProperty("is_public")
        Boolean isPublic,

        @NotNull(message = "map_config는 필수입니다.")
        @JsonProperty("map_config")
        JsonNode mapConfig,

        /** 클리어 검증용 포즈. is_public = true면 필수. */
        List<List<List<Double>>> poses
) {
    /** 미지정이면 비공개(임시 저장)로 본다. */
    public boolean publicOrDefault() {
        return Boolean.TRUE.equals(isPublic);
    }
}
