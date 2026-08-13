package org.ssafy.bodybuilder.domain.game.websocket.handler;

import org.ssafy.bodybuilder.domain.game.message.GameMessage;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;

import java.security.Principal;

public interface GameMessageHandler<T> {
    GameMessageType type();

    Class<T> payloadType();

    void handle(
            GameMessage<T> message,
            Principal principal
    );
}
