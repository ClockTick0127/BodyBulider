package org.ssafy.bodybuilder.global.config.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.security.jackson2.SecurityJackson2Modules;
import org.springframework.session.data.redis.config.annotation.web.http.EnableRedisHttpSession;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

@Configuration
@EnableRedisHttpSession(maxInactiveIntervalInSeconds = 86400)
public class RedisSessionConfig {

    @Bean
    public CookieSerializer cookieSerializer() {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setCookieName("JSESSIONID");
        serializer.setCookiePath("/");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setSameSite("Lax");
        serializer.setUseBase64Encoding(false);
        return serializer;
    }

    @Bean("springSessionDefaultRedisSerializer")
    public RedisSerializer<Object> springSessionDefaultRedisSerializer(ObjectMapper mapper) {
        ObjectMapper sessionMapper = mapper.copy();
        sessionMapper.registerModules(SecurityJackson2Modules.getModules(getClass().getClassLoader()));
        return new GenericJackson2JsonRedisSerializer(sessionMapper);
    }
}
