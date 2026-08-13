package org.ssafy.bodybuilder.domain.user.model;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;

import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Getter
@RequiredArgsConstructor(access = AccessLevel.PRIVATE)
public enum UserRole {

    USER ("ROLE_USER"),
    ADMIN("ROLE_ADMIN");

    private final String authority;

    private static final Map<String, UserRole> USER_ROLE_MAP =
            Stream.of(values()).collect(Collectors.toUnmodifiableMap(Enum::name, Function.identity()));

    public static UserRole from(String authority) {
        return Optional.ofNullable(authority)
                .map(String::toUpperCase)
                .map(USER_ROLE_MAP::get)
                .orElseThrow(() -> new GlobalException(ErrorCode.USER_ROLE_NOT_SUPPORTED));
    }
}
