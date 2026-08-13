package org.ssafy.bodybuilder.infra.oauth.google.config;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@RequiredArgsConstructor
@ConfigurationProperties(prefix = "google")
public class GoogleProperties {
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final String tokenUri;
    private final String userInfoUri;
}
