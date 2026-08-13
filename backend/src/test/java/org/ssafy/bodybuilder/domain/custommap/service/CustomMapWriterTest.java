package org.ssafy.bodybuilder.domain.custommap.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapCreateRequest;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapUpdateRequest;
import org.ssafy.bodybuilder.domain.custommap.model.CustomMap;
import org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRepository;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;

/** STEP 6 #4(채번 규칙), #5(이름 충돌 방지), #12(PUT은 기존 행을 갱신). */
@ExtendWith(MockitoExtension.class)
class CustomMapWriterTest {

    private static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    private static final int STAGE_ID = 10000;
    private static final List<String> PALETTE = List.of("#3b5998", "#8bc4e8", "#f5c422");

    @InjectMocks
    private CustomMapWriter customMapWriter;

    @Mock
    private StageRepository stageRepository;

    @Mock
    private StageRoundRepository stageRoundRepository;

    @Mock
    private CustomMapRepository customMapRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("insert - round_id는 stage_id * 10 + 1로 결정되고 검증 결과가 그대로 저장된다")
    void insertAssignsDeterministicRoundId() {
        ObjectNode mapConfig = mapConfig();
        given(stageRepository.save(any(Stage.class))).willReturn(stageWithId());

        Integer stageId = customMapWriter.insert(createRequest(mapConfig), OWNER, true, true);

        assertThat(stageId).isEqualTo(STAGE_ID);

        ArgumentCaptor<StageRound> roundCaptor = ArgumentCaptor.forClass(StageRound.class);
        verify(stageRoundRepository).save(roundCaptor.capture());
        assertThat(roundCaptor.getValue().getId()).isEqualTo(100001);
        assertThat(roundCaptor.getValue().getStageId()).isEqualTo(STAGE_ID);
        assertThat(roundCaptor.getValue().getRoundNo()).isEqualTo(1);
        assertThat(roundCaptor.getValue().getMapConfig()).isEqualTo(mapConfig);

        ArgumentCaptor<CustomMap> mapCaptor = ArgumentCaptor.forClass(CustomMap.class);
        verify(customMapRepository).save(mapCaptor.capture());
        assertThat(mapCaptor.getValue().getStageId()).isEqualTo(STAGE_ID);
        assertThat(mapCaptor.getValue().getCreatorUuid()).isEqualTo(OWNER);
        assertThat(mapCaptor.getValue().getPalette()).isEqualTo("#3b5998,#8bc4e8,#f5c422");
        assertThat(mapCaptor.getValue().isCleared()).isTrue();
        assertThat(mapCaptor.getValue().isPublic()).isTrue();
        assertThat(mapCaptor.getValue().getPlayCount()).isZero();
        assertThat(mapCaptor.getValue().getLikeCount()).isZero();
    }

    @Test
    @DisplayName("insert - stages.name에 UUID 접미사를 붙여 uk_stages_name 충돌을 피한다")
    void insertGeneratesUniqueStageName() {
        given(stageRepository.save(any(Stage.class))).willReturn(stageWithId());

        customMapWriter.insert(createRequest(mapConfig()), OWNER, false, false);

        ArgumentCaptor<Stage> stageCaptor = ArgumentCaptor.forClass(Stage.class);
        verify(stageRepository).save(stageCaptor.capture());
        assertThat(stageCaptor.getValue().getName())
                .startsWith("[UGC] 하늘 위의 도전 #")
                .hasSize("[UGC] 하늘 위의 도전 #".length() + 8);
        assertThat(stageCaptor.getValue().isOfficial()).isFalse();
        assertThat(stageCaptor.getValue().getDescription()).isEqualTo("구름 위를 뛰어다니는 감각!");
        assertThat(stageCaptor.getValue().getDifficulty()).isEqualTo("중");
    }

    @Test
    @DisplayName("insert - 이름이 이미 있으면 다시 뽑아 INSERT 전에 충돌을 걸러낸다")
    void insertRetriesWhenNameAlreadyExists() {
        given(stageRepository.existsByName(any())).willReturn(true, false);
        given(stageRepository.save(any(Stage.class))).willReturn(stageWithId());

        customMapWriter.insert(createRequest(mapConfig()), OWNER, false, false);

        verify(stageRepository, org.mockito.Mockito.times(2)).existsByName(any());
    }

    @Test
    @DisplayName("applyUpdate - 기존 행을 갱신하고 새 행을 만들지 않는다")
    void applyUpdateMutatesExistingRows() {
        CustomMap customMap = CustomMap.create(
                STAGE_ID, "하늘 위의 도전", OWNER, "#111111,#222222,#333333", 5, 2, false, false);
        Stage stage = stageWithId();
        StageRound round = StageRound.builder()
                .id(100001).stageId(STAGE_ID).roundNo(1)
                .mapConfig(objectMapper.createObjectNode()).build();
        ObjectNode newMapConfig = mapConfig();
        given(customMapRepository.findByStageId(STAGE_ID)).willReturn(Optional.of(customMap));
        given(stageRepository.findById(STAGE_ID)).willReturn(Optional.of(stage));
        given(stageRoundRepository.findByStageIdAndRoundNo(STAGE_ID, 1)).willReturn(Optional.of(round));

        customMapWriter.applyUpdate(
                STAGE_ID,
                new CustomMapUpdateRequest("바뀐 설명", "상", PALETTE, true, newMapConfig, null),
                true,
                true
        );

        assertThat(stage.getDescription()).isEqualTo("바뀐 설명");
        assertThat(stage.getDifficulty()).isEqualTo("상");
        assertThat(round.getMapConfig()).isEqualTo(newMapConfig);
        assertThat(customMap.getPalette()).isEqualTo("#3b5998,#8bc4e8,#f5c422");
        assertThat(customMap.isCleared()).isTrue();
        assertThat(customMap.isPublic()).isTrue();
        verify(customMapRepository, org.mockito.Mockito.never()).save(any(CustomMap.class));
        verify(stageRepository, org.mockito.Mockito.never()).save(any(Stage.class));
        verify(stageRoundRepository, org.mockito.Mockito.never()).save(any(StageRound.class));
    }

    private CustomMapCreateRequest createRequest(ObjectNode mapConfig) {
        return new CustomMapCreateRequest(
                "하늘 위의 도전", "구름 위를 뛰어다니는 감각!", "중", PALETTE, true, mapConfig, null);
    }

    private Stage stageWithId() {
        return Stage.builder()
                .id(STAGE_ID)
                .name("[UGC] 하늘 위의 도전 #abcd1234")
                .description("설명")
                .difficulty("중")
                .isOfficial(false)
                .build();
    }

    private ObjectNode mapConfig() {
        ObjectNode mapConfig = objectMapper.createObjectNode();
        mapConfig.putArray("terrain");
        mapConfig.putArray("gimmicks");
        return mapConfig;
    }
}
