package org.ssafy.bodybuilder.domain.game.repository.redis;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.model.GamePoseSubmission;
import org.ssafy.bodybuilder.domain.game.model.GameSimulationInput;
import org.ssafy.bodybuilder.domain.game.model.GameStatus;
import org.ssafy.bodybuilder.domain.game.model.SimulationParticipant;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;

@ExtendWith(MockitoExtension.class)
class RedisGameSessionRepositoryTest {

    private static final Duration ACTIVE_GAME_TTL = Duration.ofHours(2);

    @Mock RedisTemplate<String, Object> redisTemplate;
    @Mock HashOperations<String, Object, Object> hashOperations;
    @Mock ListOperations<String, Object> listOperations;
    @Mock ValueOperations<String, Object> valueOperations;

    private RedisGameSessionRepository repository;
    private RedisSerializer<Object> valueSerializer;

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        lenient().when(redisTemplate.opsForList()).thenReturn(listOperations);
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        valueSerializer = new GenericJackson2JsonRedisSerializer(
                new ObjectMapper().findAndRegisterModules()
        );
        lenient().doReturn(valueSerializer)
                .when(redisTemplate).getValueSerializer();
        repository = new RedisGameSessionRepository(redisTemplate);
    }

    @Test
    void enqueuesCaptureNumberForRequestedPlayer() {
        UUID gameSessionId = UUID.randomUUID();
        String gameKey = "game:" + gameSessionId;
        String pendingKey = gameKey + ":round:1:player:2:pending-captures";
        given(hashOperations.get(gameKey, "currentRoundNo")).willReturn(1);

        repository.enqueueCaptureRequest(gameSessionId, 2, 3);

        verify(listOperations).rightPush(pendingKey, 3);
        verify(redisTemplate).expire(pendingKey, ACTIVE_GAME_TTL);
    }

    @Test
    void storesRoundPlayTimeForTheGameSession() {
        UUID gameSessionId = UUID.randomUUID();
        String key = "game:" + gameSessionId + ":round-play-times";

        repository.saveRoundPlayTime(gameSessionId, 12, 350L);

        verify(hashOperations).put(key, "12", 350L);
        verify(redisTemplate).expire(key, ACTIVE_GAME_TTL);
    }

    @Test
    void readsRoundPlayTimesByRoundId() {
        UUID gameSessionId = UUID.randomUUID();
        String key = "game:" + gameSessionId + ":round-play-times";
        given(hashOperations.entries(key)).willReturn(Map.of(
                "11", 100L,
                "12", 250L
        ));

        assertThat(repository.findRoundPlayTimes(gameSessionId))
                .containsExactlyInAnyOrderEntriesOf(Map.of(
                        11, 100L,
                        12, 250L
                ));
    }

    @Test
    @SuppressWarnings("unchecked")
    void storesFourSubmissionsWithOneAtomicScriptPerSubmission() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String gameKey = "game:" + gameSessionId;
        List<List<Double>> points = List.of(
                List.of(0.34, 0.42),
                List.of(0.38, 0.45)
        );
        given(redisTemplate.execute(
                any(RedisScript.class),
                any(RedisSerializer.class),
                any(RedisSerializer.class),
                anyList(),
                any(Object[].class)
        )).willReturn(1L);

        for (int captureNo = 1; captureNo <= 4; captureNo++) {
            GamePoseSubmission submission = repository.savePose(
                    roomSessionId,
                    gameSessionId,
                    userId,
                    captureNo,
                    points
            );
            assertThat(submission.player()).isEqualTo(1);
            assertThat(submission.captureNo()).isEqualTo(captureNo);
            assertThat(submission.points()).isEqualTo(points);
        }

        ArgumentCaptor<RedisScript<Long>> scriptCaptor =
                ArgumentCaptor.forClass(RedisScript.class);
        ArgumentCaptor<List<String>> keysCaptor =
                ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Object[]> argumentsCaptor =
                ArgumentCaptor.forClass(Object[].class);
        verify(redisTemplate, times(4)).execute(
                scriptCaptor.capture(),
                any(RedisSerializer.class),
                any(RedisSerializer.class),
                keysCaptor.capture(),
                argumentsCaptor.capture()
        );

        assertThat(scriptCaptor.getValue().getScriptAsString())
                .contains("hget", "lrem", "psetex");
        assertThat(keysCaptor.getValue()).containsExactly(
                gameKey,
                gameKey + ":players"
        );
        assertThat(argumentsCaptor.getValue()).containsExactly(
                serialized(roomSessionId.toString()),
                serialized("PLAYING"),
                userId.toString(),
                "4",
                serialized(points),
                String.valueOf(ACTIVE_GAME_TTL.toMillis())
        );
    }

    @Test
    void rejectsPoseWithoutPendingCaptureRequest() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        given(redisTemplate.execute(
                any(RedisScript.class),
                any(RedisSerializer.class),
                any(RedisSerializer.class),
                anyList(),
                any(Object[].class)
        )).willReturn(-5L);

        assertThatThrownBy(() -> repository.savePose(
                roomSessionId,
                gameSessionId,
                userId,
                2,
                List.of(List.of(0.34, 0.42))
        )).isInstanceOfSatisfying(
                GlobalException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.ROUND_NOT_CAPTURING)
        );

        verify(valueOperations, never()).set(
                anyString(),
                any(),
                any(Duration.class)
        );
    }

    @ParameterizedTest
    @MethodSource("savePoseFailures")
    @SuppressWarnings("unchecked")
    void mapsAtomicSaveFailureToDomainError(
            long scriptResult,
            ErrorCode expectedErrorCode
    ) {
        given(redisTemplate.execute(
                any(RedisScript.class),
                any(RedisSerializer.class),
                any(RedisSerializer.class),
                anyList(),
                any(Object[].class)
        )).willReturn(scriptResult);

        assertThatThrownBy(() -> repository.savePose(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                1,
                List.of(List.of(0.34, 0.42))
        )).isInstanceOfSatisfying(
                GlobalException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(expectedErrorCode)
        );
    }

    private static Stream<Arguments> savePoseFailures() {
        return Stream.of(
                Arguments.of(-1L, ErrorCode.GAME_SESSION_NOT_FOUND),
                Arguments.of(-2L, ErrorCode.GAME_SESSION_ROOM_MISMATCH),
                Arguments.of(-3L, ErrorCode.SESSION_NOT_PLAYING),
                Arguments.of(-4L, ErrorCode.NOT_GAME_PARTICIPANT),
                Arguments.of(-6L, ErrorCode.INTERNAL_SERVER_ERROR),
                Arguments.of(-99L, ErrorCode.INTERNAL_SERVER_ERROR)
        );
    }

    @Test
    @SuppressWarnings("unchecked")
    void storesEmptyPoseWhenCaptureRequestTimesOut() {
        UUID gameSessionId = UUID.randomUUID();
        String gameKey = "game:" + gameSessionId;
        given(redisTemplate.execute(
                any(RedisScript.class),
                any(RedisSerializer.class),
                any(RedisSerializer.class),
                anyList(),
                any(Object[].class)
        )).willReturn(1L);

        boolean resolved = repository.resolveTimedOutCapture(
                gameSessionId,
                2,
                3
        );

        assertThat(resolved).isTrue();
        ArgumentCaptor<RedisScript<Long>> scriptCaptor =
                ArgumentCaptor.forClass(RedisScript.class);
        ArgumentCaptor<List<String>> keysCaptor =
                ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Object[]> argumentsCaptor =
                ArgumentCaptor.forClass(Object[].class);
        verify(redisTemplate).execute(
                scriptCaptor.capture(),
                any(RedisSerializer.class),
                any(RedisSerializer.class),
                keysCaptor.capture(),
                argumentsCaptor.capture()
        );
        assertThat(scriptCaptor.getValue().getScriptAsString())
                .contains("lrem", "psetex");
        assertThat(keysCaptor.getValue()).containsExactly(gameKey);
        assertThat(argumentsCaptor.getValue()).containsExactly(
                serialized("PLAYING"),
                "2",
                "3",
                serialized(List.of()),
                String.valueOf(ACTIVE_GAME_TTL.toMillis())
        );
    }

    @Test
    @SuppressWarnings("unchecked")
    void claimsSimulationOnlyAfterAllFourPosesAreStored() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        UUID firstParticipantId = UUID.randomUUID();
        UUID secondParticipantId = UUID.randomUUID();
        String gameKey = "game:" + gameSessionId;
        List<String> poseKeys = List.of(
                gameKey + ":round:1:capture:1:pose",
                gameKey + ":round:1:capture:2:pose",
                gameKey + ":round:1:capture:3:pose",
                gameKey + ":round:1:capture:4:pose"
        );
        List<List<Double>> pose = List.of(
                List.of(0.34, 0.42),
                List.of(0.38, 0.45)
        );
        List<Object> storedPoses = List.of(pose, pose, pose, pose);
        given(hashOperations.entries(gameKey)).willReturn(Map.of(
                "roomSessionId", roomSessionId.toString(),
                "status", "PLAYING",
                "stageId", 1,
                "currentRoundNo", 1,
                "playTimeMs", 150L,
                "startedAt", "2026-07-29T09:00:00"
        ));
        given(hashOperations.entries(gameKey + ":players"))
                .willReturn(Map.of(
                        secondParticipantId.toString(), 2,
                        firstParticipantId.toString(), 1
                ));
        given(valueOperations.multiGet(poseKeys)).willReturn(storedPoses);
        given(redisTemplate.execute(
                any(RedisScript.class),
                any(RedisSerializer.class),
                any(RedisSerializer.class),
                anyList(),
                any(Object[].class)
        )).willReturn(1L);

        Optional<GameSimulationInput> claimed = repository.claimReadySimulation(
                roomSessionId,
                gameSessionId
        );

        assertThat(claimed).isPresent();
        assertThat(claimed.orElseThrow().poses()).hasSize(4);
        assertThat(claimed.orElseThrow().participants())
                .containsExactly(
                        new SimulationParticipant(firstParticipantId, 1),
                        new SimulationParticipant(secondParticipantId, 2)
                );
        assertThat(claimed.orElseThrow().startedAt())
                .isEqualTo(LocalDateTime.of(2026, 7, 29, 9, 0));
        assertThat(claimed.orElseThrow().accumulatedPlayTimeMs())
                .isEqualTo(150L);

        ArgumentCaptor<RedisScript<Long>> scriptCaptor =
                ArgumentCaptor.forClass(RedisScript.class);
        ArgumentCaptor<List<String>> keysCaptor =
                ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Object[]> argumentsCaptor =
                ArgumentCaptor.forClass(Object[].class);
        verify(redisTemplate).execute(
                scriptCaptor.capture(),
                any(RedisSerializer.class),
                any(RedisSerializer.class),
                keysCaptor.capture(),
                argumentsCaptor.capture()
        );
        assertThat(scriptCaptor.getValue().getScriptAsString())
                .contains("exists", "hset", "psetex");
        assertThat(keysCaptor.getValue()).containsExactly(
                gameKey,
                gameKey + ":round:1:simulation-claimed",
                gameKey + ":round:1:capture:1:pose",
                gameKey + ":round:1:capture:2:pose",
                gameKey + ":round:1:capture:3:pose",
                gameKey + ":round:1:capture:4:pose"
        );
        assertThat(argumentsCaptor.getValue()).containsExactly(
                serialized(roomSessionId.toString()),
                serialized("PLAYING"),
                serialized(1),
                serialized("SIMULATING"),
                serialized(true),
                String.valueOf(ACTIVE_GAME_TTL.toMillis())
        );
    }

    @Test
    void movesGameToNextRound() {
        UUID gameSessionId = UUID.randomUUID();
        String gameKey = "game:" + gameSessionId;

        repository.moveToNextRound(gameSessionId, 1, 2, 750L);

        verify(hashOperations).putAll(gameKey, Map.of(
                "mapId", "1002",
                "currentRoundNo", 2,
                "roundPhase", "LOADING",
                "playTimeMs", 750L
        ));
    }

    @Test
    void finishesGameWithStatusAndEndTime() {
        UUID gameSessionId = UUID.randomUUID();
        String gameKey = "game:" + gameSessionId;
        LocalDateTime endedAt = LocalDateTime.of(2026, 7, 29, 9, 1);

        repository.finishGame(gameSessionId, GameStatus.CLEARED, endedAt);

        verify(hashOperations).putAll(gameKey, Map.of(
                "status", "CLEARED",
                "roundPhase", "COMPLETED",
                "endedAt", "2026-07-29T09:01"
        ));
    }

    private String serialized(Object value) {
        return new String(valueSerializer.serialize(value), UTF_8);
    }
}
