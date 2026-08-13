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
@Table(name = "session_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SessionEventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "session_event_id")
    private Long id;

    @Column(
            name = "game_session_id",
            columnDefinition = "BINARY(16)",
            nullable = false,
            updatable = false
    )
    private UUID gameSessionId;

    @Column(name = "sequence_no", nullable = false, updatable = false)
    private Long sequenceNo;

    @Column(
            name = "event_id",
            columnDefinition = "BINARY(16)",
            nullable = false,
            updatable = false
    )
    private UUID eventId;

    @Column(name = "event_type", nullable = false, length = 45, updatable = false)
    private String eventType;

    @Column(name = "message_type", length = 45, updatable = false)
    private String messageType;

    @Column(name = "severity", nullable = false, length = 10, updatable = false)
    private String severity;

    @Column(name = "direction", nullable = false, length = 20, updatable = false)
    private String direction;

    @Column(name = "result", nullable = false, length = 20, updatable = false)
    private String result;

    @Column(name = "actor_uuid", columnDefinition = "BINARY(16)", updatable = false)
    private UUID actorId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(
            name = "summary",
            nullable = false,
            columnDefinition = "json",
            updatable = false
    )
    private JsonNode summary;

    @Column(name = "payload_size_bytes", updatable = false)
    private Long payloadSizeBytes;

    @Column(name = "duration_ms", updatable = false)
    private Long durationMs;

    @Column(name = "error_id", columnDefinition = "BINARY(16)", updatable = false)
    private UUID errorId;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private LocalDateTime occurredAt;

    @Column(name = "server_received_at", nullable = false, updatable = false)
    private LocalDateTime serverReceivedAt;

    @Column(name = "schema_version", nullable = false, updatable = false)
    private Short schemaVersion;

    @Column(
            name = "created_at",
            nullable = false,
            insertable = false,
            updatable = false
    )
    private LocalDateTime createdAt;
}
