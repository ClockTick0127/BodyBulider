package org.ssafy.bodybuilder.domain.user.dto;

import org.ssafy.bodybuilder.domain.user.model.User;
import org.ssafy.bodybuilder.domain.user.model.UserRole;

public record UserInfoDto(String nickname, UserRole role) {

    public static UserInfoDto from(User user) {
        return new UserInfoDto(user.getNickname(), user.getRole());
    }

}
