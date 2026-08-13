package org.ssafy.bodybuilder.domain.ranking.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record MyRankingSummaryResponse(
        @JsonProperty("best_rank") Integer bestRank,
        @JsonProperty("best_stage_count") Integer bestStageCount,
        @JsonProperty("best_stages") List<MyStageRankingResponse> bestStages,
        List<MyStageRankingResponse> stages
) {
    public static MyRankingSummaryResponse from(List<MyStageRankingResponse> stages) {
        if (stages.isEmpty()) {
            return new MyRankingSummaryResponse(null, 0, List.of(), List.of());
        }

        int bestRank = stages.stream()
                .mapToInt(MyStageRankingResponse::rank)
                .min()
                .orElseThrow();
        List<MyStageRankingResponse> bestStages = stages.stream()
                .filter(stage -> stage.rank() == bestRank)
                .toList();

        return new MyRankingSummaryResponse(
                bestRank,
                bestStages.size(),
                bestStages,
                List.copyOf(stages)
        );
    }
}
