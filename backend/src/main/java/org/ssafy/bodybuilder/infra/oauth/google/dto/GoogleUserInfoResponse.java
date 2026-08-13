package org.ssafy.bodybuilder.infra.oauth.google.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class GoogleUserInfoResponse {

    @JsonProperty("sub")
    private String sub;

    @JsonProperty("name")
    private String name;

    @JsonProperty("given_name")
    private String givenName;

    @JsonProperty("family_name")
    private String familyName;

    @JsonProperty("picture")
    private String picture;

    @JsonProperty("email")
    private String email;

    @JsonProperty("email_verified")
    private Boolean emailVerified;

    public GoogleUserInfoResponse(String sub, String name, String givenName, String familyName, String picture, String email, Boolean emailVerified) {
        this.sub = sub;
        this.name = name;
        this.givenName = givenName;
        this.familyName = familyName;
        this.picture = picture;
        this.email = email;
        this.emailVerified = emailVerified;
    }
}
