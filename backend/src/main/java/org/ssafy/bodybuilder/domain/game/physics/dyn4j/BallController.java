package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import java.util.ArrayList;
import java.util.List;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.contact.ContactConstraint;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.World;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.JumpPad;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.Point;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsConstants;

/**
 * 공의 게임플레이 제어: 걷기 모터, step-up, 점프패드.
 *
 * <p>매 물리 스텝 직후 {@link #afterStep}을 호출한다.
 * legacy의 applyWalkingMotor / tryStepUp / applyJumpPad 수식을
 * dyn4j 접촉 정보 기반으로 이식한 것. 계산은 게임좌표(px, +y 아래)로 수행한다.
 *
 * <p>주의: dyn4j ContactConstraint의 법선은 body1을 향한다 (하네스 검증 결과).
 */
final class BallController {

    private record SegmentPx(double x1, double y1, double x2, double y2) {
    }

    /** 조인트 판정 허용 거리 (px): 이내에 다른 세그먼트 시작점이 있으면 이어진 길. */
    private static final double JOINT_TOLERANCE = 5.0;

    private final List<SegmentPx> roadSegments;
    /**
     * step-up(홉) 대상 세그먼트: 포즈 로드 + 지형 엣지.
     * 지형도 MAX_STEP_HEIGHT 이하의 작은 턱은 넘을 수 있다 (그 이상 지형 벽은 차단 유지).
     */
    private final List<SegmentPx> stepSegments;
    /** roadSegments[i]의 끝점에 이어지는 세그먼트가 있는지 (true = 조인트, false = 진짜 팁). */
    private final boolean[] hasContinuation;
    private final List<JumpPad> jumpPads;
    private final WindField windField;
    private final WaterFlowField waterFlowField;

    BallController(
            List<List<Point>> paths,
            List<List<Point>> terrainPolygons,
            List<JumpPad> jumpPads,
            WindField windField,
            WaterFlowField waterFlowField
    ) {
        this.windField = windField;
        this.waterFlowField = waterFlowField;
        this.roadSegments = new ArrayList<>();
        for (List<Point> path : paths) {
            for (int index = 1; index < path.size(); index++) {
                Point from = path.get(index - 1);
                Point to = path.get(index);
                double dx = to.x() - from.x();
                double dy = to.y() - from.y();
                if (dx * dx + dy * dy < 0.01) {
                    continue;
                }
                roadSegments.add(new SegmentPx(from.x(), from.y(), to.x(), to.y()));
            }
        }
        this.stepSegments = new ArrayList<>(roadSegments);
        for (List<Point> polygon : terrainPolygons) {
            // 감기 방향 정규화: 부호 면적이 양수면 바닥(윗면) 엣지는 항상 dx > 0.
            List<Point> oriented = orientPositiveArea(polygon);
            for (int index = 0; index < oriented.size(); index++) {
                Point from = oriented.get(index);
                Point to = oriented.get((index + 1) % oriented.size());
                double dx = to.x() - from.x();
                double dy = to.y() - from.y();
                if (dx * dx + dy * dy < 0.01) {
                    continue;
                }
                // 밑면(외향 법선이 아래를 향하는 엣지, dx < 0)은 step-up 대상에서 제외.
                // 공이 설 수 없는 면인데도 끝점이 "30px 이내 턱"으로 오인되면,
                // 벽을 타고 미끄러져 내려온 공이 벽 하단 끝에서 떨어지지 않고
                // 홉이 반복 발동해 벽에 매달리는 버그가 발생한다 (실맵 재현 검증).
                if (dx < 0) {
                    continue;
                }
                stepSegments.add(new SegmentPx(from.x(), from.y(), to.x(), to.y()));
            }
        }
        this.hasContinuation = new boolean[roadSegments.size()];
        for (int i = 0; i < roadSegments.size(); i++) {
            SegmentPx segment = roadSegments.get(i);
            for (int j = 0; j < roadSegments.size(); j++) {
                if (i == j) {
                    continue;
                }
                SegmentPx other = roadSegments.get(j);
                if (Math.hypot(other.x1() - segment.x2(), other.y1() - segment.y2())
                        < JOINT_TOLERANCE) {
                    hasContinuation[i] = true;
                    break;
                }
            }
        }
        this.jumpPads = jumpPads;
    }

    /**
     * 폴리곤을 양의 부호 면적(화면 기준 시계방향) 감기로 정규화한다.
     * 정규화 후 각 엣지의 외향 법선은 (dy, -dx) — 바닥 엣지는 dx &gt; 0,
     * 밑면(천장) 엣지는 dx &lt; 0, 수직 벽은 dx = 0이 보장된다.
     */
    private static List<Point> orientPositiveArea(List<Point> polygon) {
        double signedArea = 0.0;
        for (int index = 0; index < polygon.size(); index++) {
            Point current = polygon.get(index);
            Point next = polygon.get((index + 1) % polygon.size());
            signedArea += current.x() * next.y() - next.x() * current.y();
        }
        if (signedArea >= 0.0) {
            return polygon;
        }
        List<Point> reversed = new ArrayList<>(polygon);
        java.util.Collections.reverse(reversed);
        return reversed;
    }

    /**
     * world.step 직후 호출. 접지(걷기 가능 접촉) 여부를 반환한다.
     */
    boolean afterStep(World<Body> world, Body ball, double dt) {
        Vector2 center = ball.getWorldCenter();
        Vector2 velocity = ball.getLinearVelocity();
        double x = CoordinateMapper.toPixelsX(center.x);
        double y = CoordinateMapper.toPixelsY(center.y);
        double vx = CoordinateMapper.toPixelsX(velocity.x);
        double vy = CoordinateMapper.toPixelsY(velocity.y);

        // WIND: 밴드 내 & 비차폐면 -x 바람 가속 (모터 이전 적용 — 모터가 맞서는 구조)
        double windAcceleration = windField.accelerationAt(x, y);
        if (windAcceleration > 0) {
            vx -= windAcceleration * dt;
        }

        // WATER_PIPE: 물살 안이면 흐름 속도로 수렴하는 강한 항력 (모터로 못 버팀)
        double[] waterFlow = waterFlowField.flowVelocityAt(x, y);
        if (waterFlow != null) {
            double blend = Math.min(1.0, PhysicsConstants.WATER_DRAG * dt);
            vx += (waterFlow[0] - vx) * blend;
            vy += (waterFlow[1] - vy) * blend;
        }

        double[] walkDirection = findWalkDirection(world, ball);

        if (walkDirection != null) {
            // 오르막 중력 보상: 접선 방향 중력 성분(오르막일 때만)을 상쇄
            double gravityAlongTangent =
                    PhysicsConstants.GRAVITY * walkDirection[1];
            if (gravityAlongTangent < 0) { // 접선이 위를 향함(오르막)
                double compensation = gravityAlongTangent
                        * PhysicsConstants.UPHILL_GRAVITY_COMPENSATION * dt;
                vx -= walkDirection[0] * compensation;
                vy -= walkDirection[1] * compensation;
            }
            double tangentSpeed = vx * walkDirection[0] + vy * walkDirection[1];
            double speedDifference = PhysicsConstants.WALK_SPEED - tangentSpeed;
            double maximumChange = (speedDifference >= 0
                    ? PhysicsConstants.WALK_ACCELERATION
                    : PhysicsConstants.WALK_BRAKING) * dt;
            double speedChange = Math.max(
                    -maximumChange,
                    Math.min(maximumChange, speedDifference)
            );
            vx += walkDirection[0] * speedChange;
            vy += walkDirection[1] * speedChange;
        }

        // 팁 홉: 상승 세그먼트의 '진짜 끝'(연속 세그먼트 없음)에 접근하면
        // 소형 포물선 홉으로 꼭지를 넘긴다. 중력 보상이 1.0 미만이면 등판 속도가
        // 낮아져 끝점(지지 소멸 경계)에서 되떨어지는 진동 정지가 생기는 것 방지.
        if (vx > 0 && vy >= PhysicsConstants.JUMP_PAD_UPWARD_SPEED_THRESHOLD) {
            double contactDistance =
                    PhysicsConstants.BALL_RADIUS + PhysicsConstants.ROAD_RADIUS;
            double reach = contactDistance
                    + PhysicsConstants.STEP_UP_TRIGGER_MARGIN + 2.0;
            for (int i = 0; i < roadSegments.size(); i++) {
                if (hasContinuation[i]) {
                    continue;
                }
                SegmentPx segment = roadSegments.get(i);
                if (segment.y2() >= segment.y1()) { // 상승 세그먼트만 (+y 아래)
                    continue;
                }
                if (segment.x2() <= x) { // 끝점이 앞에 있어야
                    continue;
                }
                if (Math.hypot(x - segment.x2(), y - segment.y2()) >= reach) {
                    continue;
                }
                double lift = y - (segment.y2() - contactDistance);
                if (lift <= 0) {
                    continue;
                }
                vy = Math.min(vy, -Math.sqrt(2.0 * PhysicsConstants.GRAVITY
                        * (lift + PhysicsConstants.STEP_HOP_CLEARANCE)));
                vx = Math.max(vx, PhysicsConstants.MIN_STEP_FORWARD_SPEED);
                break;
            }
        }

        // step-up: 진행 방향(+x) 앞의 턱(ledge)이 MAX_STEP_HEIGHT 이내면
        // 자연스러운 포물선 홉으로 올라탄다 (순간이동 금지 — 튐 현상의 원인이었음).
        // 대상: 포즈 로드 + 지형 엣지 (지형의 작은 턱도 통과 — 30px 초과 벽은 차단 유지).
        // 게이트 주의: vx > -1 — 홉 상승 중 벽 접촉이 vx를 0으로 깎아도 후보가
        // 유지되는 동안 전진 하한(MIN_STEP_FORWARD_SPEED)을 계속 보장해야
        // 립(모서리)을 넘는다. vy 홉 재발동은 기존 상승 중 금지 게이트 유지.
        if (vx > -1.0) {
            double contactDistance =
                    PhysicsConstants.BALL_RADIUS + PhysicsConstants.ROAD_RADIUS;
            for (SegmentPx segment : stepSegments) {
                double dx = segment.x2() - segment.x1();
                double dy = segment.y2() - segment.y1();
                double lengthSquared = dx * dx + dy * dy;
                double projection = Math.max(0.0, Math.min(1.0,
                        ((x - segment.x1()) * dx + (y - segment.y1()) * dy)
                                / lengthSquared));
                double closestX = segment.x1() + dx * projection;
                double closestY = segment.y1() + dy * projection;
                // 양면 충돌체라 솔버가 침투를 막으므로 표면 접촉까지 포함해 판정
                if (Math.hypot(x - closestX, y - closestY)
                        >= contactDistance + PhysicsConstants.STEP_UP_TRIGGER_MARGIN) {
                    continue;
                }
                if (x > closestX + 0.01) { // 이미 지나친 세그먼트는 제외
                    continue;
                }
                // 선두 끝점, 또는 걷기 불가능한(약 81° 초과) 벽형 세그먼트만 대상.
                // 걸을 수 있는 경사는 중력 보상 걷기로 처리 — legacy처럼 45°부터
                // step-up이 발동해 "위로 툭툭 튀던" 문제를 제거.
                boolean leadingEndpoint = projection <= 0.05;
                boolean unwalkableWall = Math.abs(dx)
                        <= PhysicsConstants.WALKABLE_NORMAL_THRESHOLD
                        * Math.sqrt(lengthSquared);
                if (!leadingEndpoint && !unwalkableWall) {
                    continue;
                }
                // 벽형 홉은 세그먼트 x범위 왼쪽에서 접근할 때만.
                // 벽형 세그먼트 위쪽 끝(팁)에서 반복 발동해 수평 호버링하는 것 방지.
                if (unwalkableWall && !leadingEndpoint
                        && x > Math.min(segment.x1(), segment.x2()) + 0.01) {
                    continue;
                }
                // 접점 기준 국소 상승량: 이만큼 올라야 접점 위에 올라탈 수 있다.
                // ≤1px이면 굴러서 진입 가능한 조인트/오르막 → 홉 불필요
                // (전체 세그먼트 상단 기준으로만 판정하면 완만한 오르막 조인트에서
                //  불필요한 포물선 홉이 발동 — 실제 맵 재현으로 확인)
                double localLift = y - closestY + contactDistance;
                if (localLift <= 1.0) {
                    continue;
                }
                double roadTop =
                        Math.min(segment.y1(), segment.y2()) - contactDistance;
                double requiredLift = y - roadTop;
                // 총 등반 높이 게이트: 높은 벽을 연쇄 홉으로 오르는 것 방지
                if (requiredLift <= 1.0
                        || requiredLift > PhysicsConstants.MAX_STEP_HEIGHT) {
                    continue;
                }
                // 전진 하한은 항상 보장 (상승 중 벽이 깎은 vx 복원 — 립 통과의 핵심)
                vx = Math.max(vx, PhysicsConstants.MIN_STEP_FORWARD_SPEED);
                // 턱 위 + 여유고도에 도달하는 포물선 홉 — 이미 상승 중이면 재발동 금지
                if (vy >= PhysicsConstants.JUMP_PAD_UPWARD_SPEED_THRESHOLD) {
                    vy = Math.min(vy, -Math.sqrt(2.0 * PhysicsConstants.GRAVITY
                            * (requiredLift + PhysicsConstants.STEP_HOP_CLEARANCE)));
                }
                break;
            }
        }

        // 점프패드 (legacy applyJumpPad와 동일)
        if (vy >= PhysicsConstants.JUMP_PAD_UPWARD_SPEED_THRESHOLD) {
            for (JumpPad jumpPad : jumpPads) {
                double halfWidth = jumpPad.size().x() / 2.0;
                double halfHeight = jumpPad.size().y() / 2.0;
                double left = jumpPad.position().x() - halfWidth;
                double right = jumpPad.position().x() + halfWidth;
                double top = jumpPad.position().y() - halfHeight;

                boolean overlapsHorizontally =
                        x + PhysicsConstants.BALL_RADIUS >= left
                                && x - PhysicsConstants.BALL_RADIUS <= right;
                boolean touchesTop =
                        y + PhysicsConstants.BALL_RADIUS >= top
                                && y <= jumpPad.position().y();
                if (!overlapsHorizontally || !touchesTop) {
                    continue;
                }
                y = top - PhysicsConstants.BALL_RADIUS - 0.01;
                vx += jumpPad.launchVelocity().x();
                vy = jumpPad.launchVelocity().y();
                break;
            }
        }

        double newX = CoordinateMapper.toMetersX(x);
        double newY = CoordinateMapper.toMetersY(y);
        ball.translate(newX - center.x, newY - center.y);
        ball.setLinearVelocity(
                CoordinateMapper.toMetersX(vx),
                CoordinateMapper.toMetersY(vy)
        );
        return walkDirection != null;
    }

    /**
     * 유효 접촉 중 걷기 가능한 면의 접선 방향(+x 편향, 게임좌표)을 찾는다.
     * 없으면 null.
     *
     * <p>주의: 로드 끝단 캡 접촉을 걷기 소스에서 제외하는 최적화를 시도하지 말 것.
     * 어떤 형태든 on/off 경계는 오르막 팁에서 모터-중력 평형 트랩(제자리 진동
     * 정지)을 만든다 — 실제 맵 2건으로 검증됨. 끝단 캡 위에서도 모터가 +x로
     * 밀면 공은 꼭지를 넘어 자연스럽게 굴러떨어진다.
     */
    private double[] findWalkDirection(World<Body> world, Body ball) {
        for (ContactConstraint<Body> constraint : world.getContacts(ball)) {
            if (!constraint.isEnabled() || constraint.getContacts().isEmpty()) {
                continue;
            }
            Vector2 normal = constraint.getNormal();
            double nxMeters = normal.x;
            double nyMeters = normal.y;
            if (constraint.getBody2() == ball) { // 법선은 body1向 → toward-ball로 정규화
                nxMeters = -nxMeters;
                nyMeters = -nyMeters;
            }
            double nx = nxMeters;        // 게임좌표 변환 (y 반전)
            double ny = -nyMeters;
            if (ny < -PhysicsConstants.WALKABLE_NORMAL_THRESHOLD) {
                double tangentX = -ny;
                double tangentY = nx;
                if (tangentX < 0) {
                    tangentX = -tangentX;
                    tangentY = -tangentY;
                }
                return new double[]{tangentX, tangentY};
            }
        }
        return null;
    }
}
