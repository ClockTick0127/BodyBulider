package org.ssafy.bodybuilder.domain.game.util;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.UUID;

public final class PlayerPlacementAllocator {

    private PlayerPlacementAllocator() {
    }

    public static List<Integer> allocate(UUID gameSessionId, List<Integer> playerNos) {
        if (playerNos == null || playerNos.isEmpty()) {
            return List.of();
        }

        List<Integer> distinctPlayerNos = playerNos.stream().distinct().toList();
        Random random = new Random(gameSessionId.getMostSignificantBits()
                ^ gameSessionId.getLeastSignificantBits());
        List<Integer> placements = new ArrayList<>(distinctPlayerNos);
        while (placements.size() < GameConstants.CAPTURE_REQUEST_COUNT) {
            placements.add(distinctPlayerNos.get(random.nextInt(distinctPlayerNos.size())));
        }
        Collections.shuffle(placements, random);
        return List.copyOf(placements);
    }
}
