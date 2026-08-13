package org.ssafy.bodybuilder.infra.logging.persistence.repository;

import java.util.List;
import org.ssafy.bodybuilder.infra.logging.persistence.model.GameRoundReplayEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface GameRoundReplayJpaRepository
        extends Repository<GameRoundReplayEntity, Long> {

    @Modifying
    @Query(value = """
            INSERT INTO game_round_replays (
                game_session_id, round_no, poses, simulation
            ) VALUES (
                :gameSessionId, :roundNo, :poses, :simulation
            )
            ON DUPLICATE KEY UPDATE round_replay_id = round_replay_id
            """, nativeQuery = true)
    int insertIfAbsent(
            @Param("gameSessionId") byte[] gameSessionId,
            @Param("roundNo") Integer roundNo,
            @Param("poses") String poses,
            @Param("simulation") String simulation
    );

    @Query(value = """
            SELECT round_no AS roundNo,
                   poses AS poses,
                   simulation AS simulation
            FROM game_round_replays
            WHERE game_session_id = :gameSessionId
            ORDER BY round_no ASC
            """, nativeQuery = true)
    List<RoundReplayProjection> findRoundReplays(
            @Param("gameSessionId") byte[] gameSessionId
    );

    interface RoundReplayProjection {

        Integer getRoundNo();

        Object getPoses();

        Object getSimulation();
    }
}
