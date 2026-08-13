package org.ssafy.bodybuilder.infra.logging.game;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class GameSessionRecoveryService {

    private static final Duration MAX_EVENT_INACTIVITY = Duration.ofMinutes(30);

    private final GameSessionEventStore eventStore;
    private final GameSessionArchiveService archiveService;
    private final GameTerminationService gameTerminationService;
    private final Clock gameClock;

    @EventListener(ApplicationReadyEvent.class)
    public void recoverInterruptedGames() {
        try {
            for (UUID gameSessionId : eventStore.findActiveGameIds()) {
                recover(gameSessionId);
            }
        } catch (RuntimeException exception) {
            log.error("[GameSessionRecoveryService] Recovery scan failed", exception);
        }
    }

    @Scheduled(
            initialDelayString = "${observability.stale-game-initial-delay-ms:300000}",
            fixedDelayString = "${observability.stale-game-check-interval-ms:300000}"
    )
    public void archiveStaleGames() {
        try {
            for (UUID gameSessionId : eventStore.findActiveGameIds()) {
                recoverIfStale(gameSessionId);
            }
        } catch (RuntimeException exception) {
            log.error("[GameSessionRecoveryService] Stale game scan failed", exception);
        }
    }

    private void recover(UUID gameSessionId) {
        List<GameSessionEvent> events = eventStore.readAll(gameSessionId);
        GameSessionEvent started = events.stream()
                .filter(event -> "GAME_STARTED".equals(event.eventType()))
                .findFirst()
                .orElse(null);
        if (started == null) {
            log.error(
                    "[GameSessionRecoveryService] GAME_STARTED is missing. gameSessionId={}",
                    gameSessionId
            );
            eventStore.removeActive(gameSessionId);
            return;
        }
        UUID roomSessionId = UUID.fromString(started.summary().path("roomSessionId").asText());
        GameSessionEvent terminal = terminalEvent(events);

        if (terminal != null) {
            archiveTerminal(gameSessionId, roomSessionId, terminal);
            return;
        }

        gameTerminationService.terminateAborted(
                roomSessionId,
                gameSessionId,
                "SERVER_RESTART"
        );
    }

    private void recoverIfStale(UUID gameSessionId) {
        List<GameSessionEvent> events = eventStore.readAll(gameSessionId);
        if (events.isEmpty()) {
            eventStore.removeActive(gameSessionId);
            return;
        }
        GameSessionEvent started = events.stream()
                .filter(event -> "GAME_STARTED".equals(event.eventType()))
                .findFirst()
                .orElse(null);
        if (started == null) {
            eventStore.removeActive(gameSessionId);
            return;
        }
        UUID roomSessionId = UUID.fromString(
                started.summary().path("roomSessionId").asText()
        );
        GameSessionEvent terminal = terminalEvent(events);
        if (terminal != null) {
            archiveTerminal(gameSessionId, roomSessionId, terminal);
            return;
        }

        GameSessionEvent latest = events.getLast();
        LocalDateTime staleBefore = LocalDateTime.now(gameClock)
                .minus(MAX_EVENT_INACTIVITY);
        if (latest.serverReceivedAt().isBefore(staleBefore)) {
            gameTerminationService.terminateAborted(
                    roomSessionId,
                    gameSessionId,
                    "INACTIVITY_TIMEOUT"
            );
        }
    }

    private GameSessionEvent terminalEvent(List<GameSessionEvent> events) {
        return events.stream()
                .filter(event -> "GAME_COMPLETED".equals(event.eventType())
                        || "GAME_ERROR".equals(event.eventType())
                        || "GAME_ABORTED".equals(event.eventType()))
                .reduce((first, second) -> second)
                .orElse(null);
    }

    private void archiveTerminal(
            UUID gameSessionId,
            UUID roomSessionId,
            GameSessionEvent terminal
    ) {
        String finalStatus = terminal.summary().path("finalStatus").asText();
        if (finalStatus.isBlank()) {
            finalStatus = switch (terminal.eventType()) {
                case "GAME_COMPLETED" -> "COMPLETED";
                case "GAME_ERROR" -> "ERROR";
                default -> "ABORTED";
            };
        }
        String gameResult = terminal.summary().path("gameResult").asText(null);
        archiveService.archive(
                gameSessionId,
                roomSessionId,
                finalStatus,
                gameResult,
                terminal.occurredAt()
        );
    }
}
