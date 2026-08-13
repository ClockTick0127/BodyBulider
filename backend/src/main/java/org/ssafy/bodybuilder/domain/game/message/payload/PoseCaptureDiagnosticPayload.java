package org.ssafy.bodybuilder.domain.game.message.payload;

import java.util.Map;

public record PoseCaptureDiagnosticPayload(
        String primaryReason,
        Map<String, Integer> reasonCounts,
        Integer detectionAttempts,
        Integer successfulDetections,
        Boolean cameraOn,
        Boolean poseModelLoading,
        String visibilityState,
        VideoState videoState,
        String exceptionName
) {
    public record VideoState(
            Integer readyState,
            Boolean paused,
            Boolean ended,
            Integer width,
            Integer height,
            Double currentTime
    ) {
    }
}
