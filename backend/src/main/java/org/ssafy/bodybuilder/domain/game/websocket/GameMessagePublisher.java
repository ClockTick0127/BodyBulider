package org.ssafy.bodybuilder.domain.game.websocket;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.ssafy.bodybuilder.domain.game.message.GameMessage;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;


import java.util.UUID;


@Component
@RequiredArgsConstructor
public class GameMessagePublisher {
    private final SimpMessagingTemplate messagingTemplate;

    public <T> void publishGameMessage(
           GameMessageType type,
           UUID roomSessionId,
           UUID gameSessionId,
           T payload
    ){
       GameMessage<T> message=GameMessage.of(
               type,
               roomSessionId,
               gameSessionId,
               payload
       );

       messagingTemplate.convertAndSend(
               "/topic/rooms/"+roomSessionId+"/game",
               message
       );
    }
}
