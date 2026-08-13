package org.ssafy.bodybuilder.domain.game.service;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRepository;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.message.payload.GameStartResponsePayload;
import org.ssafy.bodybuilder.domain.game.model.GameSession;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.ssafy.bodybuilder.domain.game.repository.GameSessionRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.game.repository.StageRoundRepository;
import org.ssafy.bodybuilder.domain.game.util.GameConstants;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.game.util.StageCutsceneCatalog;
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.domain.room.model.Participant;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;
import org.springframework.stereotype.Service;


@Service
@RequiredArgsConstructor
//GameStart에 관련된 service
public class GameStartService {

    private final RoomSessionRepository roomSessionRepository;
    private final GameSessionRepository gameSessionRepository;
    private final StageRepository stageRepository;
    private final StageRoundRepository stageRoundRepository;
    private final RoomLockManager roomLockManager;
    private final GameMessagePublisher gameMessagePublisher;
    private final GameCaptureScheduler gameCaptureScheduler;
    private final GameSessionEventRecorder gameSessionEventRecorder;
    private final CustomMapRepository customMapRepository;
    private final WaterFlowBroadcastService waterFlowBroadcastService;

    /// WebSocket Handler가 호출하는 메서드
    /// @param roomSessionId
    /// @param requesterId
    /// @param stageId
    public void startGame(UUID roomSessionId, UUID requesterId, Integer stageId) {

        //Lock획득
        GameStartContext context = roomLockManager.withLock(
                roomSessionId,
                () -> startGameUnderLock(roomSessionId, requesterId, stageId)
        );

        GameStartResponsePayload payload = GameStartResponsePayload.of(
                context.game(),
                context.round(),
                context.participantSlots(),
                context.initialDelayMs(),
                // 최초 라운드 시작 물길 (포즈 0개, 지형만) — 실패 시 null 생략
                waterFlowBroadcastService.terrainOnlyWaterFlows(
                        context.round().getMapConfig())
        );

        //Client에 결과 전송
        gameMessagePublisher.publishGameMessage(
                GameMessageType.GAME_START_RESPONSE,
                roomSessionId,
                context.game().getGameSessionId(),
                payload
        );

        //게임 시작 이후 3초간격으로 촬영 request발송
        gameCaptureScheduler.start(
                roomSessionId,
                context.game().getGameSessionId(),
                context.participantSlots().values().stream().toList(),
                context.initialDelayMs()
        );
    }

    private GameStartContext startGameUnderLock(
            UUID roomSessionId,
            UUID requesterId,
            Integer stageId
    ) {
        RoomSession room = roomSessionRepository.findRoomById(roomSessionId)
                .orElseThrow(() -> new GlobalException(ErrorCode.ROOM_NOT_FOUND));
        validateRoom(room, requesterId);

        List<Participant> participants = room.getParticipantList().stream()
                .sorted(Comparator.comparingInt(Participant::getSlotId))
                .toList();
        validateParticipants(room, participants);

        if (stageId == null || stageId <= 0 || !stageRepository.existsById(stageId)) {
            throw new GlobalException(ErrorCode.INVALID_STAGE);
        }

        //첫번째 라운드인지 검증
        StageRound firstRound = stageRoundRepository.findByStageIdAndRoundNo(
                        stageId,
                        GameConstants.FIRST_ROUND
                )
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_HAS_NO_ROUNDS));

        //mapId생성 stage*1000+round
        int mapId = stageId * GameConstants.ROUND_MODULAR + firstRound.getRoundNo();
        GameSession game = GameSession.start(roomSessionId, mapId);
        Map<UUID, Integer> participantSlots = participants.stream()
                .collect(Collectors.toMap(
                        Participant::getUserId,
                        Participant::getSlotId,
                        (existing, ignored) -> existing,
                        LinkedHashMap::new
                ));

        gameSessionRepository.commitGameStart(game, participantSlots);
        room.startGame(game.getGameSessionId());
        roomSessionRepository.saveRoom(room);

        // 창작마당 맵 플레이 수. 공식 스테이지는 custom_maps에 행이 없어 0건 업데이트로 끝난다.
        customMapRepository.increasePlayCount(stageId);
        gameSessionEventRecorder.start(
                game.getGameSessionId(),
                game.getStartedAt(),
                Map.of(
                        "roomSessionId", roomSessionId.toString(),
                        "roomCode", room.getRoomCode(),
                        "roomTitle", room.getTitle(),
                        "stageId", stageId,
                        "startedAt", game.getStartedAt().toString(),
                        "participantCount", participants.size()
                )
        );

        int initialDelayMs = StageCutsceneCatalog.startDelayMs(
                stageId,
                room.isCutscenesEnabled()
        );
        return new GameStartContext(game, firstRound, participantSlots, initialDelayMs);
    }

    /// Room이 시작할 수 있는 상태인지 검증합니다.
    /// @param room
    /// @param requesterId
    private void validateRoom(RoomSession room, UUID requesterId) {
        if (!room.getHostUserId().equals(requesterId)) {
            throw new GlobalException(ErrorCode.NOT_ROOM_OWNER);
        }
        if (room.getState() != RoomSession.RoomState.WAITING && room.getState() != RoomSession.RoomState.FINISHED) {
            throw new GlobalException(ErrorCode.ROOM_NOT_LOBBY);
        }
        if (room.getCurrentGameSessionId() != null) {
            throw new GlobalException(ErrorCode.GAME_ALREADY_EXISTS);
        }
    }

    /// 참가자들이 게임을 할 상태인지 검증합니다.
    /// @param room
    /// @param participants
    private void validateParticipants(RoomSession room, List<Participant> participants) {
        if (participants.size() < GameConstants.MINIMUM_MEMBER_COUNT) {
            throw new GlobalException(ErrorCode.INSUFFICIENT_MEMBERS);
        }
        boolean allReady = participants.stream()
                .filter(participant -> !participant.isHost())
                .allMatch(Participant::isReady);
        if (!allReady) {
            if (room.isHasPlayerReturnedToLobby()) {
                throw new GlobalException(ErrorCode.PLAYER_RETURNED_TO_LOBBY);
            }
            throw new GlobalException(ErrorCode.NOT_ALL_MEMBERS_READY);
        }
    }

    private record GameStartContext(
            GameSession game,
            StageRound round,
            Map<UUID, Integer> participantSlots,
            int initialDelayMs
    ) {
    }
}
