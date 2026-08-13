package org.ssafy.bodybuilder.domain.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.ssafy.bodybuilder.domain.user.model.User;
import org.ssafy.bodybuilder.domain.user.model.UserRole;

import java.util.UUID;

@Getter
@AllArgsConstructor
public class ServiceUserDto {

    private UUID uuid;
    private String nickname;
    private UserRole role;

    public static ServiceUserDto from(User user) {
        return new ServiceUserDto(user.getId(), user.getNickname(), user.getRole());
    }
}
