package org.ssafy.bodybuilder.domain.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

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
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.service.StageQueryService;
import org.ssafy.bodybuilder.domain.game.util.RoomLockManager;
import org.ssafy.bodybuilder.domain.room.dto.QuickStartResponseDto;
import org.ssafy.bodybuilder.domain.room.dto.RoomCreateRequest;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;
import org.ssafy.bodybuilder.domain.room.service.RoomService;
import org.ssafy.bodybuilder.domain.room.util.RoomCodeGenerator;
import org.ssafy.bodybuilder.domain.user.dao.UserRepository;
import org.ssafy.bodybuilder.domain.user.model.User;

/**
 * STEP 6 #9(비공개 맵 플레이 차단), #14(맵 지정 방 생성 무회귀).
 *
 * <p>기존 RoomServiceTest는 손대지 않고 창작마당 관련 시나리오만 여기에 모은다.
 */
@ExtendWith(MockitoExtension.class)
class RoomCustomMapStageTest {

    private static final int PUBLIC_CUSTOM_STAGE = 10000;
    private static final int PRIVATE_CUSTOM_STAGE = 10001;
    private static final int DEFAULT_STAGE = 1;

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
    @DisplayName("createRoom - stageId가 없으면 기존 동작(기본 스테이지)을 그대로 유지한다")
    void createRoomWithoutStageIdKeepsLegacyBehaviour() {
        UUID userId = UUID.randomUUID();
        given(userRepository.findById(userId)).willReturn(Optional.of(User.of("host")));

        QuickStartResponseDto response =
                roomService.createRoom(userId, new RoomCreateRequest("일반 방", null));

        assertThat(response.getSelectedStageId()).isEqualTo(DEFAULT_STAGE);
        verify(stageQueryService, never()).getStage(any());
        verify(stageQueryService, never()).isPlayableCustomStage(any());
    }

    @Test
    @DisplayName("createRoom - 공개 커스텀 맵을 지정하면 그 맵으로 방이 만들어진다")
    void createRoomWithPublicCustomStage() {
        UUID userId = UUID.randomUUID();
        given(userRepository.findById(userId)).willReturn(Optional.of(User.of("host")));
        given(stageQueryService.getStage(PUBLIC_CUSTOM_STAGE))
                .willThrow(new GlobalException(ErrorCode.STAGE_NOT_FOUND));
        given(stageQueryService.isPlayableCustomStage(PUBLIC_CUSTOM_STAGE)).willReturn(true);

        QuickStartResponseDto response = roomService.createRoom(
                userId,
                new RoomCreateRequest("하늘 위의 도전 방", null, PUBLIC_CUSTOM_STAGE)
        );

        assertThat(response.getSelectedStageId()).isEqualTo(PUBLIC_CUSTOM_STAGE);
        verify(roomSessionRepository).saveRoom(any(RoomSession.class));
    }

    @Test
    @DisplayName("createRoom - 공식 맵을 지정하면 커스텀 맵 조회 없이 통과한다")
    void createRoomWithOfficialStage() {
        UUID userId = UUID.randomUUID();
        given(userRepository.findById(userId)).willReturn(Optional.of(User.of("host")));

        QuickStartResponseDto response =
                roomService.createRoom(userId, new RoomCreateRequest("공식 방", null, 2));

        assertThat(response.getSelectedStageId()).isEqualTo(2);
        verify(stageQueryService).getStage(2);
        verify(stageQueryService, never()).isPlayableCustomStage(any());
    }

    @Test
    @DisplayName("createRoom - 타인의 비공개 맵을 지정하면 방이 만들어지지 않는다")
    void createRoomRejectsPrivateCustomStage() {
        UUID userId = UUID.randomUUID();
        given(userRepository.findById(userId)).willReturn(Optional.of(User.of("host")));
        given(stageQueryService.getStage(PRIVATE_CUSTOM_STAGE))
                .willThrow(new GlobalException(ErrorCode.STAGE_NOT_FOUND));
        given(stageQueryService.isPlayableCustomStage(PRIVATE_CUSTOM_STAGE)).willReturn(false);

        assertThatThrownBy(() -> roomService.createRoom(
                userId, new RoomCreateRequest("몰래 방", null, PRIVATE_CUSTOM_STAGE)))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.STAGE_NOT_FOUND);

        verify(roomSessionRepository, never()).saveRoom(any(RoomSession.class));
    }

    @Test
    @DisplayName("changeStage - 공개 커스텀 맵으로는 바꿀 수 있다")
    void changeStageAllowsPublicCustomStage() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));
        given(stageQueryService.getStage(PUBLIC_CUSTOM_STAGE))
                .willThrow(new GlobalException(ErrorCode.STAGE_NOT_FOUND));
        given(stageQueryService.isPlayableCustomStage(PUBLIC_CUSTOM_STAGE)).willReturn(true);

        assertThat(roomService.changeStage("CODE", hostId, PUBLIC_CUSTOM_STAGE).getSelectedStageId())
                .isEqualTo(PUBLIC_CUSTOM_STAGE);
        assertThat(room.getSelectedStageId()).isEqualTo(PUBLIC_CUSTOM_STAGE);
    }

    @Test
    @DisplayName("changeStage - 타인의 비공개 맵 stageId는 거부하고 원래 예외를 그대로 던진다")
    void changeStageRejectsPrivateCustomStage() {
        UUID hostId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        RoomSession room = new RoomSession(roomId, "CODE", hostId, "host");
        given(roomSessionRepository.findRoomByCode("CODE")).willReturn(Optional.of(room));
        given(roomSessionRepository.findRoomById(roomId)).willReturn(Optional.of(room));
        given(stageQueryService.getStage(PRIVATE_CUSTOM_STAGE))
                .willThrow(new GlobalException(ErrorCode.STAGE_NOT_FOUND));
        given(stageQueryService.isPlayableCustomStage(PRIVATE_CUSTOM_STAGE)).willReturn(false);

        assertThatThrownBy(() -> roomService.changeStage("CODE", hostId, PRIVATE_CUSTOM_STAGE))
                .isInstanceOf(GlobalException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.STAGE_NOT_FOUND);

        assertThat(room.getSelectedStageId()).isEqualTo(DEFAULT_STAGE);
        verify(roomSessionRepository, never()).saveRoom(any(RoomSession.class));
    }
}
