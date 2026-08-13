package org.ssafy.bodybuilder.domain.game.util;

import java.util.Map;

/** 프런트엔드에 번들된 시작 컷씬의 재생 시간과 서버 촬영 시작 시점을 맞춘다. */
public final class StageCutsceneCatalog {

    private static final int TRANSITION_BUFFER_MS = 1_000;
    private static final Map<Integer, Integer> START_DURATION_MS_BY_STAGE = Map.of(
            1, 10_000,
            2, 8_000
    );

    private StageCutsceneCatalog() {
    }

    public static int startDelayMs(int stageId, boolean cutscenesEnabled) {
        if (!cutscenesEnabled) {
            return GameConstants.CAPTURE_INITIAL_DELAY_MS;
        }
        Integer durationMs = START_DURATION_MS_BY_STAGE.get(stageId);
        if (durationMs == null) {
            return GameConstants.CAPTURE_INITIAL_DELAY_MS;
        }
        return GameConstants.CAPTURE_INITIAL_DELAY_MS + durationMs + TRANSITION_BUFFER_MS;
    }
}
