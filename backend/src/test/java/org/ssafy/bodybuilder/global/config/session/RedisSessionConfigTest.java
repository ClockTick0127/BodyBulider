package org.ssafy.bodybuilder.global.config.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextImpl;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RedisSessionConfigTest {

    private final RedisSessionConfig config = new RedisSessionConfig();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("springSessionDefaultRedisSerializer 빈이 GenericJackson2JsonRedisSerializer 타입을 반환해야 한다")
    void springSessionDefaultRedisSerializer_ShouldReturnGenericJackson2JsonRedisSerializer() {
        RedisSerializer<Object> serializer = config.springSessionDefaultRedisSerializer(objectMapper);

        assertThat(serializer).isInstanceOf(GenericJackson2JsonRedisSerializer.class);
    }

    @Test
    @DisplayName("SecurityContextImpl 객체를 JSON으로 직렬화 및 역직렬화할 수 있어야 한다")
    void springSessionDefaultRedisSerializer_ShouldSerializeAndDeserializeSecurityContext() {
        RedisSerializer<Object> serializer = config.springSessionDefaultRedisSerializer(objectMapper);

        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                "testUser",
                "password",
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        SecurityContextImpl context = new SecurityContextImpl(auth);

        byte[] bytes = serializer.serialize(context);
        assertThat(bytes).isNotNull();

        Object deserialized = serializer.deserialize(bytes);
        assertThat(deserialized).isInstanceOf(SecurityContextImpl.class);

        SecurityContextImpl deserializedContext = (SecurityContextImpl) deserialized;
        assertThat(deserializedContext.getAuthentication().getName()).isEqualTo("testUser");
    }

    @Test
    @DisplayName("UUID 문자열 principal을 사용하는 SecurityContext를 JSON으로 직렬화 및 역직렬화 시 principal이 유실되지 않아야 한다")
    void springSessionDefaultRedisSerializer_ShouldPreserveUuidStringPrincipal() {
        RedisSerializer<Object> serializer = config.springSessionDefaultRedisSerializer(objectMapper);
        java.util.UUID userId = java.util.UUID.randomUUID();

        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                userId.toString(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        SecurityContextImpl context = new SecurityContextImpl(auth);

        byte[] bytes = serializer.serialize(context);
        assertThat(bytes).isNotNull();

        Object deserialized = serializer.deserialize(bytes);
        assertThat(deserialized).isInstanceOf(SecurityContextImpl.class);

        SecurityContextImpl deserializedContext = (SecurityContextImpl) deserialized;
        assertThat(deserializedContext.getAuthentication().getName()).isEqualTo(userId.toString());
        assertThat(deserializedContext.getAuthentication().getPrincipal()).isEqualTo(userId.toString());
    }

    @Test
    @DisplayName("UUID 객체 principal을 사용하면 역직렬화 시 principal이 빈 문자열이 되는 현상을 확인한다")
    void springSessionDefaultRedisSerializer_UuidObjectPrincipal_DeserializesToEmptyString() {
        RedisSerializer<Object> serializer = config.springSessionDefaultRedisSerializer(objectMapper);
        java.util.UUID userId = java.util.UUID.randomUUID();

        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                userId,
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        SecurityContextImpl context = new SecurityContextImpl(auth);

        byte[] bytes = serializer.serialize(context);
        assertThat(bytes).isNotNull();

        Object deserialized = serializer.deserialize(bytes);
        assertThat(deserialized).isInstanceOf(SecurityContextImpl.class);

        SecurityContextImpl deserializedContext = (SecurityContextImpl) deserialized;
        // UUID 객체를 직렬화하면 ["java.util.UUID", "uuid-str"] 노드가 되어 asText()가 "" 빈 문자열을 반환함
        assertThat(deserializedContext.getAuthentication().getPrincipal()).isEqualTo("");
    }
}
