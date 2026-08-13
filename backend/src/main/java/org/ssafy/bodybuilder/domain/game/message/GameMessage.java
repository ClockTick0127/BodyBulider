package org.ssafy.bodybuilder.domain.game.message;

import java.time.LocalDateTime;
import java.util.UUID;

public record GameMessage<T>(
        GameMessageType type,
        UUID eventId,
        UUID roomSessionId,
        UUID gameSessionId,
        LocalDateTime occurredAt,
        T payload
){
    public static <T> GameMessage<T> of(
            GameMessageType type,
            UUID roomSessionId,
            UUID gameSessionId,
            T payload
    ){
        return new GameMessage<>(
                type,
                UUID.randomUUID(),
                roomSessionId,
                gameSessionId,
                LocalDateTime.now(),
                payload
        );
    }
}

