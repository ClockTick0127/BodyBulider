package org.ssafy.bodybuilder.domain.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRepository;
import org.ssafy.bodybuilder.domain.game.dto.StageListResponse;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;

/** STEP 6 #3(공식 목록 필터), #9(커스텀 맵 상세 404), #10(비공개 맵 플레이 차단 판정). */
@ExtendWith(MockitoExtension.class)
class StageQueryServiceTest {

    @InjectMocks
    private StageQueryService stageQueryService;

    @Mock
    private StageRepository stageRepository;

    @Mock
    private StageRoundRepository stageRoundRepository;

    @Mock
    private CustomMapRepository customMapRepository;

    @Test
    @DisplayName("getStages - 공식 스테이지만 조회한다 (커스텀 맵 미노출)")
    void getStagesReturnsOfficialOnly() {
        given(stageRepository.findAllByIsOfficialTrueOrderByIdAsc())
                .willReturn(List.of(official(1, "하수도"), official(2, "강가")));

        List<StageListResponse> stages = stageQueryService.getStages();

        assertThat(stages).extracting(StageListResponse::stageId).containsExactly(1, 2);
        verify(stageRepository).findAllByIsOfficialTrueOrderByIdAsc();
    }

    @Test
    @DisplayName("getStage - 공식 스테이지는 정상 조회된다")
    void getStageReturnsOfficialStage() {
        given(stageRepository.findById(1)).willReturn(Optional.of(official(1, "하수도")));
        given(stageRoundRepository.findAllByStageIdOrderByRoundNoAsc(1)).willReturn(List.of());

        assertThat(stageQueryService.getStage(1)).isNotNull();
    }

    @Test
    @DisplayName("getStage - 커스텀 맵 stageId는 404다 (공식 상세 API로 새어 나가지 않는다)")
    void getStageRejectsCustomStage() {
        given(stageRepository.findById(10000)).willReturn(Optional.of(custom(10000)));

        assertThatThrownBy(() -> stageQueryService.getStage(10000))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.STAGE_NOT_FOUND);
    }

    @Test
    @DisplayName("getStage - 없는 stageId는 404다")
    void getStageRejectsUnknownStage() {
        given(stageRepository.findById(999)).willReturn(Optional.empty());

        assertThatThrownBy(() -> stageQueryService.getStage(999))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.STAGE_NOT_FOUND);
    }

    @Test
    @DisplayName("isPlayableCustomStage - 공개 커스텀 맵만 true, null은 조회 없이 false")
    void isPlayableCustomStageChecksPublicFlag() {
        given(customMapRepository.existsPublicByStageId(10000)).willReturn(true);
        given(customMapRepository.existsPublicByStageId(10001)).willReturn(false);

        assertThat(stageQueryService.isPlayableCustomStage(10000)).isTrue();
        assertThat(stageQueryService.isPlayableCustomStage(10001)).isFalse();
        assertThat(stageQueryService.isPlayableCustomStage(null)).isFalse();
    }

    private Stage official(int id, String name) {
        return Stage.builder()
                .id(id)
                .name(name)
                .description("설명")
                .difficulty("중")
                .isOfficial(true)
                .build();
    }

    private Stage custom(int id) {
        return Stage.builder()
                .id(id)
                .name("[UGC] 하늘 위의 도전 #abcd1234")
                .description("유저 설명")
                .difficulty("중")
                .isOfficial(false)
                .build();
    }
}
