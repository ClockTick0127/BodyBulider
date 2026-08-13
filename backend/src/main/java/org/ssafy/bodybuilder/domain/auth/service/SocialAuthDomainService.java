package org.ssafy.bodybuilder.domain.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.ssafy.bodybuilder.domain.auth.dao.SocialConnectionRepository;
import org.ssafy.bodybuilder.domain.auth.model.ProviderType;
import org.ssafy.bodybuilder.domain.auth.model.SocialConnection;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.model.User;

import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SocialAuthDomainService {

    private final UserRepository userRepository;
    private final SocialConnectionRepository socialConnectionRepository;

    @Transactional
    public User findOrCreateSocialUser(ProviderType providerType, String providerId, String rawNickname) {
        Optional<SocialConnection> existingConnection = socialConnectionRepository
                .findByProviderTypeAndProviderId(providerType, providerId);

        if (existingConnection.isPresent()) {
            return existingConnection.get().getUser();
        }

        return createNewSocialUser(providerType, providerId, rawNickname);
    }

    private User createNewSocialUser(ProviderType providerType, String providerId, String rawNickname) {
        String baseNickname = StringUtils.hasText(rawNickname)
                ? rawNickname
                : providerType.name().toLowerCase() + "_user";

        String nickname = generateUniqueNickname(baseNickname);

        User user = User.createSocialUser(nickname);
        User savedUser;
        try {
            savedUser = userRepository.save(user);
        } catch (DataIntegrityViolationException e) {
            log.warn("Nickname collision detected for '{}', retrying with unique UUID suffix.", nickname);
            String fallbackNickname = baseNickname + "_" + UUID.randomUUID().toString().substring(0, 8);
            user = User.createSocialUser(fallbackNickname);
            savedUser = userRepository.save(user);
        }

        SocialConnection connection = SocialConnection.create(savedUser, providerType, providerId);
        socialConnectionRepository.save(connection);

        return savedUser;
    }

    private String generateUniqueNickname(String baseNickname) {
        if (!userRepository.existsByNickname(baseNickname)) {
            return baseNickname;
        }

        String uuidSuffix = UUID.randomUUID().toString().substring(0, 6);
        String candidate = baseNickname + "_" + uuidSuffix;

        int counter = 1;
        while (userRepository.existsByNickname(candidate)) {
            candidate = baseNickname + "_" + UUID.randomUUID().toString().substring(0, 6) + counter;
            counter++;
        }
        return candidate;
    }
}
