package org.ssafy.bodybuilder.domain.game.message.payload;

import java.util.List;

/**
 * GAME_SIMULATING_RESPONSE(104) 페이로드.
 *
 * @param intervalMs 프레임 간격(ms)
 * @param points     프레임 배열 [x, y, vx, vy] — 4원소 고정 (FE 계약, 5번째 원소 금지)
 * @param result     클리어 여부
 * @param grounded   프레임별 접지 여부 (points와 같은 크기).
 *                   legacy 엔진은 null — FE는 null이면 기존 방식(dvy 추정) 사용.
 *                   주의: 필드명 is 접두사 금지 (개발명세서_BE_시뮬레이션_접지플래그)
 */
public record GameSimulationPayload(
        Integer intervalMs,
        List<List<Double>> points,
        Boolean result,
        List<Boolean> grounded
) {
}
