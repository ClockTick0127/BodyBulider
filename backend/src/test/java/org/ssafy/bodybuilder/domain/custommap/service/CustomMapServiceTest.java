package org.ssafy.bodybuilder.domain.custommap.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
 * STEP 6 #8(비공개 맵 인가), #11(내 맵 목록), #12(PUT 수정)
 * + 클리어 검증(공개 업로드는 서버 물리 재현을 통과한 요청만).
 */
@ExtendWith(MockitoExtension.class)
class CustomMapServiceTest {

    private static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    private static final UUID OTHER = UUID.fromString("00000000-0000-4000-8000-000000000002");
    private static final int STAGE_ID = 10000;
    private static final List<String> PALETTE = List.of("#3b5998", "#8bc4e8", "#f5c422");

    @InjectMocks
    private CustomMapService customMapService;

    @Mock
    private StageRoundRepository stageRoundRepository;

    @Mock
    private CustomMapRepository customMapRepository;

    @Mock
    private MapConfigValidator mapConfigValidator;

    @Mock
    private PhysicsSimulator physicsSimulator;

    @Mock
    private CustomMapSimulationExecutor customMapSimulationExecutor;

    @Mock
    private CustomMapWriter customMapWriter;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // --- 클리어 검증 (공개 업로드) ---

    @Test
    @DisplayName("create - 공개 업로드인데 poses가 없으면 저장하지 않고 400이다")
    void createPublicWithoutPosesIsRejected() {
        CustomMapCreateRequest request = createRequest(true, null);

        assertThatThrownBy(() -> customMapService.create(request, OWNER))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CUSTOM_MAP_NOT_CLEARED);

        verify(customMapWriter, never()).insert(any(), any(), anyBoolean(), anyBoolean());
        verify(customMapSimulationExecutor, never()).submitAndWait(any());
    }

    @Test
    @DisplayName("create - 공개 업로드인데 서버 시뮬레이션이 클리어에 실패하면 400이다")
    void createPublicWithFailingSimulationIsRejected() {
        CustomMapCreateRequest request = createRequest(true, poses());
        given(customMapSimulationExecutor.<SimulationResult>submitAndWait(any()))
                .willReturn(simulationResult(false));

        assertThatThrownBy(() -> customMapService.create(request, OWNER))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CUSTOM_MAP_NOT_CLEARED);

        verify(customMapWriter, never()).insert(any(), any(), anyBoolean(), anyBoolean());
    }

    @Test
    @DisplayName("create - 서버 시뮬레이션이 클리어를 재현하면 is_cleared·is_public 모두 true로 저장한다")
    void createPublicWithSuccessfulSimulationIsSaved() {
        CustomMapCreateRequest request = createRequest(true, poses());
        given(customMapSimulationExecutor.<SimulationResult>submitAndWait(any()))
                .willReturn(simulationResult(true));
        given(customMapWriter.insert(request, OWNER, true, true)).willReturn(STAGE_ID);
        given(customMapRepository.findRowByStageId(STAGE_ID))
                .willReturn(Optional.of(row(true, true)));

        CustomMapDetailResponse response = customMapService.create(request, OWNER);

        verify(customMapWriter).insert(request, OWNER, true, true);
        verify(mapConfigValidator).validateForSimulate(request.mapConfig(), request.poses());
        assertThat(response.isCleared()).isTrue();
        assertThat(response.isPublic()).isTrue();
    }

    // --- 임시 저장 (비공개) ---

    @Test
    @DisplayName("create - 비공개 임시 저장은 poses가 없어도 is_cleared = false로 저장된다")
    void createPrivateWithoutPosesIsSaved() {
        CustomMapCreateRequest request = createRequest(false, null);
        given(customMapWriter.insert(request, OWNER, false, false)).willReturn(STAGE_ID);
        given(customMapRepository.findRowByStageId(STAGE_ID))
                .willReturn(Optional.of(row(false, false)));

        assertThat(customMapService.create(request, OWNER).isCleared()).isFalse();
        verify(customMapSimulationExecutor, never()).submitAndWait(any());
    }

    @Test
    @DisplayName("create - 비공개 저장은 시뮬레이션이 실패해도 저장을 막지 않는다")
    void createPrivateKeepsSavingWhenSimulationFails() {
        CustomMapCreateRequest request = createRequest(false, poses());
        given(customMapSimulationExecutor.<SimulationResult>submitAndWait(any()))
                .willThrow(new GlobalException(ErrorCode.INVALID_INPUT_VALUE));
        given(customMapWriter.insert(request, OWNER, false, false)).willReturn(STAGE_ID);
        given(customMapRepository.findRowByStageId(STAGE_ID))
                .willReturn(Optional.of(row(false, false)));

        assertThat(customMapService.create(request, OWNER).isCleared()).isFalse();
        verify(customMapWriter).insert(request, OWNER, false, false);
    }

    @Test
    @DisplayName("create - 비공개 저장이라도 클리어에 성공했다면 is_cleared = true로 기록한다")
    void createPrivateRecordsClearResult() {
        CustomMapCreateRequest request = createRequest(false, poses());
        given(customMapSimulationExecutor.<SimulationResult>submitAndWait(any()))
                .willReturn(simulationResult(true));
        given(customMapWriter.insert(request, OWNER, true, false)).willReturn(STAGE_ID);
        given(customMapRepository.findRowByStageId(STAGE_ID))
                .willReturn(Optional.of(row(true, false)));

        CustomMapDetailResponse response = customMapService.create(request, OWNER);

        assertThat(response.isCleared()).isTrue();
        assertThat(response.isPublic()).isFalse();
    }

    @Test
    @DisplayName("create - is_public을 안 보내면 비공개(임시 저장)로 간주한다")
    void createDefaultsToPrivate() {
        CustomMapCreateRequest request = new CustomMapCreateRequest(
                "하늘 위의 도전", "설명", "중", PALETTE, null, mapConfig(), null);
        given(customMapWriter.insert(request, OWNER, false, false)).willReturn(STAGE_ID);
        given(customMapRepository.findRowByStageId(STAGE_ID))
                .willReturn(Optional.of(row(false, false)));

        assertThat(customMapService.create(request, OWNER).isPublic()).isFalse();
    }

    @Test
    @DisplayName("create - 비공개 저장도 포즈 상한 검증은 그대로 받는다 (우회 차단)")
    void createPrivateStillEnforcesPoseLimits() {
        CustomMapCreateRequest request = createRequest(false, poses());
        willThrow(new GlobalException(ErrorCode.INVALID_MAP_CONFIG))
                .given(mapConfigValidator).validateForSimulate(any(), any());

        assertThatThrownBy(() -> customMapService.create(request, OWNER))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_MAP_CONFIG);

        verify(customMapWriter, never()).insert(any(), any(), anyBoolean(), anyBoolean());
    }

    @Test
    @DisplayName("create - 비공개 저장이어도 스레드풀 과부하(429)는 삼키지 않는다")
    void createPrivatePropagatesTooManyRequests() {
        CustomMapCreateRequest request = createRequest(false, poses());
        given(customMapSimulationExecutor.<SimulationResult>submitAndWait(any()))
                .willThrow(new GlobalException(ErrorCode.TOO_MANY_REQUESTS));

        assertThatThrownBy(() -> customMapService.create(request, OWNER))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.TOO_MANY_REQUESTS);
    }

    // --- update ---

    @Test
    @DisplayName("update - 공개로 전환하려면 poses를 다시 제출해야 한다")
    void updateToPublicRequiresPoses() {
        given(customMapRepository.findByStageId(STAGE_ID)).willReturn(Optional.of(customMap()));

        assertThatThrownBy(() -> customMapService.update(
                STAGE_ID, updateRequest(true, null), OWNER))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CUSTOM_MAP_NOT_CLEARED);

        verify(customMapWriter, never()).applyUpdate(any(), any(), anyBoolean(), anyBoolean());
    }

    @Test
    @DisplayName("update - 클리어를 재현하면 is_cleared = true로 갱신한다")
    void updateVerifiesClearBeforePublishing() {
        CustomMapUpdateRequest request = updateRequest(true, poses());
        given(customMapRepository.findByStageId(STAGE_ID)).willReturn(Optional.of(customMap()));
        given(customMapSimulationExecutor.<SimulationResult>submitAndWait(any()))
                .willReturn(simulationResult(true));
        given(customMapRepository.findRowByStageId(STAGE_ID))
                .willReturn(Optional.of(row(true, true)));

        customMapService.update(STAGE_ID, request, OWNER);

        verify(customMapWriter).applyUpdate(STAGE_ID, request, true, true);
    }

    @Test
    @DisplayName("update - 타인의 맵은 403이고 시뮬레이션 CPU를 태우지 않는다")
    void updateRejectsOtherUserBeforeSimulating() {
        given(customMapRepository.findByStageId(STAGE_ID)).willReturn(Optional.of(customMap()));

        assertThatThrownBy(() -> customMapService.update(
                STAGE_ID, updateRequest(true, poses()), OTHER))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ACCESS_DENIED);

        verify(customMapSimulationExecutor, never()).submitAndWait(any());
        verify(mapConfigValidator, never()).validateForSave(any(), any(), any());
        verify(customMapWriter, never()).applyUpdate(any(), any(), anyBoolean(), anyBoolean());
    }

    @Test
    @DisplayName("update - 없는 맵은 404다")
    void updateRejectsUnknownStage() {
        given(customMapRepository.findByStageId(STAGE_ID)).willReturn(Optional.empty());

        assertThatThrownBy(() -> customMapService.update(
                STAGE_ID, updateRequest(false, null), OWNER))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.STAGE_NOT_FOUND);
    }

    // --- 조회 인가 ---

    @Test
    @DisplayName("getMap - 타인의 비공개 맵은 403이다")
    void getMapRejectsPrivateMapOfOtherUser() {
        given(customMapRepository.findRowByStageId(STAGE_ID))
                .willReturn(Optional.of(row(false, false)));

        assertThatThrownBy(() -> customMapService.getMap(STAGE_ID, OTHER))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ACCESS_DENIED);
    }

    @Test
    @DisplayName("getMap - 본인의 비공개 맵은 200이고 is_mine이 true다")
    void getMapAllowsOwnerOfPrivateMap() {
        given(customMapRepository.findRowByStageId(STAGE_ID))
                .willReturn(Optional.of(row(false, false)));
        given(stageRoundRepository.findByStageIdAndRoundNo(STAGE_ID, 1))
                .willReturn(Optional.of(StageRound.builder()
                        .id(100001).stageId(STAGE_ID).roundNo(1).mapConfig(mapConfig()).build()));

        CustomMapDetailResponse response = customMapService.getMap(STAGE_ID, OWNER);

        assertThat(response.isMine()).isTrue();
        assertThat(response.isPublic()).isFalse();
        assertThat(response.mapConfig()).isNotNull();
    }

    @Test
    @DisplayName("getMap - 공개 맵은 타인도 볼 수 있고 is_mine은 false다")
    void getMapAllowsOtherUserOnPublicMap() {
        given(customMapRepository.findRowByStageId(STAGE_ID))
                .willReturn(Optional.of(row(true, true)));
        given(stageRoundRepository.findByStageIdAndRoundNo(STAGE_ID, 1))
                .willReturn(Optional.of(StageRound.builder()
                        .id(100001).stageId(STAGE_ID).roundNo(1).mapConfig(mapConfig()).build()));

        assertThat(customMapService.getMap(STAGE_ID, OTHER).isMine()).isFalse();
    }

    @Test
    @DisplayName("getMap - 없는 맵은 404다")
    void getMapRejectsUnknownStage() {
        given(customMapRepository.findRowByStageId(STAGE_ID)).willReturn(Optional.empty());

        assertThatThrownBy(() -> customMapService.getMap(STAGE_ID, OWNER))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.STAGE_NOT_FOUND);
    }

    // --- 목록 ---

    @Test
    @DisplayName("getMyMaps - 비공개 맵도 포함해 내 맵 전체를 돌려준다")
    void getMyMapsIncludesPrivateMaps() {
        given(customMapRepository.findRowsByCreator(OWNER))
                .willReturn(List.of(row(true, true), row(false, false)));

        assertThat(customMapService.getMyMaps(OWNER))
                .extracting(CustomMapSummaryResponse::isPublic)
                .containsExactly(true, false);
        assertThat(customMapService.getMyMaps(OWNER))
                .allMatch(summary -> Boolean.TRUE.equals(summary.isMine()));
    }

    @Test
    @DisplayName("getPublicMaps - search는 소문자 %패턴%으로, 빈 문자열은 null로 정규화한다")
    void getPublicMapsNormalizesFilters() {
        given(customMapRepository.findPublicRows("%하늘%", "중"))
                .willReturn(List.of(row(true, true)));
        given(customMapRepository.findPublicRows(null, null))
                .willReturn(List.of(row(true, true)));

        assertThat(customMapService.getPublicMaps(" 하늘 ", "중", OWNER)).hasSize(1);
        assertThat(customMapService.getPublicMaps("  ", "", OWNER)).hasSize(1);
    }

    // --- simulate ---

    @Test
    @DisplayName("simulate - 검증을 통과한 요청만 전용 스레드풀로 넘어간다")
    void simulateValidatesBeforeSubmitting() {
        ObjectNode mapConfig = mapConfig();
        SimulationResult expected = simulationResult(true);
        given(customMapSimulationExecutor.<SimulationResult>submitAndWait(any())).willReturn(expected);

        assertThat(customMapService.simulate(mapConfig, poses())).isEqualTo(expected);
        verify(mapConfigValidator).validateForSimulate(eq(mapConfig), any());
    }

    @Test
    @DisplayName("simulate - 검증에 실패하면 스레드풀을 쓰지 않는다")
    void simulateSkipsExecutorWhenValidationFails() {
        willThrow(new GlobalException(ErrorCode.INVALID_MAP_CONFIG))
                .given(mapConfigValidator).validateForSimulate(any(), any());

        assertThatThrownBy(() -> customMapService.simulate(mapConfig(), List.of()))
                .isInstanceOf(GlobalException.class);

        verify(customMapSimulationExecutor, never()).submitAndWait(any());
    }

    // --- 헬퍼 ---

    private CustomMapCreateRequest createRequest(boolean isPublic, List<List<List<Double>>> poses) {
        return new CustomMapCreateRequest(
                "하늘 위의 도전", "구름 위를 뛰어다니는 감각!", "중", PALETTE, isPublic, mapConfig(), poses);
    }

    private CustomMapUpdateRequest updateRequest(boolean isPublic, List<List<List<Double>>> poses) {
        return new CustomMapUpdateRequest(
                "바뀐 설명", "상", PALETTE, isPublic, mapConfig(), poses);
    }

    private CustomMap customMap() {
        return CustomMap.create(
                STAGE_ID, "하늘 위의 도전", OWNER, "#111111,#222222,#333333", 5, 2, false, false);
    }

    private List<List<List<Double>>> poses() {
        return List.of(List.of(List.of(0.1, 0.2), List.of(0.3, 0.4)));
    }

    private SimulationResult simulationResult(boolean cleared) {
        return new SimulationResult(30, List.of(List.of(1.0, 2.0, 3.0, 4.0)), cleared);
    }

    private CustomMapRow row(boolean isCleared, boolean isPublic) {
        return new CustomMapRow(
                STAGE_ID,
                "하늘 위의 도전",
                "구름 위를 뛰어다니는 감각!",
                "중",
                "정상화",
                OWNER,
                "#3b5998,#8bc4e8,#f5c422",
                5,
                2,
                342,
                0,
                isCleared,
                isPublic,
                LocalDateTime.of(2026, 8, 1, 10, 0)
        );
    }

    private ObjectNode mapConfig() {
        ObjectNode mapConfig = objectMapper.createObjectNode();
        mapConfig.putArray("terrain");
        mapConfig.putArray("gimmicks");
        return mapConfig;
    }
}
