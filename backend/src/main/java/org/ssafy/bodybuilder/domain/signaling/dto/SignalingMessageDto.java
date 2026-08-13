package org.ssafy.bodybuilder.domain.signaling.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

import lombok.Setter;

/**
 * WebRTC 시그널링 메시지 DTO.
 *
 * <p>OFFER / ANSWER / CANDIDATE 뿐 아니라 연결 초기 phase mismatch 를 방지하기 위한
 * READY / READY_ACK 핸드셰이크 메시지에도 사용된다.
 *
 * <p>READY 관련 필드({@code generationId}, {@code readyId}, {@code sentAt},
 * {@code negotiationId})는 모두 nullable 이며, 서버는 이 값들을 해석하거나 저장하지 않고
 * 그대로 상대방에게 중계(relay)만 한다. 재시도/타임아웃/generation 검증은 클라이언트 책임이다.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SignalingMessageDto {
    /** READY, READY_ACK, OFFER, ANSWER, CANDIDATE. 서버가 엔드포인트 기준으로 강제 설정한다. */
    private String type;
    private UUID roomId;
    private UUID senderId;
    private UUID receiverId;

    /** 클라이언트 세대(세션/화면전환) 식별자. 서버는 검증하지 않고 중계만 한다. */
    private String generationId;

    /** READY - READY_ACK 트랜잭션 식별자. ACK 매칭은 클라이언트가 수행한다. */
    private String readyId;

    /** 메시지 발신 시각 (ISO-8601). */
    private String sentAt;

    /** (선택) SDP/Candidate 협상 회차 식별자. */
    private String negotiationId;

    private Object sdp;
    private Object candidate;
}
