package org.ssafy.bodybuilder.infra.logging.game;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.model.GameStatus;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.service.GameCaptureScheduler;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.infra.logging.error.ErrorDetailRecorder;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

@SuppressWarnings("unchecked")
class GameTerminationServiceTest {

    private final RedisTemplate<String, Object> redisTemplate = mock(RedisTemplate.class);
    private final ValueOperations<String, Object> valueOperations = mock(ValueOperations.class);
    private final ErrorDetailRecorder errorDetailRecorder = mock(ErrorDetailRecorder.class);
    private final GameSessionEventRecorder eventRecorder = mock(GameSessionEventRecorder.class);
    private final GameSessionArchiveService archiveService = mock(GameSessionArchiveService.class);
    private final GameSessionRepository gameSessionRepository = mock(GameSessionRepository.class);
    private final GameCaptureScheduler captureScheduler = mock(GameCaptureScheduler.class);
    private final GameMessagePublisher messagePublisher = mock(GameMessagePublisher.class);
    private final RoomLockManager roomLockManager = mock(RoomLockManager.class);
    private final RoomSessionRepository roomSessionRepository = mock(RoomSessionRepository.class);
    private final Clock clock = Clock.fixed(
            Instant.parse("2026-08-01T01:00:00Z"),
            ZoneId.of("Asia/Seoul")
    );
    private final GameTerminationService service = new GameTerminationService(
            redisTemplate,
            errorDetailRecorder,
            eventRecorder,
            archiveService,
            gameSessionRepository,
            captureScheduler,
            messagePublisher,
            roomLockManager,
            roomSessionRepository,
            clock
    );

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(anyString(), eq(true), any()))
                .thenReturn(true);
    }

    @Test
    void finishesGameAndNotifiesPlayersBeforePersistingErrorDetail() {
        UUID roomSessionId = UUID.randomUUID();
        UUID gameSessionId = UUID.randomUUID();
        UUID errorId = UUID.randomUUID();
        RuntimeException failure = new IllegalStateException("simulation failed");
        when(errorDetailRecorder.record(
                anyString(),
                any(),
                anyString(),
                any(),
                any(),
                any(),
                any(),
                anyMap()
        )).thenReturn(Optional.of(errorId));

        service.terminateWithError(
                roomSessionId,
                gameSessionId,
                failure,
                "SIMULATION"
        );

        InOrder order = inOrder(
                captureScheduler,
                gameSessionRepository,
                messagePublisher,
                errorDetailRecorder,
                eventRecorder,
                archiveService
        );
        order.verify(captureScheduler).stop(gameSessionId);
        order.verify(gameSessionRepository).finishGame(
                eq(gameSessionId),
                eq(GameStatus.ERROR),
                any()
        );
        order.verify(messagePublisher).publishGameMessage(
                eq(GameMessageType.GAME_ERROR),
                eq(roomSessionId),
                eq(gameSessionId),
                anyMap()
        );
        order.verify(errorDetailRecorder).record(
                eq("SIMULATION"),
                eq(failure),
                eq("C004"),
                eq(roomSessionId),
                eq(gameSessionId),
                eq(null),
                eq(null),
                anyMap()
        );
        order.verify(eventRecorder).recordError(
                eq(gameSessionId),
                eq(errorId),
                eq("C004"),
                any()
        );
        order.verify(archiveService).archive(
                eq(gameSessionId),
                eq(roomSessionId),
                eq("ERROR"),
                eq(null),
                any()
        );

        verify(messagePublisher).publishGameMessage(
                eq(GameMessageType.GAME_ERROR),
                eq(roomSessionId),
                eq(gameSessionId),
                anyMap()
        );
    }
}
