package org.ssafy.bodybuilder.domain.game.service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameResultPayload;
import org.ssafy.bodybuilder.domain.game.message.payload.GameRoundStartPayload;
import org.ssafy.bodybuilder.domain.game.message.payload.GameSimulationPayload;
import org.ssafy.bodybuilder.domain.game.model.GameSimulationInput;
import org.ssafy.bodybuilder.domain.game.model.GameStatus;
import org.ssafy.bodybuilder.domain.game.model.SimulationParticipant;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsSimulator;
import org.ssafy.bodybuilder.domain.game.physics.SimulationResult;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;
import org.ssafy.bodybuilder.domain.game.util.GameConstants;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.domain.record.model.StageRecord;
import org.ssafy.bodybuilder.domain.record.model.RoundRecord;
import org.ssafy.bodybuilder.domain.record.repository.RoundRecordRepository;
import org.ssafy.bodybuilder.domain.record.repository.StageRecordRepository;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionArchiveService;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;
import org.ssafy.bodybuilder.infra.logging.game.GameExecutionFailedEvent;
import org.ssafy.bodybuilder.infra.logging.game.GameRoundReplay;
import org.ssafy.bodybuilder.infra.logging.game.GameRoundReplayStore;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class GameSimulationService {

    private final GameSessionRepository gameSessionRepository;
    private final StageRoundRepository stageRoundRepository;
    private final PhysicsSimulator physicsSimulator;
    private final GameMessagePublisher gameMessagePublisher;
    private final GameCaptureScheduler gameCaptureScheduler;
    private final TaskScheduler gameTaskScheduler;
    private final Clock gameClock;
    private final StageRecordRepository stageRecordRepository;
    private final RoundRecordRepository roundRecordRepository;
    private final RoomLockManager roomLockManager;
    private final RoomSessionRepository roomSessionRepository;
    private final GameSessionEventRecorder gameSessionEventRecorder;
    private final GameSessionArchiveService gameSessionArchiveService;
    private final GameRoundReplayStore gameRoundReplayStore;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final StageRepository stageRepository;
    private final WaterFlowBroadcastService waterFlowBroadcastService;

    public void simulateIfReady(UUID roomSessionId, UUID gameSessionId) {
        gameSessionRepository.claimReadySimulation(roomSessionId, gameSessionId)
                .ifPresent(input -> simulate(roomSessionId, gameSessionId, input));
    }

    private void simulate(
            UUID roomSessionId,
            UUID gameSessionId,
            GameSimulationInput input
    ) {
        try {
            StageRound round = stageRoundRepository.findByStageIdAndRoundNo(
                            input.stageId(),
                            input.roundNo()
                    )
                    .orElseThrow(() ->
                            new GlobalException(ErrorCode.STAGE_HAS_NO_ROUNDS));

            // completeRound()는 스케줄러가 나중에 실행하므로 여기서 1회 조회해 파라미터로 흘려보낸다.
            boolean isOfficial = isOfficialStage(input.stageId());

            SimulationResult result = physicsSimulator.simulate(
                    round.getMapConfig(),
                    input.poses()
            );
            gameRoundReplayStore.save(
                    gameSessionId,
                    GameRoundReplay.of(
                            input.roundNo(),
                            input.poses(),
                            result.intervalMs(),
                            result.points(),
                            result.result()
                    )
            );
            StageRound nextRound = findNextRound(input, result, isOfficial);

            gameMessagePublisher.publishGameMessage(
                    GameMessageType.GAME_SIMULATING_RESPONSE,
                    roomSessionId,
                    gameSessionId,
                    new GameSimulationPayload(
                            result.intervalMs(),
                            result.points(),
                            result.result(),
                            result.grounded()
                    )
            );
            scheduleRoundCompletion(
                    roomSessionId,
                    gameSessionId,
                    input,
                    result,
                    round.getId(),
                    nextRound,
                    isOfficial
            );
        } catch (RuntimeException exception) {
            applicationEventPublisher.publishEvent(new GameExecutionFailedEvent(
                    roomSessionId,
                    gameSessionId,
                    exception,
                    "SIMULATION"
            ));
        }
    }

    /**
     * 스테이지를 못 찾으면 공식으로 취급한다.
     * 조회 실패로 기록 저장·별점 계산 같은 공식 경로가 조용히 꺼지는 쪽이 더 위험하다.
     */
    private boolean isOfficialStage(Integer stageId) {
        return stageRepository.findById(stageId)
                .map(Stage::isOfficial)
                .orElse(true);
    }

    private StageRound findNextRound(
            GameSimulationInput input,
            SimulationResult result,
            boolean isOfficial
    ) {
        if (!Boolean.TRUE.equals(result.result())
                || input.roundNo() >= GameConstants.LAST_ROUND) {
            return null;
        }

        return stageRoundRepository.findByStageIdAndRoundNo(
                        input.stageId(),
                        input.roundNo() + 1
                )
                .orElseGet(() -> {
                    // 커스텀 맵은 round_no = 1 하나뿐이다. 클리어 시 다음 라운드가 없는 게 정상.
                    // 공식 맵에서 예외를 유지하는 이유: 시드 누락·마이그레이션 사고 때 유일한 관측 수단이다.
                    if (isOfficial) {
                        throw new GlobalException(ErrorCode.STAGE_HAS_NO_ROUNDS);
                    }
                    return null;
                });
    }

    private void scheduleRoundCompletion(
            UUID roomSessionId,
            UUID gameSessionId,
            GameSimulationInput input,
            SimulationResult result,
            Integer roundId,
            StageRound nextRound,
            boolean isOfficial
    ) {
        long playbackDurationMs = Math.max(
                result.intervalMs(),
                simulationDurationMs(result)
        );
        gameTaskScheduler.schedule(
                () -> completeRoundSafely(
                        roomSessionId,
                        gameSessionId,
                        input,
                        result,
                        roundId,
                        nextRound,
                        isOfficial
                ),
                gameClock.instant().plusMillis(playbackDurationMs)
        );
    }

    private void completeRoundSafely(
            UUID roomSessionId,
            UUID gameSessionId,
            GameSimulationInput input,
            SimulationResult result,
            Integer roundId,
            StageRound nextRound,
            boolean isOfficial
    ) {
        try {
            completeRound(
                    roomSessionId, gameSessionId, input, result, roundId, nextRound, isOfficial);
        } catch (RuntimeException exception) {
            applicationEventPublisher.publishEvent(new GameExecutionFailedEvent(
                    roomSessionId,
                    gameSessionId,
                    exception,
                    "SCHEDULER"
            ));
        }
    }

    private void completeRound(
            UUID roomSessionId,
            UUID gameSessionId,
            GameSimulationInput input,
            SimulationResult simulationResult,
            Integer roundId,
            StageRound nextRound,
            boolean isOfficial
    ) {
        long accumulatedPlayTimeMs = Math.max(
                0L,
                input.accumulatedPlayTimeMs()
        ) + simulationDurationMs(simulationResult);
        if (isOfficial) {
            gameSessionRepository.saveRoundPlayTime(
                    gameSessionId,
                    roundId,
                    simulationDurationMs(simulationResult)
            );
        }
        gameSessionEventRecorder.record(
                gameSessionId,
                "ROUND_COMPLETED",
                GameMessageType.GAME_SIMULATING_RESPONSE,
                "INTERNAL",
                "SUCCESS",
                null,
                Map.of(
                        "roundNo", input.roundNo(),
                        "simulationSucceeded", Boolean.TRUE.equals(simulationResult.result()),
                        "simulationPointCount", simulationResult.points().size()
                ),
                null,
                null,
                LocalDateTime.now(gameClock)
        );
        if (Boolean.TRUE.equals(simulationResult.result()) && nextRound != null) {
            gameSessionRepository.moveToNextRound(
                    gameSessionId,
                    input.stageId(),
                    nextRound.getRoundNo(),
                    accumulatedPlayTimeMs
            );
            gameSessionEventRecorder.record(
                    gameSessionId,
                    "ROUND_STARTED",
                    GameMessageType.GAME_ROUND_START_RESPONSE,
                    "OUTBOUND",
                    "SUCCESS",
                    null,
                    Map.of(
                            "stageId", input.stageId(),
                            "roundNo", nextRound.getRoundNo()
                    ),
                    null,
                    null,
                    LocalDateTime.now(gameClock)
            );
            gameMessagePublisher.publishGameMessage(
                    GameMessageType.GAME_ROUND_START_RESPONSE,
                    roomSessionId,
                    gameSessionId,
                    GameRoundStartPayload.of(
                            input.stageId(),
                            nextRound,
                            // 다음 라운드 시작 물길 (포즈 0개, 지형만) — 실패 시 null 생략
                            waterFlowBroadcastService.terrainOnlyWaterFlows(
                                    nextRound.getMapConfig())
                    )
            );
            gameCaptureScheduler.start(
                    roomSessionId,
                    gameSessionId,
                    input.participants().stream()
                            .map(SimulationParticipant::playerNo)
                            .toList()
            );
            return;
        }

        boolean cleared = Boolean.TRUE.equals(simulationResult.result());
        LocalDateTime endedAt = LocalDateTime.now(gameClock);
        long elapsedTimeMs = accumulatedPlayTimeMs;

        // 삼항식 순서 주의: cleared ? (isOfficial ? roundNo : 3) : 0 으로 쓰면
        // 공식 맵 실패 경로가 회귀한다(2R 실패 1성 -> 0성).
        int stars = isOfficial
                ? (cleared ? input.roundNo() : Math.max(0, input.roundNo() - 1))
                : (cleared ? 3 : 0);

        // 커스텀 맵은 기록·랭킹을 오염시키지 않도록 stage_records 저장을 건너뛴다.
        if (isOfficial) {
            var stageRecords = stageRecordRepository.saveAll(input.participants().stream()
                    .map(participant -> StageRecord.create(
                            participant.participantId(),
                            input.stageId(),
                            elapsedTimeMs,
                            cleared
                    ))
                    .toList());
            var roundPlayTimes = gameSessionRepository.findRoundPlayTimes(gameSessionId);
            roundRecordRepository.saveAll(stageRecords.stream()
                    .flatMap(stageRecord -> roundPlayTimes.entrySet().stream()
                            .map(round -> RoundRecord.create(
                                    stageRecord.getId(),
                                    round.getKey(),
                                    round.getValue()
                            )))
                    .toList());
        }
        gameSessionRepository.finishGame(
                gameSessionId,
                cleared ? GameStatus.CLEARED : GameStatus.FAILED,
                endedAt
        );
        String gameResult = cleared ? "CLEARED" : "NOT_CLEARED";
        gameSessionEventRecorder.record(
                gameSessionId,
                "GAME_COMPLETED",
                GameMessageType.GAME_RESULT_RESPONSE,
                "INTERNAL",
                "SUCCESS",
                null,
                Map.of(
                        "finalStatus", "COMPLETED",
                        "gameResult", gameResult,
                        "roundNo", input.roundNo(),
                        "elapsedTimeMs", elapsedTimeMs
                ),
                null,
                elapsedTimeMs,
                endedAt
        );
        resetRoomToWaiting(roomSessionId);
        gameMessagePublisher.publishGameMessage(
                GameMessageType.GAME_RESULT_RESPONSE,
                roomSessionId,
                gameSessionId,
                new GameResultPayload(stars, elapsedTimeMs, cleared)
        );
        gameSessionArchiveService.archive(
                gameSessionId,
                roomSessionId,
                "COMPLETED",
                gameResult,
                endedAt
        );
    }

    private long simulationDurationMs(SimulationResult result) {
        return Math.max(
                0L,
                (result.points().size() - 1L) * result.intervalMs()
        );
    }

    private void resetRoomToWaiting(UUID roomSessionId) {
        roomLockManager.withLock(roomSessionId, () -> {
            roomSessionRepository.findRoomById(roomSessionId).ifPresent(room -> {
                room.finishGame();
                roomSessionRepository.saveRoom(room);
            });
            return null;
        });
    }
}
