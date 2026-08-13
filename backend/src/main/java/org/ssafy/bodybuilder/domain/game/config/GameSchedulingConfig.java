package org.ssafy.bodybuilder.domain.game.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
public class GameSchedulingConfig {

    @Bean
    public Clock gameClock() {
        return Clock.systemDefaultZone();
    }

    @Bean
    public ThreadPoolTaskScheduler gameTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("game-capture-");
        scheduler.setRemoveOnCancelPolicy(true);
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        return scheduler;
    }
}
