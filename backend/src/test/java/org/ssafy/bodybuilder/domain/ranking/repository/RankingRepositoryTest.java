package org.ssafy.bodybuilder.domain.ranking.repository;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.EntityManager;
import java.nio.ByteBuffer;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.ssafy.bodybuilder.domain.record.repository.StageRecordRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

@DataJpaTest(properties = "spring.flyway.enabled=false")
class RankingRepositoryTest {

    private static final UUID USER_A = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID USER_B = UUID.fromString("00000000-0000-0000-0000-000000000002");

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private RankingRepository rankingRepository;

    @Autowired
    private StageRecordRepository stageRecordRepository;

    @BeforeEach
    void setUp() {
        entityManager.createNativeQuery("""
                CREATE TABLE IF NOT EXISTS stage_records (
                    stage_record_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    uuid BINARY(16) NOT NULL,
                    stage_id INT NOT NULL,
                    stage_play_time_ms BIGINT NOT NULL,
                    is_clear BOOLEAN NOT NULL,
                    created_at TIMESTAMP NOT NULL
                )
                """).executeUpdate();
        entityManager.createNativeQuery("""
                CREATE TABLE IF NOT EXISTS stages (
                    stage_id INT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL
                )
                """).executeUpdate();
        entityManager.createNativeQuery("DELETE FROM stage_records").executeUpdate();
        entityManager.createNativeQuery("DELETE FROM stages").executeUpdate();
        entityManager.createNativeQuery("DELETE FROM users").executeUpdate();

        insertStage(1, "토이 타운");
        insertStage(3, "클라우드 브릿지");
        insertUser(USER_A, "alpha");
        insertUser(USER_B, "bravo");

        insertRecord(1L, USER_A, 1, 100_000L, true, LocalDateTime.of(2026, 7, 28, 10, 0));
        insertRecord(2L, USER_A, 1, 90_000L, true, LocalDateTime.of(2026, 7, 28, 10, 10));
        insertRecord(3L, USER_B, 1, 90_000L, true, LocalDateTime.of(2026, 7, 28, 9, 50));
        insertRecord(4L, USER_B, 1, 80_000L, false, LocalDateTime.of(2026, 7, 28, 9, 40));
        insertRecord(5L, USER_A, 3, 70_000L, true, LocalDateTime.of(2026, 7, 29, 10, 0));
        insertRecord(6L, USER_B, 3, 75_000L, true, LocalDateTime.of(2026, 7, 29, 11, 0));
    }

    @Test
    @DisplayName("사용자별 최고 클리어 기록만 사용하고 동점이면 먼저 달성한 사용자가 앞선다")
    void stageRankingUsesBestClearRecordAndEarlierTieBreak() {
        var rows = rankingRepository.findStageRanking(1, Integer.MAX_VALUE);

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getRank()).isEqualTo(1);
        assertThat(rows.get(0).getNickname()).isEqualTo("bravo");
        assertThat(rows.get(0).getStageClearTimeMs()).isEqualTo(90_000L);
        assertThat(toUuid(rows.get(1).getUuid())).isEqualTo(USER_A);
        assertThat(rows.get(1).getRank()).isEqualTo(2);
        assertThat(rows.get(1).getNickname()).isEqualTo("alpha");
        assertThat(rows.get(1).getCreatedAt()).isEqualTo(LocalDateTime.of(2026, 7, 28, 10, 10));
    }

    @Test
    @DisplayName("내 최고 기록은 클리어한 기록 중 가장 빠른 기록과 달성 일시를 반환한다")
    void findsMyBestRecords() {
        var myRecords = stageRecordRepository.findMyBestRecords(toBytes(USER_A));

        assertThat(myRecords).hasSize(2);
        assertThat(myRecords.get(0)).satisfies(row -> {
            assertThat(row.getStageId()).isEqualTo(1);
            assertThat(row.getBestTimeMs()).isEqualTo(90_000L);
            assertThat(row.getCreatedAt()).isEqualTo(LocalDateTime.of(2026, 7, 28, 10, 10));
        });
    }

    @Test
    @DisplayName("limit으로 랭킹 조회 개수를 제한한다")
    void limitsStageRanking() {
        var rows = rankingRepository.findStageRanking(1, 1);

        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.getRank()).isEqualTo(1);
            assertThat(row.getNickname()).isEqualTo("bravo");
        });
    }

    @Test
    @DisplayName("내 최고 기록을 기준으로 스테이지별 현재 순위와 전체 참가자 수를 조회한다")
    void findsMyStageRankings() {
        var rows = rankingRepository.findMyStageRankings(toBytes(USER_A));

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getStageId()).isEqualTo(3);
        assertThat(rows.get(0).getStageName()).isEqualTo("클라우드 브릿지");
        assertThat(rows.get(0).getRank()).isEqualTo(1);
        assertThat(rows.get(0).getTotalParticipants()).isEqualTo(2);
        assertThat(rows.get(0).getStageClearTimeMs()).isEqualTo(70_000L);
        assertThat(rows.get(1).getStageId()).isEqualTo(1);
        assertThat(rows.get(1).getRank()).isEqualTo(2);
    }

    private void insertStage(int stageId, String name) {
        entityManager.createNativeQuery("""
                INSERT INTO stages (stage_id, name)
                VALUES (:stageId, :name)
                """)
                .setParameter("stageId", stageId)
                .setParameter("name", name)
                .executeUpdate();
    }

    private void insertUser(UUID userId, String nickname) {
        entityManager.createNativeQuery("""
                INSERT INTO users (uuid, nickname, role, created_at, updated_at)
                VALUES (:userId, :nickname, 'USER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """)
                .setParameter("userId", toBytes(userId))
                .setParameter("nickname", nickname)
                .executeUpdate();
    }

    private void insertRecord(
            long recordId,
            UUID userId,
            int stageId,
            long playTimeMs,
            boolean clear,
            LocalDateTime createdAt
    ) {
        entityManager.createNativeQuery("""
                INSERT INTO stage_records (
                    stage_record_id,
                    uuid,
                    stage_id,
                    stage_play_time_ms,
                    is_clear,
                    created_at
                )
                VALUES (
                    :recordId,
                    :userId,
                    :stageId,
                    :playTimeMs,
                    :clear,
                    :createdAt
                )
                """)
                .setParameter("recordId", recordId)
                .setParameter("userId", toBytes(userId))
                .setParameter("stageId", stageId)
                .setParameter("playTimeMs", playTimeMs)
                .setParameter("clear", clear)
                .setParameter("createdAt", Timestamp.valueOf(createdAt))
                .executeUpdate();
    }

    private byte[] toBytes(UUID uuid) {
        return ByteBuffer.allocate(16)
                .putLong(uuid.getMostSignificantBits())
                .putLong(uuid.getLeastSignificantBits())
                .array();
    }

    private UUID toUuid(byte[] bytes) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        return new UUID(buffer.getLong(), buffer.getLong());
    }
}
