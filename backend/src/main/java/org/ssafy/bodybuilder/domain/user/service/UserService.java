package org.ssafy.bodybuilder.domain.user.service;

import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.auth.dto.NicknameAvailabilityResponse;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.dto.UserInfoDto;
import org.ssafy.bodybuilder.domain.user.dto.UserProfileDto;
import org.ssafy.bodybuilder.domain.user.model.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public UserInfoDto getUserInfo(UUID userId) {
        User user = getUserByUserId(userId);
        return UserInfoDto.from(user);
    }

    @Transactional(readOnly = true)
    public UserProfileDto getUserProfile(UUID userId) {
        User user = getUserByUserId(userId);
        return UserProfileDto.builder()
                .uuid(user.getId())
                .nickname(user.getNickname())
                .role(user.getRole())
                .build();
    }

    @Transactional(readOnly = true)
    public NicknameAvailabilityResponse checkNicknameAvailability(String nickname) {
        if (nickname == null || nickname.trim().isEmpty()) {
            return new NicknameAvailabilityResponse(false);
        }
        boolean available = !userRepository.existsByNickname(nickname.trim());
        return new NicknameAvailabilityResponse(available);
    }

    private User getUserByUserId(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new GlobalException(ErrorCode.USER_NOT_FOUND));
    }
}
