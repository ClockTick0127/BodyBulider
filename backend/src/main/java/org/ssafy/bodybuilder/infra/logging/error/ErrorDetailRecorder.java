package org.ssafy.bodybuilder.infra.logging.error;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLiveEventPublisher;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ErrorSummary;
import org.ssafy.bodybuilder.infra.logging.persistence.model.ErrorDetailEntity;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.ErrorDetailJpaRepository;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class ErrorDetailRecorder {

    private static final int MAX_MESSAGE_LENGTH = 4_000;
    private static final int MAX_STACK_BYTES = 60_000;
    private static final int MAX_CONTEXT_BYTES = 16_000;
    private static final Pattern SENSITIVE_VALUE = Pattern.compile(
            "(?i)(authorization|cookie|set-cookie|password|access[_-]?token|"
                    + "refresh[_-]?token|id[_-]?token|client[_-]?secret|oauth[_-]?code)"
                    + "([\"']?\\s*[:=]\\s*[\"']?)([^,;\"'}\\r\\n]+)"
    );

    private final ErrorDetailJpaRepository errorDetailRepository;
    private final ObjectMapper objectMapper;
    private final Clock gameClock;
    private final AdminLiveEventPublisher liveEventPublisher;

    public Optional<UUID> record(
            String source,
            Throwable throwable,
            String errorCode,
            UUID roomSessionId,
            UUID gameSessionId,
            UUID userId,
            UUID eventId,
            Map<String, Object> context
    ) {
        UUID errorId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now(gameClock);
        try {
            ErrorDetailEntity saved = errorDetailRepository.save(
                    ErrorDetailEntity.create(
                            errorId,
                            limit(source, 20),
                            limit(errorCode, 20),
                            limit(throwable.getClass().getName(), 255),
                            limit(sanitize(safeMessage(throwable)), MAX_MESSAGE_LENGTH),
                            limitUtf8(sanitize(stackTrace(throwable)), MAX_STACK_BYTES),
                            roomSessionId,
                            gameSessionId,
                            userId,
                            eventId,
                            contextNode(context),
                            now,
                            now.plusDays(7)
                    )
            );
            publishSafely(saved);
            return Optional.of(errorId);
        } catch (RuntimeException exception) {
            log.error(
                    "[ErrorDetailRecorder] Failed to persist error detail. errorId={}, source={}, gameSessionId={}",
                    errorId,
                    source,
                    gameSessionId,
                    exception
            );
            return Optional.empty();
        }
    }

    private void publishSafely(ErrorDetailEntity error) {
        try {
            liveEventPublisher.publishErrorCreated(new ErrorSummary(
                    error.getId(),
                    error.getSource(),
                    error.getSeverity(),
                    error.getErrorCode(),
                    error.getMessage(),
                    error.getRoomSessionId(),
                    error.getGameSessionId(),
                    error.getCreatedAt()
            ));
        } catch (RuntimeException exception) {
            log.warn(
                    "[ErrorDetailRecorder] Failed to publish admin error delta. errorId={}",
                    error.getId(),
                    exception
            );
        }
    }

    private JsonNode contextNode(Map<String, Object> context) {
        if (context == null || context.isEmpty()) {
            return null;
        }
        try {
            String sanitized = sanitize(objectMapper.writeValueAsString(context));
            if (sanitized.getBytes(StandardCharsets.UTF_8).length <= MAX_CONTEXT_BYTES) {
                return objectMapper.readTree(sanitized);
            }
            return objectMapper.createObjectNode()
                    .put("truncated", true)
                    .put("preview", limitUtf8(sanitized, MAX_CONTEXT_BYTES - 100));
        } catch (JsonProcessingException exception) {
            return null;
        }
    }

    private String safeMessage(Throwable throwable) {
        String message = throwable.getMessage();
        return message == null || message.isBlank()
                ? throwable.getClass().getSimpleName()
                : message;
    }

    private String stackTrace(Throwable throwable) {
        StringWriter writer = new StringWriter();
        throwable.printStackTrace(new PrintWriter(writer));
        return writer.toString();
    }

    private String limit(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    private String limitUtf8(String value, int maxBytes) {
        if (value == null || value.getBytes(StandardCharsets.UTF_8).length <= maxBytes) {
            return value;
        }
        String suffix = "\n... [TRUNCATED]";
        int targetBytes = maxBytes - suffix.getBytes(StandardCharsets.UTF_8).length;
        int low = 0;
        int high = value.length();
        while (low < high) {
            int middle = (low + high + 1) >>> 1;
            if (value.substring(0, middle).getBytes(StandardCharsets.UTF_8).length
                    <= targetBytes) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }
        return value.substring(0, low) + suffix;
    }

    private String sanitize(String value) {
        if (value == null) {
            return null;
        }
        return SENSITIVE_VALUE.matcher(value).replaceAll("$1$2***");
    }

}
