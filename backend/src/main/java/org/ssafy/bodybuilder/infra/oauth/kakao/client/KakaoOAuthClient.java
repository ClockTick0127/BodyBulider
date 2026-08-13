package org.ssafy.bodybuilder.infra.oauth.kakao.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.infra.oauth.kakao.config.KakaoProperties;
import org.ssafy.bodybuilder.infra.oauth.kakao.dto.KakaoTokenResponse;
import org.ssafy.bodybuilder.infra.oauth.kakao.dto.KakaoUserInfoResponse;

@Slf4j
@Component
@RequiredArgsConstructor
public class KakaoOAuthClient {

    private final KakaoProperties kakaoProperties;
    private final RestClient restClient;

    public KakaoTokenResponse requestAccessToken(String code, String redirectUri) {
        try {
            String targetRedirectUri = StringUtils.hasText(redirectUri)
                    ? redirectUri
                    : kakaoProperties.getRedirectUri();

            MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
            formData.add("grant_type", "authorization_code");
            formData.add("client_id", kakaoProperties.getClientId());
            formData.add("redirect_uri", targetRedirectUri);
            formData.add("code", code);

            if (StringUtils.hasText(kakaoProperties.getClientSecret())) {
                formData.add("client_secret", kakaoProperties.getClientSecret());
            }

            return restClient.post()
                    .uri(kakaoProperties.getTokenUri())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(formData)
                    .retrieve()
                    .body(KakaoTokenResponse.class);
        } catch (HttpClientErrorException e) {
            log.error("HTTP 4xx Error when requesting Kakao access token. code: {}, status: {}, body: {}",
                    code, e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new GlobalException(ErrorCode.KAKAO_OAUTH_ERROR);
        } catch (HttpServerErrorException e) {
            log.error("HTTP 5xx Error when requesting Kakao access token. code: {}, status: {}, body: {}",
                    code, e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new GlobalException(ErrorCode.KAKAO_OAUTH_ERROR);
        } catch (Exception e) {
            log.error("Failed to request Kakao access token due to network/unexpected error. code: {}, redirectUri: {}",
                    code, redirectUri, e);
            throw new GlobalException(ErrorCode.KAKAO_OAUTH_ERROR);
        }
    }

    public KakaoTokenResponse requestAccessToken(String code) {
        return requestAccessToken(code, null);
    }

    public KakaoUserInfoResponse getUserInfo(String accessToken) {
        try {
            return restClient.get()
                    .uri(kakaoProperties.getUserInfoUri())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_FORM_URLENCODED_VALUE + ";charset=utf-8")
                    .retrieve()
                    .body(KakaoUserInfoResponse.class);
        } catch (HttpClientErrorException e) {
            log.error("HTTP 4xx Error when fetching Kakao user info. status: {}, body: {}",
                    e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new GlobalException(ErrorCode.KAKAO_OAUTH_ERROR);
        } catch (HttpServerErrorException e) {
            log.error("HTTP 5xx Error when fetching Kakao user info. status: {}, body: {}",
                    e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new GlobalException(ErrorCode.KAKAO_OAUTH_ERROR);
        } catch (Exception e) {
            log.error("Failed to get Kakao user info due to network/unexpected error.", e);
            throw new GlobalException(ErrorCode.KAKAO_OAUTH_ERROR);
        }
    }
}
