package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.dyn4j.dynamics.Body;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.World;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.Point;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsConstants;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsSimulator;
import org.ssafy.bodybuilder.domain.game.physics.PoseTransformer;
import org.ssafy.bodybuilder.domain.game.physics.SimulationResult;

/**
 * dyn4j 기반 물리 엔진.
 *
 * <p>{@code game.physics.engine=dyn4j}로 활성화된다.
 * legacy와 동일한 외부 계약을 유지한다:
 * 프레임 [x,y,vx,vy] 4원소(px), intervalMs=30, 승패 판정 규칙 동일.
 *
 * <p>구현 현황:
 * <ul>
 *   <li>Phase 1 (완료): 지형 충돌 + 중력 + 프레임 샘플링</li>
 *   <li>Phase 2 (완료): 포즈 로드(양면 충돌체 — 아래→위 통과 불가) + 매몰 스폰 보정</li>
 *   <li>Phase 3 (완료): 걷기 모터, step-up, 점프패드, grounded 수집</li>
 * </ul>
 */
@Component
@ConditionalOnProperty(name = "game.physics.engine", havingValue = "dyn4j", matchIfMissing = true)
public class Dyn4jPhysicsSimulator implements PhysicsSimulator {

    private static final int FRAME_STEP = (int) Math.round(
            (FRAME_INTERVAL_MS / 1_000.0) / PhysicsConstants.PHYSICS_STEP
    );

    @Override
    public SimulationResult simulate(
            JsonNode mapConfig,
            List<List<List<Double>>> normalizedPoses
    ) {
        MapConfigParser.ParsedMapConfig map = MapConfigParser.parse(mapConfig);

        if (normalizedPoses == null
                || normalizedPoses.isEmpty()
                || map.playerCenters().size() < normalizedPoses.size()) {
            return failedAt(map.startPoint());
        }

        List<List<Point>> paths = PoseTransformer.transformAll(
                normalizedPoses,
                map.playerCenters()
        );
        if (paths.isEmpty()) {
            return failedAt(map.startPoint());
        }

        World<Body> world = WorldFactory.createWorld();
        WorldFactory.addTerrain(world, map.terrainPolygons());
        WorldFactory.addPoseRoads(world, paths);
        world.addContactListener(new RoadClimbListener());
        BallController controller = new BallController(
                paths,
                map.terrainPolygons(),
                map.jumpPads(),
                new WindField(paths, map.windZones()),
                // 물길은 스무딩 없는 원본 포즈 기준 — 화면에 그려진 로드와 일치
                // (물리 로드와 최대 ~2px 오차는 항력 폭 ±31px가 흡수)
                new WaterFlowField(
                        PoseTransformer.transformAllRaw(normalizedPoses, map.playerCenters()),
                        map.terrainPolygons(),
                        map.waterPipes())
        );

        Body ball = WorldFactory.createBall(map.startPoint());
        world.addBody(ball);

        List<List<Double>> frames = new ArrayList<>();
        List<Boolean> grounded = new ArrayList<>();
        frames.add(frame(ball)); // 첫 프레임은 startPoint 그대로 (legacy 파리티)
        grounded.add(false);

        // 이후 매몰 스폰 보정 (스폰이 로드에 겹친 경우 윗면 우선 안착)
        Point correctedSpawn = correctEmbeddedSpawn(map.startPoint(), paths);
        ball.translate(
                CoordinateMapper.toMetersX(correctedSpawn.x() - map.startPoint().x()),
                CoordinateMapper.toMetersY(correctedSpawn.y() - map.startPoint().y())
        );

        boolean success = isCleared(ball, map);
        boolean windowGrounded = false;
        int maxSteps = (int) Math.ceil(
                PhysicsConstants.MAX_PLAY_SECONDS / PhysicsConstants.PHYSICS_STEP
        );

        for (int step = 1; step <= maxSteps && !success; step++) {
            world.step(1, PhysicsConstants.PHYSICS_STEP);
            windowGrounded |= controller.afterStep(
                    world,
                    ball,
                    PhysicsConstants.PHYSICS_STEP
            );
            if (step % FRAME_STEP == 0) {
                frames.add(frame(ball));
                grounded.add(windowGrounded);
                windowGrounded = false;
            }

            success = isCleared(ball, map);
            if (isOutsideMap(ball) || touchesKillZone(ball, map.killZones())) {
                break;
            }
        }

        List<Double> lastFrame = frames.getLast();
        List<Double> currentFrame = frame(ball);
        if (!lastFrame.get(0).equals(currentFrame.get(0))
                || !lastFrame.get(1).equals(currentFrame.get(1))) {
            frames.add(currentFrame);
            grounded.add(windowGrounded);
        }
        return new SimulationResult(
                FRAME_INTERVAL_MS,
                List.copyOf(frames),
                success,
                List.copyOf(grounded)
        );
    }

    /**
     * 시작 지점이 포즈 로드에 매몰(접촉거리 17.5px 이내)된 경우
     * 로드 위쪽으로 밀어 올린다 (legacy의 단방향 위치 보정과 동일한 수식, 1회 적용).
     *
     * <p>스폰에서만 윗면을 우선한다. 시뮬레이션 중에는 로드가 양면 충돌체라
     * 아래에서 접근한 공은 통과하지 못하고 차단된다. (이동으로는 캡슐 표면에서
     * 먼저 밀려나므로 이 보정 수준의 매몰은 스폰에서만 발생한다.)
     */
    private Point correctEmbeddedSpawn(Point start, List<List<Point>> paths) {
        double contactDistance =
                PhysicsConstants.BALL_RADIUS + PhysicsConstants.ROAD_RADIUS;
        double x = start.x();
        double y = start.y();
        for (List<Point> path : paths) {
            for (int index = 1; index < path.size(); index++) {
                Point from = path.get(index - 1);
                Point to = path.get(index);
                double dx = to.x() - from.x();
                double dy = to.y() - from.y();
                double lengthSquared = dx * dx + dy * dy;
                if (lengthSquared < 0.01) {
                    continue;
                }

                double projection = Math.max(0.0, Math.min(1.0,
                        ((x - from.x()) * dx + (y - from.y()) * dy) / lengthSquared));
                double closestX = from.x() + dx * projection;
                double closestY = from.y() + dy * projection;
                double offsetX = x - closestX;
                double offsetY = y - closestY;
                double distance = Math.hypot(offsetX, offsetY);
                if (distance >= contactDistance) {
                    continue;
                }

                double nx = distance > 0.001
                        ? offsetX / distance
                        : dy / Math.sqrt(lengthSquared);
                double ny = distance > 0.001
                        ? offsetY / distance
                        : -dx / Math.sqrt(lengthSquared);
                if (ny > 0) { // 게임좌표(+y 아래)에서 법선을 항상 위쪽으로
                    nx = -nx;
                    ny = -ny;
                }
                double correction =
                        contactDistance - (offsetX * nx + offsetY * ny);
                x += nx * correction;
                y += ny * correction;
            }
        }
        return new Point(x, y);
    }

    private double ballX(Body ball) {
        return CoordinateMapper.toPixelsX(ball.getWorldCenter().x);
    }

    /**
     * 클리어 판정.
     *
     * <p>clearZone(사각형)이 있으면 공 외곽 접촉 기준(원 vs 사각형 최근접점
     * 거리 ≤ 반경 — touchesKillZone과 동일 수식)으로, 없으면 기존 규칙
     * (공.x ≥ endPoint.x)으로 판정한다. 공중 통과도 접촉 즉시 클리어.
     */
    private boolean isCleared(Body ball, MapConfigParser.ParsedMapConfig map) {
        MapConfigParser.ClearZone zone = map.clearZone();
        if (zone == null) {
            return ballX(ball) >= map.endPoint().x();
        }
        double x = CoordinateMapper.toPixelsX(ball.getWorldCenter().x);
        double y = CoordinateMapper.toPixelsY(ball.getWorldCenter().y);
        double closestX = Math.max(zone.x(), Math.min(zone.x() + zone.width(), x));
        double closestY = Math.max(zone.y(), Math.min(zone.y() + zone.height(), y));
        return Math.hypot(x - closestX, y - closestY)
                <= PhysicsConstants.BALL_RADIUS;
    }

    /**
     * KILL_ZONE 접촉 판정: 공 외곽 기준 (원 vs 사각형 최근접점 거리 ≤ 반경).
     * 접촉 시 즉시 라운드 실패 — 종료 조건이므로 isOutsideMap과 같은 층위.
     */
    private boolean touchesKillZone(
            Body ball,
            List<MapConfigParser.KillZone> killZones
    ) {
        if (killZones.isEmpty()) {
            return false;
        }
        double x = CoordinateMapper.toPixelsX(ball.getWorldCenter().x);
        double y = CoordinateMapper.toPixelsY(ball.getWorldCenter().y);
        for (MapConfigParser.KillZone zone : killZones) {
            double closestX = Math.max(zone.x(), Math.min(zone.x() + zone.width(), x));
            double closestY = Math.max(zone.y(), Math.min(zone.y() + zone.height(), y));
            if (Math.hypot(x - closestX, y - closestY)
                    <= PhysicsConstants.BALL_RADIUS) {
                return true;
            }
        }
        return false;
    }

    private boolean isOutsideMap(Body ball) {
        double x = CoordinateMapper.toPixelsX(ball.getWorldCenter().x);
        double y = CoordinateMapper.toPixelsY(ball.getWorldCenter().y);
        double margin = PhysicsConstants.BALL_RADIUS * 3.0;
        return y > PhysicsConstants.MAP_SIZE + margin
                || x > PhysicsConstants.MAP_SIZE + margin
                || x < -margin;
    }

    private SimulationResult failedAt(Point point) {
        return new SimulationResult(
                FRAME_INTERVAL_MS,
                List.of(List.of(point.x(), point.y(), 0.0, 0.0)),
                false,
                List.of(false)
        );
    }

    /** [x, y, vx, vy] px 단위 — FE 계약상 반드시 4원소. +0.0은 -0.0 정규화. */
    private List<Double> frame(Body ball) {
        Vector2 position = ball.getWorldCenter();
        Vector2 velocity = ball.getLinearVelocity();
        return List.of(
                CoordinateMapper.toPixelsX(position.x) + 0.0,
                CoordinateMapper.toPixelsY(position.y) + 0.0,
                CoordinateMapper.toPixelsX(velocity.x) + 0.0,
                CoordinateMapper.toPixelsY(velocity.y) + 0.0
        );
    }
}
