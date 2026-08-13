package org.ssafy.bodybuilder.domain.game.service;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.domain.game.event.GameCaptureTimedOutEvent;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameCapturingRequestPayload;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.util.GameConstants;
import org.ssafy.bodybuilder.domain.game.util.PlayerPlacementAllocator;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;
import org.ssafy.bodybuilder.infra.logging.game.GameExecutionFailedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class GameCaptureScheduler {

    private static final Duration CAPTURE_INTERVAL =
            Duration.ofMillis(GameConstants.CAPTURE_REQUEST_INTERVAL_MS);
    private static final Duration CAPTURE_TIMEOUT_GRACE =
            Duration.ofMillis(GameConstants.CAPTURE_RESPONSE_GRACE_MS);

    private final TaskScheduler gameTaskScheduler;
    private final GameMessagePublisher gameMessagePublisher;
    private final GameSessionRepository gameSessionRepository;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final GameSessionEventRecorder gameSessionEventRecorder;
    private final Map<UUID, ScheduledFuture<?>> captureTasks = new ConcurrentHashMap<>();

    public void start(
            UUID roomSessionId,
            UUID gameSessionId,
            List<Integer> playerNos
    ) {
        start(
                roomSessionId,
                gameSessionId,
                playerNos,
                GameConstants.CAPTURE_INITIAL_DELAY_MS
        );
    }

    public void start(
            UUID roomSessionId,
            UUID gameSessionId,
            List<Integer> playerNos,
            long initialDelayMs
    ) {
        stop(gameSessionId);

        if (playerNos == null || playerNos.isEmpty()) {
            return;
        }

        List<Integer> placementPlayerNos = PlayerPlacementAllocator.allocate(
                gameSessionId,
                playerNos
        );


        AtomicInteger nextRequestIndex = new AtomicInteger();



        Runnable captureRequest = () -> {
            try {
                int requestIndex = nextRequestIndex.getAndIncrement();
                if (requestIndex >= GameConstants.CAPTURE_REQUEST_COUNT) {
                    stopRequestTask(gameSessionId);
                    return;
                }

                int playerNo = placementPlayerNos.get(requestIndex);
                int captureNo = requestIndex + 1;
                gameSessionRepository.enqueueCaptureRequest(
                        gameSessionId,
                        playerNo,
                        captureNo
                );
                scheduleCaptureTimeout(
                        roomSessionId,
                        gameSessionId,
                        playerNo,
                        captureNo
                );
                gameSessionEventRecorder.record(
                        gameSessionId,
                        "CAPTURE_REQUESTED",
                        GameMessageType.GAME_CAPTURING_REQUEST,
                        "OUTBOUND",
                        "SUCCESS",
                        null,
                        Map.of(
                                "captureNo", captureNo,
                                "playerNo", playerNo,
                                "durationMs", GameConstants.CAPTURE_DURATION_MS
                        ),
                        null,
                        null,
                        LocalDateTime.now()
                );
                gameMessagePublisher.publishGameMessage(
                        GameMessageType.GAME_CAPTURING_REQUEST,
                        roomSessionId,
                        gameSessionId,
                        new GameCapturingRequestPayload(
                                playerNo,
                                captureNo,
                                GameConstants.CAPTURE_DURATION_MS
                        )
                );

                if (requestIndex == GameConstants.CAPTURE_REQUEST_COUNT - 1) {
                    stopRequestTask(gameSessionId);
                }
            } catch (RuntimeException exception) {
                stopRequestTask(gameSessionId);
                applicationEventPublisher.publishEvent(new GameExecutionFailedEvent(
                        roomSessionId,
                        gameSessionId,
                        exception,
                        "SCHEDULER"
                ));
            }
        };


        ScheduledFuture<?> task = gameTaskScheduler.scheduleAtFixedRate(
                captureRequest,//실행할 작업
                Instant.now().plusMillis(Math.max(0, initialDelayMs)),//최초실행시간
                CAPTURE_INTERVAL//반복 간격
        );

        captureTasks.put(gameSessionId, task);
    }

    //타이머가 있으면 종료
    public void stop(UUID gameSessionId) {
        stopRequestTask(gameSessionId);
    }

    private void stopRequestTask(UUID gameSessionId) {
        ScheduledFuture<?> task = captureTasks.remove(gameSessionId);
        if (task != null) {
            task.cancel(false);
        }
    }

    private void scheduleCaptureTimeout(
            UUID roomSessionId,
            UUID gameSessionId,
            int playerNo,
            int captureNo
    ) {
        gameTaskScheduler.schedule(
                () -> {
                    try {
                        boolean resolved = gameSessionRepository.resolveTimedOutCapture(
                                gameSessionId,
                                playerNo,
                                captureNo
                        );
                        if (resolved) {
                            gameSessionEventRecorder.recordWarning(
                                    gameSessionId,
                                    "POSE_CAPTURE_TIMED_OUT",
                                    GameMessageType.GAME_CAPTURING_RESPONSE,
                                    "INTERNAL",
                                    "FAILED",
                                    null,
                                    Map.of(
                                            "captureNo", captureNo,
                                            "playerNo", playerNo,
                                            "primaryReason", "CLIENT_RESPONSE_NOT_RECEIVED"
                                    ),
                                    null,
                                    null,
                                    LocalDateTime.now()
                            );
                            applicationEventPublisher.publishEvent(
                                    new GameCaptureTimedOutEvent(
                                            roomSessionId,
                                            gameSessionId
                                    )
                            );
                        }
                    } catch (RuntimeException exception) {
                        applicationEventPublisher.publishEvent(new GameExecutionFailedEvent(
                                roomSessionId,
                                gameSessionId,
                                exception,
                                "SCHEDULER"
                        ));
                    }
                },
                Instant.now()
                        .plusMillis(GameConstants.CAPTURE_DURATION_MS)
                        .plus(CAPTURE_TIMEOUT_GRACE)
        );
    }

    @PreDestroy
    void stopAll() {
        captureTasks.values().forEach(task -> task.cancel(false));
        captureTasks.clear();
    }
}
