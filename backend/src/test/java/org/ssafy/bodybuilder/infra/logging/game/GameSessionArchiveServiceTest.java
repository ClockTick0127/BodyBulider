package org.ssafy.bodybuilder.infra.logging.game;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLiveEventPublisher;

class GameSessionArchiveServiceTest {

    private final GameSessionEventStore eventStore = mock(GameSessionEventStore.class);
    private final GameRoundReplayStore replayStore = mock(GameRoundReplayStore.class);
    private final GameSessionArchiveWriter archiveWriter = mock(GameSessionArchiveWriter.class);
    private final AdminLiveEventPublisher publisher = mock(AdminLiveEventPublisher.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GameSessionArchiveService service = new GameSessionArchiveService(
            eventStore,
            replayStore,
            archiveWriter,
            publisher
    );

    private UUID gameSessionId;
    private UUID roomSessionId;
    private LocalDateTime startedAt;
    private GameSessionEvent terminal;
    private List<GameSessionEvent> events;

    @BeforeEach
    void setUp() {
        gameSessionId = UUID.randomUUID();
        roomSessionId = UUID.randomUUID();
        startedAt = LocalDateTime.of(2026, 8, 1, 10, 0);
        GameSessionEvent started = event(
                "GAME_STARTED",
                Map.of(
                        "roomSessionId", roomSessionId.toString(),
                        "roomCode", "ABC123",
                        "roomTitle", "test room",
                        "stageId", 1,
                        "startedAt", startedAt.toString()
                ),
                startedAt
        );
        terminal = event(
                "GAME_COMPLETED",
                Map.of(
                        "finalStatus", "COMPLETED",
                        "gameResult", "CLEARED"
                ),
                startedAt.plusMinutes(2)
        );
        events = List.of(started, terminal);
        when(eventStore.readAll(gameSessionId)).thenReturn(events);
        when(replayStore.readAll(gameSessionId)).thenReturn(List.of());
    }

    @Test
    void publishesArchivedDeltaOnlyAfterArchiveSucceeds() {
        boolean archived = service.archive(
                gameSessionId,
                roomSessionId,
                "COMPLETED",
                "CLEARED",
                terminal.occurredAt()
        );

        assertThat(archived).isTrue();
        InOrder order = inOrder(
                archiveWriter,
                publisher,
                eventStore,
                replayStore
        );
        order.verify(archiveWriter).archive(
                gameSessionId,
                roomSessionId,
                "ABC123",
                "test room",
                1,
                "COMPLETED",
                "CLEARED",
                startedAt,
                terminal.occurredAt(),
                events,
                List.of()
        );
        order.verify(publisher).publishArchived(gameSessionId, terminal);
        order.verify(eventStore).markArchived(gameSessionId);
        order.verify(replayStore).markArchived(gameSessionId, List.of());
    }

    @Test
    void doesNotPublishArchivedDeltaWhenDatabaseArchiveFails() {
        doThrow(new IllegalStateException("database unavailable"))
                .when(archiveWriter)
                .archive(
                        any(),
                        any(),
                        anyString(),
                        anyString(),
                        anyInt(),
                        anyString(),
                        nullable(String.class),
                        any(),
                        any(),
                        anyList(),
                        anyList()
                );

        boolean archived = service.archive(
                gameSessionId,
                roomSessionId,
                "COMPLETED",
                "CLEARED",
                terminal.occurredAt()
        );

        assertThat(archived).isFalse();
        verify(publisher, never()).publishArchived(any(), any());
        verify(eventStore, never()).markArchived(any());
    }

    private GameSessionEvent event(
            String type,
            Map<String, Object> summary,
            LocalDateTime occurredAt
    ) {
        return new GameSessionEvent(
                UUID.randomUUID(),
                type,
                null,
                "INFO",
                "INTERNAL",
                "SUCCESS",
                null,
                objectMapper.valueToTree(summary),
                null,
                null,
                null,
                occurredAt,
                occurredAt,
                (short) 1
        );
    }
}
