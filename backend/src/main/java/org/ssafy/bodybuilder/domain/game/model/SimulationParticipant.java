package org.ssafy.bodybuilder.domain.game.model;

import java.util.UUID;

public record SimulationParticipant(
        UUID participantId,
        int playerNo
) {
}
