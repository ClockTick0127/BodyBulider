package org.ssafy.bodybuilder.common.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.domain.user.model.UserRole;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class SessionAuthenticationManager {

    private final SecurityContextRepository securityContextRepository;

    public void authenticate(UUID userId, UserRole role, HttpServletRequest request, HttpServletResponse response) {
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                userId.toString(),
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name()))
        );

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);

        securityContextRepository.saveContext(context, request, response);
    }
}
