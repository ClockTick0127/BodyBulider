package org.ssafy.bodybuilder.domain.game.message.payload;

public record GameResultPayload(
        Integer stars,
        Long elapsedTimeMs,
        Boolean result
) {
}
