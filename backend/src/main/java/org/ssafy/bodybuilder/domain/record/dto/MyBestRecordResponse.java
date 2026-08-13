package org.ssafy.bodybuilder.domain.record.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

public record MyBestRecordResponse(
        @JsonProperty("stage_id") Integer stageId,
        String name,
        @JsonProperty("stage_clear_time_ms") Long stageClearTimeMs,
        @JsonProperty("created_at") LocalDateTime createdAt
) {
}
