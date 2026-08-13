package org.ssafy.bodybuilder.infra.oauth.google.client;

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
import org.ssafy.bodybuilder.infra.oauth.google.config.GoogleProperties;
import org.ssafy.bodybuilder.infra.oauth.google.dto.GoogleTokenResponse;
import org.ssafy.bodybuilder.infra.oauth.google.dto.GoogleUserInfoResponse;

@Slf4j
@Component
@RequiredArgsConstructor
public class GoogleOAuthClient {

    private final GoogleProperties googleProperties;
    private final RestClient restClient;

    public GoogleTokenResponse requestAccessToken(String code, String redirectUri) {
        try {
            String targetRedirectUri = StringUtils.hasText(redirectUri)
                    ? redirectUri
                    : googleProperties.getRedirectUri();

            MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
            formData.add("grant_type", "authorization_code");
            formData.add("client_id", googleProperties.getClientId());
            formData.add("client_secret", googleProperties.getClientSecret());
            formData.add("redirect_uri", targetRedirectUri);
            formData.add("code", code);

            return restClient.post()
                    .uri(googleProperties.getTokenUri())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(formData)
                    .retrieve()
                    .body(GoogleTokenResponse.class);
        } catch (HttpClientErrorException e) {
            log.error("HTTP 4xx Error when requesting Google access token. code: {}, status: {}, body: {}",
                    code, e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new GlobalException(ErrorCode.GOOGLE_OAUTH_ERROR);
        } catch (HttpServerErrorException e) {
            log.error("HTTP 5xx Error when requesting Google access token. code: {}, status: {}, body: {}",
                    code, e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new GlobalException(ErrorCode.GOOGLE_OAUTH_ERROR);
        } catch (Exception e) {
            log.error("Failed to request Google access token due to network/unexpected error. code: {}, redirectUri: {}",
                    code, redirectUri, e);
            throw new GlobalException(ErrorCode.GOOGLE_OAUTH_ERROR);
        }
    }

    public GoogleTokenResponse requestAccessToken(String code) {
        return requestAccessToken(code, null);
    }

    public GoogleUserInfoResponse getUserInfo(String accessToken) {
        try {
            return restClient.get()
                    .uri(googleProperties.getUserInfoUri())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .retrieve()
                    .body(GoogleUserInfoResponse.class);
        } catch (HttpClientErrorException e) {
            log.error("HTTP 4xx Error when fetching Google user info. status: {}, body: {}",
                    e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new GlobalException(ErrorCode.GOOGLE_OAUTH_ERROR);
        } catch (HttpServerErrorException e) {
            log.error("HTTP 5xx Error when fetching Google user info. status: {}, body: {}",
                    e.getStatusCode(), e.getResponseBodyAsString(), e);
            throw new GlobalException(ErrorCode.GOOGLE_OAUTH_ERROR);
        } catch (Exception e) {
            log.error("Failed to get Google user info due to network/unexpected error.", e);
            throw new GlobalException(ErrorCode.GOOGLE_OAUTH_ERROR);
        }
    }
}
