package org.ssafy.bodybuilder.domain.record.dto;

import java.time.LocalDateTime;
import java.util.List;
import org.ssafy.bodybuilder.domain.game.dto.StageSummaryResponse;

public record MyStageHistoryResponse(
        StageSummaryResponse stage,
        List<HistoryEntry> entries,
        Long bestTimeMs
) {
    public record HistoryEntry(
            Long recordId,
            Long clearTimeMs,
            LocalDateTime clearedAt
    ) {
    }
}
