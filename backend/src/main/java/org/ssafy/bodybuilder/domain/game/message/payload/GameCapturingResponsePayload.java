package org.ssafy.bodybuilder.domain.game.message.payload;

import java.util.List;

public record GameCapturingResponsePayload(
        Integer captureNo,
        List<List<Double>> points,
        PoseCaptureDiagnosticPayload diagnostic
) {
    public GameCapturingResponsePayload(
            Integer captureNo,
            List<List<Double>> points
    ) {
        this(captureNo, points, null);
    }
}
