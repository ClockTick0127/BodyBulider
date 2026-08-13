package org.ssafy.bodybuilder.domain.auth.strategy;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.ssafy.bodybuilder.domain.auth.model.ProviderType;
import org.ssafy.bodybuilder.domain.auth.service.SocialAuthDomainService;
import org.ssafy.bodybuilder.domain.user.model.User;
import org.ssafy.bodybuilder.infra.oauth.google.client.GoogleOAuthClient;
import org.ssafy.bodybuilder.infra.oauth.google.dto.GoogleTokenResponse;
import org.ssafy.bodybuilder.infra.oauth.google.dto.GoogleUserInfoResponse;

@Slf4j
@Service
@RequiredArgsConstructor
public class GoogleSocialAuthStrategy implements SocialAuthStrategy {

    private final GoogleOAuthClient googleOAuthClient;
    private final SocialAuthDomainService socialAuthDomainService;

    @Override
    public ProviderType getProvider() {
        return ProviderType.GOOGLE;
    }

    @Override
    public User processAuth(String credential, String redirectUri) {
        // 1. External HTTP Calls (Out of DB Transaction boundary)
        // Authorization Code flow: exchange code for access token
        GoogleTokenResponse tokenResponse = googleOAuthClient.requestAccessToken(credential, redirectUri);
        String accessToken = tokenResponse.getAccessToken();

        GoogleUserInfoResponse userInfo = googleOAuthClient.getUserInfo(accessToken);

        String providerId = userInfo.getSub();
        String nickname = StringUtils.hasText(userInfo.getName()) ? userInfo.getName() : userInfo.getEmail();

        // 2. DB Transaction Boundary (Isolated in SocialAuthDomainService)
        return socialAuthDomainService.findOrCreateSocialUser(ProviderType.GOOGLE, providerId, nickname);
    }
}
