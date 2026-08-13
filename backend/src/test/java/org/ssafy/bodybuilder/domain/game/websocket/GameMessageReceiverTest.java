package org.ssafy.bodybuilder.domain.game.websocket;

import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.security.Principal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.domain.game.message.GameMessage;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;

@ExtendWith(MockitoExtension.class)
class GameMessageReceiverTest {

    @Mock
    GameMessageDispatcher dispatcher;

    @Mock
    Principal principal;

    @InjectMocks
    GameMessageReceiver receiver;

    @Test
    void delegatesMessageToDispatcher() {
        ObjectMapper objectMapper = new ObjectMapper();
        JsonNode payload = objectMapper.createObjectNode()
                .put("captureNo", 2)
                .set(
                        "points",
                        objectMapper.createArrayNode()
                                .add(objectMapper.createArrayNode().add(0.34).add(0.42))
                );
        GameMessage<JsonNode> message = GameMessage.of(
                GameMessageType.GAME_CAPTURING_RESPONSE,
                UUID.randomUUID(),
                UUID.randomUUID(),
                payload
        );

        receiver.receive(message, principal);

        verify(dispatcher).dispatch(message, principal);
    }
}
