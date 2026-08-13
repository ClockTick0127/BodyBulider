package org.ssafy.bodybuilder.domain.game.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.domain.game.dto.StageDetailResponse;
import org.ssafy.bodybuilder.domain.game.dto.StageListResponse;
import org.ssafy.bodybuilder.domain.game.service.StageQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/stages")
@Tag(name = "Stage", description = "스테이지 조회 API")
public class StageController {

    private final StageQueryService stageQueryService;

    @GetMapping
    @Operation(summary = "스테이지 목록 조회")
    public ResponseEntity<BaseResponse<List<StageListResponse>>> getStages() {
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, stageQueryService.getStages());
    }

    @GetMapping("/{stageId}")
    @Operation(summary = "스테이지 상세 조회")
    public ResponseEntity<BaseResponse<StageDetailResponse>> getStage(
            @PathVariable Integer stageId
    ) {
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, stageQueryService.getStage(stageId));
    }
}
