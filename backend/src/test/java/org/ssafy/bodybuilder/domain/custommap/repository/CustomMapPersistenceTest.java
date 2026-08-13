package org.ssafy.bodybuilder.domain.custommap.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.ssafy.bodybuilder.domain.custommap.model.CustomMap;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.model.User;

/**
 * STEP 6 #0(마이그레이션 기동), #3(공식 목록 필터), #4(채번·대역),
 * #5(이름 충돌), #10(내 맵 목록), #15(검색·필터), #16(플레이 수).
 *
 * <p>빈 H2에 V1 -> V2 -> V3 -> V4를 실제로 적용하고 돌린다.
 * 즉 stage_id 예약 대역(>= 10000)과 벤더 분리 마이그레이션이 여기서 함께 검증된다.
 */
@DataJpaTest(properties = {
        "spring.flyway.enabled=true",
        "spring.sql.init.mode=never",
        "spring.test.database.replace=none",
        "spring.datasource.url=jdbc:h2:mem:custom-map-repository;"
                + "MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE"
})
class CustomMapPersistenceTest {

    private static final List<String> PALETTE_CSV_PARTS =
            List.of("#3b5998", "#8bc4e8", "#f5c422");

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private StageRepository stageRepository;

    @Autowired
    private StageRoundRepository stageRoundRepository;

    @Autowired
    private CustomMapRepository customMapRepository;

    @Autowired
    private UserRepository userRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private UUID creator;
    private UUID otherUser;

    @BeforeEach
    void setUp() {
        creator = userRepository.save(User.of("정상화")).getId();
        otherUser = userRepository.save(User.of("다른유저")).getId();
        entityManager.flush();

        // 공식 스테이지는 마이그레이션/시드 SQL로만 생성한다는 규칙에 맞춰 네이티브로 넣는다.
        entityManager.createNativeQuery("""
                INSERT INTO stages (stage_id, name, description, difficulty, is_official)
                VALUES (1, '하수도', '공식 설명', '하', 1)
                """).executeUpdate();
        // stage_rounds.map_config는 JSON 타입이라 네이티브 문자열 대신 엔티티로 넣는다.
        stageRoundRepository.save(StageRound.builder()
                .id(1)
                .stageId(1)
                .roundNo(1)
                .mapConfig(objectMapper.createObjectNode())
                .build());
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @DisplayName("커스텀 스테이지는 예약 대역 10000 이상으로 채번되고 round_id는 stage_id * 10 + 1이다")
    void assignsReservedIdBand() {
        Stage stage = saveCustomStage("하늘 위의 도전", "중");

        assertThat(stage.getId()).isGreaterThanOrEqualTo(10000);

        StageRound round = saveCustomRound(stage.getId());
        assertThat(round.getId()).isEqualTo(stage.getId() * 10 + 1);
        assertThat(round.getId()).isGreaterThanOrEqualTo(100001);
    }

    @Test
    @DisplayName("연속 저장해도 stage_id가 충돌하지 않고 round_id도 서로 다르다")
    void assignsDistinctIdsForConsecutiveSaves() {
        Stage first = saveCustomStage("맵 A", "하");
        Stage second = saveCustomStage("맵 B", "상");

        assertThat(first.getId()).isNotEqualTo(second.getId());
        assertThat(saveCustomRound(first.getId()).getId())
                .isNotEqualTo(saveCustomRound(second.getId()).getId());
    }

    @Test
    @DisplayName("같은 제목을 두 번 저장해도 UUID 접미사 덕분에 uk_stages_name과 충돌하지 않는다")
    void allowsDuplicateTitlesWithUniqueStageName() {
        Stage first = saveCustomStage("같은 제목", "중");
        Stage second = saveCustomStage("같은 제목", "중");
        entityManager.flush();

        assertThat(first.getName()).isNotEqualTo(second.getName());
        assertThat(stageRepository.existsByName(first.getName())).isTrue();
    }

    @Test
    @DisplayName("공식 목록·에디터 드롭다운에 커스텀 맵이 노출되지 않는다")
    void officialQueriesExcludeCustomMaps() {
        Stage custom = saveCustomStage("하늘 위의 도전", "중");
        saveCustomRound(custom.getId());
        entityManager.flush();
        entityManager.clear();

        assertThat(stageRepository.findAllByIsOfficialTrueOrderByIdAsc())
                .extracting(Stage::getId)
                .containsExactly(1);
        assertThat(stageRoundRepository.findAllOfficialOrderByStageIdAscRoundNoAsc())
                .extracting(StageRound::getStageId)
                .containsExactly(1);
        assertThat(stageRepository.findAllByOrderByIdAsc()).hasSize(2);
    }

    @Test
    @DisplayName("공개 목록은 비공개 맵을 빼고, 내 맵 목록은 비공개 맵을 포함한다")
    void publicListExcludesPrivateMapsButMyListIncludesThem() {
        createCustomMap("공개 맵", "중", true, creator);
        createCustomMap("비공개 맵", "중", false, creator);
        entityManager.flush();
        entityManager.clear();

        assertThat(customMapRepository.findPublicRows(null, null))
                .extracting(CustomMapRow::title)
                .containsExactly("공개 맵");
        assertThat(customMapRepository.findRowsByCreator(creator))
                .extracting(CustomMapRow::title)
                .containsExactlyInAnyOrder("공개 맵", "비공개 맵");
        assertThat(customMapRepository.findRowsByCreator(otherUser)).isEmpty();
    }

    @Test
    @DisplayName("조인 결과에 작성자 닉네임과 stages의 설명·난이도가 함께 실린다")
    void rowCarriesJoinedColumns() {
        createCustomMap("하늘 위의 도전", "상", true, creator);
        entityManager.flush();
        entityManager.clear();

        CustomMapRow row = customMapRepository.findRowByStageId(
                customMapRepository.findAll().get(0).getStageId()).orElseThrow();

        assertThat(row.creatorNickname()).isEqualTo("정상화");
        assertThat(row.difficulty()).isEqualTo("상");
        assertThat(row.description()).isEqualTo("하늘 위의 도전 설명");
        assertThat(row.palette()).isEqualTo("#3b5998,#8bc4e8,#f5c422");
        assertThat(row.polygonCount()).isEqualTo(5);
        assertThat(row.gimmickCount()).isEqualTo(2);
        assertThat(row.isCleared()).isTrue();
        assertThat(row.isPublic()).isTrue();
        assertThat(row.createdAt()).isNotNull();
    }

    @Test
    @DisplayName("search는 제목·작성자 닉네임 부분 일치, difficulty는 정확 일치로 거른다")
    void filtersBySearchAndDifficulty() {
        createCustomMap("하늘 위의 도전", "중", true, creator);
        createCustomMap("지하 미로", "상", true, otherUser);
        entityManager.flush();
        entityManager.clear();

        assertThat(customMapRepository.findPublicRows("%하늘%", null))
                .extracting(CustomMapRow::title).containsExactly("하늘 위의 도전");
        assertThat(customMapRepository.findPublicRows("%정상화%", null))
                .extracting(CustomMapRow::title).containsExactly("하늘 위의 도전");
        assertThat(customMapRepository.findPublicRows(null, "상"))
                .extracting(CustomMapRow::title).containsExactly("지하 미로");
        assertThat(customMapRepository.findPublicRows("%하늘%", "상")).isEmpty();
        assertThat(customMapRepository.findPublicRows(null, null)).hasSize(2);
    }

    @Test
    @DisplayName("existsPublicByStageId는 공개 맵에만 true다")
    void existsPublicByStageIdChecksVisibility() {
        int publicStageId = createCustomMap("공개 맵", "중", true, creator);
        int privateStageId = createCustomMap("비공개 맵", "중", false, creator);
        entityManager.flush();
        entityManager.clear();

        assertThat(customMapRepository.existsPublicByStageId(publicStageId)).isTrue();
        assertThat(customMapRepository.existsPublicByStageId(privateStageId)).isFalse();
        assertThat(customMapRepository.existsPublicByStageId(1)).isFalse();
    }

    @Test
    @DisplayName("increasePlayCount는 해당 커스텀 맵만 1 올리고 공식 stageId는 0행을 갱신한다")
    void increasePlayCountAffectsOnlyMatchingCustomMap() {
        int stageId = createCustomMap("공개 맵", "중", true, creator);
        entityManager.flush();
        entityManager.clear();

        assertThat(customMapRepository.increasePlayCount(stageId)).isEqualTo(1);
        assertThat(customMapRepository.increasePlayCount(1)).isZero();
        entityManager.clear();

        assertThat(customMapRepository.findByStageId(stageId).orElseThrow().getPlayCount())
                .isEqualTo(1);
    }

    private int createCustomMap(String title, String difficulty, boolean isPublic, UUID owner) {
        Stage stage = saveCustomStage(title, difficulty);
        saveCustomRound(stage.getId());
        customMapRepository.save(CustomMap.create(
                stage.getId(),
                title,
                owner,
                String.join(",", PALETTE_CSV_PARTS),
                5,
                2,
                isPublic,   // 공개 맵은 클리어 검증을 통과한 것만 존재한다
                isPublic
        ));
        return stage.getId();
    }

    private Stage saveCustomStage(String title, String difficulty) {
        return stageRepository.save(Stage.createCustom(
                "[UGC] " + title + " #" + UUID.randomUUID().toString().substring(0, 8),
                title + " 설명",
                difficulty
        ));
    }

    private StageRound saveCustomRound(Integer stageId) {
        return stageRoundRepository.save(StageRound.builder()
                .id(stageId * 10 + 1)
                .stageId(stageId)
                .roundNo(1)
                .mapConfig(objectMapper.createObjectNode())
                .build());
    }
}
