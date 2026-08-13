package org.ssafy.bodybuilder.domain.game.repository.redis;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.model.GameSession;
import org.ssafy.bodybuilder.domain.game.model.GamePoseSubmission;
import org.ssafy.bodybuilder.domain.game.model.GameSimulationInput;
import org.ssafy.bodybuilder.domain.game.model.GameStatus;
import org.ssafy.bodybuilder.domain.game.model.RoundPhase;
import org.ssafy.bodybuilder.domain.game.model.RoundPoseSnapshot;
import org.ssafy.bodybuilder.domain.game.model.SimulationParticipant;
import org.ssafy.bodybuilder.domain.game.util.GameConstants;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.RedisOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SessionCallback;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.serializer.GenericToStringSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RedisGameSessionRepository implements GameSessionRepository {

    private static final Duration ACTIVE_GAME_TTL = Duration.ofHours(2);
    private static final RedisSerializer<String> SCRIPT_ARGUMENT_SERIALIZER =
            StringRedisSerializer.UTF_8;
    private static final RedisSerializer<Long> SCRIPT_RESULT_SERIALIZER =
            new GenericToStringSerializer<>(Long.class);
    private static final DefaultRedisScript<Long> SAVE_POSE_SCRIPT =
            new DefaultRedisScript<>(
                    """
                    if redis.call('exists', KEYS[1]) == 0 then return -1 end
                    local roomId = redis.call('hget', KEYS[1], 'roomSessionId')
                    if roomId ~= ARGV[1] then return -2 end
                    local status = redis.call('hget', KEYS[1], 'status')
                    if status ~= ARGV[2] then return -3 end
                    local roundNo = redis.call('hget', KEYS[1], 'currentRoundNo')
                    if not roundNo then return -6 end
                    local playerNo = redis.call('hget', KEYS[2], ARGV[3])
                    if not playerNo then return -4 end
                    local numericPlayerNo = tonumber(playerNo)
                    if not numericPlayerNo then return -6 end
                    local pendingKey = KEYS[1] .. ':round:' .. roundNo
                            .. ':player:' .. playerNo .. ':pending-captures'
                    local removed = redis.call('lrem', pendingKey, 1, ARGV[4])
                    if removed == 0 then return -5 end
                    local poseKey = KEYS[1] .. ':round:' .. roundNo
                            .. ':capture:' .. ARGV[4] .. ':pose'
                    redis.call('psetex', poseKey, ARGV[6], ARGV[5])
                    return numericPlayerNo
                    """,
                    Long.class
            );
    private static final DefaultRedisScript<Long> CLAIM_SIMULATION_SCRIPT =
            new DefaultRedisScript<>(
                    """
                    if redis.call('exists', KEYS[1]) == 0 then return -1 end
                    local roomId = redis.call('hget', KEYS[1], 'roomSessionId')
                    if roomId ~= ARGV[1] then return -2 end
                    local status = redis.call('hget', KEYS[1], 'status')
                    if status ~= ARGV[2] then return -3 end
                    local roundNo = redis.call('hget', KEYS[1], 'currentRoundNo')
                    if not roundNo then return -4 end
                    if roundNo ~= ARGV[3] then return 0 end
                    for index = 3, #KEYS do
                        if redis.call('exists', KEYS[index]) == 0 then return 0 end
                    end
                    if redis.call('exists', KEYS[2]) == 1 then return 0 end
                    redis.call('hset', KEYS[1], 'roundPhase', ARGV[4])
                    redis.call('psetex', KEYS[2], ARGV[6], ARGV[5])
                    return 1
                    """,
                    Long.class
            );
    private static final DefaultRedisScript<Long> RESOLVE_CAPTURE_TIMEOUT_SCRIPT =
            new DefaultRedisScript<>(
                    """
                    if redis.call('exists', KEYS[1]) == 0 then return 0 end
                    local status = redis.call('hget', KEYS[1], 'status')
                    if status ~= ARGV[1] then return 0 end
                    local roundNo = redis.call('hget', KEYS[1], 'currentRoundNo')
                    if not roundNo then return 0 end
                    local pendingKey = KEYS[1] .. ':round:' .. roundNo
                            .. ':player:' .. ARGV[2] .. ':pending-captures'
                    local removed = redis.call('lrem', pendingKey, 1, ARGV[3])
                    if removed == 0 then return 0 end
                    local poseKey = KEYS[1] .. ':round:' .. roundNo
                            .. ':capture:' .. ARGV[3] .. ':pose'
                    redis.call('psetex', poseKey, ARGV[5], ARGV[4])
                    return 1
                    """,
                    Long.class
            );

    private final RedisTemplate<String, Object> redisTemplate;

    ///게임시작에 필요한 데이터를 하나의 트랜젝션으로 저장한다.
    @Override
    public void commitGameStart(GameSession game, Map<UUID, Integer> participantSlots) {
        redisTemplate.execute(new SessionCallback<>() {
            @Override
            public Object execute(RedisOperations operations) throws DataAccessException {
                operations.multi();

                operations.opsForHash().putAll(gameKey(game.getGameSessionId()), gameHash(game));

                for (Map.Entry<UUID, Integer> participant : participantSlots.entrySet()) {
                    UUID participantId = participant.getKey();
                    int playerNo = participant.getValue();

                    operations.opsForSet().add(
                            participantsKey(game.getGameSessionId()),
                            participantId.toString()
                    );

                    operations.opsForHash().put(
                            playersKey(game.getGameSessionId()),
                            participantId.toString(),
                            playerNo
                    );

                }

                operations.expire(gameKey(game.getGameSessionId()), ACTIVE_GAME_TTL);
                operations.expire(participantsKey(game.getGameSessionId()), ACTIVE_GAME_TTL);
                operations.expire(playersKey(game.getGameSessionId()), ACTIVE_GAME_TTL);
                return operations.exec();
            }
        });
    }

    //FIFO형태의 캡처 대기열 key생성
    @Override
    public void enqueueCaptureRequest(
            UUID gameSessionId,
            Integer playerNo,
            Integer captureNo
    ) {
        Object roundNoValue = redisTemplate.opsForHash().get(
                gameKey(gameSessionId),
                "currentRoundNo"
        );
        if (roundNoValue == null) {
            throw new GlobalException(ErrorCode.GAME_SESSION_NOT_FOUND);
        }

        String pendingKey = pendingCapturesKey(
                gameSessionId,
                roundNoValue.toString(),
                playerNo
        );
        redisTemplate.opsForList().rightPush(pendingKey, captureNo);
        redisTemplate.expire(pendingKey, ACTIVE_GAME_TTL);
    }

    //제출한 포즈를  Lua스크립트로 검증하여 결과를 반환한다
    @Override
    public GamePoseSubmission savePose(
            UUID roomSessionId,
            UUID gameSessionId,
            UUID userId,
            Integer captureNo,
            List<List<Double>> points
    ) {

        //중첩리스트 불변 복사
        List<List<Double>> immutablePoints = points.stream()
                .map(List::copyOf)
                .toList();

        Long result = redisTemplate.execute(
                SAVE_POSE_SCRIPT,
                SCRIPT_ARGUMENT_SERIALIZER,
                SCRIPT_RESULT_SERIALIZER,
                List.of(gameKey(gameSessionId), playersKey(gameSessionId)),
                serializeValue(roomSessionId.toString()),
                serializeValue(GameStatus.PLAYING.name()),
                userId.toString(),
                captureNo.toString(),
                serializeValue(immutablePoints),
                String.valueOf(ACTIVE_GAME_TTL.toMillis())
        );

        int playerNo = resolveSavedPosePlayer(result);
        return new GamePoseSubmission(
                playerNo,
                captureNo,
                immutablePoints
        );
    }

    //result를 해석하여 성공하면 playerNo,실패하면 예외를 반환
    private int resolveSavedPosePlayer(Long result) {
        if (result == null) {
            throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
        if (result > 0 && result <= Integer.MAX_VALUE) {
            return result.intValue();
        }
        throw new GlobalException(SavePoseScriptFailure.errorCode(result));
    }

    @SuppressWarnings("unchecked")
    private String serializeValue(Object value) {
        RedisSerializer<Object> valueSerializer =
                (RedisSerializer<Object>) redisTemplate.getValueSerializer();
        byte[] serialized = valueSerializer.serialize(value);
        if (serialized == null) {
            throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
        return new String(serialized, UTF_8);
    }

    @Override
    public boolean resolveTimedOutCapture(
            UUID gameSessionId,
            Integer playerNo,
            Integer captureNo
    ) {
        Long result = redisTemplate.execute(
                RESOLVE_CAPTURE_TIMEOUT_SCRIPT,
                SCRIPT_ARGUMENT_SERIALIZER,
                SCRIPT_RESULT_SERIALIZER,
                List.of(gameKey(gameSessionId)),
                serializeValue(GameStatus.PLAYING.name()),
                playerNo.toString(),
                captureNo.toString(),
                serializeValue(List.of()),
                String.valueOf(ACTIVE_GAME_TTL.toMillis())
        );
        if (result == null || (result != 0L && result != 1L)) {
            throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
        return result == 1L;
    }

    //모든 캡처pose가 준비됐는지 확인후, simulation실행권한을 선점후, 게임의 상태를 바꿉니다.
    @Override
    public Optional<GameSimulationInput> claimReadySimulation(
            UUID roomSessionId,
            UUID gameSessionId
    ) {
        Map<Object, Object> game = redisTemplate.opsForHash().entries(gameKey(gameSessionId));
        if (game.isEmpty()) {
            throw new GlobalException(ErrorCode.GAME_SESSION_NOT_FOUND);
        }
        if (!roomSessionId.toString().equals(String.valueOf(game.get("roomSessionId")))) {
            throw new GlobalException(ErrorCode.GAME_SESSION_ROOM_MISMATCH);
        }
        if (!"PLAYING".equals(String.valueOf(game.get("status")))) {
            throw new GlobalException(ErrorCode.SESSION_NOT_PLAYING);
        }

        int roundNo = Integer.parseInt(String.valueOf(game.get("currentRoundNo")));

        //필요한 모든 pose의 key를 생성합니다.
        List<String> poseKeys = new ArrayList<>();
        for (int captureNo = 1;
             captureNo <= GameConstants.CAPTURE_REQUEST_COUNT;
             captureNo++) {
            poseKeys.add(poseKey(gameSessionId, String.valueOf(roundNo), captureNo));
        }

        //저장된 모든 포즈를 조회합니다.
        List<Object> storedPoses = redisTemplate.opsForValue().multiGet(poseKeys);
        if (storedPoses == null
                || storedPoses.size() != GameConstants.CAPTURE_REQUEST_COUNT
                || storedPoses.stream().anyMatch(java.util.Objects::isNull)) {
            return Optional.empty();
        }

        //redis->pose값
        List<List<List<Double>>> poses = storedPoses.stream()
                .map(this::toPose)
                .toList();
        Map<Object, Object> players = redisTemplate.opsForHash()
                .entries(playersKey(gameSessionId));

        List<SimulationParticipant> participants = players.entrySet()
                .stream()
                .map(entry -> new SimulationParticipant(
                        UUID.fromString(entry.getKey().toString()),
                        Integer.parseInt(entry.getValue().toString())
                ))
                .sorted(java.util.Comparator.comparingInt(
                        SimulationParticipant::playerNo
                ))
                .toList();
        Object startedAtValue = game.get("startedAt");
        if (startedAtValue == null || participants.isEmpty()) {
            throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR);
        }

        GameSimulationInput input = new GameSimulationInput(
                Integer.parseInt(String.valueOf(game.get("stageId"))),
                roundNo,
                LocalDateTime.parse(startedAtValue.toString()),
                Long.parseLong(String.valueOf(
                        game.getOrDefault("playTimeMs", 0L)
                )),
                participants,
                poses
        );

        List<String> claimKeys = new ArrayList<>();
        claimKeys.add(gameKey(gameSessionId));
        claimKeys.add(simulationClaimKey(gameSessionId, roundNo));
        claimKeys.addAll(poseKeys);
        Long claimResult = redisTemplate.execute(
                CLAIM_SIMULATION_SCRIPT,
                SCRIPT_ARGUMENT_SERIALIZER,
                SCRIPT_RESULT_SERIALIZER,
                claimKeys,
                serializeValue(roomSessionId.toString()),
                serializeValue(GameStatus.PLAYING.name()),
                serializeValue(roundNo),
                serializeValue(RoundPhase.SIMULATING.name()),
                serializeValue(true),
                String.valueOf(ACTIVE_GAME_TTL.toMillis())
        );
        return resolveSimulationClaim(claimResult)
                ? Optional.of(input)
                : Optional.empty();
    }

    private boolean resolveSimulationClaim(Long result) {
        if (result == null) {
            throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
        if (result == 1L) {
            return true;
        }
        if (result == 0L) {
            return false;
        }
        throw new GlobalException(ClaimSimulationScriptFailure.errorCode(result));
    }

    //Status 변경해준다.
    @Override
    public void moveToNextRound(
            UUID gameSessionId,
            Integer stageId,
            Integer nextRoundNo,
            Long accumulatedPlayTimeMs
    ) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put(
                "mapId",
                String.valueOf(stageId * GameConstants.ROUND_MODULAR + nextRoundNo)
        );
        values.put("currentRoundNo", nextRoundNo);
        values.put("roundPhase", "LOADING");
        values.put("playTimeMs", accumulatedPlayTimeMs);
        redisTemplate.opsForHash().putAll(gameKey(gameSessionId), values);
    }

    @Override
    public void saveRoundPlayTime(UUID gameSessionId, Integer roundId, Long playTimeMs) {
        String key = roundPlayTimesKey(gameSessionId);
        redisTemplate.opsForHash().put(key, roundId.toString(), playTimeMs);
        redisTemplate.expire(key, ACTIVE_GAME_TTL);
    }

    @Override
    public Map<Integer, Long> findRoundPlayTimes(UUID gameSessionId) {
        Map<Object, Object> stored = redisTemplate.opsForHash()
                .entries(roundPlayTimesKey(gameSessionId));
        Map<Integer, Long> result = new LinkedHashMap<>();
        stored.forEach((roundId, playTimeMs) -> result.put(
                Integer.parseInt(roundId.toString()),
                Long.parseLong(playTimeMs.toString())
        ));
        return result;
    }

    @Override
    public void finishGame(
            UUID gameSessionId,
            GameStatus status,
            LocalDateTime endedAt
    ) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("status", status.name());
        values.put("roundPhase", "COMPLETED");
        values.put("endedAt", endedAt.toString());
        redisTemplate.opsForHash().putAll(gameKey(gameSessionId), values);
    }

    /**
     * 물길 브로드캐스트용 현재 라운드 포즈 스냅샷 (읽기 전용, 클레임 없음).
     * poses 인덱스 = captureNo-1, 미제출 캡처는 null 엔트리.
     */
    @Override
    public Optional<RoundPoseSnapshot> findRoundPoseSnapshot(UUID gameSessionId) {
        Map<Object, Object> game = redisTemplate.opsForHash().entries(gameKey(gameSessionId));
        if (game.isEmpty()
                || !GameStatus.PLAYING.name().equals(String.valueOf(game.get("status")))) {
            return Optional.empty();
        }
        Object stageIdValue = game.get("stageId");
        Object roundNoValue = game.get("currentRoundNo");
        if (stageIdValue == null || roundNoValue == null) {
            return Optional.empty();
        }
        int stageId = Integer.parseInt(String.valueOf(stageIdValue));
        int roundNo = Integer.parseInt(String.valueOf(roundNoValue));

        List<String> poseKeys = new ArrayList<>();
        for (int captureNo = 1;
             captureNo <= GameConstants.CAPTURE_REQUEST_COUNT;
             captureNo++) {
            poseKeys.add(poseKey(gameSessionId, String.valueOf(roundNo), captureNo));
        }
        List<Object> storedPoses = redisTemplate.opsForValue().multiGet(poseKeys);

        List<List<List<Double>>> poses =
                new ArrayList<>(GameConstants.CAPTURE_REQUEST_COUNT);
        for (int index = 0; index < GameConstants.CAPTURE_REQUEST_COUNT; index++) {
            Object stored = storedPoses == null || index >= storedPoses.size()
                    ? null
                    : storedPoses.get(index);
            poses.add(stored == null ? null : toPose(stored));
        }
        return Optional.of(new RoundPoseSnapshot(stageId, roundNo, poses));
    }

    private List<List<Double>> toPose(Object storedPose) {
        if (!(storedPose instanceof List<?> rawPoints)) {
            throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR);
        }

        List<List<Double>> points = new ArrayList<>();
        for (Object rawPoint : rawPoints) {
            if (!(rawPoint instanceof List<?> coordinates) || coordinates.size() < 2) {
                throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR);
            }
            Object rawX = coordinates.get(0);
            Object rawY = coordinates.get(1);
            if (!(rawX instanceof Number x) || !(rawY instanceof Number y)) {
                throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR);
            }
            points.add(List.of(x.doubleValue(), y.doubleValue()));
        }
        return List.copyOf(points);
    }

    //RedisHash에 저장하기위한 필드-값 Map변환
    private Map<Object, Object> gameHash(GameSession game) {
        Map<Object, Object> values = new LinkedHashMap<>();
        values.put("roomSessionId", game.getRoomSessionId().toString());
        values.put("mapId", game.getMapId().toString());
        values.put("stageId", game.getStageId());
        values.put("currentRoundNo", game.getRoundNo());
        values.put("status", game.getStatus().name());
        values.put("roundPhase", game.getRoundPhase().name());
        values.put("startedAt", game.getStartedAt().toString());
        values.put("endedAt", "");
        values.put("playTimeMs", 0L);
        return values;
    }

    //key팩토리 메서드
    private String gameKey(UUID gameId) { return "game:" + gameId; }
    private String participantsKey(UUID gameId) { return gameKey(gameId) + ":participants"; }
    private String playersKey(UUID gameId) { return gameKey(gameId) + ":players"; }
    private String roundPlayTimesKey(UUID gameId) {
        return gameKey(gameId) + ":round-play-times";
    }
    private String pendingCapturesKey(UUID gameId, String roundNo, Integer playerNo) {
        return gameKey(gameId) + ":round:" + roundNo
                + ":player:" + playerNo + ":pending-captures";
    }
    private String poseKey(UUID gameId, String roundNo, Integer captureNo) {
        return gameKey(gameId) + ":round:" + roundNo
                + ":capture:" + captureNo + ":pose";
    }
    private String simulationClaimKey(UUID gameId, Integer roundNo) {
        return gameKey(gameId) + ":round:" + roundNo + ":simulation-claimed";
    }

    //Lua와 Java사이의 에러를 정의한다.
    private enum SavePoseScriptFailure {
        GAME_NOT_FOUND(-1L, ErrorCode.GAME_SESSION_NOT_FOUND),
        ROOM_MISMATCH(-2L, ErrorCode.GAME_SESSION_ROOM_MISMATCH),
        SESSION_NOT_PLAYING(-3L, ErrorCode.SESSION_NOT_PLAYING),
        NOT_GAME_PARTICIPANT(-4L, ErrorCode.NOT_GAME_PARTICIPANT),
        ROUND_NOT_CAPTURING(-5L, ErrorCode.ROUND_NOT_CAPTURING),
        INVALID_GAME_STATE(-6L, ErrorCode.INTERNAL_SERVER_ERROR);

        private final long scriptResult;
        private final ErrorCode errorCode;

        SavePoseScriptFailure(long scriptResult, ErrorCode errorCode) {
            this.scriptResult = scriptResult;
            this.errorCode = errorCode;
        }

        private static ErrorCode errorCode(long scriptResult) {
            for (SavePoseScriptFailure failure : values()) {
                if (failure.scriptResult == scriptResult) {
                    return failure.errorCode;
                }
            }
            return ErrorCode.INTERNAL_SERVER_ERROR;
        }
    }

    private enum ClaimSimulationScriptFailure {
        GAME_NOT_FOUND(-1L, ErrorCode.GAME_SESSION_NOT_FOUND),
        ROOM_MISMATCH(-2L, ErrorCode.GAME_SESSION_ROOM_MISMATCH),
        SESSION_NOT_PLAYING(-3L, ErrorCode.SESSION_NOT_PLAYING),
        INVALID_GAME_STATE(-4L, ErrorCode.INTERNAL_SERVER_ERROR);

        private final long scriptResult;
        private final ErrorCode errorCode;

        ClaimSimulationScriptFailure(long scriptResult, ErrorCode errorCode) {
            this.scriptResult = scriptResult;
            this.errorCode = errorCode;
        }

        private static ErrorCode errorCode(long scriptResult) {
            for (ClaimSimulationScriptFailure failure : values()) {
                if (failure.scriptResult == scriptResult) {
                    return failure.errorCode;
                }
            }
            return ErrorCode.INTERNAL_SERVER_ERROR;
        }
    }
}
