package org.ssafy.bodybuilder.domain.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class SocialAuthRequest {

    @NotBlank(message = "provider는 필수 입력 값입니다.")
    private String provider;

    @NotBlank(message = "credentialType은 필수 입력 값입니다.")
    private String credentialType;

    @NotBlank(message = "credential은 필수 입력 값입니다.")
    private String credential;

    private String redirectUri;
}
