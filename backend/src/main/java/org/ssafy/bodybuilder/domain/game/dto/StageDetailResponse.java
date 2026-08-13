package org.ssafy.bodybuilder.domain.game.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.model.StageRound;

public record StageDetailResponse(
        @JsonProperty("stage_id") Integer stageId,
        String name,
        String description,
        String difficulty,
        @JsonProperty("thumbnail_url") String thumbnailUrl,
        List<RoundSummary> rounds
) {
    public static StageDetailResponse of(Stage stage, List<StageRound> rounds) {
        return new StageDetailResponse(
                stage.getId(),
                stage.getName(),
                stage.getDescription(),
                stage.getDifficulty(),
                stage.getThumbnailUrl(),
                rounds.stream().map(RoundSummary::from).toList()
        );
    }

    public record RoundSummary(
            @JsonProperty("round_id") Integer roundId,
            @JsonProperty("round_no") Integer roundNo
    ) {
        private static RoundSummary from(StageRound round) {
            return new RoundSummary(round.getId(), round.getRoundNo());
        }
    }
}
