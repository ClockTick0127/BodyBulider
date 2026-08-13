package org.ssafy.bodybuilder.domain.game.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsSimulator;
import org.ssafy.bodybuilder.domain.game.physics.SimulationResult;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DevSimulationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private PhysicsSimulator physicsSimulator;

    @Test
    @DisplayName("미인증 사용자 개발 API 접근 시 401 Unauthorized 반환")
    void simulate_unauthenticated_returns401() throws Exception {
        Map<String, Object> requestBody = Map.of(
                "mapConfig", Map.of(),
                "poses", Collections.emptyList()
        );

        mockMvc.perform(post("/api/v1/dev/simulate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requestBody)))
                .andDo(print())
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("C003"));
    }

    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("일반 사용자 (ROLE_USER) 개발 API 접근 시 403 Forbidden 반환")
    void simulate_userRole_returns403() throws Exception {
        Map<String, Object> requestBody = Map.of(
                "mapConfig", Map.of(),
                "poses", Collections.emptyList()
        );

        mockMvc.perform(post("/api/v1/dev/simulate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requestBody)))
                .andDo(print())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("C002"));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("관리자 (ROLE_ADMIN) 개발 API 접근 시 200 OK 반환")
    void simulate_adminRole_returns200() throws Exception {
        given(physicsSimulator.simulate(any(), any()))
                .willReturn(new SimulationResult(30, List.of(), true));

        Map<String, Object> requestBody = Map.of(
                "mapConfig", Map.of("physics", Map.of("gravity", Map.of("x", 0, "y", -9.8))),
                "poses", Collections.emptyList()
        );

        mockMvc.perform(post("/api/v1/dev/simulate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requestBody)))
                .andDo(print())
                .andExpect(status().isOk());
    }
}
