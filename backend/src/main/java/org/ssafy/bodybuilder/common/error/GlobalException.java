package org.ssafy.bodybuilder.common.error;

import lombok.Getter;
import org.ssafy.bodybuilder.common.response.ErrorCode;

@Getter
public class GlobalException extends RuntimeException {
    private final ErrorCode errorCode;

    /**
     * ErrorCode의 기본 메시지 대신 응답에 내보낼 상세 메시지. 없으면 null.
     * (예: map_config 검증 실패 시 "지형 #2의 꼭짓점이 3개 미만입니다.")
     */
    private final String detail;

    public GlobalException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.detail = null;
    }

    public GlobalException(ErrorCode errorCode, Throwable cause) {
        super(errorCode.getMessage(), cause);
        this.errorCode = errorCode;
        this.detail = null;
    }

    public GlobalException(ErrorCode errorCode, String detail) {
        super(detail);
        this.errorCode = errorCode;
        this.detail = detail;
    }
}
