package org.ssafy.bodybuilder.domain.game.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StageCutsceneCatalogTest {

    @Test
    void addsRegisteredStageCutsceneDurationAndTransitionBuffer() {
        assertThat(StageCutsceneCatalog.startDelayMs(1, true)).isEqualTo(16_000);
        assertThat(StageCutsceneCatalog.startDelayMs(2, true)).isEqualTo(14_000);
    }

    @Test
    void usesDefaultDelayWhenCutscenesAreDisabledOrStageIsNotRegistered() {
        assertThat(StageCutsceneCatalog.startDelayMs(1, false)).isEqualTo(5_000);
        assertThat(StageCutsceneCatalog.startDelayMs(999, true)).isEqualTo(5_000);
    }
}
