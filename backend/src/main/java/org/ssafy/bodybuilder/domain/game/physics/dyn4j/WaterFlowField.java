package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import java.util.ArrayList;
import java.util.List;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.Point;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.WaterPipe;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsConstants;
import org.ssafy.bodybuilder.domain.game.physics.dyn4j.PoseUnionContour.Ring;

/**
 * WATER_PIPE 기믹: 물길 계산과 물살 항력 조회.
 *
 * <p>개발명세서_BE_물기믹_유니온물길 §2 — 포즈 유니온 contour + pour point.
 * 포즈·지형을 두께 부여 후 하나의 다각형으로 union하고({@link PoseUnionContour}),
 * 그 외곽선 위에서 물길을 걷는다:
 * outlet → flowDirection 레이 착지 → 내리막 걷기 → 저점에서 양방향 턱(rim) 비교
 * → 낮은 턱으로 넘침(contour 추종) → 밑면(underside)에서 수직 재낙하 반복.
 *
 * <p>구 구현의 JOINT_TOLERANCE 끝점 연결·v4/v7 방향 휴리스틱은 폐기됐다 —
 * 교차·겹침은 union이 기하적으로 병합하고, 넘침은 턱 높이 비교로 결정한다.
 *
 * <p>모든 계산은 게임좌표 px 도메인 (+y 아래). 포즈·지형은 라운드 중 불변이므로
 * 물길은 생성 시 1회 정적 계산한다. JTS 연산은 결정적 — 리플레이 계약 유지.
 */
final class WaterFlowField {

    /** 물길 최대 낙하 홉 수 (재현 데이터에서 5회 소요 — 여유 포함 12). */
    private static final int MAX_HOPS = 12;
    /** 물길 총 길이 한도 (px). 실질 무한루프 가드. */
    private static final double MAX_TOTAL_LENGTH = 3_000.0;
    private static final double EPSILON = 0.01;
    /** 밑면(underside) 판정: 엣지 중점 이만큼 위가 solid 내부면 밑면 (명세 §2-B). */
    private static final double TOPSIDE_PROBE = 1.0;

    /** 물길 한 구간: 위치 + 흐름 속도 벡터(px/s) + 반폭. */
    record FlowSegment(
            double x1, double y1, double x2, double y2,
            double flowVx, double flowVy,
            double halfWidth
    ) {
    }

    private final List<FlowSegment> flowSegments = new ArrayList<>();

    WaterFlowField(
            List<List<Point>> paths,
            List<List<Point>> terrainPolygons,
            List<WaterPipe> waterPipes
    ) {
        if (waterPipes.isEmpty()) {
            return;
        }
        PoseUnionContour contour = PoseUnionContour.build(paths, terrainPolygons);
        for (WaterPipe pipe : waterPipes) {
            tracePipe(pipe, contour);
        }
    }

    /** (x,y)의 공에 걸리는 물살 속도 벡터 [vx, vy] (px/s). 물 밖이면 null. */
    double[] flowVelocityAt(double x, double y) {
        for (FlowSegment segment : flowSegments) {
            double reach = segment.halfWidth() + PhysicsConstants.BALL_RADIUS;
            if (distanceToSegment(x, y,
                    segment.x1(), segment.y1(), segment.x2(), segment.y2()) <= reach) {
                return new double[]{segment.flowVx(), segment.flowVy()};
            }
        }
        return null;
    }

    List<FlowSegment> flowSegments() {
        return flowSegments;
    }

    // ------------------------------------------------------------------
    // 물길 추적
    // ------------------------------------------------------------------

    /** 레이 착지 결과: 링/엣지 위치와 착지점. */
    private record RayHit(int ringIndex, int edgeIndex, double edgeParam, double x, double y) {
    }

    /** 걷기 종료: 여기서 수직 재낙하 (terminal이면 물길 종료). */
    private record WalkEnd(double x, double y, boolean terminal) {
    }

    private void tracePipe(WaterPipe pipe, PoseUnionContour contour) {
        double halfWidth = pipe.width() / 2.0;
        double px = pipe.outlet().x();
        double py = pipe.outlet().y();
        // 명세 §2-B 엣지 케이스: outlet이 union 내부 — 물길 생략
        if (contour.containsSolid(px, py)) {
            return;
        }
        double dirLength = Math.hypot(pipe.flowDirection().x(), pipe.flowDirection().y());
        double dx = pipe.flowDirection().x() / dirLength;
        double dy = pipe.flowDirection().y() / dirLength;
        double[] total = {0.0};

        for (int hop = 0; hop < MAX_HOPS && total[0] < MAX_TOTAL_LENGTH; hop++) {
            double boundary = boundaryDistance(px, py, dx, dy);
            RayHit hit = castRay(contour, px, py, dx, dy, boundary);
            if (hit == null) {
                // 맵 경계 낙하 — 종료
                if (Double.isFinite(boundary) && boundary > EPSILON) {
                    addSegment(px, py, px + dx * boundary, py + dy * boundary,
                            pipe.flowSpeed(), halfWidth, total);
                }
                return;
            }
            addSegment(px, py, hit.x(), hit.y(), pipe.flowSpeed(), halfWidth, total);

            // 착지한 엣지가 밑면이면 흡수 (구 구현의 천장 흡수와 동일 의미)
            Ring ring = contour.exteriorRings().get(hit.ringIndex());
            Point a = ring.at(hit.edgeIndex());
            Point b = ring.at(hit.edgeIndex() + 1);
            if (!isTopside(contour, a, b)) {
                return;
            }

            WalkEnd end = walk(contour, hit, pipe.flowSpeed(), halfWidth, total);
            if (end == null || end.terminal()) {
                return;
            }
            px = end.x();
            py = end.y() + EPSILON;
            dx = 0.0;
            dy = 1.0;
        }
    }

    /**
     * contour 걷기 — 명세 §2-B ②~⑥.
     * 내리막으로 걷다가 저점에서 양방향 턱을 비교해 낮은 턱으로 넘치고,
     * 밑면 엣지를 만나면 그 지점을 반환해 수직 재낙하한다.
     */
    private WalkEnd walk(
            PoseUnionContour contour,
            RayHit hit,
            double flowSpeed,
            double halfWidth,
            double[] total
    ) {
        Ring ring = contour.exteriorRings().get(hit.ringIndex());
        int n = ring.size();
        if (n < 3) {
            return new WalkEnd(hit.x(), hit.y(), true);
        }

        double cx = hit.x();
        double cy = hit.y();
        int step;      // 링 인덱스 진행 방향 (+1 / -1)
        int nextIndex; // 다음에 밟을 정점 인덱스

        Point a = ring.at(hit.edgeIndex());
        Point b = ring.at(hit.edgeIndex() + 1);
        boolean atVertexA = Math.hypot(cx - a.x(), cy - a.y()) < EPSILON;
        boolean atVertexB = Math.hypot(cx - b.x(), cy - b.y()) < EPSILON;
        if (atVertexA || atVertexB) {
            // 명세 §2-B 엣지 케이스: 정점 착지 — 인접 두 엣지 중 내리막 쪽 선택
            int vertexIndex = atVertexA ? hit.edgeIndex() : hit.edgeIndex() + 1;
            Point vertex = ring.at(vertexIndex);
            cx = vertex.x();
            cy = vertex.y();
            Point forward = ring.at(vertexIndex + 1);
            Point backward = ring.at(vertexIndex - 1);
            if (forward.y() >= backward.y()) { // 더 낮은(화면 y 큰) 쪽으로
                step = +1;
                nextIndex = vertexIndex + 1;
            } else {
                step = -1;
                nextIndex = vertexIndex - 1;
            }
        } else if (Math.abs(b.y() - a.y()) <= EPSILON) {
            // 수평 엣지 — 좌측 진행 (기존 규칙 유지)
            if (b.x() < a.x()) {
                step = +1;
                nextIndex = hit.edgeIndex() + 1;
            } else {
                step = -1;
                nextIndex = hit.edgeIndex();
            }
        } else if (b.y() > a.y()) {
            // b가 내리막 끝
            step = +1;
            nextIndex = hit.edgeIndex() + 1;
        } else {
            step = -1;
            nextIndex = hit.edgeIndex();
        }

        for (int run = 0; run < n * 4 && total[0] < MAX_TOTAL_LENGTH; run++) {
            // 맵 경계 도달 — 물길 종료 (명세 §2-B ②)
            if (cx <= 0.0 || cx >= PhysicsConstants.MAP_SIZE) {
                return new WalkEnd(cx, cy, true);
            }
            Point next = ring.at(nextIndex);
            if (next.y() >= cy - EPSILON) {
                // 내리막/수평 — 밑면이면 여기서 낙하 전환
                if (!isTopside(contour, new Point(cx, cy), next)) {
                    return new WalkEnd(cx, cy, false);
                }
                addSegment(cx, cy, next.x(), next.y(), flowSpeed, halfWidth, total);
                cx = next.x();
                cy = next.y();
                nextIndex += step;
                continue;
            }

            // 다음 정점이 오르막 — 저점(basin bottom) 도달. 양방향 턱 비교 (명세 ④⑤)
            double basinY = cy;
            Rim forwardRim = findRim(ring, nextIndex, step, basinY);
            Rim backwardRim = findRim(ring, nextIndex - step, -step, basinY);
            Rim chosen = chooseRim(forwardRim, backwardRim);
            if (chosen == null) {
                return new WalkEnd(cx, cy, true); // 양방향 밀폐 — 물길 종료
            }

            // 저점 → 턱: contour를 따라 세그먼트 생성 (chord 금지 — 명세 ⑤)
            int direction = chosen == forwardRim ? step : -step;
            int index = chosen == forwardRim ? nextIndex : nextIndex - step;
            for (int fill = 0; fill < n && total[0] < MAX_TOTAL_LENGTH; fill++) {
                Point vertex = ring.at(index);
                addSegment(cx, cy, vertex.x(), vertex.y(), flowSpeed, halfWidth, total);
                cx = vertex.x();
                cy = vertex.y();
                if (mod(index, n) == mod(chosen.vertexIndex(), n)) {
                    break;
                }
                index += direction;
            }
            step = direction;
            nextIndex = chosen.vertexIndex() + direction;
        }
        return new WalkEnd(cx, cy, true);
    }

    /** 턱(rim): 저점에서 한 방향으로 걸을 때 탈출 전 최고 봉우리. */
    private record Rim(int vertexIndex, double y, double x) {
    }

    /**
     * 명세 §2-B ④: startIndex부터 direction으로 걸으며 "저점보다 낮은 지점이
     * 나오기 전까지 만난 최고 봉우리(min y)"를 턱으로 계산. 링을 한 바퀴 돌도록
     * 저점보다 낮은 지점이 없으면 탈출 불가(null).
     */
    private Rim findRim(Ring ring, int startIndex, int direction, double basinY) {
        int n = ring.size();
        double peakY = basinY;
        double peakX = ring.at(startIndex).x();
        int peakIndex = startIndex;
        int index = startIndex;
        for (int i = 0; i < n; i++) {
            Point vertex = ring.at(index);
            if (vertex.y() < peakY) {
                peakY = vertex.y();
                peakX = vertex.x();
                peakIndex = index;
            }
            if (vertex.y() > basinY + EPSILON && vertex.y() > peakY + EPSILON) {
                return new Rim(peakIndex, peakY, peakX);
            }
            index += direction;
        }
        return null;
    }

    /** 명세 §2-B ⑤: 더 낮은 턱(화면 y 큰 쪽). 동률이면 화면 x가 큰(우측) 턱. */
    private Rim chooseRim(Rim first, Rim second) {
        if (first == null) {
            return second;
        }
        if (second == null) {
            return first;
        }
        if (Math.abs(first.y() - second.y()) > EPSILON) {
            return first.y() > second.y() ? first : second;
        }
        return first.x() >= second.x() ? first : second;
    }

    /** 엣지 중점 1px 위가 solid 밖이면 topside (물이 붙어 흐를 수 있는 윗면). */
    private boolean isTopside(PoseUnionContour contour, Point a, Point b) {
        double midX = (a.x() + b.x()) / 2.0;
        double midY = (a.y() + b.y()) / 2.0;
        return !contour.containsSolid(midX, midY - TOPSIDE_PROBE);
    }

    /**
     * 레이 (p, d)와 모든 exterior 엣지의 최근접 교차. 일반 레이-세그먼트 교차라
     * 수직 엣지도 포함된다 (명세 §2-B 엣지 케이스). limit(맵 경계 거리)보다 먼
     * 교차는 무시. 교차 없으면 null.
     */
    private RayHit castRay(
            PoseUnionContour contour,
            double px, double py, double dx, double dy,
            double limit
    ) {
        double bestT = limit;
        RayHit best = null;
        List<Ring> rings = contour.exteriorRings();
        for (int r = 0; r < rings.size(); r++) {
            Ring ring = rings.get(r);
            int n = ring.size();
            for (int e = 0; e < n; e++) {
                Point a = ring.at(e);
                Point b = ring.at(e + 1);
                double t = raySegmentIntersection(px, py, dx, dy,
                        a.x(), a.y(), b.x(), b.y());
                if (t > EPSILON && t < bestT) {
                    bestT = t;
                    double hx = px + dx * t;
                    double hy = py + dy * t;
                    best = new RayHit(r, e, 0.0, hx, hy);
                }
            }
        }
        return best;
    }

    private void addSegment(
            double x1, double y1, double x2, double y2,
            double flowSpeed, double halfWidth, double[] total
    ) {
        double length = Math.hypot(x2 - x1, y2 - y1);
        if (length <= EPSILON) {
            return;
        }
        double ux = (x2 - x1) / length;
        double uy = (y2 - y1) / length;
        flowSegments.add(new FlowSegment(x1, y1, x2, y2,
                flowSpeed * ux, flowSpeed * uy, halfWidth));
        total[0] += length;
    }

    private static int mod(int value, int n) {
        return ((value % n) + n) % n;
    }

    /** 레이 (p, d)와 세그먼트 (a→b)의 교차 파라미터 t (없으면 +무한대). */
    private static double raySegmentIntersection(
            double px, double py, double dx, double dy,
            double ax, double ay, double bx, double by
    ) {
        double sx = bx - ax;
        double sy = by - ay;
        double denominator = dx * sy - dy * sx;
        if (Math.abs(denominator) < 1e-12) {
            return Double.POSITIVE_INFINITY; // 평행
        }
        double qx = ax - px;
        double qy = ay - py;
        double t = (qx * sy - qy * sx) / denominator;
        double u = (qx * dy - qy * dx) / denominator;
        if (t <= 0 || u < 0 || u > 1) {
            return Double.POSITIVE_INFINITY;
        }
        return t;
    }

    /** 맵 경계(x=0, x=MAP, y=0, y=MAP)까지의 레이 거리. */
    private static double boundaryDistance(double px, double py, double dx, double dy) {
        double best = Double.POSITIVE_INFINITY;
        if (dy > 0) {
            best = Math.min(best, (PhysicsConstants.MAP_SIZE - py) / dy);
        } else if (dy < 0) {
            best = Math.min(best, (0 - py) / dy);
        }
        if (dx > 0) {
            best = Math.min(best, (PhysicsConstants.MAP_SIZE - px) / dx);
        } else if (dx < 0) {
            best = Math.min(best, (0 - px) / dx);
        }
        return best;
    }

    private static double distanceToSegment(
            double x, double y,
            double x1, double y1, double x2, double y2
    ) {
        double dx = x2 - x1;
        double dy = y2 - y1;
        double lengthSquared = dx * dx + dy * dy;
        if (lengthSquared < 1e-12) {
            return Math.hypot(x - x1, y - y1);
        }
        double t = Math.max(0.0, Math.min(1.0,
                ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
        return Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
    }
}
