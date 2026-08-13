package org.ssafy.bodybuilder.domain.record.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.common.security.annotation.LoginUser;
import org.ssafy.bodybuilder.domain.record.dto.MyRecordRoundsResponse;
import org.ssafy.bodybuilder.domain.record.dto.MyBestRecordResponse;
import org.ssafy.bodybuilder.domain.record.dto.MyStageHistoryResponse;
import org.ssafy.bodybuilder.domain.record.service.RecordQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/users/me/records")
@Tag(name = "Record", description = "내 게임 기록 조회 API")
public class RecordController {

    private final RecordQueryService recordQueryService;

    @GetMapping
    @Operation(summary = "내 스테이지별 최고 기록 조회")
    public ResponseEntity<BaseResponse<List<MyBestRecordResponse>>> getMyRecords(
            @Parameter(hidden = true) @LoginUser UUID userId
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                recordQueryService.getMyRecords(userId)
        );
    }

    @GetMapping("/stages/{stageId}")
    @Operation(summary = "내 스테이지 클리어 이력 조회")
    public ResponseEntity<BaseResponse<MyStageHistoryResponse>> getMyStageHistory(
            @PathVariable Integer stageId,
            @Parameter(hidden = true) @LoginUser UUID userId
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                recordQueryService.getMyStageHistory(stageId, userId)
        );
    }

    @GetMapping("/{recordId}/rounds")
    @Operation(summary = "내 기록의 라운드별 기록 조회")
    public ResponseEntity<BaseResponse<MyRecordRoundsResponse>> getMyRecordRounds(
            @PathVariable Long recordId,
            @Parameter(hidden = true) @LoginUser UUID userId
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                recordQueryService.getMyRecordRounds(recordId, userId)
        );
    }
}
