package org.ssafy.bodybuilder.domain.record.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ssafy.bodybuilder.domain.record.model.StageRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StageRecordRepository extends JpaRepository<StageRecord, Long> {

    List<StageRecord> findAllByUserIdAndStageIdAndClearTrueOrderByCreatedAtDescIdDesc(
            UUID userId,
            Integer stageId
    );

    Optional<StageRecord> findByIdAndUserIdAndClearTrue(Long id, UUID userId);

    @Query(value = """
            SELECT best.stage_id AS stageId,
                   best.stage_play_time_ms AS bestTimeMs,
                   best.created_at AS createdAt
            FROM (
                SELECT sr.stage_id,
                       sr.stage_play_time_ms,
                       sr.created_at,
                       ROW_NUMBER() OVER (
                           PARTITION BY sr.stage_id
                           ORDER BY sr.stage_play_time_ms ASC,
                                    sr.created_at ASC,
                                    sr.stage_record_id ASC
                       ) AS record_order
                FROM stage_records sr
                WHERE sr.uuid = :userId
                  AND sr.is_clear = TRUE
            ) best
            WHERE best.record_order = 1
            ORDER BY best.stage_id ASC
            """, nativeQuery = true)
    List<MyBestRecordProjection> findMyBestRecords(@Param("userId") byte[] userId);

    interface MyBestRecordProjection {
        Integer getStageId();

        Long getBestTimeMs();

        LocalDateTime getCreatedAt();
    }
}
