package org.ssafy.bodybuilder.infra.logging.persistence.model;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "game_round_replays")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GameRoundReplayEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "round_replay_id")
    private Long id;

    @Column(
            name = "game_session_id",
            columnDefinition = "BINARY(16)",
            nullable = false,
            updatable = false
    )
    private UUID gameSessionId;

    @Column(name = "round_no", nullable = false, updatable = false)
    private Integer roundNo;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "poses", nullable = false, columnDefinition = "json", updatable = false)
    private JsonNode poses;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "simulation", nullable = false, columnDefinition = "json", updatable = false)
    private JsonNode simulation;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private LocalDateTime createdAt;
}
