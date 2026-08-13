package org.ssafy.bodybuilder.domain.user.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.model.User;

import java.util.List;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Test
    @DisplayName("내 프로필 조회 시 role 정보가 포함되어 반환된다")
    void getMyProfile_includesRole() throws Exception {
        // given
        User user = userRepository.save(User.createLocalUser("profileUser", "password123"));
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                user.getId(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );

        // when & then
        mockMvc.perform(get("/api/v1/users/me/profile")
                        .with(authentication(auth)))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.uuid").value(user.getId().toString()))
                .andExpect(jsonPath("$.data.nickname").value("profileUser"))
                .andExpect(jsonPath("$.data.role").value("USER"));
    }
}
