package org.ssafy.bodybuilder.infra.logging.persistence.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ssafy.bodybuilder.infra.logging.persistence.model.ErrorDetailEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ErrorDetailJpaRepository
        extends JpaRepository<ErrorDetailEntity, UUID> {

    @Modifying
    @Query(value = """
            DELETE FROM error_details
            WHERE expires_at <= CURRENT_TIMESTAMP(6)
            """, nativeQuery = true)
    int deleteExpired();

    @Query(value = """
            SELECT error_id AS errorId,
                   source AS source,
                   severity AS severity,
                   error_code AS errorCode,
                   message AS message,
                   room_session_id AS roomSessionId,
                   game_session_id AS gameSessionId,
                   created_at AS createdAt
            FROM error_details
            WHERE expires_at > CURRENT_TIMESTAMP(6)
            ORDER BY created_at DESC, error_id DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<ErrorSummaryProjection> findErrorSummaries(@Param("limit") int limit);

    @Query(value = """
            SELECT error_id AS errorId,
                   source AS source,
                   severity AS severity,
                   error_code AS errorCode,
                   exception_class AS exceptionClass,
                   message AS message,
                   stack_trace AS stackTrace,
                   room_session_id AS roomSessionId,
                   game_session_id AS gameSessionId,
                   user_uuid AS userId,
                   request_id AS requestId,
                   trace_id AS traceId,
                   event_id AS eventId,
                   context AS context,
                   created_at AS createdAt,
                   expires_at AS expiresAt
            FROM error_details
            WHERE error_id = :errorId
              AND expires_at > CURRENT_TIMESTAMP(6)
            """, nativeQuery = true)
    Optional<ErrorDetailProjection> findActiveDetail(
            @Param("errorId") byte[] errorId
    );

    interface ErrorSummaryProjection {

        byte[] getErrorId();

        String getSource();

        String getSeverity();

        String getErrorCode();

        String getMessage();

        byte[] getRoomSessionId();

        byte[] getGameSessionId();

        LocalDateTime getCreatedAt();
    }

    interface ErrorDetailProjection {

        byte[] getErrorId();

        String getSource();

        String getSeverity();

        String getErrorCode();

        String getExceptionClass();

        String getMessage();

        String getStackTrace();

        byte[] getRoomSessionId();

        byte[] getGameSessionId();

        byte[] getUserId();

        String getRequestId();

        String getTraceId();

        byte[] getEventId();

        Object getContext();

        LocalDateTime getCreatedAt();

        LocalDateTime getExpiresAt();
    }
}
