package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.ssafy.bodybuilder.domain.game.physics.SimulationResult;

/**
 * legacy 행위 테스트 9종을 dyn4j 엔진 기준으로 이식.
 * 허용오차는 dyn4j linear slop(0.5px)을 감안해 재조정됨 (샌드박스 하네스로 산출).
 */
class Dyn4jPhysicsSimulatorTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Dyn4jPhysicsSimulator simulator = new Dyn4jPhysicsSimulator();

    @Test
    void precomputesFramesAtFixedIntervalAndReachesGoal() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(10, 500)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(80, 500)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(67.5, 500),
                List.of(182.5, 500),
                List.of(297.5, 500),
                List.of(412.5, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of(
                        List.of(0, 515),
                        List.of(200, 515),
                        List.of(200, 600),
                        List.of(0, 600)
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(flatPose, flatPose, flatPose, flatPose)
        );

        assertThat(result.intervalMs()).isEqualTo(30);
        assertThat(result.points()).isNotEmpty();
        assertThat(result.points()).allSatisfy(frame -> assertThat(frame).hasSize(4));
        assertThat(result.points().getFirst())
                .containsExactly(10.0, 500.0, 0.0, 0.0);
        assertThat(result.points().get(1).get(2))
                .isGreaterThan(0.0)
                .isLessThan(190.0);
        assertThat(result.points().getLast().get(0))
                .isGreaterThan(result.points().getFirst().get(0));
        assertThat(result.result()).isTrue();
        // grounded 불변식: points와 같은 크기, 걷는 동안 true 존재
        assertThat(result.grounded()).hasSameSizeAs(result.points());
        assertThat(result.grounded()).contains(true);
    }

    @Test
    void keepsBallOnTerrainInsteadOfFallingThroughIt() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 500)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(500, 500)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(500, 100)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of(
                        List.of(0, 515),
                        List.of(600, 515),
                        List.of(600, 1_000),
                        List.of(0, 1_000)
                )
        )));
        List<List<Double>> poseAwayFromBall = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(poseAwayFromBall)
        );

        assertThat(result.result()).isTrue();
        // dyn4j linear slop만큼 침투 허용 (legacy 502.01 → 503.01)
        assertThat(result.points())
                .allSatisfy(frame ->
                        assertThat(frame.get(1)).isLessThanOrEqualTo(503.01));
    }

    @Test
    void launchesBallUpwardWhenItTouchesJumpPad() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 802.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(300, 500)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 820)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of(
                        "type", "JUMP_PAD",
                        "position", List.of(200, 820),
                        "size", List.of(80, 20),
                        "launchVelocity", List.of(0, -360)
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(flatPose)
        );

        assertThat(result.points())
                .anySatisfy(frame -> assertThat(frame.get(3))
                        .isLessThan(-300.0));
        assertThat(result.points())
                .anySatisfy(frame -> assertThat(frame.get(1))
                        .isLessThan(750.0));
    }

    @Test
    void blocksBallFromPassingThroughRoadFromBelow() {
        // 점프패드로 도로(y=500) 아래에서 위로 발사해도 도로를 통과할 수 없다.
        // 공 중심은 항상 도로 축 - 접촉거리(517.5) 근처 아래에 머문다 (slop 여유 516.0).
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 600)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(900, 500)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(100, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of(
                        "type", "JUMP_PAD",
                        "position", List.of(100, 700),
                        "size", List.of(120, 20),
                        "launchVelocity", List.of(0, -700)
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(flatPose)
        );

        assertThat(result.result()).isFalse();
        assertThat(result.points())
                .allSatisfy(frame ->
                        assertThat(frame.get(1)).isGreaterThanOrEqualTo(516.0));
        // 실제로 도로 근처까지 도달했는지(발사가 유효했는지) 확인
        assertThat(result.points())
                .anySatisfy(frame -> assertThat(frame.get(1)).isLessThan(560.0));
    }

    @Test
    void pushesBallAbovePoseRoadWhenEmbeddedBelowSurface() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 510)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(150, 500)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(100, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(flatPose)
        );

        assertThat(result.result()).isTrue();
        assertThat(result.points()).hasSizeGreaterThan(1);
        // 스폰 보정으로 로드 위(482.5±slop)로 복원 (legacy 482.51 → 483.01)
        assertThat(result.points().get(1).get(1))
                .isLessThanOrEqualTo(483.01);
    }

    @Test
    void blocksBallAtTerrainWall() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 200)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(500, 200)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(500, 50)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of(
                        List.of(300, 0),
                        List.of(350, 0),
                        List.of(350, 1_000),
                        List.of(300, 1_000)
                )
        )));
        List<List<Double>> poseAwayFromBall = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(poseAwayFromBall)
        );

        assertThat(result.result()).isFalse();
        assertThat(result.points())
                .allSatisfy(frame ->
                        assertThat(frame.get(0)).isLessThanOrEqualTo(287.51));
    }

    @Test
    void returnsFailureFrameWhenNoPlayablePoseExists() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(90, 870)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(870, 120)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(170, 760),
                List.of(360, 610),
                List.of(580, 420),
                List.of(760, 260)
        )));

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(List.of(), List.of(), List.of(), List.of())
        );

        assertThat(result.result()).isFalse();
        assertThat(result.points()).containsExactly(List.of(90.0, 870.0, 0.0, 0.0));
        assertThat(result.grounded()).containsExactly(false);
    }

    @Test
    void simulatesWithRemainingPosesWhenOneCaptureIsMissing() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(10, 500)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(80, 500)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(67.5, 500),
                List.of(182.5, 500),
                List.of(297.5, 500),
                List.of(412.5, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of(
                        List.of(0, 515),
                        List.of(200, 515),
                        List.of(200, 600),
                        List.of(0, 600)
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(List.of(), flatPose, flatPose, flatPose)
        );

        assertThat(result.points()).hasSizeGreaterThan(1);
        assertThat(result.points().getLast().get(0))
                .isGreaterThan(result.points().getFirst().get(0));
    }

    @Test
    void climbsSmallLedgesBetweenAdjacentPoseRoads() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(80, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(880, 422.5)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(170, 500),
                List.of(380, 480),
                List.of(590, 460),
                List.of(800, 440)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(flatPose, flatPose, flatPose, flatPose)
        );

        assertThat(result.result()).isTrue();
        assertThat(result.points().getLast().get(0))
                .isGreaterThanOrEqualTo(880.0);
    }

    @Test
    void doesNotClimbLedgesHigherThanStepLimit() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(80, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(880, 302.5)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(170, 500),
                List.of(380, 440),
                List.of(590, 380),
                List.of(800, 320)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(flatPose, flatPose, flatPose, flatPose)
        );

        assertThat(result.result()).isFalse();
    }

    @Test
    void windPushesExposedBallBackward() {
        // 평지 로드 위, 밴드가 로드 높이를 덮고 상류(+x)에 차폐물 없음 → 역밀림으로 실패
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(900, 480)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of("type", "WIND", "band", List.of(400, 520), "strength", 700)
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        assertThat(result.result()).isFalse();
        // 역밀림: 시작점보다 왼쪽으로 밀려난 프레임이 존재
        assertThat(result.points())
                .anySatisfy(frame -> assertThat(frame.get(0)).isLessThan(95.0));
    }

    @Test
    void poseRoadShieldsBallFromWind() {
        // 같은 지형이지만 밴드가 공 높이 위(공은 밴드 밖) → 무영향으로 전진
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(300, 480)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of("type", "WIND", "band", List.of(100, 300), "strength", 700)
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        assertThat(result.result()).isTrue();
    }

    @Test
    void windShadowBehindUpstreamRoadAllowsProgress() {
        // 상류(+x)에 세로에 가까운 로드(차폐물)가 있으면 그 그늘에서 전진 가능.
        // P1: 걷는 평지 로드, P2: 오른쪽의 가파른 차폐 로드 (밴드 높이를 가로지름)
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(280, 480)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500),
                List.of(400, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of("type", "WIND", "band", List.of(400, 520), "strength", 700)
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );
        List<List<Double>> shieldPose = List.of( // 세로로 선 포즈 (차폐벽)
                List.of(0.5, 0.0),
                List.of(0.5, 1.0)
        );

        SimulationResult result = simulator.simulate(
                mapConfig,
                List.of(flatPose, shieldPose)
        );

        assertThat(result.result()).isTrue();
    }

    @Test
    void killZoneEndsRoundOnContact() {
        // 평지 로드 진행 경로를 킬존이 가로막음 → 접촉 즉시 실패, 진행 중단
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(300, 480)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of("type", "KILL_ZONE", "area", List.of(220, 400, 60, 120))
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        assertThat(result.result()).isFalse();
        // 외곽 접촉(반경 13) 시점에 정지: 구역 왼쪽 경계(220) - 반경 부근
        double lastX = result.points().getLast().get(0);
        assertThat(lastX).isBetween(190.0, 221.0);
    }

    @Test
    void ballClearsWhenKillZoneNotTouched() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(300, 480)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of("type", "KILL_ZONE", "area", List.of(0, 0, 1000, 40))
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        assertThat(result.result()).isTrue();
    }

    @Test
    void killZoneGrazingContactCountsBallRadius() {
        // 구역 하단이 굴러가는 공 중심보다 12.5px 위 — 중심은 안 닿지만 외곽이 스침 → 사망
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(300, 480)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of("type", "KILL_ZONE", "area", List.of(220, 300, 60, 170))
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        assertThat(result.result()).isFalse();
    }

    @Test
    void waterColumnBlocksForwardProgress() {
        // 평지 로드 위로 떨어지는 물기둥: 공이 짓눌려(항력+마찰) 통과 불가 → 실패
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(300, 480)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of(
                        "type", "WATER_PIPE",
                        "outlet", List.of(200, 300),
                        "flowDirection", List.of(0, 1),
                        "flowSpeed", 300
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        assertThat(result.result()).isFalse();
        // 물기둥(중심 200, 도달폭 ±31) 앞에서 저지됨
        assertThat(result.points().getLast().get(0)).isLessThan(260.0);
    }

    @Test
    void ballClearsWhenWaterPipeIsFarAway() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(300, 480)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of(
                        "type", "WATER_PIPE",
                        "outlet", List.of(900, 100),
                        "flowDirection", List.of(0, 1),
                        "flowSpeed", 300,
                        "inlet", List.of(880, 80),
                        "shutdownOnBlocked", true
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        // deprecated 필드(inlet/shutdownOnBlocked)가 있어도 파싱·시뮬 정상
        assertThat(result.result()).isTrue();
    }

    @Test
    void waterFlowingAlongBridgeSweepsClimbingBallBack() {
        // 오르막 다리에 떨어진 물이 내리막(왼쪽)으로 다리를 타고 흐름 → 등반 공이 휩쓸려 실패
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(150, 535.8)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(350, 300)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(250, 475)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of()));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of(
                        "type", "WATER_PIPE",
                        "outlet", List.of(250, 200),
                        "flowDirection", List.of(0, 1),
                        "flowSpeed", 300
                )
        )));
        List<List<Double>> ascendingPose = List.of( // (135,565) → (365,385) 오르막 로드
                List.of(0.0, 1.0),
                List.of(1.0, 0.0)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(ascendingPose));

        assertThat(result.result()).isFalse();
    }

    @Test
    void waterFlowsAlongTerrainSurfaceAndSweepsBall() {
        // 경사 지형 상판에 떨어진 물이 지형을 타고 내리막(왼쪽)으로 흐름
        // → 상판을 오르던 공이 휩쓸려 실패. (물 없으면 동일 지형 클리어 가능 — 하네스 검증)
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(320, 574.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(490, 500)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(500, 100) // 공과 무관한 위치의 더미 포즈 (포즈 필수 조건 충족용)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of(
                        List.of(300, 600),
                        List.of(500, 520),
                        List.of(500, 1_000),
                        List.of(300, 1_000)
                )
        )));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of(
                        "type", "WATER_PIPE",
                        "outlet", List.of(400, 300),
                        "flowDirection", List.of(0, 1),
                        "flowSpeed", 300
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        assertThat(result.result()).isFalse();
    }

    @Test
    void hopsOverSmallTerrainLip() {
        // 로드→지형 전환부의 작은 턱(20px)은 홉으로 통과 (실맵 QA: 골 지형 선반 진입)
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(450, 470)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of(
                        List.of(280, 480),
                        List.of(500, 480),
                        List.of(500, 520),
                        List.of(280, 520)
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        assertThat(result.result()).isTrue();
    }

    @Test
    void doesNotHopOverTallTerrainLip() {
        // 40px 지형 턱은 MAX_STEP_HEIGHT(30) 초과 — 여전히 차단 (벽 맵 설계 보존)
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(100, 482.5)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(450, 450)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(200, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of(
                        List.of(280, 460),
                        List.of(500, 460),
                        List.of(500, 520),
                        List.of(280, 520)
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );

        SimulationResult result = simulator.simulate(mapConfig, List.of(flatPose));

        assertThat(result.result()).isFalse();
    }

    @Test
    void fallsPastHangingWallBottomTipInsteadOfClingingToIt() {
        // 실맵 재현: 점프패드로 날아간 공이 매달린 벽(밑면이 공중에 뜬 지형)의
        // 측면에 부딪혀 미끄러져 내려올 때, 벽 하단 끝을 지나면 그대로 떨어져
        // 아래 골 지형 선반에 착지해야 한다. 밑면(천장) 엣지가 step-up 대상에
        // 포함되면 하단 끝점이 "30px 이내 턱"으로 오인돼 홉이 반복 발동,
        // 공이 벽 하단에 매달려 영원히 진동하는 버그가 있었다.
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(38.5, 826)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(986.1, 288.9)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(165.8, 797.1),
                List.of(300.7, 797.1),
                List.of(587.1, 129.9),
                List.of(707.7, 280.4)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of( // 시작 발판
                        List.of(0, 840.2),
                        List.of(81.2, 840.2),
                        List.of(81.2, 1_000),
                        List.of(0, 1_000)
                ),
                List.of( // 골 기둥 (윗면 y=320)
                        List.of(825, 320),
                        List.of(995, 320),
                        List.of(995, 1_000),
                        List.of(825, 1_000)
                ),
                List.of( // 매달린 벽 (하단 끝 y=247 — 골 기둥과 73px 틈)
                        List.of(832, 40),
                        List.of(832, 247),
                        List.of(862, 247),
                        List.of(862, 40)
                )
        )));
        mapConfig.set("gimmicks", objectMapper.valueToTree(List.of(
                Map.of(
                        "type", "JUMP_PAD",
                        "position", List.of(495.3, 859.3),
                        "size", List.of(130, 45),
                        "launchVelocity", List.of(-10, -1_400)
                ),
                Map.of(
                        "type", "KILL_ZONE",
                        "area", List.of(0, 0, 1_000, 40)
                )
        )));
        List<List<List<Double>>> bridges = List.of(
                List.of(
                        List.of(0.018557460194053237, 0.8336551064064085),
                        List.of(1.0, 0.763365725023254)
                ),
                List.of(
                        List.of(0.20216285621818042, 0.8512274517521974),
                        List.of(0.6926604958701932, 0.734078482780273),
                        List.of(1.0, 0.6520742044999263)
                ),
                List.of(
                        List.of(0.043374816292589456, 0.9145611833920245),
                        List.of(0.6759792487409794, 0.49282489509309785),
                        List.of(1.0, 0.2233822664576724)
                ),
                List.of(
                        List.of(0.202056413646286, 0.9863545818133252),
                        List.of(0.25248140463854873, 0.6759098140377264),
                        List.of(0.7567313145611785, 0.5411884997200139),
                        List.of(1.0, 0.7169119531778999)
                )
        );

        SimulationResult result = simulator.simulate(mapConfig, bridges);

        assertThat(result.result()).isTrue();
        // 벽 하단 매달림이 재발하면 15초 타임아웃까지 진동 — 클리어 시간으로도 방어
        assertThat(result.points().size() * 30 / 1_000.0).isLessThan(10.0);
    }

    @Test
    void producesDeterministicResultsForIdenticalInput() {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(10, 500)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(80, 500)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(67.5, 500),
                List.of(182.5, 500),
                List.of(297.5, 500),
                List.of(412.5, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of(
                        List.of(0, 515),
                        List.of(200, 515),
                        List.of(200, 600),
                        List.of(0, 600)
                )
        )));
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );
        List<List<List<Double>>> poses =
                List.of(flatPose, flatPose, flatPose, flatPose);

        SimulationResult first = simulator.simulate(mapConfig, poses);
        SimulationResult second = simulator.simulate(mapConfig, poses);

        assertThat(first.points()).isEqualTo(second.points());
        assertThat(first.grounded()).isEqualTo(second.grounded());
        assertThat(first.result()).isEqualTo(second.result());
    }

    // ── clearZone (사각형 클리어 구역) ──────────────────────────────

    @Test
    void clearZoneClearsOnContactEvenWhenEndPointFarAway() {
        // endPoint.x=900은 도달 불가 — 클리어되면 clearZone 접촉 판정이 동작한 것.
        var mapConfig = clearZoneBaseMap(900);
        mapConfig.set("clearZone", objectMapper.valueToTree(List.of(150, 400, 60, 150)));

        SimulationResult result = simulator.simulate(mapConfig, flatPoses());

        assertThat(result.result()).isTrue();
        assertThat(result.points().getLast().get(0)).isLessThan(900.0);
    }

    @Test
    void clearZonePresentDisablesEndPointXRule() {
        // 기존 규칙이면 x=80 통과 시 클리어. clearZone이 있으면 존 접촉만 인정 —
        // 존을 공이 닿을 수 없는 높은 곳에 두면 실패해야 한다.
        var mapConfig = clearZoneBaseMap(80);
        mapConfig.set("clearZone", objectMapper.valueToTree(List.of(100, 100, 60, 60)));

        SimulationResult result = simulator.simulate(mapConfig, flatPoses());

        assertThat(result.result()).isFalse();
        assertThat(result.points().getLast().get(0)).isGreaterThan(80.0);
    }

    @Test
    void spawnInsideClearZoneClearsImmediately() {
        var mapConfig = clearZoneBaseMap(900);
        mapConfig.set("clearZone", objectMapper.valueToTree(List.of(0, 400, 80, 200)));

        SimulationResult result = simulator.simulate(mapConfig, flatPoses());

        assertThat(result.result()).isTrue();
        // 시작 프레임(+스폰 보정 프레임)만 존재 — 시뮬레이션 루프 미진입.
        assertThat(result.points()).hasSizeLessThanOrEqualTo(2);
    }

    @Test
    void missingClearZoneFallsBackToEndPointXRule() {
        var mapConfig = clearZoneBaseMap(80);

        SimulationResult result = simulator.simulate(mapConfig, flatPoses());

        assertThat(result.result()).isTrue();
    }

    /** 평지 지형(0~200, y=515) + 수평 포즈 4인 기본 맵. endPoint.x만 바꿔 쓴다. */
    private com.fasterxml.jackson.databind.node.ObjectNode clearZoneBaseMap(double endX) {
        var mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", objectMapper.valueToTree(List.of(10, 500)));
        mapConfig.set("endPoint", objectMapper.valueToTree(List.of(endX, 500)));
        mapConfig.set("players", objectMapper.valueToTree(List.of(
                List.of(67.5, 500),
                List.of(182.5, 500),
                List.of(297.5, 500),
                List.of(412.5, 500)
        )));
        mapConfig.set("terrain", objectMapper.valueToTree(List.of(
                List.of(
                        List.of(0, 515),
                        List.of(200, 515),
                        List.of(200, 600),
                        List.of(0, 600)
                )
        )));
        return mapConfig;
    }

    private List<List<List<Double>>> flatPoses() {
        List<List<Double>> flatPose = List.of(
                List.of(0.0, 0.5),
                List.of(1.0, 0.5)
        );
        return List.of(flatPose, flatPose, flatPose, flatPose);
    }
}
