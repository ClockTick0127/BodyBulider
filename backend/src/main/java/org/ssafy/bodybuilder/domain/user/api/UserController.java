package org.ssafy.bodybuilder.domain.user.api;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.common.security.annotation.LoginUser;
import org.ssafy.bodybuilder.domain.auth.dto.NicknameAvailabilityResponse;
import org.ssafy.bodybuilder.domain.user.dto.UserInfoDto;
import org.ssafy.bodybuilder.domain.user.dto.UserProfileDto;
import org.ssafy.bodybuilder.domain.user.service.UserService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping("/me/profile")
    public ResponseEntity<BaseResponse<UserProfileDto>> getMyProfile(@LoginUser UUID userId) {
        UserProfileDto profile = userService.getUserProfile(userId);
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, profile);
    }

    @GetMapping({"/me", "/info"})
    public ResponseEntity<BaseResponse<UserInfoDto>> getUserInfo(@LoginUser UUID userId) {
        UserInfoDto userInfo = userService.getUserInfo(userId);
        return BaseResponse.success(SuccessCode.USER_INFO_SUCCESS, userInfo);
    }

    @GetMapping("/nickname/availability")
    public ResponseEntity<BaseResponse<NicknameAvailabilityResponse>> checkNicknameAvailability(
            @RequestParam("nickname") String nickname
    ) {
        NicknameAvailabilityResponse response = userService.checkNicknameAvailability(nickname);
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, response);
    }
}
