package org.ssafy.bodybuilder.domain.auth.strategy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.domain.auth.model.ProviderType;
import org.ssafy.bodybuilder.domain.auth.service.SocialAuthDomainService;
import org.ssafy.bodybuilder.domain.user.model.User;
import org.ssafy.bodybuilder.infra.oauth.google.client.GoogleOAuthClient;
import org.ssafy.bodybuilder.infra.oauth.google.dto.GoogleTokenResponse;
import org.ssafy.bodybuilder.infra.oauth.google.dto.GoogleUserInfoResponse;

import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class GoogleSocialAuthStrategyTest {

    @Mock
    private GoogleOAuthClient googleOAuthClient;

    @Mock
    private SocialAuthDomainService socialAuthDomainService;

    @InjectMocks
    private GoogleSocialAuthStrategy googleSocialAuthStrategy;

    @Test
    @DisplayName("ProviderType은 GOOGLE을 반환한다")
    void getProvider() {
        assertThat(googleSocialAuthStrategy.getProvider()).isEqualTo(ProviderType.GOOGLE);
    }

    @Test
    @DisplayName("구글 인증 처리 - 외부 HTTP 통신 후 domainService 호출")
    void processAuth() {
        // given
        String code = "google-code";
        String redirectUri = "http://localhost:5173";
        String accessToken = "google-access-token";

        GoogleTokenResponse tokenResponse = new GoogleTokenResponse(accessToken, "bearer", 3600, "openid email profile", "id-token");
        GoogleUserInfoResponse userInfo = new GoogleUserInfoResponse("1234567890", "구글유저", "유저", "구글", "http://photo.jpg", "google@test.com", true);
        User mockUser = User.createSocialUser("구글유저");

        given(googleOAuthClient.requestAccessToken(code, redirectUri)).willReturn(tokenResponse);
        given(googleOAuthClient.getUserInfo(accessToken)).willReturn(userInfo);
        given(socialAuthDomainService.findOrCreateSocialUser(ProviderType.GOOGLE, "1234567890", "구글유저")).willReturn(mockUser);

        // when
        User result = googleSocialAuthStrategy.processAuth(code, redirectUri);

        // then
        assertThat(result.getNickname()).isEqualTo("구글유저");
        verify(socialAuthDomainService).findOrCreateSocialUser(ProviderType.GOOGLE, "1234567890", "구글유저");
    }

    @Test
    @DisplayName("구글 인증 처리 실패 - Access Token 요청 실패 시 예외가 발생하고 사용자 생성이 수행되지 않는다")
    void processAuth_Failure() {
        // given
        String invalidCode = "invalid-code";
        String redirectUri = "http://localhost:5173";

        given(googleOAuthClient.requestAccessToken(invalidCode, redirectUri))
                .willThrow(new GlobalException(ErrorCode.GOOGLE_OAUTH_ERROR));

        // when & then
        assertThatThrownBy(() -> googleSocialAuthStrategy.processAuth(invalidCode, redirectUri))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.GOOGLE_OAUTH_ERROR);

        verifyNoInteractions(socialAuthDomainService);
    }
}
