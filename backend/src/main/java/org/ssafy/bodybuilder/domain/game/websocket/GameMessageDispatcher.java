package org.ssafy.bodybuilder.domain.game.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.message.GameMessage;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessageDeduplicator.ProcessingClaim;
import org.ssafy.bodybuilder.domain.game.websocket.handler.GameMessageHandler;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class GameMessageDispatcher {

    private final ObjectMapper objectMapper;
    private final Map<GameMessageType, GameMessageHandler<?>> handlers;
    private final GameMessageDeduplicator gameMessageDeduplicator;
    private final GameMessagePublisher gameMessagePublisher;

    public GameMessageDispatcher(
            ObjectMapper objectMapper,
            List<GameMessageHandler<?>> handlers,
            GameMessageDeduplicator gameMessageDeduplicator,
            GameMessagePublisher gameMessagePublisher
    ) {
        this.objectMapper = objectMapper;

        //존재하는 모든 handlers를 map의 형태로 변환시킵니다.
        this.handlers = handlers.stream()
                .collect(Collectors.toUnmodifiableMap(
                        GameMessageHandler::type,
                        Function.identity()
                ));
        this.gameMessageDeduplicator = gameMessageDeduplicator;
        this.gameMessagePublisher = gameMessagePublisher;
    }

    /// type으로 handler를 찾아줍니다.
    /// @param message
    public void dispatch(
            GameMessage<JsonNode> message,
            Principal principal
    ) {
        //메시지 내용과, 타입이 null인지 검증
        if (message == null || message.type() == null) {
            throw new GlobalException(ErrorCode.TYPE_NOT_FOUND);
        }

        //인증검증
        //Principal(메시지를 보낸 사람의 신원정보)가 없으면 거절합니다.
        if (principal == null) {
            throw new GlobalException(ErrorCode.UNAUTHORIZED);
        }

        //eventId가 있는지 확인합니다.
        if (message.eventId() == null) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }

        //메시지 타입으로 핸들러를 찾는다.
        GameMessageHandler<?> handler = handlers.get(message.type());

        //등록된 handler가없으면 에러를 반환합니다.
        if (handler == null) {
            throw new GlobalException(ErrorCode.TYPE_NOT_FOUND);
        }


        String requesterId = principal.getName();
        if (requesterId == null || requesterId.isBlank()) {
            throw new GlobalException(ErrorCode.UNAUTHORIZED);
        }

        dispatchToHandler(message, handler, principal, requesterId);
    }

    ///JsonNode를 실제로 payload로 변환해줍니다.
    /// @param message
    /// @param handler
    /// @param <T>
    private <T> void dispatchToHandler(
            GameMessage<JsonNode> message,
            GameMessageHandler<T> handler,
            Principal principal,
            String requesterId
    ) {

        //handler가 원하는 payload로 변환합니다.
        GameMessage<T> typedMessage = convertPayload(message, handler);

        //Redis를 사용합니다.
        //payload형식이 잘못됐을경우 예외처리되어서 PROCESSING 상태가 생기지 않습니다.
        //이미 처리된 요청을 Optional.empty()를 반환합니다.
        ProcessingClaim claim = gameMessageDeduplicator
                .tryStart(requesterId, message.eventId())
                .orElse(null);

        //claim이 null일 경우 handler를 실행하지않고 종료합니다.
        //같은 eventId로 메시지룰 2시간 이내에 받았으면 무시합니다..
        if (claim == null) {
            log.info(
                    "[GameMessageDispatcher] Duplicate event ignored. requesterId={}, eventId={}",
                    requesterId,
                    message.eventId()
            );
            return;
        }

        try {
            //message를 handler로 보내준다.
            handler.handle(typedMessage, principal);
        } catch (GlobalException exception) {
            //예외 발생시 Redis점유 해제
            releaseClaim(claim, exception);
            log.warn("[GameMessageDispatcher] GlobalException during dispatching messageType: {}", message.type(), exception);
            gameMessagePublisher.publishGameMessage(
                    GameMessageType.GAME_ERROR,
                    message.roomSessionId(),
                    message.gameSessionId(),
                    Map.of("message", exception.getMessage())
            );
            return;
        } catch (RuntimeException exception) {
            releaseClaim(claim, exception);
            throw exception;
        }


        // 예외가 발생하지않아서 최종으로 도달하는곳
        //상태를 complete로 바꾼다
        gameMessageDeduplicator.complete(claim);
    }

    private <T> GameMessage<T> convertPayload(
            GameMessage<JsonNode> message,
            GameMessageHandler<T> handler
    ) {
        try {
            T payload = objectMapper.convertValue(
                    message.payload(),
                    handler.payloadType()
            );

            //payload를 type별로 넣어준다.
            return new GameMessage<>(
                    message.type(),
                    message.eventId(),
                    message.roomSessionId(),
                    message.gameSessionId(),
                    message.occurredAt(),
                    payload
            );
        } catch (IllegalArgumentException exception) {
            log.warn("[GameMessageDispatcher] Failed to convert payload for messageType: {}", message.type(), exception);
            throw new GlobalException(
                    ErrorCode.INVALID_INPUT_VALUE,
                    exception
            );
        }
    }

    //메시지 처리권한을 해제하다가 예외가 발생해도, 원래 에러를 유지시키기위함
    private void releaseClaim(
            ProcessingClaim claim,
            RuntimeException originalException
    ) {
        try {
            gameMessageDeduplicator.release(claim);
        } catch (RuntimeException releaseException) {
            originalException.addSuppressed(releaseException);
        }
    }
}
