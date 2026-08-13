package org.ssafy.bodybuilder.domain.stage;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.ssafy.bodybuilder.domain.game.dto.StageListResponse;
import org.ssafy.bodybuilder.domain.ranking.dto.StageRankingEntryResponse;
import org.ssafy.bodybuilder.domain.record.dto.MyBestRecordResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;
import org.springframework.boot.test.json.JacksonTester;

@JsonTest
class ApiResponseSerializationTest {

    @Autowired
    private JacksonTester<StageListResponse> stageJson;

    @Autowired
    private JacksonTester<StageRankingEntryResponse> rankingJson;

    @Autowired
    private JacksonTester<MyBestRecordResponse> recordJson;

    @Test
    void stageListUsesSnakeCaseContract() throws Exception {
        StageListResponse response = new StageListResponse(
                1,
                "토이 타운",
                "입문용 스테이지",
                "하",
                null
        );

        assertThat(stageJson.write(response))
                .hasJsonPathNumberValue("@.stage_id")
                .hasJsonPathStringValue("@.name")
                .hasJsonPathStringValue("@.description")
                .hasJsonPathStringValue("@.difficulty")
                .hasJsonPath("@.thumbnail_url")
                .doesNotHaveJsonPath("@.stageId");
    }

    @Test
    void rankingUsesSnakeCaseContract() throws Exception {
        StageRankingEntryResponse response = new StageRankingEntryResponse(
                1,
                UUID.fromString("00000000-0000-0000-0000-000000000001"),
                "player1",
                52_100L,
                LocalDateTime.of(2026, 7, 28, 12, 34)
        );

        assertThat(rankingJson.write(response))
                .hasJsonPathNumberValue("@.rank")
                .hasJsonPathStringValue("@.uuid")
                .hasJsonPathStringValue("@.nickname")
                .hasJsonPathNumberValue("@.stage_clear_time_ms")
                .hasJsonPathStringValue("@.created_at")
                .doesNotHaveJsonPath("@.stageClearTimeMs");
    }

    @Test
    void myBestRecordUsesSnakeCaseContract() throws Exception {
        MyBestRecordResponse response = new MyBestRecordResponse(
                1,
                "토이 타운",
                63_120L,
                LocalDateTime.of(2026, 7, 28, 12, 34)
        );

        assertThat(recordJson.write(response))
                .hasJsonPathNumberValue("@.stage_id")
                .hasJsonPathStringValue("@.name")
                .hasJsonPathNumberValue("@.stage_clear_time_ms")
                .hasJsonPathStringValue("@.created_at")
                .doesNotHaveJsonPath("@.stageId");
    }
}
