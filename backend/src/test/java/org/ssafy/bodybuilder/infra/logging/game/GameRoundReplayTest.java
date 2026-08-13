package org.ssafy.bodybuilder.infra.logging.game;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class GameRoundReplayTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void exposesFourPoseSlotsAndFrontendSimulationShape() {
        List<List<Double>> bridge = List.of(
                List.of(0.09, 0.58),
                List.of(0.92, 0.59)
        );
        GameRoundReplay replay = GameRoundReplay.of(
                2,
                List.of(bridge, List.of(), List.of(), List.of()),
                30,
                List.of(List.of(100.0, 500.0, 0.0, 0.0)),
                false
        );

        var json = objectMapper.valueToTree(replay);

        assertThat(json.path("roundNo").asInt()).isEqualTo(2);
        assertThat(json.path("poses").path("p1Bridge")).hasSize(2);
        assertThat(json.path("poses").path("p2Bridge")).isEmpty();
        assertThat(json.path("poses").path("p3Bridge")).isEmpty();
        assertThat(json.path("poses").path("p4Bridge")).isEmpty();
        assertThat(json.path("simulation").path("intervalMs").asInt())
                .isEqualTo(30);
        assertThat(json.path("simulation").path("points").get(0)).hasSize(4);
        assertThat(json.path("simulation").path("result").asBoolean()).isFalse();
    }
}
