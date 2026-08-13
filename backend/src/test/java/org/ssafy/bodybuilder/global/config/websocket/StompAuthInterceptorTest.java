package org.ssafy.bodybuilder.global.config.websocket;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.ssafy.bodybuilder.domain.room.model.Participant;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

class StompAuthInterceptorTest {

    private StompAuthInterceptor stompAuthInterceptor;
    private RoomSessionRepository roomSessionRepository;
    private MessageChannel messageChannel;

    @BeforeEach
    void setUp() {
        roomSessionRepository = mock(RoomSessionRepository.class);
        stompAuthInterceptor = new StompAuthInterceptor(roomSessionRepository);
        messageChannel = mock(MessageChannel.class);
    }

    @Test
    @DisplayName("STOMP CONNECT 시 세션에 SecurityContext가 존재하면 사용자 인증이 바인딩된다.")
    void preSend_ValidSession_BindsAuthentication() {
        // given
        UUID userId = UUID.randomUUID();
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(userId.toString(), null, Collections.emptyList());
        SecurityContextImpl securityContext = new SecurityContextImpl(auth);

        Map<String, Object> sessionAttributes = new HashMap<>();
        sessionAttributes.put(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, securityContext);

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setSessionAttributes(sessionAttributes);
        Message<?> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        // when
        Message<?> resultMessage = stompAuthInterceptor.preSend(message, messageChannel);

        // then
        StompHeaderAccessor resultAccessor = StompHeaderAccessor.wrap(resultMessage);
        assertThat(resultAccessor.getUser()).isNotNull();
        assertThat(resultAccessor.getUser().getName()).isEqualTo(userId.toString());
    }

    @Test
    @DisplayName("STOMP CONNECT 시 세션이 없고 Native Header만 전달될 경우 MessageDeliveryException 발생하여 연결 거부된다.")
    void preSend_NativeHeaderUserId_Rejected() {
        // given
        UUID fakeUserId = UUID.randomUUID();
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setNativeHeader("userId", fakeUserId.toString());
        Message<?> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        // when & then
        assertThatThrownBy(() -> stompAuthInterceptor.preSend(message, messageChannel))
                .isInstanceOf(MessageDeliveryException.class)
                .hasMessageContaining("STOMP CONNECT authentication required");
    }

    @Test
    @DisplayName("STOMP SUBSCRIBE 시 방 참가자이면 구독이 정상 허용된다.")
    void preSend_SubscribeValidParticipant_Success() {
        // given
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(userId.toString(), null, Collections.emptyList());

        RoomSession room = mock(RoomSession.class);
        Participant participant = Participant.builder().userId(userId).build();
        given(room.getParticipants()).willReturn(Map.of(userId, participant));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setUser(auth);
        accessor.setDestination("/sub/room/" + roomId);
        Message<?> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        // when
        Message<?> result = stompAuthInterceptor.preSend(message, messageChannel);

        // then
        assertThat(result).isNotNull();
    }

    @Test
    @DisplayName("STOMP SUBSCRIBE 시 방 미참가자이면 MessageDeliveryException 예외가 발생한다.")
    void preSend_SubscribeNonParticipant_ThrowsException() {
        // given
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(userId.toString(), null, Collections.emptyList());

        RoomSession room = mock(RoomSession.class);
        given(room.getParticipants()).willReturn(Collections.emptyMap());
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setUser(auth);
        accessor.setDestination("/sub/room/" + roomId);
        Message<?> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        // when & then
        assertThatThrownBy(() -> stompAuthInterceptor.preSend(message, messageChannel))
                .isInstanceOf(MessageDeliveryException.class)
                .hasMessageContaining("not a participant");
    }

    @Test
    @DisplayName("STOMP SUBSCRIBE 시 타인의 개인 채널을 구독하려 하면 예외가 발생한다.")
    void preSend_SubscribeOtherUserPrivateChannel_ThrowsException() {
        // given
        UUID myUserId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(myUserId.toString(), null, Collections.emptyList());

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setUser(auth);
        accessor.setDestination("/sub/room/" + roomId + "/user/" + otherUserId);
        Message<?> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        // when & then
        assertThatThrownBy(() -> stompAuthInterceptor.preSend(message, messageChannel))
                .isInstanceOf(MessageDeliveryException.class)
                .hasMessageContaining("Cannot subscribe to another user's private channel");
    }

    @Test
    @DisplayName("일반 사용자는 관리자 토픽을 구독할 수 없다.")
    void preSend_SubscribeAdminTopicAsUser_ThrowsException() {
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(
                        UUID.randomUUID().toString(),
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_USER"))
                );
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setUser(auth);
        accessor.setDestination("/topic/admin/sessions");
        Message<?> message = MessageBuilder.createMessage(
                new byte[0],
                accessor.getMessageHeaders()
        );

        assertThatThrownBy(() -> stompAuthInterceptor.preSend(message, messageChannel))
                .isInstanceOf(MessageDeliveryException.class)
                .hasMessageContaining("Admin role required");
    }

    @Test
    @DisplayName("관리자는 관리자 토픽을 구독할 수 있다.")
    void preSend_SubscribeAdminTopicAsAdmin_Succeeds() {
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(
                        UUID.randomUUID().toString(),
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))
                );
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setUser(auth);
        accessor.setDestination("/topic/admin/sessions");
        Message<?> message = MessageBuilder.createMessage(
                new byte[0],
                accessor.getMessageHeaders()
        );

        assertThat(stompAuthInterceptor.preSend(message, messageChannel)).isNotNull();
    }
}
