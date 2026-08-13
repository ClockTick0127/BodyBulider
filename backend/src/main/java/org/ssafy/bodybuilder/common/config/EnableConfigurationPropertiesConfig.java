package org.ssafy.bodybuilder.common.config;

import org.ssafy.bodybuilder.common.security.config.properties.CorsProperties;
import org.ssafy.bodybuilder.infra.oauth.google.config.GoogleProperties;
import org.ssafy.bodybuilder.infra.oauth.kakao.config.KakaoProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({CorsProperties.class, KakaoProperties.class, GoogleProperties.class})
public class EnableConfigurationPropertiesConfig {
}

