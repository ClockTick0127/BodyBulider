package org.ssafy.bodybuilder.domain.auth.strategy;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.ssafy.bodybuilder.domain.auth.model.ProviderType;
import org.ssafy.bodybuilder.domain.auth.service.SocialAuthDomainService;
import org.ssafy.bodybuilder.domain.user.model.User;
import org.ssafy.bodybuilder.infra.oauth.kakao.client.KakaoOAuthClient;
import org.ssafy.bodybuilder.infra.oauth.kakao.dto.KakaoTokenResponse;
import org.ssafy.bodybuilder.infra.oauth.kakao.dto.KakaoUserInfoResponse;

@Slf4j
@Service
@RequiredArgsConstructor
public class KakaoSocialAuthStrategy implements SocialAuthStrategy {

    private final KakaoOAuthClient kakaoOAuthClient;
    private final SocialAuthDomainService socialAuthDomainService;

    @Override
    public ProviderType getProvider() {
        return ProviderType.KAKAO;
    }

    @Override
    public User processAuth(String credential, String redirectUri) {
        // 1. External HTTP Calls (Out of DB Transaction boundary)
        KakaoTokenResponse tokenResponse = kakaoOAuthClient.requestAccessToken(credential, redirectUri);
        KakaoUserInfoResponse userInfo = kakaoOAuthClient.getUserInfo(tokenResponse.getAccessToken());

        String providerId = String.valueOf(userInfo.getId());
        String nickname = userInfo.getNickname();

        // 2. DB Transaction Boundary (Isolated in SocialAuthDomainService)
        return socialAuthDomainService.findOrCreateSocialUser(ProviderType.KAKAO, providerId, nickname);
    }
}
