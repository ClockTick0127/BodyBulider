package org.ssafy.bodybuilder.common.error;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.infra.logging.error.ErrorDetailRecorder;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final ErrorDetailRecorder errorDetailRecorder;

    @ExceptionHandler(GlobalException.class)
    protected ResponseEntity<BaseResponse<Void>> handleGlobalException(
            GlobalException e,
            HttpServletRequest request
    ) {
        if (e.getErrorCode().getStatus().is5xxServerError()) {
            record(e, e.getErrorCode().getCode(), request);
            log.error(e.getMessage(), e);
        } else {
            log.warn("Handled request error. code={}, message={}",
                    e.getErrorCode().getCode(), e.getMessage());
        }

        if (e.getDetail() != null) {
            return BaseResponse.error(e.getErrorCode(), e.getDetail());
        }
        return BaseResponse.error(e.getErrorCode());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    protected ResponseEntity<BaseResponse<Void>> handleValidationException(MethodArgumentNotValidException e) {

        log.warn("Invalid request: {}", e.getMessage());
        return BaseResponse.error(ErrorCode.INVALID_INPUT_VALUE);
    }

    /** 요청 본문이 없거나 JSON 파싱에 실패한 경우. (없으면 500으로 떨어진다) */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    protected ResponseEntity<BaseResponse<Void>> handleNotReadableException(HttpMessageNotReadableException e) {

        log.warn("Unreadable request body: {}", e.getMessage());
        return BaseResponse.error(ErrorCode.INVALID_INPUT_VALUE, "요청 본문을 읽을 수 없습니다. JSON 형식을 확인하세요.");
    }

    @ExceptionHandler(Exception.class)
    protected ResponseEntity<BaseResponse<Void>> handleException(
            Exception e,
            HttpServletRequest request
    ) {
        record(e, ErrorCode.INTERNAL_SERVER_ERROR.getCode(), request);
        log.error(e.getMessage(), e);
        return BaseResponse.error(ErrorCode.INTERNAL_SERVER_ERROR);
    }

    private void record(
            Throwable throwable,
            String errorCode,
            HttpServletRequest request
    ) {
        errorDetailRecorder.record(
                "REST",
                throwable,
                errorCode,
                null,
                null,
                principalId(request),
                null,
                Map.of(
                        "method", request.getMethod(),
                        "path", request.getRequestURI()
                )
        );
    }

    private UUID principalId(HttpServletRequest request) {
        if (request.getUserPrincipal() == null) {
            return null;
        }
        try {
            return UUID.fromString(request.getUserPrincipal().getName());
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
