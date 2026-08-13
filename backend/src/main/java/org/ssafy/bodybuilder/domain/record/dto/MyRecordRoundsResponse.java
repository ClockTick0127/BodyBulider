package org.ssafy.bodybuilder.domain.record.dto;

import java.util.List;
import org.ssafy.bodybuilder.domain.game.dto.StageSummaryResponse;

public record MyRecordRoundsResponse(
        Long recordId,
        StageSummaryResponse stage,
        Long totalClearTimeMs,
        List<RoundEntry> rounds
) {
    public record RoundEntry(Integer roundNo, Long clearTimeMs) {
    }
}
