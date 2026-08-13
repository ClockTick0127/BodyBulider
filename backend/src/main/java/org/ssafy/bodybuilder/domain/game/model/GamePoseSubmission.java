package org.ssafy.bodybuilder.domain.game.model;

import java.util.List;

public record GamePoseSubmission(
        Integer player,
        Integer captureNo,
        List<List<Double>> points
) {
}
