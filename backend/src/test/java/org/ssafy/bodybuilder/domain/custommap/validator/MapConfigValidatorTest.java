package org.ssafy.bodybuilder.domain.custommap.validator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;

/** STEP 6 #12(PUT 상한), #13(포즈 상한) 및 allowlist·팔레트·난이도 검증. */
class MapConfigValidatorTest {

    private static final List<String> PALETTE = List.of("#3b5998", "#8bc4e8", "#f5c422");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final MapConfigValidator validator = new MapConfigValidator();

    @Test
    @DisplayName("공식 맵 수준의 정상 map_config는 통과한다")
    void acceptsValidMapConfig() {
        assertThatCode(() -> validator.validateForSave(validMapConfig(), "중", PALETTE))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("지형 폴리곤이 9개면 400")
    void rejectsTooManyPolygons() {
        ObjectNode mapConfig = validMapConfig();
        mapConfig.set("terrain", polygons(9, 4));

        assertInvalid(() -> validator.validateForSave(mapConfig, "중", PALETTE));
    }

    @Test
    @DisplayName("지형 폴리곤 8개까지는 통과한다 (경계값)")
    void acceptsPolygonUpperBound() {
        ObjectNode mapConfig = validMapConfig();
        mapConfig.set("terrain", polygons(8, 20));

        assertThatCode(() -> validator.validateForSave(mapConfig, "중", PALETTE))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("폴리곤 정점이 21개면 400, 2개여도 400")
    void rejectsPolygonVertexBounds() {
        ObjectNode tooMany = validMapConfig();
        tooMany.set("terrain", polygons(1, 21));
        assertInvalid(() -> validator.validateForSave(tooMany, "중", PALETTE));

        ObjectNode tooFew = validMapConfig();
        tooFew.set("terrain", polygons(1, 2));
        assertInvalid(() -> validator.validateForSave(tooFew, "중", PALETTE));
    }

    @Test
    @DisplayName("기믹이 6개면 400")
    void rejectsTooManyGimmicks() {
        ObjectNode mapConfig = validMapConfig();
        ArrayNode gimmicks = objectMapper.createArrayNode();
        for (int i = 0; i < 6; i++) {
            gimmicks.add(jumpPad());
        }
        mapConfig.set("gimmicks", gimmicks);

        assertInvalid(() -> validator.validateForSave(mapConfig, "중", PALETTE));
    }

    @Test
    @DisplayName("allowlist에 없는 기믹 타입(BLACKOUT)은 400 — FE 전용 연출 기믹 주입 차단")
    void rejectsGimmickTypeOutsideAllowlist() {
        ObjectNode mapConfig = validMapConfig();
        ArrayNode gimmicks = objectMapper.createArrayNode();
        ObjectNode blackout = objectMapper.createObjectNode();
        blackout.put("type", "BLACKOUT");
        gimmicks.add(blackout);
        mapConfig.set("gimmicks", gimmicks);

        assertInvalid(() -> validator.validateForSave(mapConfig, "중", PALETTE));
    }

    @Test
    @DisplayName("난이도가 하/중/상이 아니면 400")
    void rejectsUnknownDifficulty() {
        assertInvalid(() -> validator.validateForSave(validMapConfig(), "어려움", PALETTE));
        assertInvalid(() -> validator.validateForSave(validMapConfig(), null, PALETTE));
    }

    @Test
    @DisplayName("palette는 #RRGGBB 3개여야 한다")
    void rejectsInvalidPalette() {
        assertInvalid(() -> validator.validateForSave(
                validMapConfig(), "중", List.of("#3b5998", "#8bc4e8")));
        assertInvalid(() -> validator.validateForSave(
                validMapConfig(), "중", List.of("#3b5998", "#8bc4e8", "red")));
        assertInvalid(() -> validator.validateForSave(validMapConfig(), "중", null));
    }

    @Test
    @DisplayName("포즈 좌표가 13개면 400 — PoseTransformer에 상한이 없어 여기서 막는다")
    void rejectsTooManyPosePoints() {
        assertInvalid(() -> validator.validateForSimulate(validMapConfig(), List.of(pose(13))));
    }

    @Test
    @DisplayName("포즈 좌표 12개까지는 통과한다 (경계값, MediaPipe 6관절 대비 충분)")
    void acceptsPosePointUpperBound() {
        assertThatCode(() -> validator.validateForSimulate(validMapConfig(), List.of(pose(12))))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("포즈 플레이어가 5명이면 400, null 슬롯은 허용한다")
    void rejectsTooManyPosePlayers() {
        List<List<List<Double>>> fivePlayers = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            fivePlayers.add(pose(2));
        }
        assertInvalid(() -> validator.validateForSimulate(validMapConfig(), fivePlayers));

        List<List<List<Double>>> withNulls = new ArrayList<>();
        withNulls.add(pose(2));
        withNulls.add(null);
        withNulls.add(null);
        withNulls.add(null);
        assertThatCode(() -> validator.validateForSimulate(validMapConfig(), withNulls))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("map_config가 객체가 아니면 400")
    void rejectsNonObjectMapConfig() {
        assertInvalid(() -> validator.validateForSimulate(null, List.of()));
        assertInvalid(() -> validator.validateForSimulate(objectMapper.createArrayNode(), List.of()));
    }

    @Test
    @DisplayName("폴리곤·기믹 수를 세어 비정규화 컬럼에 넣는다")
    void countsPolygonsAndGimmicks() {
        ObjectNode mapConfig = validMapConfig();
        mapConfig.set("terrain", polygons(5, 4));
        ArrayNode gimmicks = objectMapper.createArrayNode();
        gimmicks.add(jumpPad());
        gimmicks.add(jumpPad());
        mapConfig.set("gimmicks", gimmicks);

        assertThat(MapConfigValidator.countPolygons(mapConfig)).isEqualTo(5);
        assertThat(MapConfigValidator.countGimmicks(mapConfig)).isEqualTo(2);
        assertThat(MapConfigValidator.countPolygons(validMapConfigWithoutTerrain())).isZero();
        assertThat(MapConfigValidator.countGimmicks(validMapConfigWithoutTerrain())).isZero();
    }

    @Test
    @DisplayName("clearZone: 정상 [x,y,w,h]는 통과, 없음(생략)도 통과")
    void acceptsValidOrAbsentClearZone() {
        ObjectNode withZone = validMapConfig();
        withZone.set("clearZone", objectMapper.valueToTree(List.of(900, 400, 80, 120)));
        assertThatCode(() -> validator.validateForSave(withZone, "중", PALETTE))
                .doesNotThrowAnyException();

        assertThatCode(() -> validator.validateForSave(validMapConfig(), "중", PALETTE))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("clearZone: 원소 부족·비배열·0 이하 크기는 400")
    void rejectsMalformedClearZone() {
        ObjectNode tooShort = validMapConfig();
        tooShort.set("clearZone", objectMapper.valueToTree(List.of(900, 400, 80)));
        assertInvalid(() -> validator.validateForSave(tooShort, "중", PALETTE));

        ObjectNode notArray = validMapConfig();
        notArray.put("clearZone", "oops");
        assertInvalid(() -> validator.validateForSave(notArray, "중", PALETTE));

        ObjectNode zeroWidth = validMapConfig();
        zeroWidth.set("clearZone", objectMapper.valueToTree(List.of(900, 400, 0, 120)));
        assertInvalid(() -> validator.validateForSave(zeroWidth, "중", PALETTE));

        ObjectNode negativeHeight = validMapConfig();
        negativeHeight.set("clearZone", objectMapper.valueToTree(List.of(900, 400, 80, -1)));
        assertInvalid(() -> validator.validateForSave(negativeHeight, "중", PALETTE));
    }

    private void assertInvalid(org.assertj.core.api.ThrowableAssert.ThrowingCallable callable) {
        assertThatThrownBy(callable)
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_MAP_CONFIG);
    }

    private ObjectNode validMapConfig() {
        ObjectNode mapConfig = validMapConfigWithoutTerrain();
        mapConfig.set("terrain", polygons(2, 4));
        ArrayNode gimmicks = objectMapper.createArrayNode();
        gimmicks.add(jumpPad());
        mapConfig.set("gimmicks", gimmicks);
        return mapConfig;
    }

    private ObjectNode validMapConfigWithoutTerrain() {
        ObjectNode mapConfig = objectMapper.createObjectNode();
        mapConfig.set("startPoint", point(10, 10));
        mapConfig.set("endPoint", point(900, 100));
        ArrayNode players = objectMapper.createArrayNode();
        players.add(point(50, 800));
        players.add(point(60, 800));
        mapConfig.set("players", players);
        return mapConfig;
    }

    private ObjectNode jumpPad() {
        ObjectNode gimmick = objectMapper.createObjectNode();
        gimmick.put("type", "JUMP_PAD");
        gimmick.set("position", point(100, 880));
        gimmick.set("size", point(40, 10));
        gimmick.set("launchVelocity", point(0, -300));
        return gimmick;
    }

    private ArrayNode polygons(int count, int vertices) {
        ArrayNode terrain = objectMapper.createArrayNode();
        for (int i = 0; i < count; i++) {
            ArrayNode polygon = objectMapper.createArrayNode();
            for (int v = 0; v < vertices; v++) {
                polygon.add(point(v * 10, 900 + i));
            }
            terrain.add(polygon);
        }
        return terrain;
    }

    private ArrayNode point(double x, double y) {
        ArrayNode node = objectMapper.createArrayNode();
        node.add(x);
        node.add(y);
        return node;
    }

    private List<List<Double>> pose(int points) {
        List<List<Double>> pose = new ArrayList<>();
        for (int i = 0; i < points; i++) {
            pose.add(List.of(0.1 * i, 0.2 * i));
        }
        return pose;
    }

}
