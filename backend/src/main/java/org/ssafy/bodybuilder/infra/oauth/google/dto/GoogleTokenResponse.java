package org.ssafy.bodybuilder.infra.oauth.google.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class GoogleTokenResponse {

    @JsonProperty("access_token")
    private String accessToken;

    @JsonProperty("token_type")
    private String tokenType;

    @JsonProperty("expires_in")
    private Integer expiresIn;

    @JsonProperty("scope")
    private String scope;

    @JsonProperty("id_token")
    private String idToken;

    public GoogleTokenResponse(String accessToken, String tokenType, Integer expiresIn, String scope, String idToken) {
        this.accessToken = accessToken;
        this.tokenType = tokenType;
        this.expiresIn = expiresIn;
        this.scope = scope;
        this.idToken = idToken;
    }
}
