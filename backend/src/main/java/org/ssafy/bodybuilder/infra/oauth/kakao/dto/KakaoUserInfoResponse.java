package org.ssafy.bodybuilder.infra.oauth.kakao.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class KakaoUserInfoResponse {

    private Long id;

    @JsonProperty("kakao_account")
    private KakaoAccount kakaoAccount;

    public KakaoUserInfoResponse(Long id, KakaoAccount kakaoAccount) {
        this.id = id;
        this.kakaoAccount = kakaoAccount;
    }

    public String getNickname() {
        if (kakaoAccount != null && kakaoAccount.getProfile() != null) {
            return kakaoAccount.getProfile().getNickname();
        }
        return null;
    }

    @Getter
    @NoArgsConstructor
    public static class KakaoAccount {
        private Profile profile;

        public KakaoAccount(Profile profile) {
            this.profile = profile;
        }

        @Getter
        @NoArgsConstructor
        public static class Profile {
            private String nickname;

            @JsonProperty("profile_image_url")
            private String profileImageUrl;

            public Profile(String nickname, String profileImageUrl) {
                this.nickname = nickname;
                this.profileImageUrl = profileImageUrl;
            }
        }
    }
}
