package org.ssafy.bodybuilder.domain.auth.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.ssafy.bodybuilder.domain.auth.dao.SocialConnectionRepository;
import org.ssafy.bodybuilder.domain.auth.model.ProviderType;
import org.ssafy.bodybuilder.domain.auth.model.SocialConnection;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.model.User;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class SocialAuthDomainServiceTest {

    @Autowired
    private SocialAuthDomainService socialAuthDomainService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SocialConnectionRepository socialConnectionRepository;

    @Test
    @DisplayName("신규 카카오 회원인 경우 User 및 SocialConnection을 생성하고 저장한다")
    void findOrCreateSocialUser_newUser() {
        // when
        User user = socialAuthDomainService.findOrCreateSocialUser(ProviderType.KAKAO, "999888777", "신규소셜유저");

        // then
        assertThat(user).isNotNull();
        assertThat(user.getNickname()).isEqualTo("신규소셜유저");

        Optional<SocialConnection> connection = socialConnectionRepository.findByProviderTypeAndProviderId(ProviderType.KAKAO, "999888777");
        assertThat(connection).isPresent();
        assertThat(connection.get().getUser().getId()).isEqualTo(user.getId());
    }

    @Test
    @DisplayName("기존 연동된 회원이 있는 경우 해당 유저를 바로 반환한다")
    void findOrCreateSocialUser_existingUser() {
        // given
        User existingUser = userRepository.save(User.createSocialUser("기존유저"));
        socialConnectionRepository.save(SocialConnection.create(existingUser, ProviderType.KAKAO, "111222333"));

        // when
        User user = socialAuthDomainService.findOrCreateSocialUser(ProviderType.KAKAO, "111222333", "다른닉네임");

        // then
        assertThat(user.getId()).isEqualTo(existingUser.getId());
        assertThat(user.getNickname()).isEqualTo("기존유저");
    }
}
