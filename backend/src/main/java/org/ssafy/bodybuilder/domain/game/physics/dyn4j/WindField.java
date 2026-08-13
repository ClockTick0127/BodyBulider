package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import java.util.ArrayList;
import java.util.List;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.Point;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.WindZone;

/**
 * WIND 기믹: y밴드 내 x축 전체에 -x 방향 바람.
 *
 * <p>차폐 규칙: 공 위치에서 +x(바람 상류) 방향 수평 시선이 포즈 로드 세그먼트와
 * 교차하면 바람 그늘(무풍). 지형은 차폐하지 않는다 (기획 확정).
 * 계산은 게임좌표 px 도메인 순수 기하.
 */
final class WindField {

    private record SegmentPx(double x1, double y1, double x2, double y2) {
    }

    private final List<WindZone> windZones;
    private final List<SegmentPx> shieldSegments;

    WindField(List<List<Point>> paths, List<WindZone> windZones) {
        this.windZones = windZones;
        this.shieldSegments = new ArrayList<>();
        if (windZones.isEmpty()) {
            return; // 바람 없으면 차폐 세그먼트도 불필요
        }
        for (List<Point> path : paths) {
            for (int index = 1; index < path.size(); index++) {
                Point from = path.get(index - 1);
                Point to = path.get(index);
                double dx = to.x() - from.x();
                double dy = to.y() - from.y();
                if (dx * dx + dy * dy < 0.01) {
                    continue;
                }
                shieldSegments.add(new SegmentPx(from.x(), from.y(), to.x(), to.y()));
            }
        }
    }

    /** (x, y)의 공에 걸리는 -x 방향 바람 가속도(px/s², 양수 반환). 무풍이면 0. */
    double accelerationAt(double x, double y) {
        double total = 0.0;
        for (WindZone zone : windZones) {
            if (y < zone.yTop() || y > zone.yBottom()) {
                continue;
            }
            if (isShielded(x, y)) {
                return 0.0; // 차폐는 높이 기준이므로 모든 밴드에 공통
            }
            total += zone.strength();
        }
        return total;
    }

    /** 공에서 +x 방향 수평 시선이 로드 세그먼트에 막히는지. */
    private boolean isShielded(double x, double y) {
        for (SegmentPx segment : shieldSegments) {
            double y1 = segment.y1();
            double y2 = segment.y2();
            if ((y1 - y) * (y2 - y) > 0) {
                continue; // 시선 높이를 가로지르지 않음
            }
            double dy = y2 - y1;
            if (Math.abs(dy) < 1e-9) {
                continue; // 시선과 평행한 수평 세그먼트는 차폐 아님
            }
            double t = (y - y1) / dy;
            double crossX = segment.x1() + (segment.x2() - segment.x1()) * t;
            if (crossX > x) {
                return true; // 상류(+x)에 차폐물 존재
            }
        }
        return false;
    }
}
