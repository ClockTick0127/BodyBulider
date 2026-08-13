package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import java.util.ArrayList;
import java.util.List;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.prep.PreparedGeometry;
import org.locationtech.jts.geom.prep.PreparedGeometryFactory;
import org.locationtech.jts.operation.buffer.BufferOp;
import org.locationtech.jts.operation.buffer.BufferParameters;
import org.locationtech.jts.simplify.DouglasPeuckerSimplifier;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.Point;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsConstants;

/**
 * 포즈 폴리라인(두께 부여) + 지형 폴리곤 → 유니온 외곽선(contour) 추출.
 *
 * <p>개발명세서_BE_물기믹_유니온물길 §2-A:
 * <ul>
 *   <li>buffer 반지름 = {@link PhysicsConstants#ROAD_RADIUS}(4.5px), 캡/조인트 ROUND,
 *       quadrantSegments=2 (캡 해상도 낮게)</li>
 *   <li>union 후 RDP(ε=0.5px) 공선점 병합, normalize()로 결정성 확보</li>
 *   <li>exterior ring만 물길 표면으로 사용 (interior ring은 이번 범위 미사용)</li>
 * </ul>
 *
 * <p>입력 계약: 포즈 경로는 스무딩 없는 {@code PoseTransformer.transformAllRaw} 결과.
 */
final class PoseUnionContour {

    /** buffer 캡 해상도 (명세 §2-A). */
    private static final int QUADRANT_SEGMENTS = 2;
    /** union 후 공선점 병합 허용오차 px (명세 §2-A). */
    private static final double SIMPLIFY_EPSILON = 0.5;

    private static final GeometryFactory FACTORY = new GeometryFactory();

    /** 닫힌 링. vertices는 마지막 중복점 없는 열린 표현. */
    record Ring(List<Point> vertices) {
        int size() {
            return vertices.size();
        }

        Point at(int index) {
            int n = vertices.size();
            return vertices.get(((index % n) + n) % n);
        }
    }

    private final List<Ring> exteriorRings;
    private final PreparedGeometry solid;

    private PoseUnionContour(List<Ring> exteriorRings, PreparedGeometry solid) {
        this.exteriorRings = exteriorRings;
        this.solid = solid;
    }

    List<Ring> exteriorRings() {
        return exteriorRings;
    }

    /** (x, y)가 유니온 solid 내부인가 (경계 제외). outlet 매몰·밑면 프로브 판정용. */
    boolean containsSolid(double x, double y) {
        return solid.contains(FACTORY.createPoint(new Coordinate(x, y)));
    }

    static PoseUnionContour build(
            List<List<Point>> rawPosePaths,
            List<List<Point>> terrainPolygons
    ) {
        List<Geometry> parts = new ArrayList<>();
        BufferParameters bufferParameters = new BufferParameters(
                QUADRANT_SEGMENTS,
                BufferParameters.CAP_ROUND,
                BufferParameters.JOIN_ROUND,
                BufferParameters.DEFAULT_MITRE_LIMIT
        );
        for (List<Point> path : rawPosePaths) {
            if (path == null || path.size() < 2) {
                continue;
            }
            Coordinate[] coordinates = new Coordinate[path.size()];
            for (int i = 0; i < path.size(); i++) {
                coordinates[i] = new Coordinate(path.get(i).x(), path.get(i).y());
            }
            LineString line = FACTORY.createLineString(coordinates);
            parts.add(BufferOp.bufferOp(line, PhysicsConstants.ROAD_RADIUS, bufferParameters));
        }
        for (List<Point> polygon : terrainPolygons) {
            if (polygon == null || polygon.size() < 3) {
                continue;
            }
            Coordinate[] shell = new Coordinate[polygon.size() + 1];
            for (int i = 0; i < polygon.size(); i++) {
                shell[i] = new Coordinate(polygon.get(i).x(), polygon.get(i).y());
            }
            shell[polygon.size()] = shell[0];
            // 자기교차 등 invalid 입력은 buffer(0)으로 정규화 (JTS 표준 관행)
            parts.add(FACTORY.createPolygon(shell).buffer(0));
        }

        if (parts.isEmpty()) {
            return new PoseUnionContour(
                    List.of(),
                    PreparedGeometryFactory.prepare(FACTORY.createPolygon())
            );
        }

        Geometry union = FACTORY.createGeometryCollection(parts.toArray(Geometry[]::new))
                .union();
        Geometry simplified = DouglasPeuckerSimplifier.simplify(union, SIMPLIFY_EPSILON);
        simplified.normalize(); // 링 방향·시작점 정규화 — 리플레이 결정성

        List<Ring> rings = new ArrayList<>();
        for (int i = 0; i < simplified.getNumGeometries(); i++) {
            if (!(simplified.getGeometryN(i) instanceof Polygon polygon) || polygon.isEmpty()) {
                continue;
            }
            LinearRing exterior = polygon.getExteriorRing();
            Coordinate[] coordinates = exterior.getCoordinates(); // 닫힘 (첫점 == 끝점)
            if (coordinates.length < 4) {
                continue;
            }
            List<Point> vertices = new ArrayList<>(coordinates.length - 1);
            for (int c = 0; c < coordinates.length - 1; c++) {
                vertices.add(new Point(coordinates[c].x, coordinates[c].y));
            }
            rings.add(new Ring(List.copyOf(vertices)));
        }
        return new PoseUnionContour(
                List.copyOf(rings),
                PreparedGeometryFactory.prepare(simplified)
        );
    }
}
