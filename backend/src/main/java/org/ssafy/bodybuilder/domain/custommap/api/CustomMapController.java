package org.ssafy.bodybuilder.domain.custommap.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.common.security.annotation.LoginUser;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapCreateRequest;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapDetailResponse;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapSimulateRequest;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapSummaryResponse;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapUpdateRequest;
import org.ssafy.bodybuilder.domain.custommap.dto.CustomMapWaterPreviewRequest;
import org.ssafy.bodybuilder.domain.custommap.dto.WaterPreviewResponse;
import org.ssafy.bodybuilder.domain.custommap.service.CustomMapService;
import org.ssafy.bodybuilder.domain.game.physics.SimulationResult;

/**
 * 창작마당 유저 맵 API.
 *
 * <p>SecurityConfig 변경은 필요 없다 — /api/v1/custom-maps/**는 명시 matcher가 없어
 * .anyRequest().authenticated()로 커버된다.
 * (/api/v1/dev/**는 hasRole("ADMIN")이라 유저가 기존 /dev/simulate를 쓰면 403을 받는다)
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/custom-maps")
@Tag(name = "CustomMap", description = "창작마당 유저 맵 API")
public class CustomMapController {

    private final CustomMapService customMapService;

    @GetMapping
    @Operation(summary = "공개 커스텀 맵 목록 조회 (검색·난이도 필터)")
    public ResponseEntity<BaseResponse<List<CustomMapSummaryResponse>>> getPublicMaps(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "difficulty", required = false) String difficulty,
            @LoginUser UUID userId
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                customMapService.getPublicMaps(search, difficulty, userId)
        );
    }

    /** 리터럴 /me가 템플릿 /{stageId}보다 우선 매칭된다. */
    @GetMapping("/me")
    @Operation(summary = "내가 만든 맵 목록 조회 (비공개 포함)")
    public ResponseEntity<BaseResponse<List<CustomMapSummaryResponse>>> getMyMaps(
            @LoginUser UUID userId
    ) {
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, customMapService.getMyMaps(userId));
    }

    @GetMapping("/{stageId}")
    @Operation(summary = "커스텀 맵 상세 조회 (공개 또는 본인)")
    public ResponseEntity<BaseResponse<CustomMapDetailResponse>> getMap(
            @PathVariable Integer stageId,
            @LoginUser UUID userId
    ) {
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, customMapService.getMap(stageId, userId));
    }

    @PostMapping
    @Operation(summary = "커스텀 맵 생성")
    public ResponseEntity<BaseResponse<CustomMapDetailResponse>> create(
            @Valid @RequestBody CustomMapCreateRequest request,
            @LoginUser UUID userId
    ) {
        return BaseResponse.success(SuccessCode.CREATE_SUCCESS, customMapService.create(request, userId));
    }

    @PutMapping("/{stageId}")
    @Operation(summary = "커스텀 맵 수정 (본인만, title 미지원)")
    public ResponseEntity<BaseResponse<CustomMapDetailResponse>> update(
            @PathVariable Integer stageId,
            @Valid @RequestBody CustomMapUpdateRequest request,
            @LoginUser UUID userId
    ) {
        return BaseResponse.success(
                SuccessCode.UPDATE_SUCCESS,
                customMapService.update(stageId, request, userId)
        );
    }

    @PostMapping("/water-preview")
    @Operation(summary = "에디터 물길 프리뷰 (WATER_PIPE 물길 세그먼트, 초과 시 429)")
    public ResponseEntity<BaseResponse<WaterPreviewResponse>> waterPreview(
            @Valid @RequestBody CustomMapWaterPreviewRequest request
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                new WaterPreviewResponse(
                        customMapService.waterPreview(request.mapConfig(), request.poses())
                )
        );
    }

    @PostMapping("/simulate")
    @Operation(summary = "에디터 물리 시뮬레이션 (전용 스레드풀, 초과 시 429)")
    public ResponseEntity<BaseResponse<SimulationResult>> simulate(
            @Valid @RequestBody CustomMapSimulateRequest request
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                customMapService.simulate(request.mapConfig(), request.poses())
        );
    }
}
