package org.ssafy.bodybuilder.domain.game.physics;

import java.util.List;

/**
 * 물리 시뮬레이션 결과.
 *
 * @param intervalMs 프레임 간격(ms)
 * @param points     프레임 배열. 각 프레임은 [x, y, vx, vy] — 반드시 4원소
 *                   (5번째 원소 추가 금지 — FE gameProtocol.ts가 거부)
 * @param result     클리어 여부
 * @param grounded   프레임별 접지 여부 (points와 같은 크기).
 *                   legacy 엔진은 null (개발명세서_BE_시뮬레이션_접지플래그 참고)
 */
public record SimulationResult(
        Integer intervalMs,
        List<List<Double>> points,
        Boolean result,
        List<Boolean> grounded
) {

    /** grounded 미지원 엔진용 (legacy). */
    public SimulationResult(
            Integer intervalMs,
            List<List<Double>> points,
            Boolean result
    ) {
        this(intervalMs, points, result, null);
    }
}
