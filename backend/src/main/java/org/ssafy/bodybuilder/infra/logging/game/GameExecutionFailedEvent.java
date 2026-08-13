package org.ssafy.bodybuilder.infra.logging.game;

import java.util.UUID;

public record GameExecutionFailedEvent(
        UUID roomSessionId,
        UUID gameSessionId,
        RuntimeException exception,
        String source
) {
}
