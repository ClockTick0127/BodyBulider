package org.ssafy.bodybuilder.domain.game.model;

import java.time.LocalDateTime;
import java.util.List;

public record GameSimulationInput(
        Integer stageId,
        Integer roundNo,
        LocalDateTime startedAt,
        Long accumulatedPlayTimeMs,
        List<SimulationParticipant> participants,
        List<List<List<Double>>> poses
) {
}
