package org.ssafy.bodybuilder.domain.game.physics.dyn4j;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser;
import org.ssafy.bodybuilder.domain.game.physics.MapConfigParser.Point;
import org.ssafy.bodybuilder.domain.game.physics.PoseTransformer;

/**
 * 물길 계산 공개 파사드 (개발명세서_BE_물기믹_유니온물길 BE-WATER-04).
 *
 * <p>{@link WaterFlowField}·{@link PoseUnionContour}는 package-private 내부 구현이라
 * 서비스 레이어(포즈 브로드캐스트, 에디터 프리뷰 API)는 이 클래스를 통해서만
 * 물길을 계산한다. 시뮬레이션 항력({@code Dyn4jPhysicsSimulator})과 같은 모듈을
 * 공유하므로 화면 물길과 판정이 항상 일치한다.
 *
 * <p>mapConfig의 불변 부분(지형·파이프·플레이어 센터 파싱 결과)을 보관한다 —
 * 라운드당 1회 생성해 캐시하고, 포즈가 바뀔 때 {@link #compute}만 재호출할 것.
 *
 * <p>명세 위치 참고: 명세에는 {@code domain/game/physics}로 적혀 있으나 내부 구현의
 * package-private 접근을 위해 {@code physics/dyn4j}에 둔다 (public이므로 외부 호출 가능).
 */
public final class WaterFlowPreview {

    private final MapConfigParser.ParsedMapConfig map;

    private WaterFlowPreview(MapConfigParser.ParsedMapConfig map) {
        this.map = map;
    }

    /** mapConfig 파싱 실패 시 GlobalException(INVALID_INPUT_VALUE) 전파. */
    public static WaterFlowPreview of(JsonNode mapConfig) {
        return new WaterFlowPreview(MapConfigParser.parse(mapConfig));
    }

    /**
     * 현재 포즈 집합 기준 물길 세그먼트. 형식: [x1, y1, x2, y2, halfWidth] × N
     * (개발명세서_BE_물기믹_유니온물길 §3).
     *
     * @param normalizedPoses 인덱스 = 플레이어(captureNo-1). 정규화 [0..1]² 좌표.
     *                        null 엔트리·빈 리스트 = 해당 플레이어 포즈 없음.
     *                        전체 null이면 지형만으로 계산 (라운드 시작 물길).
     * @return WATER_PIPE 없는 맵이면 빈 리스트 (권위적 "물 없음").
     *         계산 실패(JTS 예외 등)는 그대로 전파 — 격리 정책은 호출자 책임
     *         (브로드캐스트: 필드 생략, 에디터 API: 5xx).
     */
    public List<List<Double>> compute(List<List<List<Double>>> normalizedPoses) {
        if (map.waterPipes().isEmpty()) {
            return List.of();
        }
        List<List<List<Double>>> poses = normalizedPoses == null
                ? List.of()
                : normalizedPoses;
        int limit = Math.min(poses.size(), map.playerCenters().size());
        List<List<Point>> paths = PoseTransformer.transformAllRaw(
                poses.subList(0, limit),
                map.playerCenters()
        );
        WaterFlowField field = new WaterFlowField(
                paths,
                map.terrainPolygons(),
                map.waterPipes()
        );
        List<List<Double>> rows = new ArrayList<>(field.flowSegments().size());
        for (WaterFlowField.FlowSegment segment : field.flowSegments()) {
            rows.add(List.of(
                    segment.x1(), segment.y1(),
                    segment.x2(), segment.y2(),
                    segment.halfWidth()
            ));
        }
        return List.copyOf(rows);
    }
}
