package org.ssafy.bodybuilder.domain.game.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.ssafy.bodybuilder.domain.game.model.Stage;

public record StageListResponse(
        @JsonProperty("stage_id") Integer stageId,
        String name,
        String description,
        String difficulty,
        @JsonProperty("thumbnail_url") String thumbnailUrl
) {
    public static StageListResponse from(Stage stage) {
        return new StageListResponse(
                stage.getId(),
                stage.getName(),
                stage.getDescription(),
                stage.getDifficulty(),
                stage.getThumbnailUrl()
        );
    }
}
