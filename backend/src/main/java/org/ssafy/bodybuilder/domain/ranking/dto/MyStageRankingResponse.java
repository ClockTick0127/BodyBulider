package org.ssafy.bodybuilder.domain.ranking.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;
import org.ssafy.bodybuilder.domain.ranking.repository.RankingRepository.MyStageRankingProjection;

public record MyStageRankingResponse(
        @JsonProperty("stage_id") Integer stageId,
        @JsonProperty("stage_name") String stageName,
        Integer rank,
        @JsonProperty("total_participants") Long totalParticipants,
        @JsonProperty("stage_clear_time_ms") Long stageClearTimeMs,
        @JsonProperty("created_at") LocalDateTime createdAt
) {
    public static MyStageRankingResponse from(MyStageRankingProjection row) {
        return new MyStageRankingResponse(
                row.getStageId(),
                row.getStageName(),
                row.getRank(),
                row.getTotalParticipants(),
                row.getStageClearTimeMs(),
                row.getCreatedAt()
        );
    }
}
