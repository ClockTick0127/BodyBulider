package org.ssafy.bodybuilder.domain.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.InOrder;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.message.GameMessage;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameCapturingResponsePayload;
import org.ssafy.bodybuilder.domain.game.message.payload.GamePoseBroadcastPayload;
import org.ssafy.bodybuilder.domain.game.message.payload.PoseCaptureDiagnosticPayload;
import org.ssafy.bodybuilder.domain.game.model.GamePoseSubmission;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;

@ExtendWith(MockitoExtension.class)
class PoseSubmissionServiceTest {

    @Mock GameSessionRepository gameSessionRepository;
    @Mock GameSimulationService gameSimulationService;
    @Mock WaterFlowBroadcastService waterFlowBroadcastService;
    @Mock GameMessagePublisher gameMessagePublisher;
    @Mock GameSessionEventRecorder gameSessionEventRecorder;

    private PoseSubmissionService poseSubmissionService;
    private UUID roomId;
    private UUID requesterId;

    @BeforeEach
    void setUp() {
        poseSubmissionService = new PoseSubmissionService(
                gameSessionRepository,
                gameSimulationService,
                waterFlowBroadcastService,
                gameMessagePublisher,
                gameSessionEventRecorder
        );
        roomId = UUID.randomUUID();
        requesterId = UUID.randomUUID();
    }

    @Test
    void storesValidPoseSubmission() {
        UUID gameSessionId = UUID.randomUUID();
        GameCapturingResponsePayload payload = new GameCapturingResponsePayload(
                3,
                List.of(
                        List.of(0.34, 0.42),
                        List.of(0.45, 0.50),
                        List.of(0.58, 0.57)
                )
        );
        GameMessage<GameCapturingResponsePayload> message = GameMessage.of(
                GameMessageType.GAME_CAPTURING_RESPONSE,
                roomId,
                gameSessionId,
                payload
        );
        GamePoseSubmission submission = new GamePoseSubmission(
                2,
                3,
                payload.points()
        );
        when(gameSessionRepository.savePose(
                roomId,
                gameSessionId,
                requesterId,
                payload.captureNo(),
                payload.points()
        )).thenReturn(submission);

        poseSubmissionService.submitPose(message, requesterId);

        InOrder inOrder = inOrder(
                gameSessionRepository,
                gameMessagePublisher,
                gameSimulationService
        );
        inOrder.verify(gameSessionRepository).savePose(
                roomId,
                gameSessionId,
                requesterId,
                payload.captureNo(),
                payload.points()
        );
        inOrder.verify(gameMessagePublisher).publishGameMessage(
                GameMessageType.GAME_POSE_BROADCAST,
                roomId,
                gameSessionId,
                new GamePoseBroadcastPayload(2, 3, payload.points(), List.of())
        );
        inOrder.verify(gameSimulationService).simulateIfReady(
                roomId,
                gameSessionId
        );
    }

    @Test
    void rejectsPoseSubmissionWithWrongMessageType() {
        GameCapturingResponsePayload payload = new GameCapturingResponsePayload(
                1,
                List.of(List.of(0.34, 0.42))
        );
        GameMessage<GameCapturingResponsePayload> message = GameMessage.of(
                GameMessageType.GAME_START_RESPONSE,
                roomId,
                UUID.randomUUID(),
                payload
        );

        assertThatThrownBy(() -> poseSubmissionService.submitPose(message, requesterId))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.TYPE_NOT_FOUND)
                );

        verify(gameSessionRepository, never())
                .savePose(any(), any(), any(), any(), any());
        verify(gameSimulationService, never()).simulateIfReady(any(), any());
        verify(gameMessagePublisher, never())
                .publishGameMessage(any(), any(), any(), any());
    }

    @Test
    void rejectsPoseSubmissionWithInvalidCoordinates() {
        GameCapturingResponsePayload payload = new GameCapturingResponsePayload(
                1,
                List.of(List.of(1.2, 0.42))
        );
        GameMessage<GameCapturingResponsePayload> message = GameMessage.of(
                GameMessageType.GAME_CAPTURING_RESPONSE,
                roomId,
                UUID.randomUUID(),
                payload
        );

        assertThatThrownBy(() -> poseSubmissionService.submitPose(message, requesterId))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_INPUT_VALUE)
                );

        verify(gameSessionRepository, never())
                .savePose(any(), any(), any(), any(), any());
        verify(gameSimulationService, never()).simulateIfReady(any(), any());
        verify(gameMessagePublisher, never())
                .publishGameMessage(any(), any(), any(), any());
    }

    @Test
    void recordsDiagnosticWhenClientCouldNotProducePose() {
        UUID gameSessionId = UUID.randomUUID();
        PoseCaptureDiagnosticPayload diagnostic = new PoseCaptureDiagnosticPayload(
                "VIDEO_READY_STATE_INSUFFICIENT",
                Map.of("VIDEO_READY_STATE_INSUFFICIENT", 42),
                42,
                0,
                true,
                false,
                "visible",
                new PoseCaptureDiagnosticPayload.VideoState(
                        2,
                        false,
                        false,
                        640,
                        480,
                        3.2
                ),
                null
        );
        GameCapturingResponsePayload payload = new GameCapturingResponsePayload(
                2,
                List.of(),
                diagnostic
        );
        GameMessage<GameCapturingResponsePayload> message = GameMessage.of(
                GameMessageType.GAME_CAPTURING_RESPONSE,
                roomId,
                gameSessionId,
                payload
        );
        when(gameSessionRepository.savePose(
                roomId,
                gameSessionId,
                requesterId,
                2,
                List.of()
        )).thenReturn(new GamePoseSubmission(2, 2, List.of()));

        poseSubmissionService.submitPose(message, requesterId);

        verify(gameSessionRepository).savePose(
                roomId,
                gameSessionId,
                requesterId,
                2,
                List.of()
        );
        verify(gameSessionEventRecorder).recordWarning(
                any(),
                org.mockito.ArgumentMatchers.eq("POSE_CAPTURE_FAILED"),
                org.mockito.ArgumentMatchers.eq(GameMessageType.GAME_CAPTURING_RESPONSE),
                org.mockito.ArgumentMatchers.eq("INBOUND"),
                org.mockito.ArgumentMatchers.eq("FAILED"),
                org.mockito.ArgumentMatchers.eq(requesterId),
                any(),
                org.mockito.ArgumentMatchers.isNull(),
                org.mockito.ArgumentMatchers.isNull(),
                any()
        );
        verify(gameMessagePublisher, never())
                .publishGameMessage(any(), any(), any(), any());
        verify(gameSimulationService).simulateIfReady(roomId, gameSessionId);
    }

    @Test
    void rejectsEmptyPoseWithoutDiagnostic() {
        GameCapturingResponsePayload payload = new GameCapturingResponsePayload(1, List.of());
        GameMessage<GameCapturingResponsePayload> message = GameMessage.of(
                GameMessageType.GAME_CAPTURING_RESPONSE,
                roomId,
                UUID.randomUUID(),
                payload
        );

        assertThatThrownBy(() -> poseSubmissionService.submitPose(message, requesterId))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_INPUT_VALUE)
                );

        verify(gameSessionRepository, never())
                .savePose(any(), any(), any(), any(), any());
    }
}
