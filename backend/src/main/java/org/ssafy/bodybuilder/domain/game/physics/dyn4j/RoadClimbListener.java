package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.contact.ContactConstraint;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.ContactCollisionData;
import org.dyn4j.world.listener.ContactListenerAdapter;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsConstants;

/**
 * 로드는 기본적으로 양면 솔리드다: 위에서는 바닥, 아래에서 접근하면 차단벽(천장).
 *
 * <p>단, 단차(ledge) 등반을 위해 "선두 캡 영역 + 등반 밴드"의 밀어내기 접촉만
 * 선별적으로 비활성화한다. 이게 없으면 캡 측면이 홉(step-up) 도중 공을 되밀어
 * 20~30px 단차에서 무한 정체가 발생한다 (하네스 검증).
 *
 * <p>비활성 조건 (모두 만족 시):
 * <ul>
 *   <li>접촉 법선이 걷기 불가능(옆/아래로 밀어내는) 방향 — 지지 접촉은 항상 유지</li>
 *   <li>선두 캡 영역 (투영 t ≤ 0.05)</li>
 *   <li>등반 밴드: 로컬 lift ∈ (1px, MAX_STEP_HEIGHT]</li>
 * </ul>
 *
 * <p>주의: dyn4j 접촉 법선은 body1을 향하며, setEnabled 상태는 지속 접촉에서
 * 유지되므로 매 스텝 양방향으로 갱신해야 한다.
 */
final class RoadClimbListener extends ContactListenerAdapter<Body> {

    private static final double LEADING_CAP_PROJECTION = 0.05;
    private static final double MIN_BAND_LIFT_PX = 1.0;

    // setFriction은 dyn4j 6.0에서 deprecated(전역 ValueMixer 권장)이지만,
    // 접촉 방향(바닥/천장)에 따른 조건부 마찰은 접촉별 설정으로만 가능하다.
    // dyn4j 업그레이드 시 대체 API 확인 필요.
    @SuppressWarnings("deprecation")
    @Override
    public void collision(ContactCollisionData<Body> data) {
        ContactConstraint<Body> constraint = data.getContactConstraint();

        RoadSegment road;
        Body ball;
        if (constraint.getFixture1().getUserData() instanceof RoadSegment segment) {
            road = segment;
            ball = constraint.getBody2();
        } else if (constraint.getFixture2().getUserData() instanceof RoadSegment segment) {
            road = segment;
            ball = constraint.getBody1();
        } else {
            return;
        }

        Vector2 center = ball.getWorldCenter();
        double rawProjection = road.rawProjection(center.x, center.y);

        // 후행 끝점을 지난 캡은 지지력 없음 — 로드는 끝점까지만 바닥이다.
        // (캡이 솔리드면 공이 끝단 꼭지 위에 마찰로 얹혀 제자리 정지하는 버그)
        if (rawProjection >= 1.0) {
            constraint.setEnabled(false);
            return;
        }

        double projection = Math.max(0.0, Math.min(1.0, rawProjection));
        double axisY = road.axisYAt(projection);

        // 로컬 lift(px, 게임좌표): 공 중심이 이 지점의 로드 윗면보다 얼마나 아래인가
        double contactDistance = PhysicsConstants.BALL_RADIUS
                + PhysicsConstants.ROAD_RADIUS;
        double liftPx = (axisY - center.y) / CoordinateMapper.SCALE + contactDistance;

        // 접촉 법선(공 방향)이 걷기 가능한 위쪽이면 지지 접촉 → 항상 유지
        Vector2 normal = constraint.getNormal();
        double nyMeters = normal.y;
        if (constraint.getBody2() == ball) { // 법선은 body1向
            nyMeters = -nyMeters;
        }
        boolean walkable = -nyMeters
                < -PhysicsConstants.WALKABLE_NORMAL_THRESHOLD;

        // 바닥이 아닌 접촉(천장·벽)은 마찰 0: 점프패드로 로드 밑면에 머리를 박을 때
        // 수직 임펄스에 비례하는 마찰이 수평 속도를 전부 깎아 공이 수직 낙하하던
        // 문제 방지. 지지 접촉은 fixture 마찰의 기하평균(dyn4j 기본 혼합) 유지.
        // setEnabled처럼 지속 접촉에서 상태가 유지되므로 매 스텝 양방향 갱신.
        constraint.setFriction(walkable
                ? Math.sqrt(constraint.getFixture1().getFriction()
                        * constraint.getFixture2().getFriction())
                : 0.0);

        boolean climbBand = !walkable
                && projection <= LEADING_CAP_PROJECTION
                && liftPx > MIN_BAND_LIFT_PX
                && liftPx <= PhysicsConstants.MAX_STEP_HEIGHT;

        constraint.setEnabled(!climbBand);
    }
}
