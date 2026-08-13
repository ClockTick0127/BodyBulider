package org.ssafy.bodybuilder.infra.logging.persistence.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.ssafy.bodybuilder.infra.logging.persistence.model.GameSessionEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface GameSessionJpaRepository
        extends Repository<GameSessionEntity, UUID> {

    @Modifying
    @Query(value = """
            INSERT INTO game_sessions (
                game_session_id, room_session_id, room_code, room_title,
                stage_id, final_status, game_result, started_at, ended_at
            ) VALUES (
                :gameSessionId, :roomSessionId, :roomCode, :roomTitle,
                :stageId, :finalStatus, :gameResult, :startedAt, :endedAt
            )
            ON DUPLICATE KEY UPDATE game_session_id = game_session_id
            """, nativeQuery = true)
    int insertIfAbsent(
            @Param("gameSessionId") byte[] gameSessionId,
            @Param("roomSessionId") byte[] roomSessionId,
            @Param("roomCode") String roomCode,
            @Param("roomTitle") String roomTitle,
            @Param("stageId") Integer stageId,
            @Param("finalStatus") String finalStatus,
            @Param("gameResult") String gameResult,
            @Param("startedAt") LocalDateTime startedAt,
            @Param("endedAt") LocalDateTime endedAt
    );

    @Query(value = """
            SELECT game_session_id AS gameSessionId,
                   room_session_id AS roomSessionId,
                   room_code AS roomCode,
                   room_title AS roomTitle,
                   stage_id AS stageId,
                   final_status AS finalStatus,
                   game_result AS gameResult,
                   started_at AS startedAt,
                   ended_at AS endedAt
            FROM game_sessions
            ORDER BY ended_at DESC, game_session_id DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<ArchivedGameProjection> findArchivedGames(@Param("limit") int limit);

    interface ArchivedGameProjection {

        byte[] getGameSessionId();

        byte[] getRoomSessionId();

        String getRoomCode();

        String getRoomTitle();

        Integer getStageId();

        String getFinalStatus();

        String getGameResult();

        LocalDateTime getStartedAt();

        LocalDateTime getEndedAt();
    }
}
