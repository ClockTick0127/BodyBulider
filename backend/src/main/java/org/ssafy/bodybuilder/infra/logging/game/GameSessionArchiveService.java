package org.ssafy.bodybuilder.infra.logging.game;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLiveEventPublisher;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class GameSessionArchiveService {

    private final GameSessionEventStore eventStore;
    private final GameRoundReplayStore roundReplayStore;
    private final GameSessionArchiveWriter archiveWriter;
    private final AdminLiveEventPublisher liveEventPublisher;

    public boolean archive(
            UUID gameSessionId,
            UUID roomSessionId,
            String finalStatus,
            String gameResult,
            LocalDateTime endedAt
    ) {
        try {
            return doArchive(
                    gameSessionId,
                    roomSessionId,
                    finalStatus,
                    gameResult,
                    endedAt
            );
        } catch (RuntimeException exception) {
            log.error(
                    "[GameSessionArchiveService] Archive failed. gameSessionId={}",
                    gameSessionId,
                    exception
            );
            return false;
        }
    }

    private boolean doArchive(
            UUID gameSessionId,
            UUID roomSessionId,
            String finalStatus,
            String gameResult,
            LocalDateTime endedAt
    ) {
        List<GameSessionEvent> events = eventStore.readAll(gameSessionId);
        GameSessionEvent started = events.stream()
                .filter(event -> "GAME_STARTED".equals(event.eventType()))
                .findFirst()
                .orElse(null);
        if (started == null) {
            log.error(
                    "[GameSessionArchiveService] GAME_STARTED is missing. gameSessionId={}",
                    gameSessionId
            );
            return false;
        }

        JsonNode summary = started.summary();
        List<GameRoundReplay> roundReplays = roundReplayStore.readAll(gameSessionId);
        String roomCode = requiredText(summary, "roomCode");
        String roomTitle = requiredText(summary, "roomTitle");
        int stageId = summary.path("stageId").asInt(0);
        LocalDateTime startedAt = LocalDateTime.parse(requiredText(summary, "startedAt"));
        if (stageId <= 0) {
            log.error(
                    "[GameSessionArchiveService] Invalid stageId in GAME_STARTED. gameSessionId={}",
                    gameSessionId
            );
            return false;
        }
        GameSessionEvent terminal = events.stream()
                .filter(event -> "GAME_COMPLETED".equals(event.eventType())
                        || "GAME_ERROR".equals(event.eventType())
                        || "GAME_ABORTED".equals(event.eventType()))
                .reduce((first, second) -> second)
                .orElse(null);
        if (terminal == null) {
            log.error(
                    "[GameSessionArchiveService] Terminal event is missing. gameSessionId={}",
                    gameSessionId
            );
            return false;
        }

        archiveWriter.archive(
                gameSessionId,
                roomSessionId,
                roomCode,
                roomTitle,
                stageId,
                finalStatus,
                gameResult,
                startedAt,
                endedAt,
                events,
                roundReplays
        );
        publishArchivedSafely(gameSessionId, terminal);
        eventStore.markArchived(gameSessionId);
        roundReplayStore.markArchived(gameSessionId, roundReplays);
        return true;
    }

    private void publishArchivedSafely(
            UUID gameSessionId,
            GameSessionEvent terminal
    ) {
        try {
            liveEventPublisher.publishArchived(gameSessionId, terminal);
        } catch (RuntimeException exception) {
            log.warn(
                    "[GameSessionArchiveService] Failed to publish archived delta. "
                            + "gameSessionId={}",
                    gameSessionId,
                    exception
            );
        }
    }

    private String requiredText(JsonNode summary, String field) {
        JsonNode value = summary == null ? null : summary.get(field);
        if (value == null || value.isNull() || value.asText().isBlank()) {
            throw new IllegalStateException("Required archive field is missing: " + field);
        }
        return value.asText();
    }

}
