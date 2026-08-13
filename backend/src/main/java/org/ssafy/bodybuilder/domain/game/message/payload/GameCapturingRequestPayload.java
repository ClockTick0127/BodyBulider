package org.ssafy.bodybuilder.domain.game.message.payload;

public record GameCapturingRequestPayload(
        Integer player,
        Integer captureNo,
        Integer durationMs
){

}
