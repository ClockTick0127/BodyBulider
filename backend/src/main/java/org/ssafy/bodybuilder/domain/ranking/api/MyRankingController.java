package org.ssafy.bodybuilder.domain.ranking.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.common.security.annotation.LoginUser;
import org.ssafy.bodybuilder.domain.ranking.dto.MyRankingSummaryResponse;
import org.ssafy.bodybuilder.domain.ranking.service.RankingQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/users/me/rankings")
@Tag(name = "Ranking", description = "스테이지 랭킹 API")
public class MyRankingController {

    private final RankingQueryService rankingQueryService;

    @GetMapping
    @Operation(summary = "내 스테이지별 현재 순위와 최고 순위 조회")
    public ResponseEntity<BaseResponse<MyRankingSummaryResponse>> getMyRankings(
            @Parameter(hidden = true) @LoginUser UUID userId
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                rankingQueryService.getMyRankings(userId)
        );
    }
}
