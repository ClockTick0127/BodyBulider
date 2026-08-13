package org.ssafy.bodybuilder.infra.logging.game;

import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GameExecutionFailedEventListener {

    private final GameTerminationService gameTerminationService;

    @EventListener
    public void handle(GameExecutionFailedEvent event) {
        gameTerminationService.terminateWithError(
                event.roomSessionId(),
                event.gameSessionId(),
                event.exception(),
                event.source()
        );
    }
}
