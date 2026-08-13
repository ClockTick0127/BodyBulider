package org.ssafy.bodybuilder.domain.game.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;
import org.ssafy.bodybuilder.domain.game.message.GameMessage;

import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class GameMessageReceiver {

    private final GameMessageDispatcher dispatcher;

    /// 메시지를 수신합니다.
    /// @param message
    @MessageMapping("/game/message")
    public void receive(
            GameMessage<JsonNode> message,
            Principal principal
    ) {
        dispatcher.dispatch(message,principal);
    }
}
