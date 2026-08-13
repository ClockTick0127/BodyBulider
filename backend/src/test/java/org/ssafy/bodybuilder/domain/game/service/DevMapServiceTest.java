package org.ssafy.bodybuilder.domain.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.domain.game.dto.DevRoundSummaryResponse;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;

/** STEP 6 #3 — 관리자 맵 에디터 드롭다운에 커스텀 맵이 뜨지 않아야 한다. */
@ExtendWith(MockitoExtension.class)
class DevMapServiceTest {

    @InjectMocks
    private DevMapService devMapService;

    @Mock
    private StageRepository stageRepository;

    @Mock
    private StageRoundRepository stageRoundRepository;

    @Test
    @DisplayName("getRounds - 공식 라운드/스테이지만 조회한다")
    void getRoundsReturnsOfficialOnly() {
        Stage official = Stage.builder()
                .id(1)
                .name("하수도")
                .description("설명")
                .difficulty("중")
                .isOfficial(true)
                .build();
        StageRound round = StageRound.builder()
                .id(1)
                .stageId(1)
                .roundNo(1)
                .mapConfig(null)
                .build();
        given(stageRepository.findAllByIsOfficialTrueOrderByIdAsc()).willReturn(List.of(official));
        given(stageRoundRepository.findAllOfficialOrderByStageIdAscRoundNoAsc())
                .willReturn(List.of(round));

        List<DevRoundSummaryResponse> rounds = devMapService.getRounds();

        assertThat(rounds).hasSize(1);
        verify(stageRoundRepository).findAllOfficialOrderByStageIdAscRoundNoAsc();
        verify(stageRepository).findAllByIsOfficialTrueOrderByIdAsc();
    }
}
