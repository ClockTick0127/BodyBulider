package org.ssafy.bodybuilder.domain.ranking.repository;

import java.time.LocalDateTime;
import java.util.List;
import org.ssafy.bodybuilder.domain.record.model.StageRecord;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface RankingRepository extends Repository<StageRecord, Long> {

    @Query(value = """
            WITH user_best AS (
                SELECT sr.stage_record_id,
                       sr.uuid,
                       sr.stage_play_time_ms,
                       sr.created_at,
                       ROW_NUMBER() OVER (
                           PARTITION BY sr.uuid
                           ORDER BY sr.stage_play_time_ms ASC,
                                    sr.created_at ASC,
                                    sr.stage_record_id ASC
                       ) AS record_order
                FROM stage_records sr
                WHERE sr.stage_id = :stageId
                  AND sr.is_clear = TRUE
            )
            SELECT ROW_NUMBER() OVER (
                       ORDER BY ranked.stage_play_time_ms ASC,
                                ranked.created_at ASC,
                                ranked.stage_record_id ASC
                   ) AS `rank`,
                   ranked.uuid AS uuid,
                   users.nickname AS nickname,
                   ranked.stage_play_time_ms AS stageClearTimeMs,
                   ranked.created_at AS createdAt
            FROM user_best ranked
            JOIN users ON users.uuid = ranked.uuid
            WHERE ranked.record_order = 1
            ORDER BY `rank` ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<StageRankingProjection> findStageRanking(
            @Param("stageId") Integer stageId,
            @Param("limit") Integer limit
    );

    @Query(value = """
            WITH user_best AS (
                SELECT sr.stage_record_id,
                       sr.stage_id,
                       sr.uuid,
                       sr.stage_play_time_ms,
                       sr.created_at,
                       ROW_NUMBER() OVER (
                           PARTITION BY sr.stage_id, sr.uuid
                           ORDER BY sr.stage_play_time_ms ASC,
                                    sr.created_at ASC,
                                    sr.stage_record_id ASC
                       ) AS record_order
                FROM stage_records sr
                WHERE sr.is_clear = TRUE
            ),
            ranked AS (
                SELECT ub.stage_record_id,
                       ub.stage_id,
                       ub.uuid,
                       ub.stage_play_time_ms,
                       ub.created_at,
                       ROW_NUMBER() OVER (
                           PARTITION BY ub.stage_id
                           ORDER BY ub.stage_play_time_ms ASC,
                                    ub.created_at ASC,
                                    ub.stage_record_id ASC
                       ) AS user_rank,
                       COUNT(*) OVER (
                           PARTITION BY ub.stage_id
                       ) AS total_participants
                FROM user_best ub
                WHERE ub.record_order = 1
            )
            SELECT ranked.stage_id AS stageId,
                   stages.name AS stageName,
                   ranked.user_rank AS `rank`,
                   ranked.total_participants AS totalParticipants,
                   ranked.stage_play_time_ms AS stageClearTimeMs,
                   ranked.created_at AS createdAt
            FROM ranked
            JOIN stages ON stages.stage_id = ranked.stage_id
            WHERE ranked.uuid = :userId
            ORDER BY ranked.user_rank ASC,
                     ranked.stage_id ASC
            """, nativeQuery = true)
    List<MyStageRankingProjection> findMyStageRankings(
            @Param("userId") byte[] userId
    );

    interface StageRankingProjection {
        Integer getRank();

        byte[] getUuid();

        String getNickname();

        Long getStageClearTimeMs();

        java.time.LocalDateTime getCreatedAt();
    }

    interface MyStageRankingProjection {
        Integer getStageId();

        String getStageName();

        Integer getRank();

        Long getTotalParticipants();

        Long getStageClearTimeMs();

        LocalDateTime getCreatedAt();
    }
}
