package org.ssafy.bodybuilder.domain.game.service;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRepository;
import org.ssafy.bodybuilder.domain.game.dto.StageDetailResponse;
import org.ssafy.bodybuilder.domain.game.dto.StageListResponse;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StageQueryService {

    private final StageRepository stageRepository;
    private final StageRoundRepository stageRoundRepository;
    private final CustomMapRepository customMapRepository;

    /** 공식 스테이지만 노출한다. 창작마당 맵은 /api/v1/custom-maps로 조회한다. */
    public List<StageListResponse> getStages() {
        return stageRepository.findAllByIsOfficialTrueOrderByIdAsc().stream()
                .map(StageListResponse::from)
                .toList();
    }

    /**
     * 공식 스테이지 상세.
     *
     * <p>is_official = false면 404다. 그러지 않으면 커스텀 맵 라운드가 공식 상세 API로 새어 나가고
     * 비공개 맵 차단도 이 경로로 우회된다.
     */
    public StageDetailResponse getStage(Integer stageId) {
        Stage stage = stageRepository.findById(stageId)
                .filter(Stage::isOfficial)
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_NOT_FOUND));
        return StageDetailResponse.of(
                stage,
                stageRoundRepository.findAllByStageIdOrderByRoundNoAsc(stageId)
        );
    }

    /**
     * 방에 걸 수 있는 공개 커스텀 맵인지 확인한다. (RoomService의 비공개 맵 차단용)
     *
     * <p>RoomService가 CustomMapRepository를 직접 주입받지 않는 이유:
     * RoomServiceTest / RoomConcurrencyTest가 @InjectMocks라서 선언되지 않은 의존성이 null로 남고,
     * 예외 경로에서 STAGE_NOT_FOUND 대신 NPE가 난다. 이미 @Mock으로 잡혀 있는 이 서비스에 둔다.
     */
    public boolean isPlayableCustomStage(Integer stageId) {
        return stageId != null && customMapRepository.existsPublicByStageId(stageId);
    }
}
