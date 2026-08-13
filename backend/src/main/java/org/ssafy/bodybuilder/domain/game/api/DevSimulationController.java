package org.ssafy.bodybuilder.domain.game.api;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.physics.PhysicsSimulator;
import org.ssafy.bodybuilder.domain.game.physics.SimulationResult;
import org.ssafy.bodybuilder.domain.game.physics.dyn4j.Dyn4jPhysicsSimulator;

/**
 * 맵 에디터(FE /dev/map-editor) 전용 개발 도구 API.
 * mapConfig + 정규화 포즈를 받아 물리 시뮬레이션 결과(프레임)를 반환한다.
 *
 * <p>engine 쿼리 파라미터로 legacy/dyn4j를 직접 선택해 A/B 비교할 수 있다.
 * 생략 시 game.physics.engine 설정을 따른다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/dev")
@Tag(name = "Dev", description = "맵 에디터용 개발 도구 API")
public class DevSimulationController {

    /** 엔진들은 상태가 없으므로 A/B용 인스턴스를 직접 보관한다. */
    private static final Dyn4jPhysicsSimulator DYN4J = new Dyn4jPhysicsSimulator();

    private final PhysicsSimulator physicsSimulator;

    @PostMapping("/simulate")
    @Operation(summary = "맵 물리 시뮬레이션 실행 (맵 에디터용, engine=legacy|dyn4j로 A/B 비교)")
    public SimulationResult simulate(
            @RequestBody SimulateRequest request,
            @RequestParam(name = "engine", required = false) String engine
    ) {
        return selectEngine(engine)
                .simulate(request.mapConfig(), request.poses());
    }

    private PhysicsSimulator selectEngine(String engine) {
        if (engine == null || engine.isBlank()) {
            return physicsSimulator;
        }
        return switch (engine) {
            case "dyn4j" -> DYN4J;
            default -> throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        };
    }

    /**
     * 맵 에디터 물길 프리뷰 (개발명세서_BE_물기믹_유니온물길 BE-WATER-07).
     * dev 관행대로 요청 키는 camelCase(mapConfig), 응답 키는 waterFlows.
     * 계산 실패는 5xx 전파 — 200+빈 배열로 뭉개지 않는다 (명세 §3).
     */
    @PostMapping("/water-preview")
    @Operation(summary = "맵 에디터 물길 프리뷰 (WATER_PIPE 물길 세그먼트)")
    public org.ssafy.bodybuilder.domain.custommap.dto.WaterPreviewResponse waterPreview(
            @RequestBody SimulateRequest request
    ) {
        return new org.ssafy.bodybuilder.domain.custommap.dto.WaterPreviewResponse(
                org.ssafy.bodybuilder.domain.game.physics.dyn4j.WaterFlowPreview
                        .of(request.mapConfig())
                        .compute(request.poses())
        );
    }

    public record SimulateRequest(
            JsonNode mapConfig,
            List<List<List<Double>>> poses
    ) {
    }
}
