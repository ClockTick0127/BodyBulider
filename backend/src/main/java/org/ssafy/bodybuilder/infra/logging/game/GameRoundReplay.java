package org.ssafy.bodybuilder.infra.logging.game;

import java.util.List;

public record GameRoundReplay(
        Integer roundNo,
        RoundPoses poses,
        Simulation simulation
) {

    public static GameRoundReplay of(
            Integer roundNo,
            List<List<List<Double>>> poses,
            Integer intervalMs,
            List<List<Double>> simulationPoints,
            Boolean result
    ) {
        return new GameRoundReplay(
                roundNo,
                new RoundPoses(
                        bridgeAt(poses, 0),
                        bridgeAt(poses, 1),
                        bridgeAt(poses, 2),
                        bridgeAt(poses, 3)
                ),
                new Simulation(
                        intervalMs,
                        simulationPoints == null
                                ? List.of()
                                : List.copyOf(simulationPoints),
                        Boolean.TRUE.equals(result)
                )
        );
    }

    private static List<List<Double>> bridgeAt(
            List<List<List<Double>>> poses,
            int index
    ) {
        if (poses == null || index >= poses.size() || poses.get(index) == null) {
            return List.of();
        }
        return List.copyOf(poses.get(index));
    }

    public record RoundPoses(
            List<List<Double>> p1Bridge,
            List<List<Double>> p2Bridge,
            List<List<Double>> p3Bridge,
            List<List<Double>> p4Bridge
    ) {
    }

    public record Simulation(
            Integer intervalMs,
            List<List<Double>> points,
            Boolean result
    ) {
    }
}
