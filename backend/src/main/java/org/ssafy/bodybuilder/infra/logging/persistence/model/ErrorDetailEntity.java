package org.ssafy.bodybuilder.infra.logging.persistence.model;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.domain.Persistable;

@Entity
@Table(name = "error_details")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ErrorDetailEntity implements Persistable<UUID> {

    @Id
    @Column(
            name = "error_id",
            columnDefinition = "BINARY(16)",
            nullable = false,
            updatable = false
    )
    private UUID id;

    @Column(name = "source", nullable = false, length = 20, updatable = false)
    private String source;

    @Column(name = "severity", nullable = false, length = 10, updatable = false)
    private String severity;

    @Column(name = "error_code", length = 20, updatable = false)
    private String errorCode;

    @Column(
            name = "exception_class",
            nullable = false,
            length = 255,
            updatable = false
    )
    private String exceptionClass;

    @Column(name = "message", nullable = false, columnDefinition = "TEXT", updatable = false)
    private String message;

    @Column(name = "stack_trace", columnDefinition = "TEXT", updatable = false)
    private String stackTrace;

    @Column(
            name = "room_session_id",
            columnDefinition = "BINARY(16)",
            updatable = false
    )
    private UUID roomSessionId;

    @Column(
            name = "game_session_id",
            columnDefinition = "BINARY(16)",
            updatable = false
    )
    private UUID gameSessionId;

    @Column(name = "user_uuid", columnDefinition = "BINARY(16)", updatable = false)
    private UUID userId;

    @Column(name = "request_id", length = 64, updatable = false)
    private String requestId;

    @Column(name = "trace_id", length = 64, updatable = false)
    private String traceId;

    @Column(name = "event_id", columnDefinition = "BINARY(16)", updatable = false)
    private UUID eventId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "context", columnDefinition = "json", updatable = false)
    private JsonNode context;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private LocalDateTime expiresAt;

    @Transient
    private boolean newEntity = true;

    public static ErrorDetailEntity create(
            UUID id,
            String source,
            String errorCode,
            String exceptionClass,
            String message,
            String stackTrace,
            UUID roomSessionId,
            UUID gameSessionId,
            UUID userId,
            UUID eventId,
            JsonNode context,
            LocalDateTime createdAt,
            LocalDateTime expiresAt
    ) {
        ErrorDetailEntity entity = new ErrorDetailEntity();
        entity.id = id;
        entity.source = source;
        entity.severity = "ERROR";
        entity.errorCode = errorCode;
        entity.exceptionClass = exceptionClass;
        entity.message = message;
        entity.stackTrace = stackTrace;
        entity.roomSessionId = roomSessionId;
        entity.gameSessionId = gameSessionId;
        entity.userId = userId;
        entity.eventId = eventId;
        entity.context = context;
        entity.createdAt = createdAt;
        entity.expiresAt = expiresAt;
        return entity;
    }

    @Override
    public boolean isNew() {
        return newEntity;
    }

    @PostLoad
    @PostPersist
    private void markNotNew() {
        newEntity = false;
    }
}
