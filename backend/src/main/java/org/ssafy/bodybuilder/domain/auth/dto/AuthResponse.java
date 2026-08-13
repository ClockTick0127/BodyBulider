package org.ssafy.bodybuilder.domain.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class AuthResponse {

    private String status;
    private ServiceUserDto user;

    public static AuthResponse authenticated(ServiceUserDto user) {
        return new AuthResponse("AUTHENTICATED", user);
    }
}
