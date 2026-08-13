package org.ssafy.bodybuilder.domain.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
import org.ssafy.bodybuilder.domain.game.websocket.GameMessagePublisher;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.infra.logging.game.GameSessionEventRecorder;

@ExtendWith(MockitoExtension.class)
class GameStartServiceTest {

    @Mock RoomSessionRepository roomSessionRepository;
    @Mock GameSessionRepository gameSessionRepository;
    @Mock StageRepository stageRepository;
    @Mock StageRoundRepository stageRoundRepository;
    @Mock RoomLockManager roomLockManager;
    @Mock GameMessagePublisher gameMessagePublisher;
    @Mock GameCaptureScheduler gameCaptureScheduler;
    @Mock GameSessionEventRecorder gameSessionEventRecorder;
    @Mock CustomMapRepository customMapRepository;
    @Mock WaterFlowBroadcastService waterFlowBroadcastService;
    @Mock StageRound firstRound;

    private GameStartService gameStartService;
    private UUID roomId;
    private UUID ownerId;
    private UUID guestId;
    private RoomSession room;

    @BeforeEach
    void setUp() {
        gameStartService = new GameStartService(
                roomSessionRepository,
                gameSessionRepository,
                stageRepository,
                stageRoundRepository,
                roomLockManager,
                gameMessagePublisher,
                gameCaptureScheduler,
                gameSessionEventRecorder,
                customMapRepository,
                waterFlowBroadcastService
        );
        roomId = UUID.randomUUID();
        ownerId = UUID.randomUUID();
        guestId = UUID.randomUUID();
        room = new RoomSession(roomId, "CODE", ownerId, "owner");

        lenient().when(roomLockManager.withLock(eq(roomId), any())).thenAnswer(invocation -> {
            Supplier<?> operation = invocation.getArgument(1);
            return operation.get();
        });
    }

    @Test
    void startsGameAndSchedulesCaptureRequests() {
        var guest = room.addParticipant(guestId, "guest", false);
        guest.toggleReady();
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));
        when(stageRepository.existsById(1)).thenReturn(true);
        when(stageRoundRepository.findByStageIdAndRoundNo(1, 1))
                .thenReturn(Optional.of(firstRound));
        when(firstRound.getId()).thenReturn(1);
        when(firstRound.getRoundNo()).thenReturn(1);
        when(firstRound.getMapConfig()).thenReturn(
                new ObjectMapper().createObjectNode().put("mapNo", 11)
        );

        gameStartService.startGame(roomId, ownerId, 1);

        ArgumentCaptor<GameSession> gameCaptor = ArgumentCaptor.forClass(GameSession.class);
        ArgumentCaptor<Map<UUID, Integer>> slotsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(gameSessionRepository).commitGameStart(gameCaptor.capture(), slotsCaptor.capture());

        GameSession game = gameCaptor.getValue();
        assertThat(game.getMapId()).isEqualTo(1001);
        assertThat(slotsCaptor.getValue()).containsExactly(
                Map.entry(ownerId, 1),
                Map.entry(guestId, 2)
        );
        assertThat(room.getState()).isEqualTo(RoomSession.RoomState.PLAYING);
        assertThat(room.getCurrentGameSessionId()).isEqualTo(game.getGameSessionId());
        verify(roomSessionRepository).saveRoom(room);

        ArgumentCaptor<GameStartResponsePayload> payloadCaptor =
                ArgumentCaptor.forClass(GameStartResponsePayload.class);
        verify(gameMessagePublisher).publishGameMessage(
                eq(GameMessageType.GAME_START_RESPONSE),
                eq(roomId),
                eq(game.getGameSessionId()),
                payloadCaptor.capture()
        );
        assertThat(payloadCaptor.getValue().participants())
                .extracting(
                        GameStartResponsePayload.Participant::userId,
                        GameStartResponsePayload.Participant::playerNo
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(ownerId, 1),
                        org.assertj.core.groups.Tuple.tuple(guestId, 2)
                );
        assertThat(payloadCaptor.getValue().initialDelayMs()).isEqualTo(5_000);
        assertThat(payloadCaptor.getValue().placements()).hasSize(4);
        assertThat(payloadCaptor.getValue().placements())
                .extracting(GameStartResponsePayload.Placement::captureNo)
                .containsExactly(1, 2, 3, 4);
        assertThat(payloadCaptor.getValue().placements())
                .extracting(GameStartResponsePayload.Placement::userId)
                .contains(ownerId, guestId);
        verify(gameCaptureScheduler).start(
                roomId,
                game.getGameSessionId(),
                List.of(1, 2),
                5_000
        );
    }

    @Test
    void delaysFirstCaptureWhileRegisteredStartCutscenePlays() {
        var guest = room.addParticipant(guestId, "guest", false);
        guest.toggleReady();
        room.setCutscenesEnabled(true);
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));
        when(stageRepository.existsById(1)).thenReturn(true);
        when(stageRoundRepository.findByStageIdAndRoundNo(1, 1))
                .thenReturn(Optional.of(firstRound));
        when(firstRound.getRoundNo()).thenReturn(1);

        gameStartService.startGame(roomId, ownerId, 1);

        ArgumentCaptor<GameStartResponsePayload> payloadCaptor =
                ArgumentCaptor.forClass(GameStartResponsePayload.class);
        verify(gameMessagePublisher).publishGameMessage(
                eq(GameMessageType.GAME_START_RESPONSE),
                eq(roomId),
                any(),
                payloadCaptor.capture()
        );
        assertThat(payloadCaptor.getValue().initialDelayMs()).isEqualTo(16_000);
        verify(gameCaptureScheduler).start(
                eq(roomId),
                any(),
                eq(List.of(1, 2)),
                eq(16_000L)
        );
    }

    @Test
    void preservesRoomSlotIdsWhenThereIsAnEmptySlot() {
        UUID departedGuestId = UUID.randomUUID();
        room.addParticipant(departedGuestId, "departed", false);
        var guest = room.addParticipant(guestId, "guest", false);
        guest.toggleReady();
        room.removeParticipant(departedGuestId);
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));
        when(stageRepository.existsById(1)).thenReturn(true);
        when(stageRoundRepository.findByStageIdAndRoundNo(1, 1))
                .thenReturn(Optional.of(firstRound));
        when(firstRound.getRoundNo()).thenReturn(1);

        gameStartService.startGame(roomId, ownerId, 1);

        ArgumentCaptor<Map<UUID, Integer>> slotsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(gameSessionRepository).commitGameStart(any(), slotsCaptor.capture());
        assertThat(slotsCaptor.getValue()).containsExactly(
                Map.entry(ownerId, 1),
                Map.entry(guestId, 3)
        );
    }

    @Test
    void rejectsStartByNonHost() {
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> gameStartService.startGame(roomId, guestId, 1))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.NOT_ROOM_OWNER)
                );

        verify(gameSessionRepository, never()).commitGameStart(any(), any());
        verify(gameCaptureScheduler, never()).start(any(), any(), any());
    }

    @Test
    void rejectsStartWhenParticipantsAreInsufficient() {
        room.removeParticipant(ownerId);
        assertThat(room.getParticipantList().size())
                .isLessThan(GameConstants.MINIMUM_MEMBER_COUNT);
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> gameStartService.startGame(roomId, ownerId, 1))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INSUFFICIENT_MEMBERS)
                );

        verify(gameSessionRepository, never()).commitGameStart(any(), any());
        verify(gameCaptureScheduler, never()).start(any(), any(), any());
    }

    @Test
    void rejectsStartWhenParticipantsAreNotAllReady() {
        room.addParticipant(guestId, "guest", false);
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> gameStartService.startGame(roomId, ownerId, 1))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.NOT_ALL_MEMBERS_READY)
                );

        verify(gameSessionRepository, never()).commitGameStart(any(), any());
        verify(gameCaptureScheduler, never()).start(any(), any(), any());
    }

    @Test
    void rejectsStartWithInvalidStage() {
        var guest = room.addParticipant(guestId, "guest", false);
        guest.toggleReady();
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> gameStartService.startGame(roomId, ownerId, null))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_STAGE)
                );

        verify(stageRepository, never()).existsById(any());
        verify(gameSessionRepository, never()).commitGameStart(any(), any());
        verify(gameCaptureScheduler, never()).start(any(), any(), any());
    }

    @Test
    void allowsStartWhenRoomIsFinishedAndAllMembersReady() {
        room.addParticipant(guestId, "guest", false);
        room.finishGame(); // Sets state = FINISHED, isReady = true
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));
        when(stageRepository.existsById(1)).thenReturn(true);
        when(stageRoundRepository.findByStageIdAndRoundNo(1, GameConstants.FIRST_ROUND))
                .thenReturn(Optional.of(firstRound));

        gameStartService.startGame(roomId, ownerId, 1);

        verify(gameSessionRepository).commitGameStart(any(), any());
        assertThat(room.getState()).isEqualTo(RoomSession.RoomState.PLAYING);
    }

    @Test
    void rejectsStartWhenPlayerReturnedToLobby() {
        room.addParticipant(guestId, "guest", false);
        room.finishGame();
        room.returnToLobby(guestId); // Sets state = WAITING, hasPlayerReturnedToLobby = true
        when(roomSessionRepository.findRoomById(roomId)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> gameStartService.startGame(roomId, ownerId, 1))
                .isInstanceOfSatisfying(
                        GlobalException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.PLAYER_RETURNED_TO_LOBBY)
                );

        verify(gameSessionRepository, never()).commitGameStart(any(), any());
    }
}
