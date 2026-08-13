package org.ssafy.bodybuilder.domain.game.dto;

import org.ssafy.bodybuilder.domain.game.model.Stage;

public record StageSummaryResponse(
        Integer id,
        String name
) {
    public static StageSummaryResponse from(Stage stage) {
        return new StageSummaryResponse(
                stage.getId(),
                stage.getName()
        );
    }
}
