package org.ssafy.bodybuilder.domain.signaling.api;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.ssafy.bodybuilder.domain.signaling.dto.SignalingMessageDto;

import java.security.Principal;
import java.util.UUID;

/**
 * WebRTC 시그널링 중계 컨트롤러.
 *
 * <p>설계 원칙
 * <ul>
 *   <li><b>Stateless Relay</b>: READY 수신 여부나 연결 상태를 서버에 저장하지 않는다.
 *       retry / ACK 매칭 / timeout / generation 검증은 모두 클라이언트 책임이다.</li>
 *   <li><b>서버 측 ACK 자동 생성 금지</b>: READY 를 받았다고 서버가 READY_ACK 를 대신
 *       만들지 않는다. 실제 상대 클라이언트가 보낸 READY_ACK 만 중계한다.</li>
 *   <li><b>Sender 위조 방지</b>: senderId 는 WebSocket 세션 Principal 기준으로 덮어쓴다.</li>
 *   <li><b>type 정규화</b>: type 은 호출된 엔드포인트를 기준으로 서버가 강제 설정한다.</li>
 * </ul>
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class SignalingController {

    private static final String TYPE_OFFER = "OFFER";
    private static final String TYPE_ANSWER = "ANSWER";
    private static final String TYPE_CANDIDATE = "CANDIDATE";
    private static final String TYPE_READY = "READY";
    private static final String TYPE_READY_ACK = "READY_ACK";

    private static final String DESTINATION_FORMAT = "/sub/room/%s/user/%s";

    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/signal/offer")
    public void handleOffer(SignalingMessageDto message, SimpMessageHeaderAccessor headerAccessor) {
        processSignal(TYPE_OFFER, message, headerAccessor.getUser());
    }

    @MessageMapping("/signal/answer")
    public void handleAnswer(SignalingMessageDto message, SimpMessageHeaderAccessor headerAccessor) {
        processSignal(TYPE_ANSWER, message, headerAccessor.getUser());
    }

    @MessageMapping("/signal/candidate")
    public void handleCandidate(SignalingMessageDto message, SimpMessageHeaderAccessor headerAccessor) {
        processSignal(TYPE_CANDIDATE, message, headerAccessor.getUser());
    }

    /**
     * WebRTC 협상 시작 전 상대방의 수신 준비 상태를 알리는 READY 신호를 중계한다.
     * 서버는 상태를 저장하지 않으며 READY_ACK 를 대신 생성하지도 않는다.
     */
    @MessageMapping("/signal/ready")
    public void handleReady(SignalingMessageDto message, SimpMessageHeaderAccessor headerAccessor) {
        processSignal(TYPE_READY, message, headerAccessor.getUser());
    }

    /**
     * 상대 클라이언트가 실제로 전송한 READY_ACK 를 중계한다.
     * 동일한 readyId 로 재전송(retry)되어도 서버는 그대로 중계하며, 멱등 처리는 클라이언트가 담당한다.
     */
    @MessageMapping("/signal/ready-ack")
    public void handleReadyAck(SignalingMessageDto message, SimpMessageHeaderAccessor headerAccessor) {
        processSignal(TYPE_READY_ACK, message, headerAccessor.getUser());
    }

    private void processSignal(String signalType, SignalingMessageDto message, Principal principal) {
        if (principal == null || principal.getName() == null) {
            log.warn("[WebRTC {} Rejected] Unauthenticated signaling attempt.", signalType);
            return;
        }

        if (message == null || message.getRoomId() == null || message.getReceiverId() == null) {
            log.warn("[WebRTC {} Rejected] Invalid signaling payload from user: {}", signalType, principal.getName());
            return;
        }

        UUID authenticatedUserId;
        try {
            authenticatedUserId = UUID.fromString(principal.getName());
        } catch (IllegalArgumentException e) {
            log.error("[WebRTC {} Rejected] Invalid UUID format in principal name: {}", signalType, principal.getName());
            return;
        }

        if (message.getSenderId() != null && !authenticatedUserId.equals(message.getSenderId())) {
            log.warn("[WebRTC {} Sender Overridden] Client senderId ({}) does not match authenticated user ({})",
                    signalType, message.getSenderId(), authenticatedUserId);
        }

        message.setSenderId(authenticatedUserId);
        message.setType(signalType);

        if (TYPE_READY.equals(signalType) || TYPE_READY_ACK.equals(signalType)) {
            log.info("[WebRTC {}] Room: {}, Sender: {} -> Receiver: {}, readyId: {}, generationId: {}",
                    signalType, message.getRoomId(), message.getSenderId(), message.getReceiverId(),
                    message.getReadyId(), message.getGenerationId());
        } else {
            log.info("[WebRTC {}] Room: {}, Sender: {} -> Receiver: {}",
                    signalType, message.getRoomId(), message.getSenderId(), message.getReceiverId());
        }

        String destination = String.format(DESTINATION_FORMAT,
                message.getRoomId(), message.getReceiverId());
        messagingTemplate.convertAndSend(destination, message);
    }
}
