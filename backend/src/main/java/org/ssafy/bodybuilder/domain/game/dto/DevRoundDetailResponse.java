package org.ssafy.bodybuilder.domain.game.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import org.ssafy.bodybuilder.domain.game.model.StageRound;

/**
 * 맵 에디터 라운드 상세 DTO. map_config 원본을 그대로 실어 보낸다.
 */
public record DevRoundDetailResponse(
        @JsonProperty("round_id") Integer roundId,
        @JsonProperty("stage_id") Integer stageId,
        @JsonProperty("round_no") Integer roundNo,
        @JsonProperty("stage_name") String stageName,
        @JsonProperty("map_config") JsonNode mapConfig
) {
    public static DevRoundDetailResponse of(StageRound round, String stageName) {
        return new DevRoundDetailResponse(
                round.getId(),
                round.getStageId(),
                round.getRoundNo(),
                stageName,
                round.getMapConfig()
        );
    }
}
