package org.ssafy.bodybuilder.infra.oauth.kakao.config;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@RequiredArgsConstructor
@ConfigurationProperties(prefix = "kakao")
public class KakaoProperties {
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final String tokenUri;
    private final String userInfoUri;
}
