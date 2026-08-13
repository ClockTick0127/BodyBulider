package org.ssafy.bodybuilder.common.response;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor(access = AccessLevel.PRIVATE)
public enum ErrorCode {

    // Common
    INVALID_INPUT_VALUE(HttpStatus.BAD_REQUEST, "C001", "유효하지 않은 입력 값입니다."),
    ACCESS_DENIED(HttpStatus.FORBIDDEN,"C002", "접근 권한이 없습니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "C003","인증 정보가 유효하지 않습니다."),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "C004","서버 내부 오류가 발생했습니다."),
    LOG_NOT_FOUND(HttpStatus.NOT_FOUND, "C005", "로그를 찾을 수 없습니다."),
    TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "C006", "요청이 많습니다. 잠시 후 다시 시도해 주세요."),

    // User
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "US001","해당 유저를 찾을 수 없습니다."),
    USER_NICKNAME_DUPLICATED(HttpStatus.BAD_REQUEST, "US002", "이미 사용 중인 닉네임입니다."),
    USER_ROLE_NOT_SUPPORTED(HttpStatus.BAD_REQUEST, "US003", "지원하지 않는 권한입니다."),
    USER_AUTH_INFO_INCORRECT(HttpStatus.UNAUTHORIZED, "US004", "잘못된 닉네임 혹은 비밀번호입니다."),
    KAKAO_OAUTH_ERROR(HttpStatus.BAD_GATEWAY, "US005", "카카오 인증 처리 중 오류가 발생했습니다."),
    GOOGLE_OAUTH_ERROR(HttpStatus.BAD_GATEWAY, "US006", "구글 인증 처리 중 오류가 발생했습니다."),

    // Game
    GAME_SESSION_ROOM_MISMATCH(HttpStatus.BAD_REQUEST, "G001", "게임 세션과 방 정보가 일치하지 않습니다."),
    ROOM_NOT_LOBBY(HttpStatus.CONFLICT, "G002", "로비 상태에서만 게임을 시작할 수 있습니다."),
    NOT_ROOM_OWNER(HttpStatus.FORBIDDEN, "G003", "방장만 게임을 시작할 수 있습니다."),
    INVALID_STAGE(HttpStatus.NOT_FOUND, "G004", "존재하지 않는 스테이지입니다."),
    STAGE_HAS_NO_ROUNDS(HttpStatus.NOT_FOUND, "G005", "플레이 가능한 라운드가 없습니다."),
    INSUFFICIENT_MEMBERS(HttpStatus.CONFLICT, "G006", "게임 시작에 필요한 인원이 부족합니다."),
    NOT_ALL_MEMBERS_READY(HttpStatus.CONFLICT, "G007", "준비하지 않은 참가자가 있습니다."),
    GAME_ALREADY_EXISTS(HttpStatus.CONFLICT, "G008", "이미 진행 중인 게임이 있습니다."),
    ROOM_OPERATION_BUSY(HttpStatus.CONFLICT, "G009", "방 상태가 변경 중입니다. 잠시 후 다시 시도해 주세요."),
    SESSION_NOT_PLAYING(HttpStatus.CONFLICT,"G010","플레이중에만 상태를 변경할 수 있습니다."),
    TYPE_NOT_FOUND(HttpStatus.NOT_FOUND, "G011", "타입을 찾을 수 없습니다."),
    GAME_SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "G012", "존재하지 않는 게임 세션입니다."),
    NOT_GAME_PARTICIPANT(HttpStatus.FORBIDDEN,"G013","게임 참가자가 아닙니다."),
    ROUND_NOT_CAPTURING(HttpStatus.CONFLICT,"G014","포즈를 제출할 수 있는 단계가 아닙니다."),
    PLAYER_RETURNED_TO_LOBBY(HttpStatus.CONFLICT, "G015", "로비로 돌아간 플레이어가 있습니다."),


    // Record
    STAGE_NOT_FOUND(HttpStatus.NOT_FOUND, "ST001", "존재하지 않는 스테이지입니다."),
    ROUND_NOT_FOUND(HttpStatus.NOT_FOUND, "ST002", "존재하지 않는 라운드입니다."),
    INVALID_MAP_CONFIG(HttpStatus.BAD_REQUEST, "ST003", "map_config 형식이 올바르지 않습니다."),
    CUSTOM_MAP_NOT_CLEARED(HttpStatus.BAD_REQUEST, "ST004", "클리어 검증을 통과하지 않은 커스텀 맵은 공개 업로드할 수 없습니다."),
    RECORD_NOT_FOUND(HttpStatus.NOT_FOUND, "RC002", "존재하지 않거나 접근할 수 없는 기록입니다."),

    // Room
    ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "RM001", "해당 방을 찾을 수 없습니다."),
    ROOM_HOST_ONLY(HttpStatus.FORBIDDEN, "RM002", "방장만 가능한 요청입니다."),
    INVALID_ROOM_PASSWORD(HttpStatus.BAD_REQUEST, "RM003", "방 비밀번호가 일치하지 않습니다."),
    ROOM_FULL(HttpStatus.BAD_REQUEST, "RM004", "방의 정원이 가득 찼습니다.");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
