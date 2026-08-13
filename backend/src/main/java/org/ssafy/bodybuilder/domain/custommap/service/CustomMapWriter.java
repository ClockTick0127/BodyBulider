package org.ssafy.bodybuilder.domain.custommap.service;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapCreateRequest;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapUpdateRequest;
import org.ssafy.bodybuilder.domain.custommap.dto.PaletteCodec;
import org.ssafy.bodybuilder.domain.custommap.model.CustomMap;
import org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRepository;
import org.ssafy.bodybuilder.domain.custommap.validator.MapConfigValidator;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;

/**
 * 창작마당 맵의 DB 쓰기만 담당한다.
 *
 * <p>CustomMapService에서 분리한 이유: 공개 저장은 물리 시뮬레이션으로 클리어를 재현한 뒤에야
 * 저장할 수 있는데, 그 시뮬레이션을 트랜잭션 안에서 돌리면 최대 2,700스텝짜리 CPU 작업이 도는 동안
 * HikariCP 커넥션을 붙잡고 있게 된다. 전용 스레드풀(2 + 큐 10)까지 합치면 최대 12개 요청이
 * 커넥션을 점유한 채 대기해 기본 풀(10)을 말려 죽인다 — 창작마당뿐 아니라 게임 루프까지 멈춘다.
 *
 * <p>그래서 검증은 트랜잭션 밖(CustomMapService)에서 끝내고, 여기서는 짧은 쓰기 트랜잭션만 연다.
 */
@Service
@RequiredArgsConstructor
public class CustomMapWriter {

    /** 커스텀 맵은 LAST_ROUND(3)와 무관하게 1라운드로만 정의한다. */
    private static final int CUSTOM_ROUND_NO = 1;

    /** round_id = stage_id * 10 + round_no. 커스텀 최소 100001로 공식(1~6)과 충돌하지 않는다. */
    private static final int ROUND_ID_MULTIPLIER = 10;

    private static final String NAME_PREFIX = "[UGC] ";
    private static final int NAME_SUFFIX_LENGTH = 8;
    private static final int NAME_ATTEMPTS = 5;

    private final StageRepository stageRepository;
    private final StageRoundRepository stageRoundRepository;
    private final CustomMapRepository customMapRepository;

    @Transactional
    public Integer insert(
            CustomMapCreateRequest request,
            UUID creatorUuid,
            boolean isCleared,
            boolean isPublic
    ) {
        Stage stage = stageRepository.save(Stage.createCustom(
                generateUniqueStageName(request.title()),
                request.description(),
                request.difficulty()
        ));
        Integer stageId = stage.getId();

        stageRoundRepository.save(StageRound.builder()
                .id(stageId * ROUND_ID_MULTIPLIER + CUSTOM_ROUND_NO)
                .stageId(stageId)
                .roundNo(CUSTOM_ROUND_NO)
                .mapConfig(request.mapConfig())
                .build());

        customMapRepository.save(CustomMap.create(
                stageId,
                request.title(),
                creatorUuid,
                PaletteCodec.join(request.palette()),
                MapConfigValidator.countPolygons(request.mapConfig()),
                MapConfigValidator.countGimmicks(request.mapConfig()),
                isCleared,
                isPublic
        ));
        return stageId;
    }

    @Transactional
    public void applyUpdate(
            Integer stageId,
            CustomMapUpdateRequest request,
            boolean isCleared,
            boolean isPublic
    ) {
        CustomMap customMap = customMapRepository.findByStageId(stageId)
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_NOT_FOUND));

        Stage stage = stageRepository.findById(stageId)
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_NOT_FOUND));
        stage.updateCustomMeta(request.description(), request.difficulty());

        StageRound round = stageRoundRepository
                .findByStageIdAndRoundNo(stageId, CUSTOM_ROUND_NO)
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_HAS_NO_ROUNDS));
        round.updateMapConfig(request.mapConfig());

        customMap.update(
                PaletteCodec.join(request.palette()),
                MapConfigValidator.countPolygons(request.mapConfig()),
                MapConfigValidator.countGimmicks(request.mapConfig()),
                isCleared,
                isPublic
        );
    }

    /**
     * uk_stages_name 회피용 이름 생성.
     * "[UGC] {title} #{uuid8}" 이라 title까지 같아야 충돌하므로 위험은 낮지만,
     * 충돌 시 DataIntegrityViolationException이 500으로 나가므로 INSERT 전에 걸러낸다.
     */
    private String generateUniqueStageName(String title) {
        String name = null;
        for (int attempt = 0; attempt < NAME_ATTEMPTS; attempt++) {
            name = NAME_PREFIX + title + " #"
                    + UUID.randomUUID().toString().substring(0, NAME_SUFFIX_LENGTH);
            if (!stageRepository.existsByName(name)) {
                return name;
            }
        }
        return name;
    }
}
