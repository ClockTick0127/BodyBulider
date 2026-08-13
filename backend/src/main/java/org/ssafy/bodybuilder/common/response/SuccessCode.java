package org.ssafy.bodybuilder.common.response;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor(access = AccessLevel.PRIVATE)
public enum SuccessCode {

    // Common
    REQUEST_SUCCESS(HttpStatus.OK, "요청이 성공적으로 처리되었습니다."),
    CREATE_SUCCESS(HttpStatus.CREATED, "성공적으로 생성되었습니다."),
    UPDATE_SUCCESS(HttpStatus.OK, "성공적으로 수정되었습니다."),
    DELETE_SUCCESS(HttpStatus.OK, "성공적으로 삭제되었습니다."),

    // User
    USER_SIGN_UP_SUCCESS(HttpStatus.CREATED, "회원가입이 완료되었습니다."),
    USER_LOGIN_SUCCESS(HttpStatus.OK, "로그인 되었습니다."),
    USER_LOGOUT_SUCCESS(HttpStatus.OK, "로그아웃 되었습니다."),
    USER_INFO_SUCCESS(HttpStatus.OK, "유저 정보가 조회되었습니다.");

    private final HttpStatus status;
    private final String message;
}
