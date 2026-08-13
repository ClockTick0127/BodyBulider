package org.ssafy.bodybuilder.infra.logging.error;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.springframework.messaging.Message;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.web.bind.annotation.ControllerAdvice;

@ControllerAdvice
@RequiredArgsConstructor
@Slf4j
public class StompExceptionHandler {

    private final ErrorDetailRecorder errorDetailRecorder;

    @MessageExceptionHandler(GlobalException.class)
    public void handleGlobalException(
            GlobalException exception,
            Message<?> message
    ) {
        if (exception.getErrorCode().getStatus().is5xxServerError()) {
            record(exception, exception.getErrorCode().getCode(), message);
            log.error("[STOMP] Unexpected application error", exception);
            return;
        }
        log.warn(
                "[STOMP] Rejected message. code={}, destination={}",
                exception.getErrorCode().getCode(),
                destination(message)
        );
    }

    @MessageExceptionHandler(Exception.class)
    public void handleException(Exception exception, Message<?> message) {
        record(exception, ErrorCode.INTERNAL_SERVER_ERROR.getCode(), message);
        log.error("[STOMP] Unexpected message handling error", exception);
    }

    private void record(
            Throwable throwable,
            String errorCode,
            Message<?> message
    ) {
        errorDetailRecorder.record(
                "STOMP",
                throwable,
                errorCode,
                null,
                null,
                null,
                null,
                Map.of("destination", destination(message))
        );
    }

    private String destination(Message<?> message) {
        String destination = message.getHeaders().get(
                "simpDestination",
                String.class
        );
        return destination == null ? "UNKNOWN" : destination;
    }
}
