package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.Point;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.WaterPipe;
import org.ssafy.bodybuilder.domain.game.physics.PoseTransformer;

/**
 * 물길 재설계(포즈 유니온 + pour point) 검증 — 개발명세서_BE_물기믹_유니온물길 BE-WATER-06.
 */
class WaterFlowFieldTest {

    private static final List<List<Point>> FLOOR = List.of(polygon(
            0, 925, 1000, 924, 1000, 1000, 0, 1000
    ));

    private static WaterPipe verticalPipe(double x, double y) {
        return new WaterPipe(new Point(x, y), new Point(0, 1), 180.0, 36.0);
    }

    private static List<Point> polygon(double... xy) {
        List<Point> points = new ArrayList<>();
        for (int i = 0; i < xy.length; i += 2) {
            points.add(new Point(xy[i], xy[i + 1]));
        }
        return points;
    }

    private static List<Point> path(double... xy) {
        return polygon(xy);
    }

    private static double totalLength(List<WaterFlowField.FlowSegment> segments) {
        return segments.stream()
                .mapToDouble(s -> Math.hypot(s.x2() - s.x1(), s.y2() - s.y1()))
                .sum();
    }

    // ------------------------------------------------------------------
    // 1. U자 턱 비교 — 낮은 턱으로 넘침 (대칭 케이스)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("U자: 좌턱이 낮으면(화면 y 큼) 좌측으로 넘친다")
    void spillsOverLowerLeftRim() {
        // 좌끝 y=300(낮음), 저점 (200,400), 우끝 y=280(높음)
        List<List<Point>> paths = List.of(path(100, 300, 200, 400, 300, 280));
        WaterFlowField field = new WaterFlowField(
                paths, FLOOR, List.of(verticalPipe(200, 100)));

        List<WaterFlowField.FlowSegment> segments = field.flowSegments();
        assertThat(segments).isNotEmpty();
        // 물은 좌측 팔 끝을 넘어 좌측(x < 120)에서 바닥까지 수직 낙하해야 한다.
        // (착지 후 바닥 흐름의 마지막 세그먼트는 항상 x=0으로 가므로 낙하 세그먼트로 판정)
        assertThat(floorLandingX(segments)).isLessThan(120.0);
    }

    @Test
    @DisplayName("U자: 우턱이 낮으면 우측으로 넘친다 (대칭)")
    void spillsOverLowerRightRim() {
        List<List<Point>> paths = List.of(path(100, 280, 200, 400, 300, 300));
        WaterFlowField field = new WaterFlowField(
                paths, FLOOR, List.of(verticalPipe(200, 100)));

        assertThat(floorLandingX(field.flowSegments())).isGreaterThan(280.0);
    }

    /** 바닥(y>900)에 닿는 수직 낙하 세그먼트의 x. 없으면 실패. */
    private static double floorLandingX(List<WaterFlowField.FlowSegment> segments) {
        return segments.stream()
                .filter(s -> Math.abs(s.x1() - s.x2()) < 0.01 && s.y2() > 900.0)
                .mapToDouble(WaterFlowField.FlowSegment::x2)
                .findFirst()
                .orElseThrow(() -> new AssertionError("바닥 착지 낙하 세그먼트 없음"));
    }

    // ------------------------------------------------------------------
    // 2. 겹친 팔 — 교차점 아래로 새지 않음
    // ------------------------------------------------------------------

    @Test
    @DisplayName("교차한 두 팔 위에서 물이 교차점을 관통해 새지 않는다")
    void doesNotLeakThroughCrossingArms() {
        // X자 교차 (교차점 근처 200,300). 위 V홈에 물을 부으면 union이 교차를
        // 병합하므로 물은 홈에 고였다가 낮은 턱으로 넘쳐야 하고, 교차점 아래로
        // 수직 관통(구 버그)하면 안 된다.
        List<List<Point>> paths = List.of(
                path(100, 200, 300, 400),
                path(100, 400, 300, 210)
        );
        WaterFlowField field = new WaterFlowField(
                paths, FLOOR, List.of(verticalPipe(200, 100)));

        // 교차점 바로 아래(도형 내부)를 지나는 수직 낙하 세그먼트가 없어야 한다
        boolean leakThroughCrossing = field.flowSegments().stream()
                .anyMatch(s -> Math.abs(s.x1() - s.x2()) < 0.01     // 수직 세그먼트
                        && Math.abs(s.x1() - 200) < 8               // 교차점 x 부근
                        && s.y1() > 290 && s.y1() < 320             // 교차점에서 시작해
                        && s.y2() > 400);                           // 도형 아래까지 관통
        assertThat(leakThroughCrossing).isFalse();
    }

    // ------------------------------------------------------------------
    // 3. 2026-08-07 재현 데이터 회귀
    // ------------------------------------------------------------------

    private static List<List<Point>> reproductionPaths() {
        double[][][] bridges = {
                {{0.10238666455027103, 0.5505075752870722}, {0.13164795749729355, 0.8472793300504146},
                 {0.3204826591398866, 0.7038957624982466}, {0.6802533640979094, 0.6853991897515835},
                 {0.943339530059528, 0.752872436621165}, {0.9289831174911056, 0.38243848534717095}},
                {{0.17051687347305405, 1}, {0.21109330764254933, 0.999918088723998},
                 {0.2941731572514757, 0.7831810890277744}, {0.6516835716679594, 0.6687722296540479},
                 {0.9073194963455573, 0.6494042898462487}, {0.7967899691253068, 0.2504176151974108}},
                {{0.010132735155354022, 1}, {0.20051497939089524, 0.9426342503572714},
                 {0.339441944543886, 0.7372439291490276}, {0.6940094634676912, 0.7102101150027565},
                 {0.901501351831729, 0.8777077721660634}, {0.9972590161576438, 0.5876089524770647}},
                {{0.3919468333704901, 0.6807509109329762}, {0.2695766684026701, 0.9922351736501294},
                 {0.37641341534881123, 0.7260856626046182}, {0.6784983297314847, 0.7215688517047976},
                 {0.7974987449154584, 0.9740804668830411}, {0.6561755194878168, 0.6174682500181101}},
        };
        double[][] centers = {{670, 430}, {500, 465}, {330, 500}, {160, 535}};

        List<List<List<Double>>> normalized = new ArrayList<>();
        List<Point> playerCenters = new ArrayList<>();
        for (int p = 0; p < 4; p++) {
            List<List<Double>> pose = new ArrayList<>();
            for (double[] point : bridges[p]) {
                pose.add(List.of(point[0], point[1]));
            }
            normalized.add(pose);
            playerCenters.add(new Point(centers[p][0], centers[p][1]));
        }
        return PoseTransformer.transformAllRaw(normalized, playerCenters);
    }

    private static List<List<Point>> reproductionTerrain() {
        return List.of(
                polygon(0, 105, 640, 105, 700, 170, 655, 225, 610, 175, 0, 175),
                polygon(0, 925, 1000, 924, 1000, 1000, 0, 1000)
        );
    }

    @Test
    @DisplayName("재현 데이터: U자 안 물이 팔을 관통 누수하지 않고 좌측 팔 계단으로 넘친다")
    void reproductionScenarioRegression() {
        WaterFlowField field = new WaterFlowField(
                reproductionPaths(),
                reproductionTerrain(),
                List.of(verticalPipe(681.3, 194)));

        List<WaterFlowField.FlowSegment> segments = field.flowSegments();
        assertThat(segments).isNotEmpty();

        // (a) 구 버그의 누수 물기둥: x≈594에서 y 500→924 수직 관통 — 없어야 한다
        boolean ghostColumn = segments.stream()
                .anyMatch(s -> Math.abs(s.x1() - s.x2()) < 0.01
                        && s.x1() > 585 && s.x1() < 600
                        && s.y1() < 520 && s.y2() > 900);
        assertThat(ghostColumn).isFalse();

        // (b) 물은 좌측 팔 계단을 타고 내려가 좌측 영역(x < 200)에서 바닥에 착지
        //     (기준 구현 근사: x≈102.7 — JTS/shapely 버퍼 좌표 차이를 감안해 느슨하게)
        boolean landsLeft = segments.stream()
                .anyMatch(s -> Math.abs(s.x1() - s.x2()) < 0.01
                        && s.x1() < 200
                        && s.y2() > 900);
        assertThat(landsLeft).isTrue();

        // (c) 스필 지점: 좌측 턱(기준 구현 (566.8, 415.8)) 부근을 물길이 지난다
        boolean passesLeftRim = segments.stream()
                .anyMatch(s -> Math.hypot(s.x2() - 566.8, s.y2() - 415.8) < 8.0
                        || Math.hypot(s.x1() - 566.8, s.y1() - 415.8) < 8.0);
        assertThat(passesLeftRim).isTrue();
    }

    // ------------------------------------------------------------------
    // 4. 비수직 flowDirection (수직 엣지 교차 포함)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("수평 분사 파이프가 수직 벽 엣지에 착지한다")
    void horizontalFlowDirectionHitsVerticalWall() {
        List<List<Point>> wall = List.of(polygon(500, 50, 520, 50, 520, 600, 500, 600));
        WaterPipe pipe = new WaterPipe(new Point(100, 100), new Point(1, 0), 180.0, 36.0);
        WaterFlowField field = new WaterFlowField(List.of(), wall, List.of(pipe));

        List<WaterFlowField.FlowSegment> segments = field.flowSegments();
        assertThat(segments).isNotEmpty();
        WaterFlowField.FlowSegment first = segments.getFirst();
        assertThat(first.y1()).isCloseTo(100.0, org.assertj.core.data.Offset.offset(0.01));
        assertThat(first.x2()).isCloseTo(500.0, org.assertj.core.data.Offset.offset(1.0));
        assertThat(first.flowVx()).isGreaterThan(0.0); // 흐름 방향 = +x
    }

    // ------------------------------------------------------------------
    // 5. 포즈 0개 — 지형만으로 물길 생성
    // ------------------------------------------------------------------

    @Test
    @DisplayName("포즈가 없어도 outlet→지형 낙하 물길이 존재한다")
    void terrainOnlyFlow() {
        WaterFlowField field = new WaterFlowField(
                List.of(), FLOOR, List.of(verticalPipe(300, 100)));

        List<WaterFlowField.FlowSegment> segments = field.flowSegments();
        assertThat(segments).isNotEmpty();
        WaterFlowField.FlowSegment first = segments.getFirst();
        assertThat(first.x1()).isEqualTo(300.0);
        assertThat(first.y2()).isGreaterThan(900.0); // 바닥 상면 착지
    }

    // ------------------------------------------------------------------
    // 6. outlet이 union 내부 — 물길 생략
    // ------------------------------------------------------------------

    @Test
    @DisplayName("outlet이 지형 내부에 매몰되면 해당 파이프 물길을 생략한다")
    void skipsPipeWhenOutletBuried() {
        List<List<Point>> block = List.of(polygon(200, 200, 400, 200, 400, 400, 200, 400));
        WaterFlowField field = new WaterFlowField(
                List.of(), block, List.of(verticalPipe(300, 300)));
        assertThat(field.flowSegments()).isEmpty();
    }

    // ------------------------------------------------------------------
    // 7. 결정성 + 한도
    // ------------------------------------------------------------------

    @Test
    @DisplayName("동일 입력 2회 → flowSegments 완전 일치 (리플레이 계약)")
    void deterministic() {
        WaterFlowField first = new WaterFlowField(
                reproductionPaths(), reproductionTerrain(),
                List.of(verticalPipe(681.3, 194)));
        WaterFlowField second = new WaterFlowField(
                reproductionPaths(), reproductionTerrain(),
                List.of(verticalPipe(681.3, 194)));
        assertThat(first.flowSegments()).isEqualTo(second.flowSegments());
    }

    @Test
    @DisplayName("물길 총 길이 ≤ 3,000px (무한루프 가드)")
    void respectsTotalLengthLimit() {
        WaterFlowField field = new WaterFlowField(
                reproductionPaths(), reproductionTerrain(),
                List.of(verticalPipe(681.3, 194)));
        assertThat(totalLength(field.flowSegments())).isLessThanOrEqualTo(3_000.0);
    }

    // ------------------------------------------------------------------
    // 8. 스필 구간 표면 밀착 (chord 항력 버그 방지 — 명세 §2-B ⑤)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("저점→턱 스필 세그먼트가 웅덩이 내부 허공을 가로지르지 않는다")
    void spillFollowsContourNotChord() {
        // 단순 U에서 저점(200,400)→좌턱(100,300)을 직선으로 이으면 웅덩이 내부를
        // 가로지른다. contour 추종이면 모든 세그먼트가 팔 표면(선분까지 거리
        // ≤ ROAD_RADIUS+ε) 위에 있다.
        List<Point> arm = path(100, 300, 200, 400, 300, 280);
        WaterFlowField field = new WaterFlowField(
                List.of(arm), FLOOR, List.of(verticalPipe(200, 100)));

        for (WaterFlowField.FlowSegment s : field.flowSegments()) {
            if (Math.abs(s.x1() - s.x2()) < 0.01) {
                continue; // 수직 낙하 구간은 표면 위가 아님
            }
            double midX = (s.x1() + s.x2()) / 2.0;
            double midY = (s.y1() + s.y2()) / 2.0;
            if (midY > 500) {
                continue; // 바닥 지형 위 흐름
            }
            double distance = distanceToPolyline(midX, midY, arm);
            assertThat(distance)
                    .as("스필/흐름 세그먼트 중점 (%f, %f)이 팔 표면에서 벗어남", midX, midY)
                    .isLessThanOrEqualTo(4.5 + 1.5);
        }
    }

    private static double distanceToPolyline(double x, double y, List<Point> polyline) {
        double best = Double.POSITIVE_INFINITY;
        for (int i = 1; i < polyline.size(); i++) {
            Point a = polyline.get(i - 1);
            Point b = polyline.get(i);
            double dx = b.x() - a.x();
            double dy = b.y() - a.y();
            double lengthSquared = dx * dx + dy * dy;
            double t = lengthSquared < 1e-12 ? 0
                    : Math.max(0, Math.min(1,
                            ((x - a.x()) * dx + (y - a.y()) * dy) / lengthSquared));
            best = Math.min(best,
                    Math.hypot(x - (a.x() + dx * t), y - (a.y() + dy * t)));
        }
        return best;
    }

    // ------------------------------------------------------------------
    // 9. WaterFlowPreview 파사드 — 페이로드 계약 (명세 §3)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("파사드: 행 길이 5, WATER_PIPE 없으면 빈 배열, null 포즈 엔트리 허용")
    void previewFacadeContract() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode withPipe = mapper.readTree("""
                {
                  "startPoint": [100, 900], "endPoint": [885, 850],
                  "players": [[670, 430], [500, 465], [330, 500], [160, 535]],
                  "terrain": [[[0, 925], [1000, 924], [1000, 1000], [0, 1000]]],
                  "gimmicks": [{"type": "WATER_PIPE", "outlet": [681.3, 194],
                                "flowSpeed": 180, "flowDirection": [0, 1]}]
                }
                """);
        List<List<List<Double>>> poses = Arrays.asList(
                List.of(List.of(0.1, 0.5), List.of(0.9, 0.5)),
                null, null, null);
        List<List<Double>> rows = WaterFlowPreview.of(withPipe).compute(poses);
        assertThat(rows).isNotEmpty();
        assertThat(rows).allSatisfy(row -> assertThat(row).hasSize(5));

        JsonNode withoutPipe = mapper.readTree("""
                {
                  "startPoint": [100, 900], "endPoint": [885, 850],
                  "players": [[670, 430]],
                  "terrain": [[[0, 925], [1000, 924], [1000, 1000], [0, 1000]]]
                }
                """);
        assertThat(WaterFlowPreview.of(withoutPipe).compute(null)).isEmpty();
    }
}
