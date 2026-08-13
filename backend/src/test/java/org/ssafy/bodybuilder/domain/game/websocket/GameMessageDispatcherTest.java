package org.ssafy.bodybuilder.domain.game.websocket;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.Principal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.message.GameMessage;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameCapturingResponsePayload;
import org.ssafy.bodybuilder.domain.game.message.payload.GameStartRequestPayload;
import org.ssafy.bodybuilder.domain.game.service.GameStartService;
import org.ssafy.bodybuilder.domain.game.service.PoseSubmissionService;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessageDeduplicator.ProcessingClaim;
import org.ssafy.bodybuilder.domain.game.websocket.handler.GameStartMessageHandler;
import org.ssafy.bodybuilder.domain.game.websocket.handler.GameCapturingMessageHandler;

class GameMessageDispatcherTest {

    private final ObjectMapper objectMapper =
            new ObjectMapper().findAndRegisterModules();

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void convertsPayloadAndRoutesToMatchingHandler() {
        PoseSubmissionService poseSubmissionService = mock(PoseSubmissionService.class);
        GameCapturingMessageHandler poseHandler = new GameCapturingMessageHandler(poseSubmissionService);
        GameMessageDispatcher dispatcher = new GameMessageDispatcher(
                objectMapper,
                List.of(poseHandler),
                allowingDeduplicator(),
                mock(GameMessagePublisher.class)
        );
        GameCapturingResponsePayload payload = new GameCapturingResponsePayload(
                2,
                List.of(List.of(0.34, 0.42))
        );
        GameMessage<JsonNode> message = GameMessage.of(
                GameMessageType.GAME_CAPTURING_RESPONSE,
                UUID.randomUUID(),
                UUID.randomUUID(),
                objectMapper.valueToTree(payload)
        );
        UUID requesterId = UUID.randomUUID();
        Principal principal = mock(Principal.class);
        when(principal.getName()).thenReturn(requesterId.toString());

        dispatcher.dispatch(message, principal);

        ArgumentCaptor<GameMessage<GameCapturingResponsePayload>> captor =
                ArgumentCaptor.forClass((Class) GameMessage.class);
        verify(poseSubmissionService).submitPose(captor.capture(), eq(requesterId));
        assertThat(captor.getValue().payload()).isEqualTo(payload);
    }

    @Test
    void routesGameStartRequestToStartHandler() {
        GameStartService gameStartService = mock(GameStartService.class);
        GameStartMessageHandler startHandler = new GameStartMessageHandler(gameStartService);
        GameMessageDispatcher dispatcher = new GameMessageDispatcher(
                objectMapper,
                List.of(startHandler),
                allowingDeduplicator(),
                mock(GameMessagePublisher.class)
        );
        UUID roomSessionId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        GameMessage<JsonNode> message = GameMessage.of(
                GameMessageType.GAME_START_REQUEST,
                roomSessionId,
                null,
                objectMapper.valueToTree(new GameStartRequestPayload(1))
        );
        Principal principal = mock(Principal.class);
        when(principal.getName()).thenReturn(requesterId.toString());

        dispatcher.dispatch(message, principal);

        verify(gameStartService).startGame(roomSessionId, requesterId, 1);
    }

    @Test
    void rejectsMessageWithoutMatchingHandler() {
        GameMessageDispatcher dispatcher = new GameMessageDispatcher(
                objectMapper,
                List.of(),
                allowingDeduplicator(),
                mock(GameMessagePublisher.class)
        );
        GameMessage<JsonNode> message = GameMessage.of(
                GameMessageType.GAME_START_RESPONSE,
                UUID.randomUUID(),
                UUID.randomUUID(),
                objectMapper.createObjectNode()
        );
        Principal principal = mock(Principal.class);

        assertThatThrownBy(() -> dispatcher.dispatch(message, principal))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.TYPE_NOT_FOUND)
                );
    }

    @Test
    void ignoresDuplicateEventIdFromSameRequester() {
        GameStartService gameStartService = mock(GameStartService.class);
        GameStartMessageHandler startHandler =
                new GameStartMessageHandler(gameStartService);
        GameMessageDeduplicator deduplicator =
                mock(GameMessageDeduplicator.class);
        GameMessageDispatcher dispatcher = new GameMessageDispatcher(
                objectMapper,
                List.of(startHandler),
                deduplicator,
                mock(GameMessagePublisher.class)
        );
        UUID eventId = UUID.randomUUID();
        UUID roomSessionId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        GameMessage<JsonNode> message = new GameMessage<>(
                GameMessageType.GAME_START_REQUEST,
                eventId,
                roomSessionId,
                null,
                java.time.LocalDateTime.now(),
                objectMapper.valueToTree(new GameStartRequestPayload(1))
        );
        Principal principal = mock(Principal.class);
        when(principal.getName()).thenReturn(requesterId.toString());
        ProcessingClaim claim = claim();
        when(deduplicator.tryStart(requesterId.toString(), eventId))
                .thenReturn(Optional.of(claim), Optional.empty());

        dispatcher.dispatch(message, principal);
        dispatcher.dispatch(message, principal);

        verify(gameStartService, times(1))
                .startGame(roomSessionId, requesterId, 1);
        verify(deduplicator, times(2))
                .tryStart(requesterId.toString(), eventId);
        verify(deduplicator).complete(claim);
    }

    @Test
    void releasesEventIdClaimWhenHandlerFails() {
        GameStartService gameStartService = mock(GameStartService.class);
        GameStartMessageHandler startHandler =
                new GameStartMessageHandler(gameStartService);
        GameMessageDeduplicator deduplicator =
                mock(GameMessageDeduplicator.class);
        GameMessageDispatcher dispatcher = new GameMessageDispatcher(
                objectMapper,
                List.of(startHandler),
                deduplicator,
                mock(GameMessagePublisher.class)
        );
        UUID eventId = UUID.randomUUID();
        UUID roomSessionId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        GameMessage<JsonNode> message = new GameMessage<>(
                GameMessageType.GAME_START_REQUEST,
                eventId,
                roomSessionId,
                null,
                java.time.LocalDateTime.now(),
                objectMapper.valueToTree(new GameStartRequestPayload(1))
        );
        Principal principal = mock(Principal.class);
        when(principal.getName()).thenReturn(requesterId.toString());
        ProcessingClaim claim = claim();
        when(deduplicator.tryStart(requesterId.toString(), eventId))
                .thenReturn(Optional.of(claim));
        doThrow(new IllegalStateException("failed"))
                .when(gameStartService)
                .startGame(roomSessionId, requesterId, 1);

        assertThatThrownBy(() -> dispatcher.dispatch(message, principal))
                .isInstanceOf(IllegalStateException.class);

        verify(deduplicator).tryStart(requesterId.toString(), eventId);
        verify(deduplicator).release(claim);
        verify(deduplicator, never()).complete(any());
    }

    @Test
    void releasesEventIdClaimWhenBusinessValidationFails() {
        GameStartService gameStartService = mock(GameStartService.class);
        GameStartMessageHandler startHandler =
                new GameStartMessageHandler(gameStartService);
        GameMessageDeduplicator deduplicator =
                mock(GameMessageDeduplicator.class);
        GameMessagePublisher publisher = mock(GameMessagePublisher.class);
        GameMessageDispatcher dispatcher = new GameMessageDispatcher(
                objectMapper,
                List.of(startHandler),
                deduplicator,
                publisher
        );
        UUID eventId = UUID.randomUUID();
        UUID roomSessionId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        GameMessage<JsonNode> message = new GameMessage<>(
                GameMessageType.GAME_START_REQUEST,
                eventId,
                roomSessionId,
                null,
                java.time.LocalDateTime.now(),
                objectMapper.valueToTree(new GameStartRequestPayload(1))
        );
        Principal principal = mock(Principal.class);
        ProcessingClaim claim = claim();
        when(principal.getName()).thenReturn(requesterId.toString());
        when(deduplicator.tryStart(requesterId.toString(), eventId))
                .thenReturn(Optional.of(claim));
        doThrow(new GlobalException(ErrorCode.INVALID_INPUT_VALUE))
                .when(gameStartService)
                .startGame(roomSessionId, requesterId, 1);

        dispatcher.dispatch(message, principal);

        verify(deduplicator).release(claim);
        verify(deduplicator, never()).complete(any());
        verify(publisher).publishGameMessage(
                eq(GameMessageType.GAME_ERROR),
                eq(roomSessionId),
                eq(null),
                any()
        );
    }

    @Test
    void rejectsInvalidPayloadBeforeStartingIdempotencyClaim() {
        GameStartService gameStartService = mock(GameStartService.class);
        GameStartMessageHandler startHandler =
                new GameStartMessageHandler(gameStartService);
        GameMessageDeduplicator deduplicator =
                mock(GameMessageDeduplicator.class);
        GameMessageDispatcher dispatcher = new GameMessageDispatcher(
                objectMapper,
                List.of(startHandler),
                deduplicator,
                mock(GameMessagePublisher.class)
        );
        UUID requesterId = UUID.randomUUID();
        GameMessage<JsonNode> message = GameMessage.of(
                GameMessageType.GAME_START_REQUEST,
                UUID.randomUUID(),
                null,
                objectMapper.createObjectNode().put("stageId", "invalid")
        );
        Principal principal = mock(Principal.class);
        when(principal.getName()).thenReturn(requesterId.toString());

        assertThatThrownBy(() -> dispatcher.dispatch(message, principal))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_INPUT_VALUE)
                );

        verify(deduplicator, never()).tryStart(anyString(), any());
        verify(gameStartService, never()).startGame(any(), any(), any());
    }

    @Test
    void rejectsMissingEventIdBeforeCallingHandler() {
        GameStartService gameStartService = mock(GameStartService.class);
        GameStartMessageHandler startHandler =
                new GameStartMessageHandler(gameStartService);
        GameMessageDeduplicator deduplicator =
                mock(GameMessageDeduplicator.class);
        GameMessageDispatcher dispatcher = new GameMessageDispatcher(
                objectMapper,
                List.of(startHandler),
                deduplicator,
                mock(GameMessagePublisher.class)
        );
        UUID requesterId = UUID.randomUUID();
        GameMessage<JsonNode> message = new GameMessage<>(
                GameMessageType.GAME_START_REQUEST,
                null,
                UUID.randomUUID(),
                null,
                java.time.LocalDateTime.now(),
                objectMapper.valueToTree(new GameStartRequestPayload(1))
        );
        Principal principal = mock(Principal.class);
        when(principal.getName()).thenReturn(requesterId.toString());

        assertThatThrownBy(() -> dispatcher.dispatch(message, principal))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_INPUT_VALUE)
                );

        verify(deduplicator, never()).tryStart(anyString(), any());
        verify(gameStartService, never())
                .startGame(any(), any(), any());
    }

    private GameMessageDeduplicator allowingDeduplicator() {
        GameMessageDeduplicator deduplicator =
                mock(GameMessageDeduplicator.class);
        when(deduplicator.tryStart(anyString(), any(UUID.class)))
                .thenReturn(Optional.of(claim()));
        return deduplicator;
    }

    private ProcessingClaim claim() {
        return new ProcessingClaim(
                "game:processed-event:test:" + UUID.randomUUID(),
                "PROCESSING:" + UUID.randomUUID()
        );
    }
}
