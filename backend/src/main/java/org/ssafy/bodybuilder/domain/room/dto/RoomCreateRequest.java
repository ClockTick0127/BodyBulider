package org.ssafy.bodybuilder.domain.room.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class RoomCreateRequest {

    @NotBlank(message = "방 제목은 필수입니다.")
    private String title;

    private String password;

    /**
     * 창작마당 "이 맵으로 방 만들기"용 선택 필드.
     * null이면 기존 동작(기본 스테이지)을 그대로 유지한다.
     */
    private Integer stageId;

    /** 기존 2인자 호출부 보존용. (@AllArgsConstructor가 3인자로 바뀌면서 필요) */
    public RoomCreateRequest(String title, String password) {
        this(title, password, null);
    }
}
