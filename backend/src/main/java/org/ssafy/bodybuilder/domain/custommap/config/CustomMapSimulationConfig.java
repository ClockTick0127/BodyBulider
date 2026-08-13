package org.ssafy.bodybuilder.domain.custommap.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.ssafy.bodybuilder.domain.custommap.service.CustomMapSimulationExecutor;

@Configuration
public class CustomMapSimulationConfig {

    private static final int POOL_SIZE = 2;
    private static final int QUEUE_CAPACITY = 10;

    @Bean(destroyMethod = "shutdown")
    public CustomMapSimulationExecutor customMapSimulationExecutor() {
        return new CustomMapSimulationExecutor(POOL_SIZE, QUEUE_CAPACITY);
    }
}
