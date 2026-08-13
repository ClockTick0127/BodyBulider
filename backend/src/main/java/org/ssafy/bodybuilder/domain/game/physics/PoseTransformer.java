package org.ssafy.bodybuilder.domain.game.physics;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.Point;

/**
 * 정규화 포즈([0..1]²)를 맵 좌표(px) 폴리라인으로 변환하는 공용 유틸.
 *
 * <p>legacy의 transformPose와 동일한 규칙:
 * 플레이어 중심 기준 230×180 영역에 매핑, 우→좌 폴리라인은 자동 반전,
 * 점이 2개 미만인 길은 제외.
 *
 * <p>추가로 모션(MediaPipe) 입력 지터를 흡수하기 위해 스무딩을 적용한다:
 * 이동평균(창 3) → RDP 단순화(POSE_SMOOTHING_EPSILON). ±수 px 노이즈는
 * 제거되고 의도적 관절 굽힘은 보존된다.
 */
public final class PoseTransformer {

    private PoseTransformer() {
    }

    /** 유효한(점 2개 이상) 길만 반환한다. */
    public static List<List<Point>> transformAll(
            List<List<List<Double>>> normalizedPoses,
            List<Point> playerCenters
    ) {
        List<List<Point>> paths = new ArrayList<>();
        for (int index = 0; index < normalizedPoses.size(); index++) {
            List<Point> path = transform(
                    normalizedPoses.get(index),
                    playerCenters.get(index)
            );
            if (path.size() > 1) {
                paths.add(path);
            }
        }
        return paths;
    }

    /**
     * 스무딩 없는 원본(변환+반전만) 경로. 물길(WaterFlowField) 등
     * "화면에 그려진 포즈 그대로"를 따라야 하는 소비자용.
     * 공이 구르는 물리 로드는 여전히 {@link #transformAll}(스무딩) 기준.
     */
    public static List<List<Point>> transformAllRaw(
            List<List<List<Double>>> normalizedPoses,
            List<Point> playerCenters
    ) {
        List<List<Point>> paths = new ArrayList<>();
        for (int index = 0; index < normalizedPoses.size(); index++) {
            List<Point> path = transformRaw(
                    normalizedPoses.get(index),
                    playerCenters.get(index)
            );
            if (path.size() > 1) {
                paths.add(path);
            }
        }
        return paths;
    }

    public static List<Point> transform(
            List<List<Double>> normalizedPose,
            Point center
    ) {
        return smooth(transformRaw(normalizedPose, center));
    }

    static List<Point> transformRaw(
            List<List<Double>> normalizedPose,
            Point center
    ) {
        if (normalizedPose == null) {
            return List.of();
        }

        List<Point> path = normalizedPose.stream()
                .filter(point -> point != null && point.size() >= 2)
                .map(point -> new Point(
                        center.x() - PhysicsConstants.PLAYER_AREA_WIDTH / 2.0
                                + point.get(0) * PhysicsConstants.PLAYER_AREA_WIDTH,
                        center.y() - PhysicsConstants.PLAYER_AREA_HEIGHT / 2.0
                                + point.get(1) * PhysicsConstants.PLAYER_AREA_HEIGHT
                ))
                .toList();

        if (path.size() > 1 && path.getFirst().x() > path.getLast().x()) {
            List<Point> reversed = new ArrayList<>(path);
            Collections.reverse(reversed);
            path = List.copyOf(reversed);
        }
        return path;
    }

    /** 약한 가중평균(끝점 고정) 후 RDP 단순화로 지터 제거. 의도 형상 보존 우선. */
    static List<Point> smooth(List<Point> path) {
        if (path.size() < 3
                || PhysicsConstants.POSE_SMOOTHING_EPSILON <= 0) {
            return path;
        }
        double side = PhysicsConstants.POSE_SMOOTHING_NEIGHBOR_WEIGHT;
        double middle = 1.0 - 2.0 * side;
        List<Point> averaged = new ArrayList<>(path.size());
        averaged.add(path.getFirst());
        for (int index = 1; index < path.size() - 1; index++) {
            Point previous = path.get(index - 1);
            Point current = path.get(index);
            Point next = path.get(index + 1);
            averaged.add(new Point(
                    previous.x() * side + current.x() * middle + next.x() * side,
                    previous.y() * side + current.y() * middle + next.y() * side
            ));
        }
        averaged.add(path.getLast());
        return List.copyOf(simplify(
                averaged,
                PhysicsConstants.POSE_SMOOTHING_EPSILON
        ));
    }

    /** Ramer-Douglas-Peucker: epsilon 이하로 벗어난 중간점 제거. */
    private static List<Point> simplify(List<Point> points, double epsilon) {
        if (points.size() < 3) {
            return points;
        }
        Point first = points.getFirst();
        Point last = points.getLast();
        double dx = last.x() - first.x();
        double dy = last.y() - first.y();
        double length = Math.hypot(dx, dy);

        int farthestIndex = -1;
        double farthestDistance = 0.0;
        for (int index = 1; index < points.size() - 1; index++) {
            Point point = points.get(index);
            double distance = length < 1e-9
                    ? Math.hypot(point.x() - first.x(), point.y() - first.y())
                    : Math.abs(dx * (first.y() - point.y())
                            - (first.x() - point.x()) * dy) / length;
            if (distance > farthestDistance) {
                farthestDistance = distance;
                farthestIndex = index;
            }
        }
        if (farthestDistance <= epsilon) {
            return List.of(first, last);
        }
        List<Point> left =
                simplify(points.subList(0, farthestIndex + 1), epsilon);
        List<Point> right =
                simplify(points.subList(farthestIndex, points.size()), epsilon);
        List<Point> merged = new ArrayList<>(left.subList(0, left.size() - 1));
        merged.addAll(right);
        return merged;
    }
}
