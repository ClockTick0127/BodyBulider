package org.ssafy.bodybuilder.domain.auth.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.common.security.SessionAuthenticationManager;
import org.ssafy.bodybuilder.domain.auth.dto.AuthResponse;
import org.ssafy.bodybuilder.domain.auth.dto.LoginRequest;
import org.ssafy.bodybuilder.domain.auth.dto.ServiceUserDto;
import org.ssafy.bodybuilder.domain.auth.dto.SignUpRequest;
import org.ssafy.bodybuilder.domain.auth.dto.SocialAuthRequest;
import org.ssafy.bodybuilder.domain.auth.service.AuthService;
import org.ssafy.bodybuilder.domain.auth.strategy.SocialAuthStrategy;
import org.ssafy.bodybuilder.domain.auth.strategy.SocialAuthStrategyFactory;
import org.ssafy.bodybuilder.domain.user.model.User;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final SocialAuthStrategyFactory socialAuthStrategyFactory;
    private final SessionAuthenticationManager sessionAuthenticationManager;

    @PostMapping("/signup")
    public ResponseEntity<BaseResponse<AuthResponse>> signUp(
            @Valid @RequestBody SignUpRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        AuthResponse response = authService.signUp(request, httpRequest, httpResponse);
        return BaseResponse.success(SuccessCode.USER_SIGN_UP_SUCCESS, response);
    }

    @PostMapping("/login")
    public ResponseEntity<BaseResponse<AuthResponse>> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        AuthResponse response = authService.login(request, httpRequest, httpResponse);
        return BaseResponse.success(SuccessCode.USER_LOGIN_SUCCESS, response);
    }

    @PostMapping("/social")
    public ResponseEntity<BaseResponse<AuthResponse>> socialLogin(
            @Valid @RequestBody SocialAuthRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        SocialAuthStrategy strategy = socialAuthStrategyFactory.getStrategy(request.getProvider());
        User user = strategy.processAuth(request.getCredential(), request.getRedirectUri());

        sessionAuthenticationManager.authenticate(user.getId(), user.getRole(), httpRequest, httpResponse);

        return BaseResponse.success(SuccessCode.USER_LOGIN_SUCCESS, AuthResponse.authenticated(ServiceUserDto.from(user)));
    }
}
