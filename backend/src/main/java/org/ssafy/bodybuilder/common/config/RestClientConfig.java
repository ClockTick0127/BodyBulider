package org.ssafy.bodybuilder.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class RestClientConfig {

    @Bean
    public RestClient restClient() {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(3000); // 3 seconds
        requestFactory.setReadTimeout(5000);    // 5 seconds

        return RestClient.builder()
                .requestFactory(requestFactory)
                .build();
    }
}
