package org.ssafy.bodybuilder.domain.signaling.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.ssafy.bodybuilder.domain.signaling.dto.SignalingMessageDto;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class SignalingControllerTest {

    private SignalingController signalingController;
    private SimpMessagingTemplate messagingTemplate;

    @BeforeEach
    void setUp() {
        messagingTemplate = mock(SimpMessagingTemplate.class);
        signalingController = new SignalingController(messagingTemplate);
    }

    private SimpMessageHeaderAccessor authenticatedAccessor(UUID userId) {
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                userId.toString(), null, Collections.emptyList());
        SimpMessageHeaderAccessor accessor = mock(SimpMessageHeaderAccessor.class);
        given(accessor.getUser()).willReturn(auth);
        return accessor;
    }

    private String destinationOf(UUID roomId, UUID receiverId) {
        return String.format("/sub/room/%s/user/%s", roomId, receiverId);
    }

    @Test
    @DisplayName("Principal이 null이면 시그널링 메시지가 전송되지 않고 즉시 종료된다.")
    void handleOffer_NullPrincipal_Rejects() {
        // given
        SignalingMessageDto message = SignalingMessageDto.builder()
                .type("OFFER")
                .roomId(UUID.randomUUID())
                .senderId(UUID.randomUUID())
                .receiverId(UUID.randomUUID())
                .build();
        SimpMessageHeaderAccessor accessor = mock(SimpMessageHeaderAccessor.class);

        // when
        signalingController.handleOffer(message, accessor);

        // then
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    @DisplayName("클라이언트가 전송한 senderId가 미일치하더라도 authenticated user ID로 강제 덮어쓰기되어 전송된다.")
    void handleOffer_OverridesSenderIdWithAuthenticatedUser() {
        // given
        UUID authenticatedUserId = UUID.randomUUID();
        UUID forgedSenderId = UUID.randomUUID();
        UUID receiverId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();

        SignalingMessageDto message = SignalingMessageDto.builder()
                .type("OFFER")
                .roomId(roomId)
                .senderId(forgedSenderId)
                .receiverId(receiverId)
                .build();

        SimpMessageHeaderAccessor accessor = authenticatedAccessor(authenticatedUserId);

        // when
        signalingController.handleOffer(message, accessor);

        // then
        ArgumentCaptor<SignalingMessageDto> captor = ArgumentCaptor.forClass(SignalingMessageDto.class);
        verify(messagingTemplate).convertAndSend(eq(destinationOf(roomId, receiverId)), captor.capture());

        SignalingMessageDto sentMessage = captor.getValue();
        assertThat(sentMessage.getSenderId()).isEqualTo(authenticatedUserId);
        assertThat(sentMessage.getSenderId()).isNotEqualTo(forgedSenderId);
    }

    @Test
    @DisplayName("인증된 사용자의 READY 메시지는 수신자 개인 채널로 중계되며 핸드셰이크 필드가 보존된다.")
    void handleReady_RelaysToReceiver() {
        // given
        UUID senderId = UUID.randomUUID();
        UUID receiverId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        String generationId = UUID.randomUUID().toString();
        String readyId = UUID.randomUUID().toString();
        String sentAt = "2026-08-07T12:00:00Z";

        SignalingMessageDto message = SignalingMessageDto.builder()
                .roomId(roomId)
                .senderId(senderId)
                .receiverId(receiverId)
                .generationId(generationId)
                .readyId(readyId)
                .sentAt(sentAt)
                .build();

        SimpMessageHeaderAccessor accessor = authenticatedAccessor(senderId);

        // when
        signalingController.handleReady(message, accessor);

        // then
        ArgumentCaptor<SignalingMessageDto> captor = ArgumentCaptor.forClass(SignalingMessageDto.class);
        verify(messagingTemplate).convertAndSend(eq(destinationOf(roomId, receiverId)), captor.capture());

        SignalingMessageDto sentMessage = captor.getValue();
        assertThat(sentMessage.getType()).isEqualTo("READY");
        assertThat(sentMessage.getSenderId()).isEqualTo(senderId);
        assertThat(sentMessage.getReceiverId()).isEqualTo(receiverId);
        assertThat(sentMessage.getGenerationId()).isEqualTo(generationId);
        assertThat(sentMessage.getReadyId()).isEqualTo(readyId);
        assertThat(sentMessage.getSentAt()).isEqualTo(sentAt);
    }

    @Test
    @DisplayName("READY_ACK 메시지는 원본 readyId를 유지한 채 수신자 개인 채널로 중계된다.")
    void handleReadyAck_RelaysToReceiver() {
        // given
        UUID senderId = UUID.randomUUID();
        UUID receiverId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        String readyId = UUID.randomUUID().toString();

        SignalingMessageDto message = SignalingMessageDto.builder()
                .roomId(roomId)
                .senderId(senderId)
                .receiverId(receiverId)
                .readyId(readyId)
                .build();

        SimpMessageHeaderAccessor accessor = authenticatedAccessor(senderId);

        // when
        signalingController.handleReadyAck(message, accessor);

        // then
        ArgumentCaptor<SignalingMessageDto> captor = ArgumentCaptor.forClass(SignalingMessageDto.class);
        verify(messagingTemplate).convertAndSend(eq(destinationOf(roomId, receiverId)), captor.capture());

        SignalingMessageDto sentMessage = captor.getValue();
        assertThat(sentMessage.getType()).isEqualTo("READY_ACK");
        assertThat(sentMessage.getReadyId()).isEqualTo(readyId);
        assertThat(sentMessage.getSenderId()).isEqualTo(senderId);
    }

    @Test
    @DisplayName("READY 메시지의 senderId가 위조되어도 인증된 Principal ID로 대체된다.")
    void handleReady_OverridesSenderId() {
        // given
        UUID authenticatedUserId = UUID.randomUUID();
        UUID forgedSenderId = UUID.randomUUID();
        UUID receiverId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();

        SignalingMessageDto message = SignalingMessageDto.builder()
                .type("READY")
                .roomId(roomId)
                .senderId(forgedSenderId)
                .receiverId(receiverId)
                .readyId(UUID.randomUUID().toString())
                .build();

        SimpMessageHeaderAccessor accessor = authenticatedAccessor(authenticatedUserId);

        // when
        signalingController.handleReady(message, accessor);

        // then
        ArgumentCaptor<SignalingMessageDto> captor = ArgumentCaptor.forClass(SignalingMessageDto.class);
        verify(messagingTemplate).convertAndSend(eq(destinationOf(roomId, receiverId)), captor.capture());

        SignalingMessageDto sentMessage = captor.getValue();
        assertThat(sentMessage.getSenderId()).isEqualTo(authenticatedUserId);
        assertThat(sentMessage.getSenderId()).isNotEqualTo(forgedSenderId);
    }

    @Test
    @DisplayName("미인증 READY 요청은 중계되지 않는다.")
    void handleReady_NullPrincipal_Rejects() {
        // given
        SignalingMessageDto message = SignalingMessageDto.builder()
                .type("READY")
                .roomId(UUID.randomUUID())
                .senderId(UUID.randomUUID())
                .receiverId(UUID.randomUUID())
                .readyId(UUID.randomUUID().toString())
                .build();
        SimpMessageHeaderAccessor accessor = mock(SimpMessageHeaderAccessor.class);

        // when
        signalingController.handleReady(message, accessor);

        // then
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    @DisplayName("roomId 또는 receiverId가 없는 READY 요청은 중계되지 않는다.")
    void handleReady_MissingReceiver_Rejects() {
        // given
        UUID senderId = UUID.randomUUID();
        SignalingMessageDto message = SignalingMessageDto.builder()
                .type("READY")
                .roomId(UUID.randomUUID())
                .senderId(senderId)
                .readyId(UUID.randomUUID().toString())
                .build();

        SimpMessageHeaderAccessor accessor = authenticatedAccessor(senderId);

        // when
        signalingController.handleReady(message, accessor);

        // then
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    @DisplayName("동일한 readyId의 READY 재전송(retry)도 예외 없이 매번 중계된다. (서버는 상태를 저장하지 않는다)")
    void handleReady_IdempotentRelay() {
        // given
        UUID senderId = UUID.randomUUID();
        UUID receiverId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        String readyId = UUID.randomUUID().toString();
        String generationId = UUID.randomUUID().toString();

        SimpMessageHeaderAccessor accessor = authenticatedAccessor(senderId);

        SignalingMessageDto first = SignalingMessageDto.builder()
                .roomId(roomId)
                .senderId(senderId)
                .receiverId(receiverId)
                .readyId(readyId)
                .generationId(generationId)
                .build();
        SignalingMessageDto retry = SignalingMessageDto.builder()
                .roomId(roomId)
                .senderId(senderId)
                .receiverId(receiverId)
                .readyId(readyId)
                .generationId(generationId)
                .build();

        // when
        signalingController.handleReady(first, accessor);
        signalingController.handleReady(retry, accessor);

        // then
        ArgumentCaptor<SignalingMessageDto> captor = ArgumentCaptor.forClass(SignalingMessageDto.class);
        verify(messagingTemplate, times(2))
                .convertAndSend(eq(destinationOf(roomId, receiverId)), captor.capture());

        List<SignalingMessageDto> relayed = captor.getAllValues();
        assertThat(relayed).hasSize(2);
        assertThat(relayed).allSatisfy(sent -> {
            assertThat(sent.getType()).isEqualTo("READY");
            assertThat(sent.getReadyId()).isEqualTo(readyId);
            assertThat(sent.getGenerationId()).isEqualTo(generationId);
        });
    }
}
