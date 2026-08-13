package org.ssafy.bodybuilder.global.config.websocket;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;
import org.ssafy.bodybuilder.domain.room.service.RoomService;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class WebSocketEventListenerTest {

    @InjectMocks
    private WebSocketEventListener webSocketEventListener;

    @Mock
    private RoomService roomService;

    @Test
    @DisplayName("Disconnect - 세션 속성에 roomId와 사용자 정보가 유효하면 leaveRoom이 호출된다")
    void handleDisconnect_validSession_callsLeaveRoom() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination("/sub/room/" + roomId);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(userId, null, Collections.emptyList());
        accessor.setUser(auth);

        Map<String, Object> sessionAttributes = new HashMap<>();
        accessor.setSessionAttributes(sessionAttributes);

        Message<byte[]> subscribeMessage = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
        SessionSubscribeEvent subscribeEvent = new SessionSubscribeEvent(this, subscribeMessage, auth);

        webSocketEventListener.handleSubscribe(subscribeEvent);

        // Disconnect Event
        StompHeaderAccessor disconnectAccessor = StompHeaderAccessor.create(StompCommand.DISCONNECT);
        disconnectAccessor.setSessionAttributes(sessionAttributes);
        disconnectAccessor.setUser(auth);

        Message<byte[]> disconnectMessage = MessageBuilder.createMessage(new byte[0], disconnectAccessor.getMessageHeaders());
        SessionDisconnectEvent disconnectEvent = new SessionDisconnectEvent(this, disconnectMessage, "session-1", null);

        webSocketEventListener.handleDisconnect(disconnectEvent);

        verify(roomService, times1()).leaveRoom(eq(roomId), eq(userId));
    }

    private static org.mockito.verification.VerificationMode times1() {
        return org.mockito.Mockito.times(1);
    }

    @Test
    @DisplayName("Disconnect - 세션 정보나 방 정보가 없을 때 leaveRoom이 호출되지 않는다")
    void handleDisconnect_noSessionInfo_doesNotCallLeaveRoom() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.DISCONNECT);
        accessor.setSessionAttributes(new HashMap<>());

        Message<byte[]> disconnectMessage = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
        SessionDisconnectEvent disconnectEvent = new SessionDisconnectEvent(this, disconnectMessage, "session-2", null);

        webSocketEventListener.handleDisconnect(disconnectEvent);

        verify(roomService, never()).leaveRoom(any(), any());
    }
}
