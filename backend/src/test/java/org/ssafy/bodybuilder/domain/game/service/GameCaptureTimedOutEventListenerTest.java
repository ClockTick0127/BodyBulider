package org.ssafy.bodybuilder.domain.game.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.ssafy.bodybuilder.domain.game.event.GameCaptureTimedOutEvent;

class GameCaptureTimedOutEventListenerTest {

    private final GameSimulationService gameSimulationService =
            mock(GameSimulationService.class);
    private final GameCaptureTimedOutEventListener listener =
            new GameCaptureTimedOutEventListener(gameSimulationService);

    @Test
    void triesSimulationAfterMissingCaptureIsResolved() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();

        listener.handle(new GameCaptureTimedOutEvent(
                roomSessionId,
                gameSessionId
        ));

        verify(gameSimulationService).simulateIfReady(
                roomSessionId,
                gameSessionId
        );
    }
}
