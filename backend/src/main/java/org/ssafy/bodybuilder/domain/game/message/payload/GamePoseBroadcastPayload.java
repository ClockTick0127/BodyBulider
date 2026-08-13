package org.ssafy.bodybuilder.domain.game.message.payload;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import org.ssafy.bodybuilder.domain.game.model.GamePoseSubmission;

/**
 * GAME_POSE_BROADCAST(107) 페이로드.
 *
 * @param waterFlows 현재 포즈 집합 기준 물길 [x1, y1, x2, y2, halfWidth] × N
 *                   (개발명세서_BE_물기믹_유니온물길 §3).
 *                   빈 배열 = "물 없음"(권위적), null = 계산 실패 → 직렬화에서 생략
 *                   (FE는 필드 부재 시 로컬 계산 폴백).
 *                   주의: 필드명 is 접두사 금지 (CLAUDE.md 직렬화 사고 전례)
 */
public record GamePoseBroadcastPayload(
        Integer player,
        Integer captureNo,
        List<List<Double>> points,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        List<List<Double>> waterFlows
) {
    public static GamePoseBroadcastPayload from(
            GamePoseSubmission submission,
            List<List<Double>> waterFlows
    ) {
        return new GamePoseBroadcastPayload(
                submission.player(),
                submission.captureNo(),
                submission.points(),
                waterFlows
        );
    }
}
