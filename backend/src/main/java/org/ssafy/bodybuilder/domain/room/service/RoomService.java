package org.ssafy.bodybuilder.domain.room.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.service.StageQueryService;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.room.dto.QuickStartResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomCreateRequest;
import org.ssafy.bodybuilder.domain.room.dto.RoomCutsceneSettingResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomJoinRequest;
import org.ssafy.bodybuilder.domain.room.dto.RoomParticipantDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomStageChangeResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomSummaryDto;
import org.ssafy.bodybuilder.domain.room.model.Participant;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.domain.room.util.RoomCodeGenerator;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.model.User;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RoomService {

    private final RoomSessionRepository roomSessionRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final RoomLockManager roomLockManager;
    private final RoomCodeGenerator roomCodeGenerator;
    private final StageQueryService stageQueryService;

    public QuickStartResponseDto createRoom(UUID userId) {
        return createRoom(userId, new RoomCreateRequest("즐거운 게임 방", null));
    }

    public QuickStartResponseDto createRoom(UUID userId, RoomCreateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new GlobalException(ErrorCode.USER_NOT_FOUND));

        // 창작마당 "이 맵으로 방 만들기". stageId가 null이면 기존 동작을 그대로 유지한다.
        if (request.getStageId() != null) {
            validatePlayableStage(request.getStageId());
        }

        RoomSession room = createRoomInternal(
                userId,
                user.getNickname(),
                request.getTitle(),
                request.getPassword(),
                request.getStageId()
        );
        return toResponse(room, userId);
    }

    public QuickStartResponseDto joinRoom(UUID userId, RoomJoinRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new GlobalException(ErrorCode.USER_NOT_FOUND));

        RoomSession initialRoom = roomSessionRepository.findRoomByCode(request.getRoomCode())
                .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));
        UUID roomId = initialRoom.getRoomId();

        return roomLockManager.withLock(roomId, () -> {
            RoomSession room = roomSessionRepository.findRoomById(roomId)
                    .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));

            if (room.getState() != RoomSession.RoomState.WAITING) {
                throw new GlobalException(ErrorCode.ROOM_OPERATION_BUSY);
            }
            if (room.isFull() && !room.getParticipants().containsKey(userId)) {
                throw new GlobalException(ErrorCode.ROOM_FULL);
            }
            if (!room.verifyPassword(request.getPassword())) {
                throw new GlobalException(ErrorCode.INVALID_ROOM_PASSWORD);
            }

            boolean isNewParticipant = !room.getParticipants().containsKey(userId);
            Participant participant = room.addParticipant(userId, user.getNickname(), false);
            roomSessionRepository.saveRoom(room);

            if (isNewParticipant) {
                broadcastPlayerJoined(room, participant);
            }

            return toResponse(room, userId);
        });
    }

    public List<RoomSummaryDto> getWaitingRooms() {
        return roomSessionRepository.findAllWaitingRooms().stream()
                .map(room -> {
                    Participant host = room.getParticipants().get(room.getHostUserId());
                    String hostNickname = host != null ? host.getNickname() : "알 수 없음";

                    return RoomSummaryDto.builder()
                            .roomId(room.getRoomId())
                            .roomCode(room.getRoomCode())
                            .title(room.getTitle())
                            .isSecret(room.isSecret())
                            .currentCapacity(room.getParticipants().size())
                            .maxCapacity(room.getMaxCapacity())
                            .hostNickname(hostNickname)
                            .build();
                })
                .collect(Collectors.toList());
    }

    public QuickStartResponseDto quickStart(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new GlobalException(ErrorCode.USER_NOT_FOUND));

        boolean isAlreadyInRoom = roomSessionRepository.findAllWaitingRooms().stream()
                .anyMatch(r -> r.getParticipants().containsKey(userId));

        RoomSession room = findAvailableRoomOrCreate(userId, user.getNickname());
        Participant participant = room.getParticipants().get(userId);

        if (!isAlreadyInRoom) {
            broadcastPlayerJoined(room, participant);
        }

        return toResponse(room, userId);
    }

    public QuickStartResponseDto getRoomInfo(String roomCode, UUID userId) {
        RoomSession room = roomSessionRepository.findRoomByCode(roomCode)
                .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));

        if (!room.getParticipants().containsKey(userId)) {
            return QuickStartResponseDto.builder()
                    .roomCode(room.getRoomCode())
                    .title(room.getTitle())
                    .isSecret(room.isSecret())
                    .slotId(-1)
                    .isHost(false)
                    .participants(List.of())
                    .build();
        }

        return toResponse(room, userId);
    }

    public RoomParticipantDto toggleReady(String roomCode, UUID userId) {
        RoomSession initialRoom = roomSessionRepository.findRoomByCode(roomCode)
                .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));
        UUID roomId = initialRoom.getRoomId();

        return roomLockManager.withLock(roomId, () -> {
            RoomSession room = roomSessionRepository.findRoomById(roomId)
                    .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));

            Participant participant = room.getParticipants().get(userId);
            if (participant == null) {
                throw new GlobalException(ErrorCode.NOT_GAME_PARTICIPANT);
            }

            if (participant.isHost()) {
                participant.updateReady(true);
            } else {
                participant.toggleReady();
            }

            roomSessionRepository.saveRoom(room);
            broadcastPlayerReadyChanged(room, participant);

            return RoomParticipantDto.from(participant);
        });
    }

    public RoomParticipantDto returnToLobby(String roomCode, UUID userId) {
        RoomSession initialRoom = roomSessionRepository.findRoomByCode(roomCode)
                .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));
        UUID roomId = initialRoom.getRoomId();

        return roomLockManager.withLock(roomId, () -> {
            RoomSession room = roomSessionRepository.findRoomById(roomId)
                    .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));

            Participant participant = room.returnToLobby(userId);
            if (participant == null) {
                throw new GlobalException(ErrorCode.NOT_GAME_PARTICIPANT);
            }

            roomSessionRepository.saveRoom(room);
            broadcastPlayerReadyChanged(room, participant);

            return RoomParticipantDto.from(participant);
        });
    }

    public RoomStageChangeResponseDto changeStage(String roomCode, UUID userId, Integer stageId) {
        RoomSession initialRoom = roomSessionRepository.findRoomByCode(roomCode)
                .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));
        UUID roomId = initialRoom.getRoomId();

        return roomLockManager.withLock(roomId, () -> {
            RoomSession room = roomSessionRepository.findRoomById(roomId)
                    .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));

            Participant participant = room.getParticipants().get(userId);
            if (participant == null || !participant.isHost()) {
                throw new GlobalException(ErrorCode.ROOM_HOST_ONLY);
            }

            validatePlayableStage(stageId);

            room.setSelectedStageId(stageId);
            roomSessionRepository.saveRoom(room);

            broadcastStageChanged(room, stageId);

            return RoomStageChangeResponseDto.builder()
                    .roomId(room.getRoomId())
                    .roomCode(room.getRoomCode())
                    .selectedStageId(stageId)
                    .build();
        });
    }

    public RoomCutsceneSettingResponseDto changeCutsceneSetting(
            String roomCode,
            UUID userId,
            boolean enabled
    ) {
        RoomSession initialRoom = roomSessionRepository.findRoomByCode(roomCode)
                .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));
        UUID roomId = initialRoom.getRoomId();

        return roomLockManager.withLock(roomId, () -> {
            RoomSession room = roomSessionRepository.findRoomById(roomId)
                    .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));

            Participant participant = room.getParticipants().get(userId);
            if (participant == null || !participant.isHost()) {
                throw new GlobalException(ErrorCode.ROOM_HOST_ONLY);
            }

            room.setCutscenesEnabled(enabled);
            roomSessionRepository.saveRoom(room);
            broadcastCutsceneSettingChanged(room, enabled);

            return RoomCutsceneSettingResponseDto.builder()
                    .roomId(room.getRoomId())
                    .roomCode(room.getRoomCode())
                    .cutscenesEnabled(enabled)
                    .build();
        });
    }

    public void leaveRoom(UUID roomId, UUID userId) {
        roomLockManager.withLock(roomId, () -> {
            roomSessionRepository.findRoomById(roomId).ifPresent(room -> {
                boolean removed = room.removeParticipant(userId);
                if (!removed) {
                    return;
                }

                if (room.isEmpty()) {
                    roomSessionRepository.removeRoom(roomId);
                    return;
                }

                roomSessionRepository.saveRoom(room);

                Map<String, Object> eventPayload = new HashMap<>();
                eventPayload.put("type", "PLAYER_LEFT");
                eventPayload.put("roomId", roomId);
                eventPayload.put("leftUserId", userId);
                eventPayload.put("newHostUserId", room.getHostUserId());
                broadcastRoomEvent(roomId, eventPayload);
            });
            return null;
        });
    }

    private RoomSession findAvailableRoomOrCreate(UUID userId, String nickname) {
        List<RoomSession> waitingRooms = roomSessionRepository.findAllWaitingRooms();

        for (RoomSession room : waitingRooms) {
            if (room.getParticipants().containsKey(userId)) {
                return room;
            }
        }

        for (RoomSession candidate : waitingRooms) {
            for (int attempt = 0; attempt < 3; attempt++) {
                try {
                    RoomSession joinedRoom = tryJoinRoom(candidate.getRoomId(), userId, nickname);
                    if (joinedRoom != null) {
                        return joinedRoom;
                    }
                    break;
                } catch (GlobalException exception) {
                    if (exception.getErrorCode() != ErrorCode.ROOM_OPERATION_BUSY) {
                        throw exception;
                    }
                    waitBeforeRetry();
                }
            }
        }

        return createRoomInternal(userId, nickname, "즐거운 게임 방", null, null);
    }

    private RoomSession tryJoinRoom(UUID roomId, UUID userId, String nickname) {
        return roomLockManager.withLock(roomId, () -> {
            Optional<RoomSession> roomOptional = roomSessionRepository.findRoomById(roomId);
            if (roomOptional.isEmpty()) {
                return null;
            }

            RoomSession room = roomOptional.get();
            if (room.getState() != RoomSession.RoomState.WAITING
                    || room.isFull()
                    || room.isSecret()) {
                return null;
            }

            room.addParticipant(userId, nickname, false);
            roomSessionRepository.saveRoom(room);
            return room;
        });
    }

    private void waitBeforeRetry() {
        try {
            Thread.sleep(50);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new GlobalException(ErrorCode.ROOM_OPERATION_BUSY);
        }
    }

    private RoomSession createRoomInternal(
            UUID userId,
            String nickname,
            String title,
            String password,
            Integer stageId
    ) {
        UUID roomId = UUID.randomUUID();
        String roomCode = roomCodeGenerator.generateUniqueRoomCode(roomId);
        RoomSession room = new RoomSession(
                roomId,
                roomCode,
                title,
                password,
                userId,
                nickname
        );
        if (stageId != null) {
            room.setSelectedStageId(stageId);
        }
        roomSessionRepository.saveRoom(room);
        return room;
    }

    /**
     * 방에 걸 수 있는 스테이지인지 검증한다. (공식 맵 또는 공개 커스텀 맵)
     *
     * <p>stage_id는 10000부터 순차 발급되므로 값을 추측해 남의 비공개 맵을 방에 걸 수 있다.
     * 상세 API에만 인가를 걸면 이 경로로 우회되므로 여기서도 막는다.
     *
     * <p>공개 커스텀 맵이 아니면 getStage()가 던진 원래 예외를 그대로 재던진다.
     * (기존 changeStage 계약: 없는 stageId → STAGE_NOT_FOUND)
     */
    private void validatePlayableStage(Integer stageId) {
        try {
            stageQueryService.getStage(stageId);
        } catch (GlobalException exception) {
            if (!stageQueryService.isPlayableCustomStage(stageId)) {
                throw exception;
            }
        }
    }

    private QuickStartResponseDto toResponse(RoomSession room, UUID userId) {
        Participant participant = room.getParticipants().get(userId);
        int slotId = participant != null ? participant.getSlotId() : -1;
        boolean isHost = participant != null
                ? participant.isHost()
                : userId.equals(room.getHostUserId());

        return QuickStartResponseDto.builder()
                .roomId(room.getRoomId())
                .roomCode(room.getRoomCode())
                .title(room.getTitle())
                .isSecret(room.isSecret())
                .slotId(slotId)
                .isHost(isHost)
                .selectedStageId(room.getSelectedStageId() != null
                        ? room.getSelectedStageId()
                        : RoomSession.DEFAULT_STAGE_ID)
                .cutscenesEnabled(room.isCutscenesEnabled())
                .participants(toDtoList(room.getParticipantList()))
                .build();
    }

    private void broadcastPlayerJoined(RoomSession room, Participant participant) {
        Map<String, Object> eventPayload = new HashMap<>();
        eventPayload.put("type", "PLAYER_JOINED");
        eventPayload.put("roomId", room.getRoomId());
        eventPayload.put("newParticipant", RoomParticipantDto.from(participant));
        eventPayload.put("currentParticipantsCount", room.getParticipants().size());
        broadcastRoomEvent(room.getRoomId(), eventPayload);
    }

    private void broadcastStageChanged(RoomSession room, Integer stageId) {
        Map<String, Object> eventPayload = new HashMap<>();
        eventPayload.put("type", "STAGE_CHANGED");
        eventPayload.put("roomId", room.getRoomId());
        eventPayload.put("stageId", stageId);
        broadcastRoomEvent(room.getRoomId(), eventPayload);
    }

    private void broadcastCutsceneSettingChanged(RoomSession room, boolean enabled) {
        Map<String, Object> eventPayload = new HashMap<>();
        eventPayload.put("type", "CUTSCENE_SETTING_CHANGED");
        eventPayload.put("roomId", room.getRoomId());
        eventPayload.put("enabled", enabled);
        broadcastRoomEvent(room.getRoomId(), eventPayload);
    }

    private void broadcastPlayerReadyChanged(RoomSession room, Participant participant) {
        Map<String, Object> eventPayload = new HashMap<>();
        eventPayload.put("type", "PLAYER_READY_CHANGED");
        eventPayload.put("roomId", room.getRoomId());
        eventPayload.put("userId", participant.getUserId());
        eventPayload.put("slotId", participant.getSlotId());
        eventPayload.put("isReady", participant.isReady());
        broadcastRoomEvent(room.getRoomId(), eventPayload);
    }

    private List<RoomParticipantDto> toDtoList(List<Participant> participants) {
        return participants.stream()
                .map(RoomParticipantDto::from)
                .collect(Collectors.toList());
    }

    private void broadcastRoomEvent(UUID roomId, Object payload) {
        messagingTemplate.convertAndSend("/sub/room/" + roomId, payload);
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId, payload);
    }
}
