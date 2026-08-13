package org.ssafy.bodybuilder.domain.auth.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.common.security.SessionAuthenticationManager;
import org.ssafy.bodybuilder.domain.auth.dto.*;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.model.User;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SessionAuthenticationManager sessionAuthenticationManager;

    @Transactional
    public AuthResponse signUp(SignUpRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        if (userRepository.existsByNickname(request.getNickname())) {
            throw new GlobalException(ErrorCode.USER_NICKNAME_DUPLICATED);
        }

        String encodedPassword = passwordEncoder.encode(request.getPassword());
        User user = User.createLocalUser(request.getNickname(), encodedPassword);
        User savedUser = userRepository.save(user);

        sessionAuthenticationManager.authenticate(savedUser.getId(), savedUser.getRole(), httpRequest, httpResponse);

        return AuthResponse.authenticated(ServiceUserDto.from(savedUser));
    }

    public AuthResponse login(LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        User user = userRepository.findByNickname(request.getNickname())
                .orElseThrow(() -> new GlobalException(ErrorCode.USER_AUTH_INFO_INCORRECT));

        if (user.getPassword() == null || !passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new GlobalException(ErrorCode.USER_AUTH_INFO_INCORRECT);
        }

        sessionAuthenticationManager.authenticate(user.getId(), user.getRole(), httpRequest, httpResponse);

        return AuthResponse.authenticated(ServiceUserDto.from(user));
    }
}
