package org.ssafy.bodybuilder.domain.user.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.ssafy.bodybuilder.domain.user.model.UserRole;

import org.ssafy.bodybuilder.domain.user.model.UserRole;

import java.util.UUID;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserProfileDto {
    private UUID uuid;
    private String nickname;
    private UserRole role;
}
