package org.ssafy.bodybuilder.domain.game.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PlayerPlacementAllocatorTest {

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4})
    void assignsFourPositionsAndIncludesEveryPlayer(int playerCount) {
        List<Integer> playerNos = IntStream.rangeClosed(1, playerCount).boxed().toList();

        List<Integer> placements = PlayerPlacementAllocator.allocate(
                UUID.fromString("12345678-1234-5678-1234-567812345678"),
                playerNos
        );

        assertThat(placements).hasSize(4);
        assertThat(placements).allMatch(playerNos::contains);
        assertThat(placements).containsAll(playerNos);
    }
}
