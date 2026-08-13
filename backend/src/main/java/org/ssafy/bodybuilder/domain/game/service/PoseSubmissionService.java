package org.ssafy.bodybuilder.domain.game.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.message.GameMessage;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameCapturingResponsePayload;
import org.ssafy.bodybuilder.domain.game.message.payload.GamePoseBroadcastPayload;
import org.ssafy.bodybuilder.domain.game.message.payload.PoseCaptureDiagnosticPayload;
import org.ssafy.bodybuilder.domain.game.model.GamePoseSubmission;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.util.GameConstants;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PoseSubmissionService {

    private static final Set<String> DIAGNOSTIC_REASONS = Set.of(
            "LANDMARKER_NOT_READY",
            "VIDEO_PAUSED",
            "VIDEO_ENDED",
            "VIDEO_READY_STATE_INSUFFICIENT",
            "NO_LANDMARKS",
            "DETECTION_EXCEPTION",
            "VIDEO_ELEMENT_UNAVAILABLE",
            "CANVAS_UNAVAILABLE",
            "CAMERA_UNAVAILABLE",
            "NO_VALID_POSE"
    );

    private final GameSessionRepository gameSessionRepository;
    private final GameSimulationService gameSimulationService;
    private final WaterFlowBroadcastService waterFlowBroadcastService;
    private final GameMessagePublisher gameMessagePublisher;
    private final GameSessionEventRecorder gameSessionEventRecorder;

    public void submitPose(
            GameMessage<GameCapturingResponsePayload> message,
            UUID requesterId
    ) {
        //메시지 타입확인
        if (message.type() != GameMessageType.GAME_CAPTURING_RESPONSE) {
            throw new GlobalException(ErrorCode.TYPE_NOT_FOUND);
        }

        GameCapturingResponsePayload payload = message.payload();
        validatePoseMessage(message, payload, requesterId);

        GamePoseSubmission submission = gameSessionRepository.savePose(
                message.roomSessionId(),
                message.gameSessionId(),
                requesterId,
                payload.captureNo(),
                payload.points()
        );
        if (submission.points().isEmpty()) {
            recordCaptureFailure(message, requesterId, submission, payload.diagnostic());
            gameSimulationService.simulateIfReady(
                    message.roomSessionId(),
                    message.gameSessionId()
            );
            return;
        }
        gameSessionEventRecorder.record(
                message.gameSessionId(),
                "POSE_ACCEPTED",
                GameMessageType.GAME_CAPTURING_RESPONSE,
                "INBOUND",
                "SUCCESS",
                requesterId,
                java.util.Map.of(
                        "captureNo", submission.captureNo(),
                        "playerNo", submission.player(),
                        "pointCount", submission.points().size()
                ),
                null,
                null,
                message.occurredAt()
        );
        // 물길은 BE 단일 계산 — 실패 시 null(필드 생략) → FE 로컬 폴백
        // (개발명세서_BE_물기믹_유니온물길 BE-WATER-05)
        List<List<Double>> waterFlows =
                waterFlowBroadcastService.currentWaterFlows(message.gameSessionId());
        gameMessagePublisher.publishGameMessage(
                GameMessageType.GAME_POSE_BROADCAST,
                message.roomSessionId(),
                message.gameSessionId(),
                GamePoseBroadcastPayload.from(submission, waterFlows)
        );

        //simulate실행
        gameSimulationService.simulateIfReady(
                message.roomSessionId(),
                message.gameSessionId()
        );
    }

    private void validatePoseMessage(
            GameMessage<GameCapturingResponsePayload> message,
            GameCapturingResponsePayload payload,
            UUID requesterId
    ) {
        if (message.roomSessionId() == null
                || message.gameSessionId() == null
                || requesterId == null
                || payload == null
                || payload.captureNo() == null
                || payload.captureNo() < 1
                || payload.captureNo() > GameConstants.CAPTURE_REQUEST_COUNT
                || payload.points() == null
                || payload.points().stream().anyMatch(this::isInvalidPoint)
                || (payload.points().isEmpty() && !isValidDiagnostic(payload.diagnostic()))
                || (!payload.points().isEmpty() && payload.diagnostic() != null)) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }
    }

    private void recordCaptureFailure(
            GameMessage<GameCapturingResponsePayload> message,
            UUID requesterId,
            GamePoseSubmission submission,
            PoseCaptureDiagnosticPayload diagnostic
    ) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("captureNo", submission.captureNo());
        summary.put("playerNo", submission.player());
        summary.put("primaryReason", diagnostic.primaryReason());
        summary.put("reasonCounts", diagnostic.reasonCounts());
        summary.put("detectionAttempts", diagnostic.detectionAttempts());
        summary.put("successfulDetections", diagnostic.successfulDetections());
        summary.put("cameraOn", diagnostic.cameraOn());
        summary.put("poseModelLoading", diagnostic.poseModelLoading());
        summary.put("visibilityState", diagnostic.visibilityState());
        summary.put("videoState", diagnostic.videoState());
        if (diagnostic.exceptionName() != null) {
            summary.put("exceptionName", diagnostic.exceptionName());
        }
        gameSessionEventRecorder.recordWarning(
                message.gameSessionId(),
                "POSE_CAPTURE_FAILED",
                GameMessageType.GAME_CAPTURING_RESPONSE,
                "INBOUND",
                "FAILED",
                requesterId,
                summary,
                null,
                null,
                message.occurredAt()
        );
    }

    private boolean isValidDiagnostic(PoseCaptureDiagnosticPayload diagnostic) {
        if (diagnostic == null
                || !DIAGNOSTIC_REASONS.contains(diagnostic.primaryReason())
                || diagnostic.reasonCounts() == null
                || diagnostic.reasonCounts().size() > DIAGNOSTIC_REASONS.size()
                || diagnostic.reasonCounts().entrySet().stream().anyMatch(entry ->
                        !DIAGNOSTIC_REASONS.contains(entry.getKey())
                                || entry.getValue() == null
                                || entry.getValue() < 1
                                || entry.getValue() > 10_000)
                || diagnostic.detectionAttempts() == null
                || diagnostic.detectionAttempts() < 0
                || diagnostic.detectionAttempts() > 10_000
                || diagnostic.successfulDetections() == null
                || diagnostic.successfulDetections() < 0
                || diagnostic.successfulDetections() > diagnostic.detectionAttempts()
                || diagnostic.cameraOn() == null
                || diagnostic.poseModelLoading() == null
                || diagnostic.visibilityState() == null
                || diagnostic.visibilityState().length() > 20
                || (diagnostic.exceptionName() != null
                    && diagnostic.exceptionName().length() > 100)) {
            return false;
        }
        return diagnostic.videoState() == null || isValidVideoState(diagnostic.videoState());
    }

    private boolean isValidVideoState(PoseCaptureDiagnosticPayload.VideoState state) {
        return state.readyState() != null
                && state.readyState() >= 0
                && state.readyState() <= 4
                && state.paused() != null
                && state.ended() != null
                && state.width() != null
                && state.width() >= 0
                && state.width() <= 8_192
                && state.height() != null
                && state.height() >= 0
                && state.height() <= 8_192
                && state.currentTime() != null
                && Double.isFinite(state.currentTime())
                && state.currentTime() >= 0;
    }

    private boolean isInvalidPoint(List<Double> point) {
        return point == null
                || point.size() != 2
                || point.stream().anyMatch(coordinate ->
                        coordinate == null
                                || !Double.isFinite(coordinate)
                                || coordinate < 0.0
                                || coordinate > 1.0);
    }
}
