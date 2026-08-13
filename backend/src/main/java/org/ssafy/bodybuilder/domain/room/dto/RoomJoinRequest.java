package org.ssafy.bodybuilder.domain.room.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class RoomJoinRequest {

    @NotBlank(message = "방 코드는 필수입니다.")
    private String roomCode;

    private String password;
}
