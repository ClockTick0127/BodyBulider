package org.ssafy.bodybuilder.infra.logging.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLiveEventPublisher.AdminSessionDelta;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEvent;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventStore;
import org.springframework.messaging.simp.SimpMessagingTemplate;

class AdminLiveEventPublisherTest {

    private final SimpMessagingTemplate messagingTemplate =
            mock(SimpMessagingTemplate.class);
    private final GameSessionEventStore eventStore =
            mock(GameSessionEventStore.class);
    private final AdminLiveEventPublisher publisher =
            new AdminLiveEventPublisher(messagingTemplate, eventStore);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void publishesCompleteActiveGameDelta() {
        UUID gameId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        LocalDateTime startedAt = LocalDateTime.of(2026, 8, 1, 10, 0);
        GameSessionEvent started = event(
                "GAME_STARTED",
                objectMapper.valueToTree(Map.of(
                        "roomSessionId", roomId.toString(),
                        "roomCode", "ABC123",
                        "roomTitle", "test room",
                        "stageId", 1,
                        "participantCount", 2,
                        "startedAt", startedAt.toString()
                )),
                startedAt
        );
        GameSessionEvent latest = event(
                "ROUND_COMPLETED",
                objectMapper.valueToTree(Map.of("roundNo", 1)),
                startedAt.plusMinutes(1)
        );
        when(eventStore.readAll(gameId)).thenReturn(List.of(started, latest));

        publisher.publish(gameId, latest);

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(
                eq("/topic/admin/sessions"),
                captor.capture()
        );
        AdminSessionDelta delta = (AdminSessionDelta) captor.getValue();
        assertThat(delta.type()).isEqualTo("SESSION_UPDATED");
        assertThat(delta.activeGame().gameSessionId()).isEqualTo(gameId);
        assertThat(delta.activeGame().roomSessionId()).isEqualTo(roomId);
        assertThat(delta.activeGame().latestEventType())
                .isEqualTo("ROUND_COMPLETED");
        assertThat(delta.archivedGame()).isNull();
    }

    @Test
    void publishesArchivedGameDeltaForTerminalEvent() {
        UUID gameId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        LocalDateTime startedAt = LocalDateTime.of(2026, 8, 1, 10, 0);
        GameSessionEvent started = event(
                "GAME_STARTED",
                objectMapper.valueToTree(Map.of(
                        "roomSessionId", roomId.toString(),
                        "roomCode", "ABC123",
                        "roomTitle", "test room",
                        "stageId", 1,
                        "participantCount", 2,
                        "startedAt", startedAt.toString()
                )),
                startedAt
        );
        GameSessionEvent completed = event(
                "GAME_COMPLETED",
                objectMapper.valueToTree(Map.of(
                        "finalStatus", "COMPLETED",
                        "gameResult", "CLEARED"
                )),
                startedAt.plusMinutes(2)
        );
        when(eventStore.readAll(gameId)).thenReturn(List.of(started, completed));

        publisher.publish(gameId, completed);

        verify(messagingTemplate, never()).convertAndSend(
                eq("/topic/admin/sessions"),
                org.mockito.ArgumentMatchers.any(Object.class)
        );

        publisher.publishArchived(gameId, completed);

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(
                eq("/topic/admin/sessions"),
                captor.capture()
        );
        AdminSessionDelta delta = (AdminSessionDelta) captor.getValue();
        assertThat(delta.type()).isEqualTo("SESSION_ARCHIVED");
        assertThat(delta.activeGame()).isNull();
        assertThat(delta.archivedGame().finalStatus()).isEqualTo("COMPLETED");
        assertThat(delta.archivedGame().gameResult()).isEqualTo("CLEARED");
    }

    private GameSessionEvent event(
            String eventType,
            com.fasterxml.jackson.databind.JsonNode summary,
            LocalDateTime occurredAt
    ) {
        return new GameSessionEvent(
                UUID.randomUUID(),
                eventType,
                null,
                "INFO",
                "INTERNAL",
                "SUCCESS",
                null,
                summary,
                null,
                null,
                null,
                occurredAt,
                occurredAt,
                (short) 1
        );
    }
}
