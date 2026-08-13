package org.ssafy.bodybuilder.domain.custommap.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapCreateRequest;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapDetailResponse;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapSummaryResponse;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapUpdateRequest;
import org.ssafy.bodybuilder.domain.custommap.model.CustomMap;
import org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRepository;
import org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRow;
import org.ssafy.bodybuilder.domain.custommap.validator.MapConfigValidator;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsSimulator;
import org.ssafy.bodybuilder.domain.game.physics.SimulationResult;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;

/**
 * 창작마당 유저 맵 서비스.
 *
 * <p>커스텀 맵은 별도 도메인으로 분리하지 않고 stages / stage_rounds에
 * is_official = false 행으로 삽입한다. 게임 루프(GameStartService, GameSimulationService,
 * Redis 세션, 리플레이, 아카이브)를 건드리지 않고 조회 레이어에서만 격리하기 위함이다.
 *
 * <p>공개 저장(is_public = true)은 클라이언트가 보낸 성공 플래그가 아니라
 * 제출된 포즈 시퀀스를 서버 PhysicsSimulator로 재현해 클리어를 확인한 요청만 통과시킨다.
 * create / update는 일부러 트랜잭션을 열지 않는다 — 이유는 CustomMapWriter 주석 참고.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CustomMapService {

    private static final int CUSTOM_ROUND_NO = 1;

    private final StageRoundRepository stageRoundRepository;
    private final CustomMapRepository customMapRepository;
    private final MapConfigValidator mapConfigValidator;
    private final PhysicsSimulator physicsSimulator;
    private final CustomMapSimulationExecutor customMapSimulationExecutor;
    private final CustomMapWriter customMapWriter;

    @Transactional(readOnly = true)
    public List<CustomMapSummaryResponse> getPublicMaps(String search, String difficulty, UUID userId) {
        return customMapRepository
                .findPublicRows(toLikePattern(search), blankToNull(difficulty))
                .stream()
                .map(row -> CustomMapSummaryResponse.of(row, userId))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CustomMapSummaryResponse> getMyMaps(UUID userId) {
        return customMapRepository.findRowsByCreator(userId).stream()
                .map(row -> CustomMapSummaryResponse.of(row, userId))
                .toList();
    }

    @Transactional(readOnly = true)
    public CustomMapDetailResponse getMap(Integer stageId, UUID userId) {
        CustomMapRow row = findRow(stageId);
        if (!Boolean.TRUE.equals(row.isPublic()) && !row.creatorUuid().equals(userId)) {
            throw new GlobalException(ErrorCode.ACCESS_DENIED);
        }
        return CustomMapDetailResponse.of(row, userId, findMapConfig(stageId));
    }

    public CustomMapDetailResponse create(CustomMapCreateRequest request, UUID userId) {
        mapConfigValidator.validateForSave(request.mapConfig(), request.difficulty(), request.palette());

        boolean requestedPublic = request.publicOrDefault();
        boolean isCleared = verifyClear(request.mapConfig(), request.poses(), requestedPublic);

        Integer stageId = customMapWriter.insert(request, userId, isCleared, requestedPublic);
        return CustomMapDetailResponse.of(findRow(stageId), userId, request.mapConfig());
    }

    public CustomMapDetailResponse update(Integer stageId, CustomMapUpdateRequest request, UUID userId) {
        // 소유권 확인을 먼저 한다. 남의 맵 요청으로 물리 시뮬레이션 CPU를 태우지 않기 위함이다.
        CustomMap customMap = customMapRepository.findByStageId(stageId)
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_NOT_FOUND));
        if (!customMap.isOwnedBy(userId)) {
            throw new GlobalException(ErrorCode.ACCESS_DENIED);
        }
        mapConfigValidator.validateForSave(request.mapConfig(), request.difficulty(), request.palette());

        // map_config가 바뀌면 이전 검증은 무효다. 공개 저장이면 항상 다시 재현해 본다.
        boolean requestedPublic = request.publicOrDefault();
        boolean isCleared = verifyClear(request.mapConfig(), request.poses(), requestedPublic);

        customMapWriter.applyUpdate(stageId, request, isCleared, requestedPublic);
        return CustomMapDetailResponse.of(findRow(stageId), userId, request.mapConfig());
    }

    /**
     * 에디터 시뮬레이션. 트랜잭션을 열지 않는다 —
     * 시뮬레이션이 도는 동안 DB 커넥션을 붙잡고 있을 이유가 없다.
     */
    public SimulationResult simulate(JsonNode mapConfig, List<List<List<Double>>> poses) {
        mapConfigValidator.validateForSimulate(mapConfig, poses);
        return runSimulation(mapConfig, poses);
    }

    /**
     * 에디터 물길 프리뷰 (개발명세서_BE_물기믹_유니온물길 BE-WATER-07).
     * 물리 적분이 없는 1ms 미만 연산이지만 남용 방지를 위해 simulate와 같은
     * 전용 스레드풀을 공유한다 (큐 포화 시 429). 계산 실패(JTS 예외 등)는 그대로
     * 전파되어 5xx — 200+빈 배열로 뭉개면 FE가 "물 없음"과 구분할 수 없다 (명세 §3).
     */
    public List<List<Double>> waterPreview(
            JsonNode mapConfig,
            List<List<List<Double>>> poses
    ) {
        mapConfigValidator.validateForSimulate(mapConfig, poses);
        validateNormalizedPoseRange(poses);
        return customMapSimulationExecutor.submitAndWait(
                () -> org.ssafy.bodybuilder.domain.game.physics.dyn4j.WaterFlowPreview
                        .of(mapConfig)
                        .compute(poses)
        );
    }

    /** 물길 프리뷰 poses는 정규화 [0..1]² 계약 — 이탈은 400 (명세 §3). */
    private void validateNormalizedPoseRange(List<List<List<Double>>> poses) {
        if (poses == null) {
            return;
        }
        for (List<List<Double>> pose : poses) {
            if (pose == null) {
                continue;
            }
            for (List<Double> point : pose) {
                double x = point.get(0) == null ? Double.NaN : point.get(0);
                double y = point.get(1) == null ? Double.NaN : point.get(1);
                if (!Double.isFinite(x) || !Double.isFinite(y)
                        || x < 0 || x > 1 || y < 0 || y > 1) {
                    throw new GlobalException(
                            ErrorCode.INVALID_INPUT_VALUE,
                            "poses 좌표는 정규화 [0..1] 범위여야 합니다."
                    );
                }
            }
        }
    }

    /**
     * 제출된 포즈로 실제 클리어가 재현되는지 확인한다.
     *
     * <p>공개 저장이면 포즈 누락·시뮬레이션 실패 모두 400 CUSTOM_MAP_NOT_CLEARED다.
     * 비공개(임시 저장)는 검증을 강제하지 않고 결과만 기록한다 — 만들다 만 맵도 저장할 수 있어야 한다.
     *
     * <p>단, 입력 복잡도 상한(validateForSimulate)은 공개·비공개 모두에 적용한다.
     * 여기서 빼면 비공개 저장 경로로 좌표 10만 개짜리 포즈를 밀어 넣어 상한 검증 전체를 우회할 수 있다.
     */
    private boolean verifyClear(
            JsonNode mapConfig,
            List<List<List<Double>>> poses,
            boolean requestedPublic
    ) {
        if (poses == null || poses.isEmpty()) {
            if (requestedPublic) {
                throw new GlobalException(
                        ErrorCode.CUSTOM_MAP_NOT_CLEARED,
                        "공개 업로드하려면 클리어에 성공한 포즈를 함께 제출해야 합니다."
                );
            }
            return false;
        }

        mapConfigValidator.validateForSimulate(mapConfig, poses);

        boolean cleared;
        if (requestedPublic) {
            cleared = Boolean.TRUE.equals(runSimulation(mapConfig, poses).result());
            if (!cleared) {
                throw new GlobalException(
                        ErrorCode.CUSTOM_MAP_NOT_CLEARED,
                        "제출한 포즈로는 맵을 클리어하지 못했습니다."
                );
            }
        } else {
            // 임시 저장은 시뮬레이션이 터져도 저장 자체를 막지 않는다.
            try {
                cleared = Boolean.TRUE.equals(runSimulation(mapConfig, poses).result());
            } catch (GlobalException exception) {
                if (exception.getErrorCode() == ErrorCode.TOO_MANY_REQUESTS) {
                    throw exception;
                }
                log.debug("임시 저장 클리어 검증 실패: {}", exception.getMessage());
                cleared = false;
            } catch (RuntimeException exception) {
                log.debug("임시 저장 클리어 검증 실패", exception);
                cleared = false;
            }
        }
        return cleared;
    }

    /** 물리 연산은 전부 전용 스레드풀을 거친다. 큐가 넘치면 429가 나간다. */
    private SimulationResult runSimulation(JsonNode mapConfig, List<List<List<Double>>> poses) {
        return customMapSimulationExecutor.submitAndWait(
                () -> physicsSimulator.simulate(mapConfig, poses)
        );
    }

    private CustomMapRow findRow(Integer stageId) {
        return customMapRepository.findRowByStageId(stageId)
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_NOT_FOUND));
    }

    private JsonNode findMapConfig(Integer stageId) {
        return stageRoundRepository.findByStageIdAndRoundNo(stageId, CUSTOM_ROUND_NO)
                .map(StageRound::getMapConfig)
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_HAS_NO_ROUNDS));
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String toLikePattern(String search) {
        String trimmed = blankToNull(search);
        return trimmed == null ? null : "%" + trimmed.toLowerCase() + "%";
    }
}
