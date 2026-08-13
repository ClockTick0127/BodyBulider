package org.ssafy.bodybuilder.infra.logging.persistence.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.ByteBuffer;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.ssafy.bodybuilder.infra.logging.persistence.model.ErrorDetailEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

@DataJpaTest(properties = {
        "spring.flyway.enabled=true",
        "spring.sql.init.mode=never",
        "spring.test.database.replace=none",
        "spring.datasource.url=jdbc:h2:mem:logging-repository;"
                + "MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE"
})
class LoggingJpaRepositoryTest {

    private static final UUID GAME_ID =
            UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID ROOM_ID =
            UUID.fromString("20000000-0000-0000-0000-000000000001");
    private static final UUID EVENT_ID =
            UUID.fromString("30000000-0000-0000-0000-000000000001");

    @Autowired
    private GameSessionJpaRepository gameSessionRepository;

    @Autowired
    private SessionEventJpaRepository sessionEventRepository;

    @Autowired
    private GameRoundReplayJpaRepository roundReplayRepository;

    @Autowired
    private ErrorDetailJpaRepository errorDetailRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void nativeArchiveQueriesAreIdempotentAndReadable() {
        LocalDateTime startedAt = LocalDateTime.of(2026, 7, 31, 14, 0);
        LocalDateTime endedAt = startedAt.plusMinutes(2);

        insertGameSession(startedAt, endedAt);
        insertGameSession(startedAt, endedAt);
        insertSessionEvent(startedAt);
        insertSessionEvent(startedAt);
        insertRoundReplay();
        insertRoundReplay();

        var sessions = gameSessionRepository.findArchivedGames(10);
        var events = sessionEventRepository.findSessionEvents(
                uuidBytes(GAME_ID),
                10
        );
        var roundReplays = roundReplayRepository.findRoundReplays(
                uuidBytes(GAME_ID)
        );

        assertThat(sessions).hasSize(1);
        assertThat(toUuid(sessions.getFirst().getGameSessionId()))
                .isEqualTo(GAME_ID);
        assertThat(sessions.getFirst().getRoomTitle()).isEqualTo("테스트 방");
        assertThat(events).hasSize(1);
        assertThat(toUuid(events.getFirst().getEventId())).isEqualTo(EVENT_ID);
        assertThat(events.getFirst().getSummary()).isNotNull();
        assertThat(roundReplays).hasSize(1);
        assertThat(roundReplays.getFirst().getRoundNo()).isEqualTo(1);
        assertThat(roundReplays.getFirst().getPoses().toString())
                .contains("p1Bridge");
        assertThat(roundReplays.getFirst().getSimulation().toString())
                .contains("intervalMs");
    }

    @Test
    void errorDetailUsesJpaJsonAndNativeRetentionQueries() {
        UUID activeErrorId = UUID.randomUUID();
        UUID expiredErrorId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.of(2026, 7, 31, 14, 0);

        errorDetailRepository.saveAndFlush(errorDetail(
                activeErrorId,
                now,
                now.plusDays(7)
        ));
        errorDetailRepository.saveAndFlush(errorDetail(
                expiredErrorId,
                now.minusDays(8),
                now.minusDays(1)
        ));

        var detail = errorDetailRepository.findActiveDetail(
                uuidBytes(activeErrorId)
        );
        int deleted = errorDetailRepository.deleteExpired();

        assertThat(detail).isPresent();
        assertThat(detail.orElseThrow().getContext()).isNotNull();
        assertThat(deleted).isEqualTo(1);
        assertThat(errorDetailRepository.existsById(expiredErrorId)).isFalse();
    }

    private void insertGameSession(
            LocalDateTime startedAt,
            LocalDateTime endedAt
    ) {
        gameSessionRepository.insertIfAbsent(
                uuidBytes(GAME_ID),
                uuidBytes(ROOM_ID),
                "ABC123",
                "테스트 방",
                1,
                "COMPLETED",
                "CLEARED",
                startedAt,
                endedAt
        );
    }

    private void insertSessionEvent(LocalDateTime occurredAt) {
        sessionEventRepository.insertIfAbsent(
                uuidBytes(GAME_ID),
                1L,
                uuidBytes(EVENT_ID),
                "GAME_STARTED",
                "GAME_START_RESPONSE",
                "INFO",
                "INTERNAL",
                "SUCCESS",
                null,
                "{\"stageId\":1}",
                13L,
                2L,
                null,
                occurredAt,
                occurredAt,
                (short) 1
        );
    }

    private void insertRoundReplay() {
        roundReplayRepository.insertIfAbsent(
                uuidBytes(GAME_ID),
                1,
                "{\"p1Bridge\":[[0.1,0.2]],\"p2Bridge\":[],"
                        + "\"p3Bridge\":[],\"p4Bridge\":[]}",
                "{\"intervalMs\":30,\"points\":[[1,2,3,4]],\"result\":false}"
        );
    }

    private ErrorDetailEntity errorDetail(
            UUID errorId,
            LocalDateTime createdAt,
            LocalDateTime expiresAt
    ) {
        return ErrorDetailEntity.create(
                errorId,
                "REST",
                "C004",
                IllegalStateException.class.getName(),
                "test",
                "stack",
                ROOM_ID,
                GAME_ID,
                null,
                null,
                objectMapper.createObjectNode().put("path", "/test"),
                createdAt,
                expiresAt
        );
    }

    private byte[] uuidBytes(UUID value) {
        ByteBuffer buffer = ByteBuffer.allocate(16);
        buffer.putLong(value.getMostSignificantBits());
        buffer.putLong(value.getLeastSignificantBits());
        return buffer.array();
    }

    private UUID toUuid(byte[] bytes) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        return new UUID(buffer.getLong(), buffer.getLong());
    }
}
