package org.ssafy.bodybuilder.domain.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.service.StageQueryService;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.room.dto.QuickStartResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomStageChangeResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomCreateRequest;
import org.ssafy.bodybuilder.domain.room.dto.RoomJoinRequest;
import org.ssafy.bodybuilder.domain.room.dto.RoomSummaryDto;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.domain.room.service.RoomService;
import org.ssafy.bodybuilder.domain.room.util.RoomCodeGenerator;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.model.User;
import org.springframework.messaging.simp.SimpMessagingTemplate;

@ExtendWith(MockitoExtension.class)
class RoomServiceTest {

    @InjectMocks
    private RoomService roomService;

    @Mock
    private RoomSessionRepository roomSessionRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Mock
    private RoomLockManager roomLockManager;

    @Mock
    private RoomCodeGenerator roomCodeGenerator;

    @Mock
    private StageQueryService stageQueryService;

    @BeforeEach
    void setUp() {
        lenient().when(roomLockManager.withLock(any(), any())).thenAnswer(invocation -> {
            Supplier<?> operation = invocation.getArgument(1);
            return operation.get();
        });
        lenient().when(roomCodeGenerator.generateUniqueRoomCode(any())).thenReturn("CODE");
    }

    @Test
    @DisplayName("createRoom - 제목과 비밀번호를 설정한 비밀방을 생성한다")
    void createRoom_withTitleAndPassword_createsSecretRoom() {
        UUID userId = UUID.randomUUID();
        given(userRepository.findById(userId)).willReturn(Optional.of(User.of("host")));

        QuickStartResponseDto response = roomService.createRoom(
                userId,
                new RoomCreateRequest("초보만 오세요", "1234")
        );

        assertThat(response.getTitle()).isEqualTo("초보만 오세요");
        assertThat(response.isSecret()).isTrue();
        assertThat(response.getSlotId()).isEqualTo(1);
        assertThat(response.isHost()).isTrue();
        verify(roomSessionRepository).saveRoom(any(RoomSession.class));
    }

    @Test
    @DisplayName("joinRoom - 올바른 코드와 비밀번호로 방에 입장한다")
    void joinRoom_correctPassword_success() {
        UUID hostId = UUID.randomUUID();
        UUID guestId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(
                roomId,
                "CODE",
                "비밀방",
                "1234",
                hostId,
                "host"
        );

        given(userRepository.findById(guestId)).willReturn(Optional.of(User.of("guest")));
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        QuickStartResponseDto response = roomService.joinRoom(
                guestId,
                new RoomJoinRequest("CODE", "1234")
        );

        assertThat(response.getSlotId()).isEqualTo(2);
        assertThat(response.isHost()).isFalse();
        assertThat(response.getParticipants()).hasSize(2);
        verify(roomSessionRepository).saveRoom(room);
    }

    @Test
    @DisplayName("joinRoom - 비밀번호가 다르면 입장을 거부한다")
    void joinRoom_wrongPassword_throwsException() {
        UUID hostId = UUID.randomUUID();
        UUID guestId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(
                roomId,
                "CODE",
                "비밀방",
                "1234",
                hostId,
                "host"
        );

        given(userRepository.findById(guestId)).willReturn(Optional.of(User.of("guest")));
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        assertThatThrownBy(() -> roomService.joinRoom(
                guestId,
                new RoomJoinRequest("CODE", "wrong")
        ))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_ROOM_PASSWORD);
    }

    @Test
    @DisplayName("getWaitingRooms - 대기방을 요약 정보로 반환한다")
    void getWaitingRooms_returnsRoomSummaries() {
        UUID hostId = UUID.randomUUID();
        RoomSession room = new RoomSession(
                UUID.randomUUID(),
                "CODE",
                "방 1",
                null,
                hostId,
                "host"
        );
        given(roomSessionRepository.findAllWaitingRooms()).willReturn(List.of(room));

        List<RoomSummaryDto> result = roomService.getWaitingRooms();

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().getTitle()).isEqualTo("방 1");
        assertThat(result.getFirst().getHostNickname()).isEqualTo("host");
    }

    @Test
    @DisplayName("quickStart - 빈 대기방 목록이면 새 방의 방장으로 입장한다")
    void quickStart_noWaitingRoom_createsRoom() {
        UUID userId = UUID.randomUUID();
        given(userRepository.findById(userId)).willReturn(Optional.of(User.of("user")));
        given(roomSessionRepository.findAllWaitingRooms()).willReturn(List.of());

        QuickStartResponseDto response = roomService.quickStart(userId);

        assertThat(response.getSlotId()).isEqualTo(1);
        assertThat(response.isHost()).isTrue();
        assertThat(response.getParticipants()).hasSize(1);
        verify(messagingTemplate, times(1))
                .convertAndSend(eq("/sub/room/" + response.getRoomId()), any(Map.class));
    }

    @Test
    @DisplayName("quickStart - 공개 대기방이 있으면 해당 방에 입장한다")
    void quickStart_waitingRoom_joinsRoom() {
        UUID hostId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(
                roomId,
                "CODE",
                "즐거운 게임 방",
                null,
                hostId,
                "host"
        );

        given(userRepository.findById(userId)).willReturn(Optional.of(User.of("guest")));
        given(roomSessionRepository.findAllWaitingRooms()).willReturn(List.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        QuickStartResponseDto response = roomService.quickStart(userId);

        assertThat(response.getRoomId()).isEqualTo(roomId);
        assertThat(response.getSlotId()).isEqualTo(2);
        assertThat(response.isHost()).isFalse();
        verify(roomSessionRepository).saveRoom(room);
    }

    @Test
    @DisplayName("quickStart - 존재하지 않는 사용자는 입장할 수 없다")
    void quickStart_userNotFound_throwsException() {
        UUID userId = UUID.randomUUID();
        given(userRepository.findById(userId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> roomService.quickStart(userId))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.USER_NOT_FOUND);
    }

    @Test
    @DisplayName("leaveRoom - 방장이 나가면 다음 참가자에게 방장을 위임한다")
    void leaveRoom_hostLeaves_transfersHost() {
        UUID hostId = UUID.randomUUID();
        UUID guestId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(
                roomId,
                "CODE",
                "즐거운 게임 방",
                null,
                hostId,
                "host"
        );
        room.addParticipant(guestId, "guest", false);
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        roomService.leaveRoom(roomId, hostId);

        assertThat(room.getHostUserId()).isEqualTo(guestId);
        assertThat(room.getParticipants()).hasSize(1);
        verify(roomSessionRepository).saveRoom(room);
    }

    @Test
    @DisplayName("leaveRoom - 마지막 참가자가 나가면 방을 삭제한다")
    void leaveRoom_lastUserLeaves_removesRoom() {
        UUID userId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(
                roomId,
                "CODE",
                "즐거운 게임 방",
                null,
                userId,
                "user"
        );
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        roomService.leaveRoom(roomId, userId);

        verify(roomSessionRepository).removeRoom(roomId);
    }

    @Test
    @DisplayName("createRoom_Success - 방 생성 시 방장 배정 및 UUID/RoomCode 생성 확인")
    void createRoom_Success() {
        UUID userId = UUID.randomUUID();
        User user = User.of("host_user");
        given(userRepository.findById(userId)).willReturn(Optional.of(user));

        RoomCreateRequest request = new RoomCreateRequest("테스트 방", null);
        QuickStartResponseDto response = roomService.createRoom(userId, request);

        assertThat(response).isNotNull();
        assertThat(response.getRoomId()).isNotNull();
        assertThat(response.getRoomCode()).isEqualTo("CODE");
        assertThat(response.getTitle()).isEqualTo("테스트 방");
        assertThat(response.isHost()).isTrue();
        assertThat(response.getSlotId()).isEqualTo(1);
    }

    @Test
    @DisplayName("joinRoom_Full_ThrowsException - 4인 정원 초과 시 ROOM_FULL 예외 발생 검증")
    void joinRoom_Full_ThrowsException() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", "일반방", null, hostId, "host");
        room.addParticipant(UUID.randomUUID(), "user2", false);
        room.addParticipant(UUID.randomUUID(), "user3", false);
        room.addParticipant(UUID.randomUUID(), "user4", false);

        UUID guestId = UUID.randomUUID();
        User guest = User.of("guest");
        given(userRepository.findById(guestId)).willReturn(Optional.of(guest));
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        RoomJoinRequest joinReq = new RoomJoinRequest("CODE", null);

        assertThatThrownBy(() -> roomService.joinRoom(guestId, joinReq))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ROOM_FULL);
    }

    @Test
    @DisplayName("joinRoom_InvalidPassword_ThrowsException - 비밀번호 틀릴 시 INVALID_ROOM_PASSWORD 예외 발생 검증")
    void joinRoom_InvalidPassword_ThrowsException() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", "비밀방", "secret123", hostId, "host");

        UUID guestId = UUID.randomUUID();
        User guest = User.of("guest");
        given(userRepository.findById(guestId)).willReturn(Optional.of(guest));
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        RoomJoinRequest joinReq = new RoomJoinRequest("CODE", "wrongpass");

        assertThatThrownBy(() -> roomService.joinRoom(guestId, joinReq))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_ROOM_PASSWORD);
    }

    @Test
    @DisplayName("joinRoom_PlayingState_ThrowsException - PLAYING 상태 방 입장 시 ROOM_OPERATION_BUSY 예외 발생 검증")
    void joinRoom_PlayingState_ThrowsException() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", "게임방", null, hostId, "host");
        room.setState(RoomSession.RoomState.PLAYING);

        UUID guestId = UUID.randomUUID();
        User guest = User.of("guest");
        given(userRepository.findById(guestId)).willReturn(Optional.of(guest));
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        RoomJoinRequest joinReq = new RoomJoinRequest("CODE", null);

        assertThatThrownBy(() -> roomService.joinRoom(guestId, joinReq))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ROOM_OPERATION_BUSY);
    }

    @Test
    @DisplayName("joinRoom_AlreadyJoined_DoesNotBroadcast - 이미 속한 유저 재입장 시 PLAYER_JOINED 이벤트 중복 미발행 검증")
    void joinRoom_AlreadyJoined_DoesNotBroadcast() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", "게임방", null, hostId, "host");

        given(userRepository.findById(hostId)).willReturn(Optional.of(User.of("host")));
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        RoomJoinRequest joinReq = new RoomJoinRequest("CODE", null);
        roomService.joinRoom(hostId, joinReq);

        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    @Test
    @DisplayName("leaveRoom_NonParticipant_DoesNotSaveOrBroadcast - 방 참가자가 아닌 유저 퇴장 시 saveRoom 및 브로드캐스트 미호출 검증")
    void leaveRoom_NonParticipant_DoesNotSaveOrBroadcast() {
        UUID hostId = UUID.randomUUID();
        UUID nonParticipantId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", "게임방", null, hostId, "host");

        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        roomService.leaveRoom(roomId, nonParticipantId);

        verify(roomSessionRepository, never()).saveRoom(any());
        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    @Test
    @DisplayName("toggleReady - 게스트 참가자의 준비 상태 토글 및 브로드캐스트 검증")
    void toggleReady_guestTogglesReady_broadcastsEvent() {
        UUID hostId = UUID.randomUUID();
        UUID guestId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");
        room.addParticipant(guestId, "guest", false);

        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        var response = roomService.toggleReady("CODE", guestId);

        assertThat(response.isReady()).isTrue();
        verify(roomSessionRepository).saveRoom(room);
        verify(messagingTemplate, times(2))
                .convertAndSend(any(String.class), any(Object.class));
    }

    @Test
    @DisplayName("toggleReady - 방장의 준비 상태 변경 시 isReady=true 유지 검증")
    void toggleReady_hostTogglesReady_remainsTrue() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");

        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        var response = roomService.toggleReady("CODE", hostId);

        assertThat(response.isReady()).isTrue();
        verify(roomSessionRepository).saveRoom(room);
    }

    @Test
    @DisplayName("changeStage_Success - 방장이 유효한 stageId로 요청 시 selectedStageId 변경 및 STOMP 방송 성공 검증")
    void changeStage_Success() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");

        assertThat(room.getSelectedStageId()).isEqualTo(1);

        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        RoomStageChangeResponseDto response = roomService.changeStage("CODE", hostId, 2);

        assertThat(response.getRoomId()).isEqualTo(roomId);
        assertThat(response.getRoomCode()).isEqualTo("CODE");
        assertThat(response.getSelectedStageId()).isEqualTo(2);
        assertThat(room.getSelectedStageId()).isEqualTo(2);

        verify(stageQueryService).getStage(2);
        verify(roomSessionRepository).saveRoom(room);
        verify(messagingTemplate, times(1))
                .convertAndSend(eq("/sub/room/" + roomId), any(Map.class));
        verify(messagingTemplate, times(1))
                .convertAndSend(eq("/topic/rooms/" + roomId), any(Map.class));
    }

    @Test
    @DisplayName("changeStage_Forbidden_NonHost - 방장이 아닌 참가자 요청 시 ROOM_HOST_ONLY 예외 발생 검증")
    void changeStage_Forbidden_NonHost() {
        UUID hostId = UUID.randomUUID();
        UUID guestId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");
        room.addParticipant(guestId, "guest", false);

        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        assertThatThrownBy(() -> roomService.changeStage("CODE", guestId, 2))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ROOM_HOST_ONLY);

        assertThat(room.getSelectedStageId()).isEqualTo(1);
        verify(roomSessionRepository, never()).saveRoom(any());
        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    @Test
    @DisplayName("changeStage_NotFound_InvalidStage - 존재하지 않는 stageId 요청 시 STAGE_NOT_FOUND 예외 발생 검증")
    void changeStage_NotFound_InvalidStage() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");

        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));
        given(stageQueryService.getStage(999))
                .willThrow(new GlobalException(ErrorCode.STAGE_NOT_FOUND));

        assertThatThrownBy(() -> roomService.changeStage("CODE", hostId, 999))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.STAGE_NOT_FOUND);

        assertThat(room.getSelectedStageId()).isEqualTo(1);
        verify(roomSessionRepository, never()).saveRoom(any());
        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    @Test
    @DisplayName("changeStage_NotFound_Room - 존재하지 않는 방 코드 요청 시 ROOM_NOT_FOUND 예외 발생 검증")
    void changeStage_NotFound_Room() {
        given(roomSessionRepository.findRoomByCode("NONE")).willReturn(Optional.empty());

        assertThatThrownBy(() -> roomService.changeStage("NONE", UUID.randomUUID(), 2))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ROOM_NOT_FOUND);
    }

    @Test
    @DisplayName("getRoomInfo - 방 참가자가 아닌 유저가 조회 시 roomId와 참가자 명부가 마스킹된다")
    void getRoomInfo_nonParticipant_returnsMaskedInfo() {
        UUID hostId = UUID.randomUUID();
        UUID nonParticipantId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "SECRET1", "비밀방", "1234", hostId, "host");

        given(roomSessionRepository.findRoomByCode("SECRET1")).willReturn(Optional.of(room));

        QuickStartResponseDto response = roomService.getRoomInfo("SECRET1", nonParticipantId);

        assertThat(response.getRoomId()).isNull();
        assertThat(response.getRoomCode()).isEqualTo("SECRET1");
        assertThat(response.getTitle()).isEqualTo("비밀방");
        assertThat(response.isSecret()).isTrue();
        assertThat(response.getSlotId()).isEqualTo(-1);
        assertThat(response.isHost()).isFalse();
        assertThat(response.getParticipants()).isEmpty();
    }

    @Test
    @DisplayName("getRoomInfo - 방 참가자 유저가 조회 시 전체 방 정보 및 참가자 명부가 반환된다")
    void getRoomInfo_participant_returnsFullInfo() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");
        room.setSelectedStageId(3);

        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));

        QuickStartResponseDto response = roomService.getRoomInfo("CODE", hostId);

        assertThat(response.getRoomId()).isEqualTo(roomId);
        assertThat(response.getRoomCode()).isEqualTo("CODE");
        assertThat(response.getSelectedStageId()).isEqualTo(3);
        assertThat(response.getParticipants()).hasSize(1);
        assertThat(response.getParticipants().get(0).getUserId()).isEqualTo(hostId);
    }

    @Test
    @DisplayName("changeCutsceneSetting - 방장이 컷씬 사용 여부를 변경하고 참가자에게 방송한다")
    void changeCutsceneSetting_hostUpdatesAndBroadcasts() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        var response = roomService.changeCutsceneSetting("CODE", hostId, true);

        assertThat(response.isCutscenesEnabled()).isTrue();
        assertThat(room.isCutscenesEnabled()).isTrue();
        assertThat(roomService.getRoomInfo("CODE", hostId).isCutscenesEnabled()).isTrue();
        verify(roomSessionRepository).saveRoom(room);
        verify(messagingTemplate).convertAndSend(eq("/sub/room/" + roomId), any(Map.class));
        verify(messagingTemplate).convertAndSend(eq("/topic/rooms/" + roomId), any(Map.class));
    }

    @Test
    @DisplayName("changeCutsceneSetting - 참가자는 컷씬 설정을 변경할 수 없다")
    void changeCutsceneSetting_nonHostIsRejected() {
        UUID hostId = UUID.randomUUID();
        UUID guestId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");
        room.addParticipant(guestId, "guest", false);
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));

        assertThatThrownBy(() -> roomService.changeCutsceneSetting("CODE", guestId, true))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.ROOM_HOST_ONLY);

        assertThat(room.isCutscenesEnabled()).isFalse();
        verify(roomSessionRepository, never()).saveRoom(any());
    }
}
