package org.ssafy.bodybuilder.domain.game.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.ssafy.bodybuilder.domain.game.model.StageRound;

/**
 * 맵 에디터 라운드 선택 목록용 요약 DTO. (map_config 미포함)
 */
public record DevRoundSummaryResponse(
        @JsonProperty("round_id") Integer roundId,
        @JsonProperty("stage_id") Integer stageId,
        @JsonProperty("round_no") Integer roundNo,
        @JsonProperty("stage_name") String stageName
) {
    public static DevRoundSummaryResponse of(StageRound round, String stageName) {
        return new DevRoundSummaryResponse(
                round.getId(),
                round.getStageId(),
                round.getRoundNo(),
                stageName
        );
    }
}
