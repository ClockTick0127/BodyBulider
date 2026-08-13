package org.ssafy.bodybuilder.domain.ranking.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.domain.ranking.dto.StageRankingEntryResponse;
import org.ssafy.bodybuilder.domain.ranking.service.RankingQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/stages")
@Tag(name = "Ranking", description = "스테이지 랭킹 API")
public class RankingController {

    private final RankingQueryService rankingQueryService;

    @GetMapping("/{stageId}/rankings")
    @Operation(summary = "스테이지 랭킹 조회")
    public ResponseEntity<BaseResponse<List<StageRankingEntryResponse>>> getStageRanking(
            @PathVariable Integer stageId,
            @RequestParam(required = false) Integer limit
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                rankingQueryService.getStageRanking(stageId, limit)
        );
    }
}
