package org.ssafy.bodybuilder.domain.ranking.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class MyRankingSummaryResponseTest {

    @Test
    void keepsEveryStageThatSharesTheBestRank() {
        var first = stage(1, "토이 타운", 1);
        var second = stage(2, "윈디 캐니언", 4);
        var third = stage(3, "클라우드 브릿지", 1);

        MyRankingSummaryResponse response =
                MyRankingSummaryResponse.from(List.of(first, second, third));

        assertThat(response.bestRank()).isEqualTo(1);
        assertThat(response.bestStageCount()).isEqualTo(2);
        assertThat(response.bestStages()).containsExactly(first, third);
        assertThat(response.stages()).containsExactly(first, second, third);
    }

    @Test
    void returnsEmptySummaryWhenTheUserHasNoClearRecord() {
        MyRankingSummaryResponse response =
                MyRankingSummaryResponse.from(List.of());

        assertThat(response.bestRank()).isNull();
        assertThat(response.bestStageCount()).isZero();
        assertThat(response.bestStages()).isEmpty();
        assertThat(response.stages()).isEmpty();
    }

    private MyStageRankingResponse stage(
            int stageId,
            String stageName,
            int rank
    ) {
        return new MyStageRankingResponse(
                stageId,
                stageName,
                rank,
                10L,
                30_000L,
                LocalDateTime.of(2026, 7, 30, 12, 0)
        );
    }
}
