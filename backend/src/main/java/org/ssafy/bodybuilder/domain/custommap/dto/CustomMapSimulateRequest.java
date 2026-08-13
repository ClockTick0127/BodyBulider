package org.ssafy.bodybuilder.domain.custommap.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 창작마당 에디터 시뮬레이션 요청.
 *
 * <p>기존 /api/v1/dev/simulate는 요청 키가 mapConfig(camelCase)였다.
 * 새 엔드포인트는 map_config로 통일한다 — FE가 키를 바꿔야 한다.
 */
public record CustomMapSimulateRequest(
        @NotNull(message = "map_config는 필수입니다.")
        @JsonProperty("map_config")
        JsonNode mapConfig,

        List<List<List<Double>>> poses
) {
}
