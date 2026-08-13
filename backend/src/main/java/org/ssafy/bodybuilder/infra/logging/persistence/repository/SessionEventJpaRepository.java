package org.ssafy.bodybuilder.infra.logging.persistence.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.ssafy.bodybuilder.infra.logging.persistence.model.SessionEventEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface SessionEventJpaRepository
        extends Repository<SessionEventEntity, Long> {

    @Modifying
    @Query(value = """
            INSERT INTO session_events (
                game_session_id, sequence_no, event_id, event_type,
                message_type, severity, direction, result, actor_uuid,
                summary, payload_size_bytes, duration_ms, error_id,
                occurred_at, server_received_at, schema_version
            ) VALUES (
                :gameSessionId, :sequenceNo, :eventId, :eventType,
                :messageType, :severity, :direction, :result, :actorId,
                :summary, :payloadSizeBytes, :durationMs, :errorId,
                :occurredAt, :serverReceivedAt, :schemaVersion
            )
            ON DUPLICATE KEY UPDATE event_id = event_id
            """, nativeQuery = true)
    int insertIfAbsent(
            @Param("gameSessionId") byte[] gameSessionId,
            @Param("sequenceNo") long sequenceNo,
            @Param("eventId") byte[] eventId,
            @Param("eventType") String eventType,
            @Param("messageType") String messageType,
            @Param("severity") String severity,
            @Param("direction") String direction,
            @Param("result") String result,
            @Param("actorId") byte[] actorId,
            @Param("summary") String summary,
            @Param("payloadSizeBytes") Long payloadSizeBytes,
            @Param("durationMs") Long durationMs,
            @Param("errorId") byte[] errorId,
            @Param("occurredAt") LocalDateTime occurredAt,
            @Param("serverReceivedAt") LocalDateTime serverReceivedAt,
            @Param("schemaVersion") short schemaVersion
    );

    @Query(value = """
            SELECT sequence_no AS sequenceNo,
                   event_id AS eventId,
                   event_type AS eventType,
                   message_type AS messageType,
                   severity AS severity,
                   direction AS direction,
                   result AS result,
                   actor_uuid AS actorId,
                   summary AS summary,
                   payload_size_bytes AS payloadSizeBytes,
                   duration_ms AS durationMs,
                   error_id AS errorId,
                   occurred_at AS occurredAt,
                   server_received_at AS serverReceivedAt
            FROM session_events
            WHERE game_session_id = :gameSessionId
            ORDER BY sequence_no ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<SessionEventProjection> findSessionEvents(
            @Param("gameSessionId") byte[] gameSessionId,
            @Param("limit") int limit
    );

    interface SessionEventProjection {

        Long getSequenceNo();

        byte[] getEventId();

        String getEventType();

        String getMessageType();

        String getSeverity();

        String getDirection();

        String getResult();

        byte[] getActorId();

        Object getSummary();

        Long getPayloadSizeBytes();

        Long getDurationMs();

        byte[] getErrorId();

        LocalDateTime getOccurredAt();

        LocalDateTime getServerReceivedAt();
    }
}
