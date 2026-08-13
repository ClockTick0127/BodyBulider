package org.ssafy.bodybuilder.domain.game.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.ssafy.bodybuilder.domain.game.model.RoundPoseSnapshot;
import org.ssafy.bodybuilder.domain.game.physics.dyn4j.WaterFlowPreview;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;

/**
 * 인게임 물길 브로드캐스트 공급 (개발명세서_BE_물기믹_유니온물길 BE-WATER-04·05).
 *
 * <p>mapConfig 파싱·지형 파싱 결과({@link WaterFlowPreview})는 라운드당 1회만 생성해
 * 캐시한다 — 포즈 제출마다 JSON을 재파싱하지 않는다. 캐시는 (gameSessionId, stageId,
 * roundNo) 키의 소형 LRU로, 라운드가 바뀌면 자연 교체된다.
 *
 * <p><b>예외 격리</b>: 물길 계산 실패는 무조건 null(페이로드 필드 생략)로 강등하고
 * WARN만 남긴다 — 포즈 브로드캐스트·라운드 시작 발행은 반드시 성공해야 한다.
 * null을 받은 FE는 필드 부재 규칙에 따라 로컬 계산으로 폴백한다 (명세 §3 표).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WaterFlowBroadcastService {

    private static final int CACHE_MAX_ENTRIES = 256;

    private final GameSessionRepository gameSessionRepository;
    private final StageRoundRepository stageRoundRepository;

    private record CacheKey(UUID gameSessionId, int stageId, int roundNo) {
    }

    private final Map<CacheKey, WaterFlowPreview> previewCache =
            java.util.Collections.synchronizedMap(
                    new LinkedHashMap<>(16, 0.75f, true) {
                        @Override
                        protected boolean removeEldestEntry(
                                Map.Entry<CacheKey, WaterFlowPreview> eldest
                        ) {
                            return size() > CACHE_MAX_ENTRIES;
                        }
                    });

    /**
     * 현재 라운드의 "각 플레이어 최신 제출 포즈" 기준 물길.
     *
     * @return [x1, y1, x2, y2, halfWidth] × N. 빈 리스트 = 물 없음(권위적).
     *         실패·세션 미확보 시 null — 호출자는 페이로드 필드를 생략한다.
     */
    public List<List<Double>> currentWaterFlows(UUID gameSessionId) {
        try {
            RoundPoseSnapshot snapshot = gameSessionRepository
                    .findRoundPoseSnapshot(gameSessionId)
                    .orElse(null);
            if (snapshot == null) {
                return null;
            }
            WaterFlowPreview preview = previewCache.computeIfAbsent(
                    new CacheKey(gameSessionId, snapshot.stageId(), snapshot.roundNo()),
                    key -> stageRoundRepository
                            .findByStageIdAndRoundNo(key.stageId(), key.roundNo())
                            .map(round -> WaterFlowPreview.of(round.getMapConfig()))
                            .orElse(null)
            );
            if (preview == null) {
                return null;
            }
            return preview.compute(snapshot.poses());
        } catch (Exception exception) {
            log.warn("물길 브로드캐스트 계산 실패 — 필드 생략으로 강등 (gameSessionId={})",
                    gameSessionId, exception);
            return null;
        }
    }

    /**
     * 라운드 시작(포즈 0개, 지형만) 물길 (BE-WATER-05).
     *
     * @return 실패 시 null — 호출자는 페이로드 필드를 생략한다.
     */
    public List<List<Double>> terrainOnlyWaterFlows(JsonNode mapConfig) {
        try {
            return WaterFlowPreview.of(mapConfig).compute(List.of());
        } catch (Exception exception) {
            log.warn("라운드 시작 물길 계산 실패 — 필드 생략으로 강등", exception);
            return null;
        }
    }
}
