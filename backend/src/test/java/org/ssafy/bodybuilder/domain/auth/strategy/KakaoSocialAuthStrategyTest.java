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
import org.ssafy.bodybuilder.infra.oauth.kakao.client.KakaoOAuthClient;
import org.ssafy.bodybuilder.infra.oauth.kakao.dto.KakaoTokenResponse;
import org.ssafy.bodybuilder.infra.oauth.kakao.dto.KakaoUserInfoResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class KakaoSocialAuthStrategyTest {

    @Mock
    private KakaoOAuthClient kakaoOAuthClient;

    @Mock
    private SocialAuthDomainService socialAuthDomainService;

    @InjectMocks
    private KakaoSocialAuthStrategy kakaoSocialAuthStrategy;

    @Test
    @DisplayName("ProviderType은 KAKAO를 반환한다")
    void getProvider() {
        assertThat(kakaoSocialAuthStrategy.getProvider()).isEqualTo(ProviderType.KAKAO);
    }

    @Test
    @DisplayName("카카오 인증 처리 - 외부 HTTP 통신 후 domainService 호출")
    void processAuth() {
        // given
        String code = "kakao-code";
        String redirectUri = "http://localhost:5173";
        String accessToken = "access-token";

        KakaoTokenResponse tokenResponse = new KakaoTokenResponse(accessToken, "bearer", "refresh", 3600, "scope", 86400);
        KakaoUserInfoResponse.KakaoAccount.Profile profile = new KakaoUserInfoResponse.KakaoAccount.Profile("카카오유저", null);
        KakaoUserInfoResponse.KakaoAccount account = new KakaoUserInfoResponse.KakaoAccount(profile);
        KakaoUserInfoResponse userInfo = new KakaoUserInfoResponse(123456789L, account);
        User mockUser = User.createSocialUser("카카오유저");

        given(kakaoOAuthClient.requestAccessToken(code, redirectUri)).willReturn(tokenResponse);
        given(kakaoOAuthClient.getUserInfo(accessToken)).willReturn(userInfo);
        given(socialAuthDomainService.findOrCreateSocialUser(ProviderType.KAKAO, "123456789", "카카오유저")).willReturn(mockUser);

        // when
        User result = kakaoSocialAuthStrategy.processAuth(code, redirectUri);

        // then
        assertThat(result.getNickname()).isEqualTo("카카오유저");
        verify(socialAuthDomainService).findOrCreateSocialUser(ProviderType.KAKAO, "123456789", "카카오유저");
    }
}
