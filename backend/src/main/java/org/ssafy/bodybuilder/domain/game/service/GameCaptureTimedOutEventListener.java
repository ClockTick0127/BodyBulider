package org.ssafy.bodybuilder.domain.game.service;

import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.domain.game.event.GameCaptureTimedOutEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GameCaptureTimedOutEventListener {

    private final GameSimulationService gameSimulationService;

    @EventListener
    public void handle(GameCaptureTimedOutEvent event) {
        gameSimulationService.simulateIfReady(
                event.roomSessionId(),
                event.gameSessionId()
        );
    }
}
