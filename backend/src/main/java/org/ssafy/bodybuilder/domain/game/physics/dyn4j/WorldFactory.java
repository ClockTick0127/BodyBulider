package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import java.util.ArrayList;
import java.util.List;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.BodyFixture;
import org.dyn4j.geometry.Capsule;
import org.dyn4j.geometry.Circle;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.MassType;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.geometry.decompose.Bayazit;
import org.dyn4j.geometry.decompose.SweepLine;
import org.dyn4j.world.World;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.Point;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsConstants;

/**
 * dyn4j World와 Body 생성 담당.
 *
 * <p>지형 폴리곤은 볼록 분해(SweepLine, 실패 시 Bayazit)해 정적 Body로 추가한다.
 * 좌표는 CoordinateMapper로 px→m(+y 위) 변환된다.
 */
final class WorldFactory {

    /** 지형 마찰(Phase 4 튜닝 대상). legacy의 지수 감쇠 0.35에 대응. */
    private static final double TERRAIN_FRICTION = 0.5;
    /** 로드 마찰(Phase 4 튜닝 대상). legacy의 지수 감쇠 1.15에 대응. */
    private static final double ROAD_FRICTION = 0.2;
    /** 공 마찰(Phase 4 튜닝 대상). */
    private static final double BALL_FRICTION = 0.1;
    private static final double FIXTURE_DENSITY = 1.0;
    private static final double NO_RESTITUTION = 0.0;

    private WorldFactory() {
    }

    static World<Body> createWorld() {
        World<Body> world = new World<>();
        world.setGravity(
                0.0,
                -PhysicsConstants.GRAVITY * CoordinateMapper.SCALE
        );
        world.getSettings().setStepFrequency(PhysicsConstants.PHYSICS_STEP);
        return world;
    }

    static void addTerrain(World<Body> world, List<List<Point>> polygons) {
        for (List<Point> polygon : polygons) {
            Body body = new Body();
            for (Convex convex : decompose(polygon)) {
                body.addFixture(
                        convex,
                        FIXTURE_DENSITY,
                        TERRAIN_FRICTION,
                        NO_RESTITUTION
                );
            }
            body.setMass(MassType.INFINITE);
            world.addBody(body);
        }
    }

    /**
     * 포즈 로드를 캡슐 체인(선분 + ROAD_RADIUS)으로 추가한다.
     * 로드는 양면 충돌체다: 위에서는 바닥, 아래에서 접근하면 차단벽으로 작동한다.
     */
    static void addPoseRoads(World<Body> world, List<List<Point>> paths) {
        double capRadius = PhysicsConstants.ROAD_RADIUS * CoordinateMapper.SCALE;
        for (List<Point> path : paths) {
            Body body = new Body();
            for (int index = 1; index < path.size(); index++) {
                Point from = path.get(index - 1);
                Point to = path.get(index);
                double dxPx = to.x() - from.x();
                double dyPx = to.y() - from.y();
                if (dxPx * dxPx + dyPx * dyPx < 0.01) { // legacy와 동일 스킵
                    continue;
                }

                double x1 = CoordinateMapper.toMetersX(from.x());
                double y1 = CoordinateMapper.toMetersY(from.y());
                double x2 = CoordinateMapper.toMetersX(to.x());
                double y2 = CoordinateMapper.toMetersY(to.y());
                double length = Math.hypot(x2 - x1, y2 - y1);

                Capsule capsule = new Capsule(length + 2 * capRadius, 2 * capRadius);
                capsule.rotate(Math.atan2(y2 - y1, x2 - x1));
                capsule.translate((x1 + x2) / 2.0, (y1 + y2) / 2.0);

                BodyFixture fixture = body.addFixture(
                        capsule,
                        FIXTURE_DENSITY,
                        ROAD_FRICTION,
                        NO_RESTITUTION
                );
                // RoadClimbListener의 등반 밴드 판정용
                fixture.setUserData(new RoadSegment(x1, y1, x2, y2));
            }
            if (body.getFixtureCount() > 0) {
                body.setMass(MassType.INFINITE);
                world.addBody(body);
            }
        }
    }

    static Body createBall(Point startPoint) {
        Body ball = new Body();
        ball.addFixture(
                new Circle(PhysicsConstants.BALL_RADIUS * CoordinateMapper.SCALE),
                FIXTURE_DENSITY,
                BALL_FRICTION,
                NO_RESTITUTION
        );
        // 회전 관성 무한대: 공은 회전하지 않는 질점으로 취급 (legacy와 동일)
        ball.setMass(MassType.FIXED_ANGULAR_VELOCITY);
        ball.translate(
                CoordinateMapper.toMetersX(startPoint.x()),
                CoordinateMapper.toMetersY(startPoint.y())
        );
        // 걷기 모터(Phase 3)가 항상 개입하므로 슬립 비활성화
        ball.setAtRestDetectionEnabled(false);
        // 고속 이동 시 지형/로드 터널링(통과) 방지를 위해 bullet(CCD) 설정
        ball.setBullet(true);
        return ball;
    }

    /**
     * px 폴리곤 → m 좌표(y 반전) 변환 후 볼록 분해.
     * y 반전으로 감기 방향이 뒤집히므로 CCW로 정규화한다.
     */
    private static List<Convex> decompose(List<Point> polygon) {
        List<Vector2> vertices = new ArrayList<>(polygon.size());
        for (Point point : polygon) {
            vertices.add(new Vector2(
                    CoordinateMapper.toMetersX(point.x()),
                    CoordinateMapper.toMetersY(point.y())
            ));
        }
        ensureCounterClockwise(vertices);

        try {
            return new SweepLine().decompose(vertices);
        } catch (RuntimeException sweepLineFailure) {
            try {
                return new Bayazit().decompose(vertices);
            } catch (RuntimeException bayazitFailure) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
        }
    }

    private static void ensureCounterClockwise(List<Vector2> vertices) {
        double signedArea = 0.0;
        for (int index = 0; index < vertices.size(); index++) {
            Vector2 current = vertices.get(index);
            Vector2 next = vertices.get((index + 1) % vertices.size());
            signedArea += current.x * next.y - next.x * current.y;
        }
        if (signedArea < 0) {
            java.util.Collections.reverse(vertices);
        }
    }
}
