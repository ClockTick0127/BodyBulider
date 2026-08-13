package org.ssafy.bodybuilder.domain.custommap.validator;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;

/**
 * 창작마당(UGC) 입력 검증기.
 *
 * <p>POST / PUT / simulate 세 경로 전부에 적용한다. 하나라도 빠지면 상한 검증 전체가 우회된다.
 *
 * <p>관리자 경로(DevMapService)에는 적용하지 않는다.
 * 공식 맵 1-2가 BLACKOUT 기믹을 실제로 사용하므로 allowlist를 걸면 기존 공식 맵을 저장할 수 없게 된다.
 *
 * <p>벽시계 타임아웃 대신 입력 복잡도 상한으로 방어한다.
 * PhysicsSimulator의 계약이 "결정적이어야 한다"이므로 타임아웃은 같은 맵의 성패를 뒤집어 계약을 깨뜨린다.
 */
@Component
public class MapConfigValidator {

    private static final int MAX_POLYGONS = 8;
    private static final int MIN_POLYGON_VERTICES = 3;
    private static final int MAX_POLYGON_VERTICES = 20;
    private static final int MAX_GIMMICKS = 5;
    private static final int MAX_PLAYERS = 4;
    private static final int MAX_POSE_POINTS = 12;
    private static final int PALETTE_SIZE = 3;

    /**
     * MapConfigParser가 실제로 해석하는 기믹만 허용한다.
     * 현재 DevMapService.validateMapConfig()와 MapConfigParser는 모르는 type을 그냥 통과시키므로,
     * allowlist가 없으면 BLACKOUT 같은 FE 전용 연출 기믹을 주입해 타 플레이어 화면을 조작할 수 있다.
     */
    private static final Set<String> ALLOWED_GIMMICK_TYPES =
            Set.of("JUMP_PAD", "WIND", "KILL_ZONE", "WATER_PIPE");

    private static final Set<String> ALLOWED_DIFFICULTIES = Set.of("하", "중", "상");

    private static final Pattern HEX_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");

    /** POST / PUT 경로. */
    public void validateForSave(JsonNode mapConfig, String difficulty, List<String> palette) {
        validateDifficulty(difficulty);
        validatePalette(palette);
        validateMapConfig(mapConfig);
    }

    /** simulate 경로. */
    public void validateForSimulate(JsonNode mapConfig, List<List<List<Double>>> poses) {
        validateMapConfig(mapConfig);
        validatePoses(poses);
    }

    public static int countPolygons(JsonNode mapConfig) {
        JsonNode terrain = mapConfig.get("terrain");
        return terrain == null || !terrain.isArray() ? 0 : terrain.size();
    }

    public static int countGimmicks(JsonNode mapConfig) {
        JsonNode gimmicks = mapConfig.get("gimmicks");
        return gimmicks == null || !gimmicks.isArray() ? 0 : gimmicks.size();
    }

    private void validateDifficulty(String difficulty) {
        if (difficulty == null || !ALLOWED_DIFFICULTIES.contains(difficulty)) {
            throw invalid("difficulty는 '하', '중', '상' 중 하나여야 합니다.");
        }
    }

    private void validatePalette(List<String> palette) {
        if (palette == null || palette.size() != PALETTE_SIZE) {
            throw invalid("palette는 " + PALETTE_SIZE + "개의 색상이어야 합니다.");
        }
        for (String color : palette) {
            if (color == null || !HEX_COLOR.matcher(color).matches()) {
                throw invalid("palette 색상은 #RRGGBB 형식이어야 합니다: " + color);
            }
        }
    }

    private void validatePoses(List<List<List<Double>>> poses) {
        if (poses == null) {
            return;
        }
        if (poses.size() > MAX_PLAYERS) {
            throw invalid("poses는 최대 " + MAX_PLAYERS + "명까지 가능합니다.");
        }
        int index = 0;
        for (List<List<Double>> pose : poses) {
            index++;
            if (pose == null) {
                continue;
            }
            if (pose.size() > MAX_POSE_POINTS) {
                throw invalid("플레이어 #" + index + "의 포즈 좌표는 최대 "
                        + MAX_POSE_POINTS + "개까지 가능합니다.");
            }
            for (List<Double> point : pose) {
                if (point == null || point.size() < 2) {
                    throw invalid("플레이어 #" + index + "의 포즈 좌표는 [x, y] 형태여야 합니다.");
                }
            }
        }
    }

    private void validateMapConfig(JsonNode mapConfig) {
        if (mapConfig == null || !mapConfig.isObject()) {
            throw invalid("map_config는 JSON 객체여야 합니다.");
        }
        requirePoint(mapConfig.get("startPoint"), "startPoint");
        requirePoint(mapConfig.get("endPoint"), "endPoint");

        JsonNode players = mapConfig.get("players");
        if (players == null || !players.isArray() || players.isEmpty()) {
            throw invalid("players는 1개 이상의 좌표 배열이어야 합니다.");
        }
        if (players.size() > MAX_PLAYERS) {
            throw invalid("players는 최대 " + MAX_PLAYERS + "개까지 가능합니다.");
        }
        for (JsonNode player : players) {
            requirePoint(player, "players 항목");
        }

        validateTerrain(mapConfig.get("terrain"));
        validateGimmicks(mapConfig.get("gimmicks"));
        validateClearZone(mapConfig.get("clearZone"));
    }

    /**
     * 선택 필드 clearZone. MapConfigParser.readClearZone과 동일 규칙:
     * [x, y, w, h] 숫자 배열, w·h > 0. 없으면(null) 기존 x 기준 판정.
     */
    private void validateClearZone(JsonNode clearZone) {
        if (clearZone == null || clearZone.isNull()) {
            return;
        }
        if (!clearZone.isArray() || clearZone.size() < 4
                || !clearZone.get(0).isNumber() || !clearZone.get(1).isNumber()
                || !clearZone.get(2).isNumber() || !clearZone.get(3).isNumber()) {
            throw invalid("clearZone은 [x, y, w, h] 숫자 배열이어야 합니다.");
        }
        if (clearZone.get(2).asDouble() <= 0 || clearZone.get(3).asDouble() <= 0) {
            throw invalid("clearZone의 w, h는 0보다 커야 합니다.");
        }
    }

    private void validateTerrain(JsonNode terrain) {
        if (terrain == null || terrain.isNull()) {
            return;
        }
        if (!terrain.isArray()) {
            throw invalid("terrain은 배열이어야 합니다.");
        }
        if (terrain.size() > MAX_POLYGONS) {
            throw invalid("지형 폴리곤은 최대 " + MAX_POLYGONS + "개까지 가능합니다.");
        }
        int index = 0;
        for (JsonNode polygon : terrain) {
            index++;
            if (!polygon.isArray()
                    || polygon.size() < MIN_POLYGON_VERTICES
                    || polygon.size() > MAX_POLYGON_VERTICES) {
                throw invalid("지형 #" + index + "의 꼭짓점은 "
                        + MIN_POLYGON_VERTICES + "개 이상 "
                        + MAX_POLYGON_VERTICES + "개 이하여야 합니다.");
            }
            for (JsonNode vertex : polygon) {
                requirePoint(vertex, "지형 #" + index + " 꼭짓점");
            }
        }
    }

    private void validateGimmicks(JsonNode gimmicks) {
        if (gimmicks == null || gimmicks.isNull()) {
            return;
        }
        if (!gimmicks.isArray()) {
            throw invalid("gimmicks는 배열이어야 합니다.");
        }
        if (gimmicks.size() > MAX_GIMMICKS) {
            throw invalid("기믹은 최대 " + MAX_GIMMICKS + "개까지 가능합니다.");
        }
        int index = 0;
        for (JsonNode gimmick : gimmicks) {
            index++;
            JsonNode typeNode = gimmick.get("type");
            if (typeNode == null || !typeNode.isTextual()) {
                throw invalid("기믹 #" + index + ": type이 필요합니다.");
            }
            String type = typeNode.asText();
            if (!ALLOWED_GIMMICK_TYPES.contains(type)) {
                throw invalid("기믹 #" + index + ": 지원하지 않는 type입니다. ("
                        + type + ") 사용 가능: JUMP_PAD, WIND, KILL_ZONE, WATER_PIPE");
            }
            switch (type) {
                case "JUMP_PAD" -> validateJumpPad(gimmick, index);
                case "WIND" -> validateWind(gimmick, index);
                case "KILL_ZONE" -> validateKillZone(gimmick, index);
                case "WATER_PIPE" -> validateWaterPipe(gimmick, index);
                default -> throw invalid("기믹 #" + index + ": 지원하지 않는 type입니다.");
            }
        }
    }

    /** MapConfigParser.readJumpPads와 동일 규칙 (size 양수, launchVelocity.y 음수). */
    private void validateJumpPad(JsonNode gimmick, int index) {
        String label = "기믹 #" + index + " (JUMP_PAD) ";
        requirePoint(gimmick.get("position"), label + "position");
        requirePoint(gimmick.get("size"), label + "size");
        requirePoint(gimmick.get("launchVelocity"), label + "launchVelocity");
        JsonNode size = gimmick.get("size");
        if (size.get(0).asDouble() <= 0 || size.get(1).asDouble() <= 0) {
            throw invalid(label + "size의 두 값은 0보다 커야 합니다.");
        }
        if (gimmick.get("launchVelocity").get(1).asDouble() >= 0) {
            throw invalid(label + "launchVelocity의 y는 음수여야 합니다(위 방향).");
        }
    }

    /** MapConfigParser.readWindZones와 동일 규칙. */
    private void validateWind(JsonNode gimmick, int index) {
        JsonNode band = gimmick.get("band");
        JsonNode strength = gimmick.get("strength");
        if (band == null || !band.isArray() || band.size() < 2
                || !band.get(0).isNumber() || !band.get(1).isNumber()) {
            throw invalid("기믹 #" + index + " (WIND): band는 [yTop, yBottom] 숫자 배열이어야 합니다.");
        }
        if (band.get(0).asDouble() >= band.get(1).asDouble()) {
            throw invalid("기믹 #" + index + " (WIND): yTop < yBottom 이어야 합니다.");
        }
        if (strength == null || !strength.isNumber() || strength.asDouble() <= 0) {
            throw invalid("기믹 #" + index + " (WIND): strength는 0보다 큰 숫자여야 합니다.");
        }
    }

    /** MapConfigParser.readKillZones와 동일 규칙. */
    private void validateKillZone(JsonNode gimmick, int index) {
        JsonNode area = gimmick.get("area");
        if (area == null || !area.isArray() || area.size() < 4
                || !area.get(0).isNumber() || !area.get(1).isNumber()
                || !area.get(2).isNumber() || !area.get(3).isNumber()) {
            throw invalid("기믹 #" + index + " (KILL_ZONE): area는 [x, y, w, h] 숫자 배열이어야 합니다.");
        }
        if (area.get(2).asDouble() <= 0 || area.get(3).asDouble() <= 0) {
            throw invalid("기믹 #" + index + " (KILL_ZONE): w, h는 0보다 커야 합니다.");
        }
    }

    /** MapConfigParser.readWaterPipes와 동일 규칙 (inlet/shutdownOnBlocked는 deprecated — 무시). */
    private void validateWaterPipe(JsonNode gimmick, int index) {
        requirePoint(gimmick.get("outlet"), "기믹 #" + index + " (WATER_PIPE) outlet");
        requirePoint(gimmick.get("flowDirection"), "기믹 #" + index + " (WATER_PIPE) flowDirection");
        JsonNode flowDirection = gimmick.get("flowDirection");
        if (flowDirection.get(0).asDouble() == 0 && flowDirection.get(1).asDouble() == 0) {
            throw invalid("기믹 #" + index + " (WATER_PIPE): flowDirection은 영벡터일 수 없습니다.");
        }
        JsonNode speed = gimmick.get("flowSpeed");
        if (speed == null || !speed.isNumber() || speed.asDouble() <= 0) {
            throw invalid("기믹 #" + index + " (WATER_PIPE): flowSpeed는 0보다 큰 숫자여야 합니다.");
        }
        JsonNode width = gimmick.get("width");
        if (width != null && (!width.isNumber() || width.asDouble() <= 0)) {
            throw invalid("기믹 #" + index + " (WATER_PIPE): width는 0보다 큰 숫자여야 합니다.");
        }
    }

    private void requirePoint(JsonNode node, String field) {
        if (node == null || !node.isArray() || node.size() < 2
                || !node.get(0).isNumber() || !node.get(1).isNumber()) {
            throw invalid(field + "은(는) [x, y] 형태의 숫자 배열이어야 합니다.");
        }
    }

    private GlobalException invalid(String detail) {
        return new GlobalException(ErrorCode.INVALID_MAP_CONFIG, detail);
    }
}
