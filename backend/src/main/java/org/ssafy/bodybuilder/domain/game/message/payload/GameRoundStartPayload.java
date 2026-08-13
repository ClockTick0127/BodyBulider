package org.ssafy.bodybuilder.domain.game.message.payload;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.util.GameConstants;

/**
 * @param waterFlows 라운드 시작(포즈 0개, 지형만) 물길 [x1, y1, x2, y2, halfWidth] × N
 *                   (개발명세서_BE_물기믹_유니온물길 BE-WATER-05).
 *                   null(계산 실패)은 직렬화에서 생략 — FE는 로컬 계산 폴백.
 */
public record GameRoundStartPayload(
        Integer mapId,
        RoundInfo round,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        List<List<Double>> waterFlows
) {
    public static GameRoundStartPayload of(
            Integer stageId,
            StageRound round,
            List<List<Double>> waterFlows
    ) {
        return new GameRoundStartPayload(
                stageId * GameConstants.ROUND_MODULAR + round.getRoundNo(),
                new RoundInfo(
                        round.getId(),
                        round.getRoundNo(),
                        round.getMapConfig()
                ),
                waterFlows
        );
    }

    public record RoundInfo(
            Integer roundId,
            Integer roundNo,
            JsonNode mapConfig
    ) {
    }
}
