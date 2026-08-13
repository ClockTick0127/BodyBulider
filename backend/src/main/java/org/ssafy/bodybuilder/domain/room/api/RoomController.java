package org.ssafy.bodybuilder.domain.room.api;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.ssafy.bodybuilder.common.response.BaseResponse;
import org.ssafy.bodybuilder.common.response.SuccessCode;
import org.ssafy.bodybuilder.common.security.annotation.LoginUser;
import org.ssafy.bodybuilder.domain.room.dto.QuickStartResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomCreateRequest;
import org.ssafy.bodybuilder.domain.room.dto.RoomCutsceneSettingRequest;
import org.ssafy.bodybuilder.domain.room.dto.RoomCutsceneSettingResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomJoinRequest;
import org.ssafy.bodybuilder.domain.room.dto.RoomParticipantDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomStageChangeRequest;
import org.ssafy.bodybuilder.domain.room.dto.RoomStageChangeResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomSummaryDto;
import org.ssafy.bodybuilder.domain.room.service.RoomService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/rooms")
@RequiredArgsConstructor
public class RoomController {

    private final RoomService roomService;

    @PostMapping
    public ResponseEntity<BaseResponse<QuickStartResponseDto>> createRoom(
            @Valid @RequestBody RoomCreateRequest request,
            @LoginUser UUID userId
    ) {
        QuickStartResponseDto response = roomService.createRoom(userId, request);
        return BaseResponse.success(SuccessCode.CREATE_SUCCESS, response);
    }

    @PostMapping("/join")
    public ResponseEntity<BaseResponse<QuickStartResponseDto>> joinRoom(
            @Valid @RequestBody RoomJoinRequest request,
            @LoginUser UUID userId
    ) {
        QuickStartResponseDto response = roomService.joinRoom(userId, request);
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, response);
    }

    @GetMapping
    public ResponseEntity<BaseResponse<List<RoomSummaryDto>>> getWaitingRooms() {
        List<RoomSummaryDto> response = roomService.getWaitingRooms();
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, response);
    }

    @PostMapping("/quick-start")
    public ResponseEntity<BaseResponse<QuickStartResponseDto>> quickStart(@LoginUser UUID userId) {
        QuickStartResponseDto response = roomService.quickStart(userId);
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, response);
    }

    @GetMapping("/{roomCode}")
    public ResponseEntity<BaseResponse<QuickStartResponseDto>> getRoomInfo(
            @PathVariable String roomCode,
            @LoginUser UUID userId
    ) {
        QuickStartResponseDto response = roomService.getRoomInfo(roomCode, userId);
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, response);
    }

    @PatchMapping("/{roomCode}/ready")
    public ResponseEntity<BaseResponse<RoomParticipantDto>> toggleReady(
            @PathVariable String roomCode,
            @LoginUser UUID userId
    ) {
        RoomParticipantDto response = roomService.toggleReady(roomCode, userId);
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, response);
    }

    @PatchMapping("/{roomCode}/stage")
    public ResponseEntity<BaseResponse<RoomStageChangeResponseDto>> changeStage(
            @PathVariable String roomCode,
            @Valid @RequestBody RoomStageChangeRequest request,
            @LoginUser UUID userId
    ) {
        RoomStageChangeResponseDto response =
                roomService.changeStage(roomCode, userId, request.getStageId());
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, response);
    }

    @PatchMapping("/{roomCode}/cutscenes")
    public ResponseEntity<BaseResponse<RoomCutsceneSettingResponseDto>> changeCutsceneSetting(
            @PathVariable String roomCode,
            @Valid @RequestBody RoomCutsceneSettingRequest request,
            @LoginUser UUID userId
    ) {
        RoomCutsceneSettingResponseDto response =
                roomService.changeCutsceneSetting(roomCode, userId, request.enabled());
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, response);
    }

    @PatchMapping("/{roomCode}/return-to-lobby")
    public ResponseEntity<BaseResponse<RoomParticipantDto>> returnToLobby(
            @PathVariable String roomCode,
            @LoginUser UUID userId
    ) {
        RoomParticipantDto response = roomService.returnToLobby(roomCode, userId);
        return BaseResponse.success(SuccessCode.REQUEST_SUCCESS, response);
    }
}
