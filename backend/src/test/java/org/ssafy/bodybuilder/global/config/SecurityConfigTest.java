package org.ssafy.bodybuilder.global.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("POST /api/v1/auth/logout 요청 시 정상적으로 로그아웃 성공 응답을 반환한다")
    void logoutWithPostSuccess() throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(200))
                .andExpect(jsonPath("$.message").value("로그아웃 되었습니다."));
    }

    @Test
    @DisplayName("GET /api/v1/auth/logout 요청 시 로그아웃이 수행되지 않는다")
    void logoutWithGetFails() throws Exception {
        mockMvc.perform(get("/api/v1/auth/logout"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("서버 내부 오류가 발생했습니다."));
    }
}
