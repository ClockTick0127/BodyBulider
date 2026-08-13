package org.ssafy.bodybuilder.domain.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class LoginRequest {

    @NotBlank(message = "닉네임을 입력해 주세요.")
    private String nickname;

    @NotBlank(message = "비밀번호를 입력해 주세요.")
    private String password;
}
