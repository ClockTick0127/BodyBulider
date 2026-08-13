package org.ssafy.bodybuilder.domain.game.websocket.handler;

import java.security.Principal;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.message.GameMessage;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameCapturingResponsePayload;
import org.ssafy.bodybuilder.domain.game.service.PoseSubmissionService;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GameCapturingMessageHandler
        implements GameMessageHandler<GameCapturingResponsePayload> {

    private final PoseSubmissionService poseSubmissionService;

    @Override
    public GameMessageType type() {
        return GameMessageType.GAME_CAPTURING_RESPONSE;
    }

    @Override
    public Class<GameCapturingResponsePayload> payloadType() {
        return GameCapturingResponsePayload.class;
    }

    @Override
    public void handle(
            GameMessage<GameCapturingResponsePayload> message,
            Principal principal
    ) {
        UUID requesterId = resolveUserId(principal);
        poseSubmissionService.submitPose(message, requesterId);
    }

    private UUID resolveUserId(Principal principal) {
        if (principal == null) {
            throw new GlobalException(ErrorCode.UNAUTHORIZED);
        }

        try {
            return UUID.fromString(principal.getName());
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new GlobalException(ErrorCode.UNAUTHORIZED);
        }
    }
}
