package org.ssafy.bodybuilder.domain.ranking.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.nio.ByteBuffer;
import java.time.LocalDateTime;
import java.util.UUID;
import org.ssafy.bodybuilder.domain.ranking.repository.RankingRepository.StageRankingProjection;

public record StageRankingEntryResponse(
        Integer rank,
        UUID uuid,
        String nickname,
        @JsonProperty("stage_clear_time_ms") Long stageClearTimeMs,
        @JsonProperty("created_at") LocalDateTime createdAt
) {
    public static StageRankingEntryResponse from(StageRankingProjection row) {
        return new StageRankingEntryResponse(
                row.getRank(),
                toUuid(row.getUuid()),
                row.getNickname(),
                row.getStageClearTimeMs(),
                row.getCreatedAt()
        );
    }

    private static UUID toUuid(byte[] bytes) {
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        return new UUID(buffer.getLong(), buffer.getLong());
    }
}
