package org.ssafy.bodybuilder.domain.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class SignUpRequest {

    @NotBlank(message = "닉네임을 입력해 주세요.")
    @Size(max = 45, message = "닉네임은 최대 45자까지 가능합니다.")
    private String nickname;

    @NotBlank(message = "비밀번호를 입력해 주세요.")
    @Size(min = 8, message = "비밀번호는 8자 이상이어야 합니다.")
    private String password;
}
