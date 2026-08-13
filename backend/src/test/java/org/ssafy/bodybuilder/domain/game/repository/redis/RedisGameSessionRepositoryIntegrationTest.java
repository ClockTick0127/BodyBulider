package org.ssafy.bodybuilder.domain.game.repository.redis;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.model.GamePoseSubmission;
import org.ssafy.bodybuilder.domain.game.model.GameSimulationInput;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

@EnabledIfEnvironmentVariable(named = "REDIS_INTEGRATION", matches = "true")
class RedisGameSessionRepositoryIntegrationTest {

    private LettuceConnectionFactory connectionFactory;
    private RedisTemplate<String, Object> redisTemplate;
    private RedisGameSessionRepository repository;
    private UUID gameSessionId;
    private UUID userId;

    @BeforeEach
    void setUp() {
        RedisStandaloneConfiguration configuration =
                new RedisStandaloneConfiguration(
                        environment("REDIS_TEST_HOST", "127.0.0.1"),
                        Integer.parseInt(environment("REDIS_TEST_PORT", "6379"))
                );
        String password = System.getenv("REDIS_TEST_PASSWORD");
        if (password != null && !password.isBlank()) {
            configuration.setPassword(RedisPassword.of(password));
        }

        connectionFactory = new LettuceConnectionFactory(configuration);
        connectionFactory.afterPropertiesSet();

        GenericJackson2JsonRedisSerializer valueSerializer =
                new GenericJackson2JsonRedisSerializer(
                        new ObjectMapper().findAndRegisterModules()
                );
        redisTemplate = new RedisTemplate<>();
        redisTemplate.setConnectionFactory(connectionFactory);
        redisTemplate.setKeySerializer(StringRedisSerializer.UTF_8);
        redisTemplate.setValueSerializer(valueSerializer);
        redisTemplate.setHashKeySerializer(StringRedisSerializer.UTF_8);
        redisTemplate.setHashValueSerializer(valueSerializer);
        redisTemplate.afterPropertiesSet();

        repository = new RedisGameSessionRepository(redisTemplate);
        gameSessionId = UUID.randomUUID();
        userId = UUID.randomUUID();
    }

    @AfterEach
    void tearDown() {
        String gameKey = gameKey();
        redisTemplate.delete(List.of(
                gameKey,
                gameKey + ":participants",
                gameKey + ":players",
                gameKey + ":round:1:player:1:pending-captures",
                gameKey + ":round:1:capture:1:pose",
                gameKey + ":round:1:capture:2:pose",
                gameKey + ":round:1:capture:3:pose",
                gameKey + ":round:1:capture:4:pose",
                gameKey + ":round:1:simulation-claimed"
        ));
        connectionFactory.destroy();
    }

    @Test
    void storesPoseExactlyOnceWhenSameCaptureArrivesConcurrently() throws Exception {
        UUID roomSessionId = UUID.randomUUID();
        List<List<Double>> points = List.of(
                List.of(0.34, 0.42),
                List.of(0.38, 0.45)
        );
        String gameKey = gameKey();
        String pendingKey = gameKey + ":round:1:player:1:pending-captures";
        String poseKey = gameKey + ":round:1:capture:1:pose";

        redisTemplate.opsForHash().put(gameKey, "roomSessionId", roomSessionId.toString());
        redisTemplate.opsForHash().put(gameKey, "status", "PLAYING");
        redisTemplate.opsForHash().put(gameKey, "currentRoundNo", 1);
        redisTemplate.opsForHash().put(gameKey + ":players", userId.toString(), 1);
        redisTemplate.opsForList().rightPush(pendingKey, 1);

        CountDownLatch start = new CountDownLatch(1);
        Callable<Object> save = () -> {
            start.await();
            try {
                return repository.savePose(
                        roomSessionId,
                        gameSessionId,
                        userId,
                        1,
                        points
                );
            } catch (GlobalException exception) {
                return exception.getErrorCode();
            }
        };
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<Object> first = executor.submit(save);
            Future<Object> second = executor.submit(save);
            start.countDown();
            List<Object> outcomes = List.of(
                    first.get(5, TimeUnit.SECONDS),
                    second.get(5, TimeUnit.SECONDS)
            );

            assertThat(outcomes.stream()
                    .filter(GamePoseSubmission.class::isInstance))
                    .hasSize(1);
            assertThat(outcomes.stream()
                    .filter(ErrorCode.ROUND_NOT_CAPTURING::equals))
                    .hasSize(1);
        } finally {
            executor.shutdownNow();
        }

        assertThat(redisTemplate.opsForList().size(pendingKey)).isZero();
        assertThat(redisTemplate.opsForValue().get(poseKey)).isEqualTo(points);
        Long ttlMillis = redisTemplate.getExpire(poseKey, TimeUnit.MILLISECONDS);
        assertThat(ttlMillis)
                .isPositive()
                .isLessThanOrEqualTo(Duration.ofHours(2).toMillis());
    }

    @Test
    void storesEitherSubmittedOrEmptyPoseWhenSubmissionAndTimeoutRace() throws Exception {
        UUID roomSessionId = UUID.randomUUID();
        List<List<Double>> points = List.of(
                List.of(0.34, 0.42),
                List.of(0.38, 0.45)
        );
        String gameKey = gameKey();
        String pendingKey = gameKey + ":round:1:player:1:pending-captures";
        String poseKey = gameKey + ":round:1:capture:1:pose";
        redisTemplate.opsForHash().put(gameKey, "roomSessionId", roomSessionId.toString());
        redisTemplate.opsForHash().put(gameKey, "status", "PLAYING");
        redisTemplate.opsForHash().put(gameKey, "currentRoundNo", 1);
        redisTemplate.opsForHash().put(gameKey + ":players", userId.toString(), 1);
        redisTemplate.opsForList().rightPush(pendingKey, 1);

        CountDownLatch start = new CountDownLatch(1);
        Callable<Object> submit = () -> {
            start.await();
            try {
                return repository.savePose(
                        roomSessionId,
                        gameSessionId,
                        userId,
                        1,
                        points
                );
            } catch (GlobalException exception) {
                return exception.getErrorCode();
            }
        };
        Callable<Object> timeOut = () -> {
            start.await();
            return repository.resolveTimedOutCapture(gameSessionId, 1, 1);
        };
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<Object> submission = executor.submit(submit);
            Future<Object> timeout = executor.submit(timeOut);
            start.countDown();
            List<Object> outcomes = List.of(
                    submission.get(5, TimeUnit.SECONDS),
                    timeout.get(5, TimeUnit.SECONDS)
            );

            assertThat(outcomes.stream()
                    .filter(outcome -> outcome instanceof GamePoseSubmission
                            || Boolean.TRUE.equals(outcome)))
                    .hasSize(1);
        } finally {
            executor.shutdownNow();
        }

        assertThat(redisTemplate.opsForList().size(pendingKey)).isZero();
        Object storedPose = redisTemplate.opsForValue().get(poseKey);
        assertThat(storedPose).isNotNull();
        assertThat(storedPose.equals(points) || storedPose.equals(List.of())).isTrue();
        assertThat(redisTemplate.getExpire(poseKey, TimeUnit.MILLISECONDS))
                .isPositive()
                .isLessThanOrEqualTo(Duration.ofHours(2).toMillis());
    }

    @Test
    void claimsReadySimulationExactlyOnceWhenRequestsRace() throws Exception {
        UUID roomSessionId = UUID.randomUUID();
        String gameKey = gameKey();
        List<List<Double>> pose = List.of(
                List.of(0.34, 0.42),
                List.of(0.38, 0.45)
        );
        redisTemplate.opsForHash().put(gameKey, "roomSessionId", roomSessionId.toString());
        redisTemplate.opsForHash().put(gameKey, "status", "PLAYING");
        redisTemplate.opsForHash().put(gameKey, "roundPhase", "LOADING");
        redisTemplate.opsForHash().put(gameKey, "stageId", 1);
        redisTemplate.opsForHash().put(gameKey, "currentRoundNo", 1);
        redisTemplate.opsForHash().put(gameKey, "startedAt", "2026-07-29T09:00:00");
        redisTemplate.opsForHash().put(gameKey, "playTimeMs", 0L);
        redisTemplate.opsForHash().put(gameKey + ":players", userId.toString(), 1);
        for (int captureNo = 1; captureNo <= 4; captureNo++) {
            redisTemplate.opsForValue().set(
                    gameKey + ":round:1:capture:" + captureNo + ":pose",
                    pose,
                    Duration.ofHours(2)
            );
        }

        CountDownLatch start = new CountDownLatch(1);
        Callable<Optional<GameSimulationInput>> claim = () -> {
            start.await();
            return repository.claimReadySimulation(roomSessionId, gameSessionId);
        };
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<Optional<GameSimulationInput>> first = executor.submit(claim);
            Future<Optional<GameSimulationInput>> second = executor.submit(claim);
            start.countDown();
            List<Optional<GameSimulationInput>> outcomes = List.of(
                    first.get(5, TimeUnit.SECONDS),
                    second.get(5, TimeUnit.SECONDS)
            );

            assertThat(outcomes.stream().filter(Optional::isPresent)).hasSize(1);
        } finally {
            executor.shutdownNow();
        }

        assertThat(redisTemplate.opsForHash().get(gameKey, "roundPhase"))
                .isEqualTo("SIMULATING");
        String claimKey = gameKey + ":round:1:simulation-claimed";
        assertThat(redisTemplate.opsForValue().get(claimKey)).isEqualTo(true);
        assertThat(redisTemplate.getExpire(claimKey, TimeUnit.MILLISECONDS))
                .isPositive()
                .isLessThanOrEqualTo(Duration.ofHours(2).toMillis());
    }

    private String gameKey() {
        return "game:" + gameSessionId;
    }

    private String environment(String name, String defaultValue) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
