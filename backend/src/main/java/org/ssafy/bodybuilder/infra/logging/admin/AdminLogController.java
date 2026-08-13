package org.ssafy.bodybuilder.infra.logging.admin;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ArchivedGame;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ActiveGame;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ErrorDetail;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ErrorSummary;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.SessionEvent;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.RoundReplay;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminLogController {

    private final AdminLogQueryService queryService;

    @GetMapping("/sessions/active")
    public ResponseEntity<BaseResponse<List<ActiveGame>>> getActiveGames() {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                queryService.getActiveGames()
        );
    }

    @GetMapping("/sessions/archived")
    public ResponseEntity<BaseResponse<List<ArchivedGame>>> getArchivedGames(
            @RequestParam(defaultValue = "50") int limit
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                queryService.getArchivedGames(limit)
        );
    }

    @GetMapping("/sessions/{gameSessionId}/events")
    public ResponseEntity<BaseResponse<List<SessionEvent>>> getSessionEvents(
            @PathVariable UUID gameSessionId,
            @RequestParam(defaultValue = "200") int limit
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                queryService.getSessionEvents(gameSessionId, limit)
        );
    }

    @GetMapping("/sessions/{gameSessionId}/rounds")
    public ResponseEntity<BaseResponse<List<RoundReplay>>> getRoundReplays(
            @PathVariable UUID gameSessionId
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                queryService.getRoundReplays(gameSessionId)
        );
    }

    @GetMapping("/errors")
    public ResponseEntity<BaseResponse<List<ErrorSummary>>> getErrors(
            @RequestParam(defaultValue = "50") int limit
    ) {
        return BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                queryService.getErrors(limit)
        );
    }

    @GetMapping("/errors/{errorId}")
    public ResponseEntity<BaseResponse<ErrorDetail>> getError(
            @PathVariable UUID errorId
    ) {
        ResponseEntity<BaseResponse<ErrorDetail>> response = BaseResponse.success(
                SuccessCode.REQUEST_SUCCESS,
                queryService.getError(errorId)
        );
        return ResponseEntity.status(response.getStatusCode())
                .cacheControl(CacheControl.noStore())
                .body(response.getBody());
    }
}
