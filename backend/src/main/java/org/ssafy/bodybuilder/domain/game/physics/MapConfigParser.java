package org.ssafy.bodybuilder.domain.game.physics;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;

/**
 * stage_rounds.map_config(JSON) 파싱 공용 유틸.
 *
 * <p>legacy·dyn4j 양쪽 엔진이 동일한 맵 해석을 공유한다.
 * 검증 규칙은 DevMapService.validateMapConfig와 정합해야 한다.
 */
public final class MapConfigParser {

    private MapConfigParser() {
    }

    public record Point(double x, double y) {
    }

    public record JumpPad(
            Point position,
            Point size,
            Point launchVelocity
    ) {
    }

    /**
     * WIND 기믹: y밴드 [yTop, yBottom] 내 x축 전체에 -x 방향 바람.
     * strength는 가속도(px/s²). 포즈 로드가 차폐물로 작동한다.
     */
    public record WindZone(
            double yTop,
            double yBottom,
            double strength
    ) {
    }

    /**
     * KILL_ZONE 기믹: 공 외곽이 닿으면 즉시 라운드 실패하는 사각형 즉사 구역.
     * area = [x, y, w, h] (좌상단 + 크기).
     */
    public record KillZone(
            double x,
            double y,
            double width,
            double height
    ) {
    }

    /**
     * WATER_PIPE 기믹: outlet에서 flowDirection으로 물이 분사되어 낙하하고,
     * 포즈 로드에 닿으면 다리를 타고 내리막으로 흐른다. 물살에 닿은 공은
     * 흐름 속도로 끌려간다. inlet/shutdownOnBlocked는 deprecated — 무시.
     */
    public record WaterPipe(
            Point outlet,
            Point flowDirection,
            double flowSpeed,
            double width
    ) {
    }

    /** WATER_PIPE width 기본값 (px). */
    public static final double WATER_PIPE_DEFAULT_WIDTH = 36.0;

    /**
     * 클리어 구역 (선택 필드): 공 외곽이 닿는 순간 클리어되는 사각형.
     * clearZone = [x, y, w, h] (좌상단 + 크기, KILL_ZONE area와 동일 포맷).
     *
     * <p>없으면(null) 기존 판정(공.x ≥ endPoint.x)으로 동작한다.
     * endPoint는 clearZone이 있어도 필수 — GOAL 마커 표시용으로 유지.
     */
    public record ClearZone(
            double x,
            double y,
            double width,
            double height
    ) {
    }

    public record ParsedMapConfig(
            Point startPoint,
            Point endPoint,
            List<Point> playerCenters,
            List<List<Point>> terrainPolygons,
            List<JumpPad> jumpPads,
            List<WindZone> windZones,
            List<KillZone> killZones,
            List<WaterPipe> waterPipes,
            ClearZone clearZone
    ) {
    }

    public static ParsedMapConfig parse(JsonNode mapConfig) {
        JsonNode gimmicks = mapConfig == null ? null : mapConfig.get("gimmicks");
        return new ParsedMapConfig(
                readPoint(mapConfig, "startPoint"),
                readPoint(mapConfig, "endPoint"),
                readPoints(mapConfig == null ? null : mapConfig.get("players")),
                readTerrain(mapConfig == null ? null : mapConfig.get("terrain")),
                readJumpPads(gimmicks),
                readWindZones(gimmicks),
                readKillZones(gimmicks),
                readWaterPipes(gimmicks),
                readClearZone(mapConfig == null ? null : mapConfig.get("clearZone"))
        );
    }

    /** 선택 필드 clearZone 파싱. 없으면 null, 있으면 [x,y,w,h]에 w·h > 0 필수. */
    public static ClearZone readClearZone(JsonNode clearZoneNode) {
        if (clearZoneNode == null || clearZoneNode.isNull()) {
            return null;
        }
        if (!clearZoneNode.isArray() || clearZoneNode.size() < 4) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }
        double x = clearZoneNode.get(0).asDouble();
        double y = clearZoneNode.get(1).asDouble();
        double width = clearZoneNode.get(2).asDouble();
        double height = clearZoneNode.get(3).asDouble();
        if (width <= 0 || height <= 0) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }
        return new ClearZone(x, y, width, height);
    }

    public static Point readPoint(JsonNode parent, String fieldName) {
        if (parent == null) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }
        JsonNode point = parent.get(fieldName);
        if (point == null || !point.isArray() || point.size() < 2) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }
        return new Point(point.get(0).asDouble(), point.get(1).asDouble());
    }

    public static List<Point> readPoints(JsonNode pointsNode) {
        if (pointsNode == null || !pointsNode.isArray()) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }
        List<Point> points = new ArrayList<>();
        for (JsonNode point : pointsNode) {
            if (!point.isArray() || point.size() < 2) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            points.add(new Point(point.get(0).asDouble(), point.get(1).asDouble()));
        }
        return List.copyOf(points);
    }

    public static List<List<Point>> readTerrain(JsonNode terrainNode) {
        if (terrainNode == null || terrainNode.isNull()) {
            return List.of();
        }
        if (!terrainNode.isArray()) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }

        List<List<Point>> polygons = new ArrayList<>();
        for (JsonNode polygonNode : terrainNode) {
            List<Point> polygon = readPoints(polygonNode);
            if (polygon.size() < 3) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            polygons.add(polygon);
        }
        return List.copyOf(polygons);
    }

    public static List<JumpPad> readJumpPads(JsonNode gimmicksNode) {
        if (gimmicksNode == null || gimmicksNode.isNull()) {
            return List.of();
        }
        if (!gimmicksNode.isArray()) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }

        List<JumpPad> jumpPads = new ArrayList<>();
        for (JsonNode gimmickNode : gimmicksNode) {
            if (gimmickNode == null || !gimmickNode.isObject()) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            JsonNode typeNode = gimmickNode.get("type");
            if (typeNode == null || !"JUMP_PAD".equals(typeNode.asText())) {
                continue;
            }

            Point position = readPoint(gimmickNode, "position");
            Point size = readPoint(gimmickNode, "size");
            Point launchVelocity = readPoint(gimmickNode, "launchVelocity");
            if (size.x() <= 0
                    || size.y() <= 0
                    || launchVelocity.y() >= 0) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            jumpPads.add(new JumpPad(position, size, launchVelocity));
        }
        return List.copyOf(jumpPads);
    }

    public static List<WindZone> readWindZones(JsonNode gimmicksNode) {
        if (gimmicksNode == null || gimmicksNode.isNull()) {
            return List.of();
        }
        if (!gimmicksNode.isArray()) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }

        List<WindZone> windZones = new ArrayList<>();
        for (JsonNode gimmickNode : gimmicksNode) {
            if (gimmickNode == null || !gimmickNode.isObject()) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            JsonNode typeNode = gimmickNode.get("type");
            if (typeNode == null || !"WIND".equals(typeNode.asText())) {
                continue;
            }

            JsonNode band = gimmickNode.get("band");
            JsonNode strengthNode = gimmickNode.get("strength");
            if (band == null || !band.isArray() || band.size() < 2
                    || strengthNode == null || !strengthNode.isNumber()) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            double yTop = band.get(0).asDouble();
            double yBottom = band.get(1).asDouble();
            double strength = strengthNode.asDouble();
            if (yTop >= yBottom || strength <= 0) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            windZones.add(new WindZone(yTop, yBottom, strength));
        }
        return List.copyOf(windZones);
    }

    public static List<KillZone> readKillZones(JsonNode gimmicksNode) {
        if (gimmicksNode == null || gimmicksNode.isNull()) {
            return List.of();
        }
        if (!gimmicksNode.isArray()) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }

        List<KillZone> killZones = new ArrayList<>();
        for (JsonNode gimmickNode : gimmicksNode) {
            if (gimmickNode == null || !gimmickNode.isObject()) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            JsonNode typeNode = gimmickNode.get("type");
            if (typeNode == null || !"KILL_ZONE".equals(typeNode.asText())) {
                continue;
            }

            JsonNode area = gimmickNode.get("area");
            if (area == null || !area.isArray() || area.size() < 4) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            double x = area.get(0).asDouble();
            double y = area.get(1).asDouble();
            double width = area.get(2).asDouble();
            double height = area.get(3).asDouble();
            if (width <= 0 || height <= 0) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            killZones.add(new KillZone(x, y, width, height));
        }
        return List.copyOf(killZones);
    }

    public static List<WaterPipe> readWaterPipes(JsonNode gimmicksNode) {
        if (gimmicksNode == null || gimmicksNode.isNull()) {
            return List.of();
        }
        if (!gimmicksNode.isArray()) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }

        List<WaterPipe> waterPipes = new ArrayList<>();
        for (JsonNode gimmickNode : gimmicksNode) {
            if (gimmickNode == null || !gimmickNode.isObject()) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            JsonNode typeNode = gimmickNode.get("type");
            if (typeNode == null || !"WATER_PIPE".equals(typeNode.asText())) {
                continue;
            }

            Point outlet = readPoint(gimmickNode, "outlet");
            Point flowDirection = readPoint(gimmickNode, "flowDirection");
            JsonNode speedNode = gimmickNode.get("flowSpeed");
            if (speedNode == null || !speedNode.isNumber()) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            double flowSpeed = speedNode.asDouble();
            JsonNode widthNode = gimmickNode.get("width");
            double width = widthNode != null && widthNode.isNumber()
                    ? widthNode.asDouble()
                    : WATER_PIPE_DEFAULT_WIDTH;
            if (flowSpeed <= 0 || width <= 0
                    || (flowDirection.x() == 0 && flowDirection.y() == 0)) {
                throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
            }
            waterPipes.add(new WaterPipe(outlet, flowDirection, flowSpeed, width));
        }
        return List.copyOf(waterPipes);
    }
}
