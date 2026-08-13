package org.ssafy.bodybuilder.infra.logging.persistence.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "game_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GameSessionEntity {

    @Id
    @Column(
            name = "game_session_id",
            columnDefinition = "BINARY(16)",
            nullable = false,
            updatable = false
    )
    private UUID id;

    @Column(
            name = "room_session_id",
            columnDefinition = "BINARY(16)",
            nullable = false,
            updatable = false
    )
    private UUID roomSessionId;

    @Column(name = "room_code", nullable = false, length = 10, updatable = false)
    private String roomCode;

    @Column(name = "room_title", nullable = false, length = 100, updatable = false)
    private String roomTitle;

    @Column(name = "stage_id", nullable = false, updatable = false)
    private Integer stageId;

    @Column(name = "final_status", nullable = false, length = 20, updatable = false)
    private String finalStatus;

    @Column(name = "game_result", length = 20, updatable = false)
    private String gameResult;

    @Column(name = "started_at", nullable = false, updatable = false)
    private LocalDateTime startedAt;

    @Column(name = "ended_at", nullable = false, updatable = false)
    private LocalDateTime endedAt;

    @Column(
            name = "created_at",
            nullable = false,
            insertable = false,
            updatable = false
    )
    private LocalDateTime createdAt;
}
