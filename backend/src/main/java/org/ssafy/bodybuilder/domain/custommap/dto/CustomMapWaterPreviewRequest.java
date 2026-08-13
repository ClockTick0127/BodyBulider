package org.ssafy.bodybuilder.domain.custommap.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 창작마당 에디터 물길 프리뷰 요청 (개발명세서_BE_물기믹_유니온물길 BE-WATER-07).
 *
 * <p>요청 키는 simulate와 동일하게 map_config(snake_case).
 * poses는 정규화 [0..1]² 좌표, 인덱스 = map_config.players 인덱스, null 엔트리 허용.
 */
public record CustomMapWaterPreviewRequest(
        @NotNull(message = "map_config는 필수입니다.")
        @JsonProperty("map_config")
        JsonNode mapConfig,

        List<List<List<Double>>> poses
) {
}
