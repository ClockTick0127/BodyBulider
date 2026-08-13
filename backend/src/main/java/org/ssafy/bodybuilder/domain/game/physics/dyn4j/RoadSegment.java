package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

/**
 * 포즈 로드 선분 (dyn4j 좌표계: m, +y 위).
 *
 * <p>캡슐 fixture의 userData로 저장되어 RoadClimbListener가
 * 등반 밴드 판정에 사용한다.
 */
record RoadSegment(double x1, double y1, double x2, double y2) {

    /** 공 중심을 선분 축에 투영한 파라미터 t (0~1로 클램프). */
    double projection(double ballX, double ballY) {
        return Math.max(0.0, Math.min(1.0, rawProjection(ballX, ballY)));
    }

    /**
     * 클램프 없는 투영값. 1.0 초과 = 공이 후행 끝점을 지나 캡 영역에 있음.
     * RoadClimbListener가 "로드는 끝점까지만 바닥" 규칙에 사용한다.
     */
    double rawProjection(double ballX, double ballY) {
        double dx = x2 - x1;
        double dy = y2 - y1;
        double lengthSquared = dx * dx + dy * dy;
        if (lengthSquared < 1e-12) {
            return 0.0;
        }
        return ((ballX - x1) * dx + (ballY - y1) * dy) / lengthSquared;
    }

    /** 투영 지점의 축 y(m). */
    double axisYAt(double projection) {
        return y1 + (y2 - y1) * projection;
    }
}
