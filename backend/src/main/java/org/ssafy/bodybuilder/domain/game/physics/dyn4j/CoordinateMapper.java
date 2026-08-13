package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

/**
 * 게임 좌표계(px, +y 아래) ↔ dyn4j 좌표계(m, +y 위) 변환.
 *
 * <p>dyn4j는 MKS(미터) 단위에 튜닝되어 있으므로 1px = 0.01m 스케일을 적용한다.
 * (맵 1000px = 10m, 중력 720px/s² = 7.2m/s² ≈ 실중력)
 */
public final class CoordinateMapper {

    /** 1px = 0.01m. */
    public static final double SCALE = 0.01;

    private CoordinateMapper() {
    }

    public static double toMetersX(double pixels) {
        return pixels * SCALE;
    }

    /** y축 반전 포함. */
    public static double toMetersY(double pixels) {
        return -pixels * SCALE;
    }

    public static double toPixelsX(double meters) {
        return meters / SCALE;
    }

    /** y축 반전 포함. */
    public static double toPixelsY(double meters) {
        return -meters / SCALE;
    }
}
