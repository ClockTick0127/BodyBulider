package org.ssafy.bodybuilder.domain.game.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * 맵 에디터 저장 요청. snake_case(map_config)와 camelCase(mapConfig)를 모두 받는다.
 */
public record DevRoundUpdateRequest(
        @JsonProperty("map_config")
        @JsonAlias({"mapConfig"})
        JsonNode mapConfig
) {
}
