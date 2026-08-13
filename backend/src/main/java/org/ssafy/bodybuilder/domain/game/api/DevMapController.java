package org.ssafy.bodybuilder.domain.game.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.domain.game.dto.DevRoundDetailResponse;
import org.ssafy.bodybuilder.domain.game.dto.DevRoundSummaryResponse;
import org.ssafy.bodybuilder.domain.game.dto.DevRoundUpdateRequest;
import org.ssafy.bodybuilder.domain.game.service.DevMapService;

/**
 * 맵 에디터(/dev/map-editor) 전용 라운드 CRUD API.
 *
 * <p>SecurityConfig에서 {@code /api/v1/dev/**}는 ROLE_ADMIN으로 제한되어 있다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/dev")
@Tag(name = "Dev", description = "맵 에디터용 개발 도구 API")
public class DevMapController {

    private final DevMapService devMapService;

    @GetMapping("/rounds")
    @Operation(summary = "라운드 목록 조회 (맵 에디터 드롭다운용)")
    public ResponseEntity<BaseResponse<List<DevRoundSummaryResponse>>> getRounds() {
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, devMapService.getRounds());
    }

    @GetMapping("/rounds/{roundId}")
    @Operation(summary = "라운드 map_config 조회")
    public ResponseEntity<BaseResponse<DevRoundDetailResponse>> getRound(
            @PathVariable Integer roundId
    ) {
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, devMapService.getRound(roundId));
    }

    @PutMapping("/rounds/{roundId}")
    @Operation(summary = "라운드 map_config 저장 (덮어쓰기)")
    public ResponseEntity<BaseResponse<DevRoundDetailResponse>> updateRound(
            @PathVariable Integer roundId,
            @RequestBody DevRoundUpdateRequest request
    ) {
        return BaseResponse.success(
                SuccessCode.UPDATE_SUCCESS,
                devMapService.updateMapConfig(roundId, request.mapConfig())
        );
    }
}
