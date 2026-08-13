package org.ssafy.bodybuilder.domain.auth.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.ssafy.bodybuilder.domain.auth.dto.LoginRequest;
import org.ssafy.bodybuilder.domain.auth.dto.SignUpRequest;
import org.ssafy.bodybuilder.domain.auth.dto.SocialAuthRequest;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.infra.oauth.kakao.client.KakaoOAuthClient;
import org.ssafy.bodybuilder.infra.oauth.kakao.dto.KakaoTokenResponse;
import org.ssafy.bodybuilder.infra.oauth.kakao.dto.KakaoUserInfoResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @MockBean
    private KakaoOAuthClient kakaoOAuthClient;

    @Test
    @DisplayName("회원가입 성공 테스트")
    void signUpSuccess() throws Exception {
        SignUpRequest request = new SignUpRequest("testuser", "password123");

        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andDo(print())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.data.user.uuid").exists())
                .andExpect(jsonPath("$.data.user.nickname").value("testuser"))
                .andExpect(result -> assertThat(result.getResponse().getCookie("JSESSIONID")).isNotNull());
    }

    @Test
    @DisplayName("회원가입 실패 - 닉네임 중복 시 400 Bad Request 반환")
    void signUpFailure_duplicateNickname() throws Exception {
        SignUpRequest request1 = new SignUpRequest("dupuser", "password123");
        mockMvc.perform(post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request1)));

        SignUpRequest request2 = new SignUpRequest("dupuser", "password456");
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request2)))
                .andDo(print())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("US002"));
    }

    @Test
    @DisplayName("로그인 성공 및 세션 생성 테스트")
    void loginSuccess() throws Exception {
        SignUpRequest signUpRequest = new SignUpRequest("loginuser", "password123");
        mockMvc.perform(post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(signUpRequest)));

        LoginRequest loginRequest = new LoginRequest("loginuser", "password123");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.data.user.uuid").exists())
                .andExpect(jsonPath("$.data.user.nickname").value("loginuser"))
                .andExpect(result -> assertThat(result.getResponse().getCookie("JSESSIONID")).isNotNull());
    }

    @Test
    @DisplayName("로그인 실패 - 잘못된 비밀번호 시 401 Unauthorized 반환")
    void loginFailure_wrongPassword() throws Exception {
        SignUpRequest signUpRequest = new SignUpRequest("user_wrong_pw", "password123");
        mockMvc.perform(post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(signUpRequest)));

        LoginRequest loginRequest = new LoginRequest("user_wrong_pw", "wrong_password");

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andDo(print())
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").exists());
    }

    @Test
    @DisplayName("닉네임 중복 체크 테스트")
    void checkNicknameAvailability() throws Exception {
        SignUpRequest signUpRequest = new SignUpRequest("existuser", "password123");
        mockMvc.perform(post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(signUpRequest)));

        mockMvc.perform(get("/api/v1/users/nickname/availability")
                        .param("nickname", "existuser"))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.available").value(false));

        mockMvc.perform(get("/api/v1/users/nickname/availability")
                        .param("nickname", "newuser"))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.available").value(true));
    }

    @Test
    @DisplayName("Option B 소셜 로그인(POST /api/v1/auth/social) 성공 및 세션 생성 테스트")
    void socialLoginSuccess() throws Exception {
        SocialAuthRequest request = new SocialAuthRequest(
                "KAKAO",
                "AUTHORIZATION_CODE",
                "test-code",
                "http://localhost:5173"
        );

        KakaoTokenResponse tokenResponse = new KakaoTokenResponse("access-token-123", "bearer", "refresh", 3600, "scope", 86400);
        KakaoUserInfoResponse.KakaoAccount.Profile profile = new KakaoUserInfoResponse.KakaoAccount.Profile("카카오테스트유저", null);
        KakaoUserInfoResponse.KakaoAccount account = new KakaoUserInfoResponse.KakaoAccount(profile);
        KakaoUserInfoResponse userInfo = new KakaoUserInfoResponse(987654321L, account);

        given(kakaoOAuthClient.requestAccessToken("test-code", "http://localhost:5173")).willReturn(tokenResponse);
        given(kakaoOAuthClient.getUserInfo("access-token-123")).willReturn(userInfo);

        mockMvc.perform(post("/api/v1/auth/social")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("AUTHENTICATED"))
                .andExpect(jsonPath("$.data.user.nickname").value("카카오테스트유저"))
                .andExpect(result -> assertThat(result.getResponse().getCookie("JSESSIONID")).isNotNull());
    }
}
