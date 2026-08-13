package org.ssafy.bodybuilder.domain.custommap.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRow;

public record CustomMapSummaryResponse(
        @JsonProperty("stage_id") Integer stageId,
        String title,
        String description,
        String difficulty,
        @JsonProperty("creator_nickname") String creatorNickname,
        List<String> palette,
        @JsonProperty("polygon_count") Integer polygonCount,
        @JsonProperty("gimmick_count") Integer gimmickCount,
        @JsonProperty("play_count") Integer playCount,
        @JsonProperty("like_count") Integer likeCount,
        @JsonProperty("is_cleared") Boolean isCleared,
        @JsonProperty("is_public") Boolean isPublic,
        @JsonProperty("is_mine") Boolean isMine,
        @JsonProperty("created_at") LocalDateTime createdAt
) {
    public static CustomMapSummaryResponse of(CustomMapRow row, UUID userId) {
        return new CustomMapSummaryResponse(
                row.stageId(),
                row.title(),
                row.description(),
                row.difficulty(),
                row.creatorNickname(),
                PaletteCodec.split(row.palette()),
                row.polygonCount(),
                row.gimmickCount(),
                row.playCount(),
                row.likeCount(),
                row.isCleared(),
                row.isPublic(),
                row.creatorUuid().equals(userId),
                row.createdAt()
        );
    }
}
