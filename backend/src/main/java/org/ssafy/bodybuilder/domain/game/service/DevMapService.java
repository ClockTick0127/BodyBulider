package org.ssafy.bodybuilder.domain.game.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.dto.DevRoundDetailResponse;
import org.ssafy.bodybuilder.domain.game.dto.DevRoundSummaryResponse;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;

/**
 * 맵 에디터(/dev/map-editor) 전용 라운드 조회·저장 서비스.
 *
 * <p>운영 데이터를 직접 덮어쓰는 경로이므로, 저장 전에 물리 시뮬레이터(PhysicsSimulator)가
 * 읽는 필드들을 기준으로 최소한의 형식 검증을 수행한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DevMapService {

    private static final int MAX_PLAYERS = 4;
    private static final int MIN_POLYGON_VERTICES = 3;

    private final StageRepository stageRepository;
    private final StageRoundRepository stageRoundRepository;

    public List<DevRoundSummaryResponse> getRounds() {
        Map<Integer, String> stageNames = stageNames();
        return stageRoundRepository.findAllOfficialOrderByStageIdAscRoundNoAsc().stream()
                .map(round -> DevRoundSummaryResponse.of(round, stageNames.get(round.getStageId())))
                .toList();
    }

    public DevRoundDetailResponse getRound(Integer roundId) {
        StageRound round = findRound(roundId);
        return DevRoundDetailResponse.of(round, stageName(round.getStageId()));
    }

    @Transactional
    public DevRoundDetailResponse updateMapConfig(Integer roundId, JsonNode mapConfig) {
        StageRound round = findRound(roundId); // 존재 여부(404)를 형식 검증(400)보다 먼저 본다
        validateMapConfig(mapConfig);
        round.updateMapConfig(mapConfig);
        return DevRoundDetailResponse.of(round, stageName(round.getStageId()));
    }

    private StageRound findRound(Integer roundId) {
        return stageRoundRepository.findById(roundId)
                .orElseThrow(() -> new GlobalException(ErrorCode.ROUND_NOT_FOUND));
    }

    private Map<Integer, String> stageNames() {
        return stageRepository.findAllByIsOfficialTrueOrderByIdAsc().stream()
                .collect(Collectors.toMap(Stage::getId, Stage::getName));
    }

    private String stageName(Integer stageId) {
        return stageRepository.findById(stageId).map(Stage::getName).orElse(null);
    }

    /**
     * 물리 시뮬레이터(MapConfigParser)가 읽는 필드를 기준으로 한 최소 검증.
     * 시뮬레이터가 런타임에 터지는 형태(꼭짓점 2개짜리 폴리곤 등)를 DB에 넣지 못하게 막는다.
     */
    private void validateMapConfig(JsonNode mapConfig) {
        if (mapConfig == null || !mapConfig.isObject()) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG, "map_config는 JSON 객체여야 합니다.");
        }
        requirePoint(mapConfig.get("startPoint"), "startPoint");
        requirePoint(mapConfig.get("endPoint"), "endPoint");

        JsonNode players = mapConfig.get("players");
        if (players == null || !players.isArray() || players.isEmpty()) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG, "players는 1개 이상의 좌표 배열이어야 합니다.");
        }
        if (players.size() > MAX_PLAYERS) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "players는 최대 " + MAX_PLAYERS + "개까지 가능합니다.");
        }
        for (JsonNode player : players) {
            requirePoint(player, "players 항목");
        }

        JsonNode terrain = mapConfig.get("terrain");
        if (terrain != null && !terrain.isNull()) {
            if (!terrain.isArray()) {
                throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG, "terrain은 배열이어야 합니다.");
            }
            int index = 0;
            for (JsonNode polygon : terrain) {
                index++;
                if (!polygon.isArray() || polygon.size() < MIN_POLYGON_VERTICES) {
                    throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                            "지형 #" + index + "의 꼭짓점이 " + MIN_POLYGON_VERTICES + "개 미만입니다.");
                }
                for (JsonNode vertex : polygon) {
                    requirePoint(vertex, "지형 #" + index + " 꼭짓점");
                }
            }
        }

        JsonNode gimmicks = mapConfig.get("gimmicks");
        if (gimmicks != null && !gimmicks.isNull()) {
            if (!gimmicks.isArray()) {
                throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG, "gimmicks는 배열이어야 합니다.");
            }
            int index = 0;
            for (JsonNode gimmick : gimmicks) {
                index++;
                JsonNode type = gimmick.get("type");
                if (type != null && "WIND".equals(type.asText())) {
                    validateWindGimmick(gimmick, index);
                }
                if (type != null && "KILL_ZONE".equals(type.asText())) {
                    validateKillZoneGimmick(gimmick, index);
                }
                if (type != null && "WATER_PIPE".equals(type.asText())) {
                    validateWaterPipeGimmick(gimmick, index);
                }
            }
        }

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
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "clearZone은 [x, y, w, h] 숫자 배열이어야 합니다.");
        }
        if (clearZone.get(2).asDouble() <= 0 || clearZone.get(3).asDouble() <= 0) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "clearZone의 w, h는 0보다 커야 합니다.");
        }
    }

    /** MapConfigParser.readWaterPipes와 동일 규칙 (inlet/shutdownOnBlocked는 deprecated — 무시). */
    private void validateWaterPipeGimmick(JsonNode gimmick, int index) {
        requirePoint(gimmick.get("outlet"), "기믹 #" + index + " (WATER_PIPE) outlet");
        requirePoint(gimmick.get("flowDirection"), "기믹 #" + index + " (WATER_PIPE) flowDirection");
        if (gimmick.get("flowDirection").get(0).asDouble() == 0
                && gimmick.get("flowDirection").get(1).asDouble() == 0) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "기믹 #" + index + " (WATER_PIPE): flowDirection은 영벡터일 수 없습니다.");
        }
        JsonNode speed = gimmick.get("flowSpeed");
        if (speed == null || !speed.isNumber() || speed.asDouble() <= 0) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "기믹 #" + index + " (WATER_PIPE): flowSpeed는 0보다 큰 숫자여야 합니다.");
        }
        JsonNode width = gimmick.get("width");
        if (width != null && (!width.isNumber() || width.asDouble() <= 0)) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "기믹 #" + index + " (WATER_PIPE): width는 0보다 큰 숫자여야 합니다.");
        }
    }

    /** MapConfigParser.readKillZones와 동일 규칙. */
    private void validateKillZoneGimmick(JsonNode gimmick, int index) {
        JsonNode area = gimmick.get("area");
        if (area == null || !area.isArray() || area.size() < 4
                || !area.get(0).isNumber() || !area.get(1).isNumber()
                || !area.get(2).isNumber() || !area.get(3).isNumber()) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "기믹 #" + index + " (KILL_ZONE): area는 [x, y, w, h] 숫자 배열이어야 합니다.");
        }
        if (area.get(2).asDouble() <= 0 || area.get(3).asDouble() <= 0) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "기믹 #" + index + " (KILL_ZONE): w, h는 0보다 커야 합니다.");
        }
    }

    /** MapConfigParser.readWindZones와 동일 규칙. */
    private void validateWindGimmick(JsonNode gimmick, int index) {
        JsonNode band = gimmick.get("band");
        JsonNode strength = gimmick.get("strength");
        if (band == null || !band.isArray() || band.size() < 2
                || !band.get(0).isNumber() || !band.get(1).isNumber()) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "기믹 #" + index + " (WIND): band는 [yTop, yBottom] 숫자 배열이어야 합니다.");
        }
        if (band.get(0).asDouble() >= band.get(1).asDouble()) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "기믹 #" + index + " (WIND): yTop < yBottom 이어야 합니다.");
        }
        if (strength == null || !strength.isNumber() || strength.asDouble() <= 0) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    "기믹 #" + index + " (WIND): strength는 0보다 큰 숫자여야 합니다.");
        }
    }

    private void requirePoint(JsonNode node, String field) {
        if (node == null || !node.isArray() || node.size() < 2
                || !node.get(0).isNumber() || !node.get(1).isNumber()) {
            throw new GlobalException(ErrorCode.INVALID_MAP_CONFIG,
                    field + "은(는) [x, y] 형태의 숫자 배열이어야 합니다.");
        }
    }
}
