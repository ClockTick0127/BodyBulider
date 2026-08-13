package org.ssafy.bodybuilder.domain.game.event;

import java.util.UUID;

public record GameCaptureTimedOutEvent(
        UUID roomSessionId,
        UUID gameSessionId
) {
}
