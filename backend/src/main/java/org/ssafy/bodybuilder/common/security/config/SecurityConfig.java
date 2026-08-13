package org.ssafy.bodybuilder.common.security.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.common.security.config.properties.CorsProperties;

import java.io.IOException;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private static final String LOGOUT_URL = "/api/v1/auth/logout";

    private final ObjectMapper objectMapper;
    private final CorsProperties corsProperties;

    @Bean
    @SuppressWarnings("removal")
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            SecurityContextRepository securityContextRepository
    ) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                )
                .securityContext(context -> context
                        .securityContextRepository(securityContextRepository)
                )
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/v1/auth/**", "/api/v1/users/nickname/availability").permitAll()
                        .requestMatchers("/api/v1/dev/**").hasRole("ADMIN")
                        .requestMatchers("/api/v1/stages", "/api/v1/stages/*").permitAll()
                        .requestMatchers("/ws-stomp/**").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/oauth2/**", "/login/oauth2/**").permitAll()
                        .requestMatchers("/swagger-ui/*", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                        .anyRequest().authenticated()
                )
                .exceptionHandling(exception -> exception
                        .authenticationEntryPoint((request, response, e) ->
                                sendResponse(response, BaseResponse.of(ErrorCode.UNAUTHORIZED)))
                        .accessDeniedHandler((request, response, e) ->
                                sendResponse(response, BaseResponse.of(ErrorCode.ACCESS_DENIED)))
                )
                .logout(logout -> logout
                        .logoutRequestMatcher(AntPathRequestMatcher.antMatcher(HttpMethod.POST, LOGOUT_URL))
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID")
                        .logoutSuccessHandler((request, response, authentication) ->
                                sendResponse(response, BaseResponse.of(SuccessCode.USER_LOGOUT_SUCCESS)))
                        .permitAll()
                );

        return http.build();
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(corsProperties.getAllowedOrigins());
        configuration.setAllowedMethods(corsProperties.getAllowedMethods());
        configuration.setAllowedHeaders(corsProperties.getAllowedHeaders());
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private void sendResponse(HttpServletResponse response, BaseResponse<Void> body) throws IOException {
        response.setStatus(body.status());
        response.setContentType(APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(UTF_8.name());
        objectMapper.writeValue(response.getWriter(), body);
    }
}
