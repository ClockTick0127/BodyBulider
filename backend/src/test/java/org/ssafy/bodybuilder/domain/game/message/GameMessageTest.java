package org.ssafy.bodybuilder.domain.game.message;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.ssafy.bodybuilder.domain.game.message.payload.GameCapturingResponsePayload;
import org.ssafy.bodybuilder.domain.game.message.payload.GameResultPayload;

class GameMessageTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void serializesEventTypeAsNumericProtocolCode() throws Exception {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        GameMessage<Map<String, Integer>> message = GameMessage.of(
                GameMessageType.GAME_START_RESPONSE,
                roomSessionId,
                gameSessionId,
                Map.of("stageId", 1)
        );

        String json = objectMapper.writeValueAsString(message);

        assertThat(objectMapper.readTree(json).get("type").asInt()).isEqualTo(101);
        assertThat(objectMapper.readTree(json).get("roomSessionId").asText())
                .isEqualTo(roomSessionId.toString());
        assertThat(objectMapper.readTree(json).get("payload").get("stageId").asInt())
                .isEqualTo(1);
    }

    @Test
    void resolvesEventTypeFromProtocolCode() {
        assertThat(GameMessageType.fromCode(104))
                .isEqualTo(GameMessageType.GAME_SIMULATING_RESPONSE);
        assertThat(GameMessageType.fromCode(105))
                .isEqualTo(GameMessageType.GAME_ROUND_START_RESPONSE);
        assertThat(GameMessageType.fromCode(106))
                .isEqualTo(GameMessageType.GAME_RESULT_RESPONSE);
        assertThat(GameMessageType.fromCode(107))
                .isEqualTo(GameMessageType.GAME_POSE_BROADCAST);
    }

    @Test
    void serializesFinalResultWithStarsAndElapsedTime() throws Exception {
        GameMessage<GameResultPayload> message = GameMessage.of(
                GameMessageType.GAME_RESULT_RESPONSE,
                UUID.randomUUID(),
                UUID.randomUUID(),
                new GameResultPayload(2, 65_432L, false)
        );

        var json = objectMapper.readTree(objectMapper.writeValueAsString(message));

        assertThat(json.get("type").asInt()).isEqualTo(106);
        assertThat(json.get("payload").get("stars").asInt()).isEqualTo(2);
        assertThat(json.get("payload").get("elapsedTimeMs").asLong())
                .isEqualTo(65_432L);
        assertThat(json.get("payload").get("result").asBoolean()).isFalse();
    }

    @Test
    void deserializesPoseMessageWithConcretePayloadType() throws Exception {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        GameCapturingResponsePayload payload = new GameCapturingResponsePayload(
                2,
                List.of(List.of(0.34, 0.42))
        );
        String json = objectMapper.writeValueAsString(GameMessage.of(
                GameMessageType.GAME_CAPTURING_RESPONSE,
                roomSessionId,
                gameSessionId,
                payload
        ));

        GameMessage<GameCapturingResponsePayload> message = objectMapper.readValue(
                json,
                new TypeReference<>() {
                }
        );

        assertThat(message.type()).isEqualTo(GameMessageType.GAME_CAPTURING_RESPONSE);
        assertThat(message.roomSessionId()).isEqualTo(roomSessionId);
        assertThat(message.gameSessionId()).isEqualTo(gameSessionId);
        assertThat(message.payload()).isEqualTo(payload);
    }
}
