package org.ssafy.bodybuilder.domain.custommap.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 창작마당 맵 생성 요청.
 *
 * <p>map_config 내부 키는 camelCase 원본 그대로다(startPoint, endPoint, launchVelocity ...).
 * stage_rounds.map_config에 그대로 저장되어 물리 엔진이 직접 읽으므로 키를 바꾸면 안 된다.
 *
 * <p>poses는 클리어 검증용 포즈 시퀀스다. is_public = true로 올리려면 반드시 함께 보내야 하며,
 * 서버가 PhysicsSimulator로 직접 재현해 클리어를 확인한다. 클라이언트의 성공 플래그는 믿지 않는다.
 */
public record CustomMapCreateRequest(
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 100, message = "제목은 100자 이하여야 합니다.")
        String title,

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
    /** 미지정이면 비공개(임시 저장)로 본다. 공개는 클리어 검증을 통과한 요청만 허용한다. */
    public boolean publicOrDefault() {
        return Boolean.TRUE.equals(isPublic);
    }
}
