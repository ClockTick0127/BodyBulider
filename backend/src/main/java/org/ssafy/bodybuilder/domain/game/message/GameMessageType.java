package org.ssafy.bodybuilder.domain.game.message;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;

import java.util.Arrays;
//타입을 서로에맞게 번역해준다.
public enum GameMessageType {

    REGISTER_REQUEST(1),
    REGISTER_RESPONSE(2),

    GAME_START_REQUEST(100),
    GAME_START_RESPONSE(101),       // 게임 시작, 맵 데이터
    GAME_CAPTURING_REQUEST(102),    // 촬영 시작 요청
    GAME_CAPTURING_RESPONSE(103),   // 촬영 결과 응답
    GAME_SIMULATING_RESPONSE(104),  // 좌표와 결과
    GAME_ROUND_START_RESPONSE(105), // 다음 라운드 시작
    GAME_RESULT_RESPONSE(106),      // 최종 게임 결과
    GAME_POSE_BROADCAST(107),       // 저장된 촬영 좌표를 방 전체에 전송
    GAME_ERROR(999);                // 게임 에러 메시지

    private final int code;

    GameMessageType(int code) {
        this.code = code;
    }

    @JsonValue
    public int getCode() {
        return code;
    }

    @JsonCreator
    public static GameMessageType fromCode(int code) {
        return Arrays.stream(values())
                .filter(type -> type.code == code)
                .findFirst()
                .orElseThrow(() -> new GlobalException(ErrorCode.TYPE_NOT_FOUND));
    }
}
