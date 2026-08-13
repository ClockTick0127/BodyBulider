import { request } from '../../../shared/api/request'

/**
 * ⚠️ 백엔드 직렬화 규격 — 반드시 함께 확인할 것
 *
 * 이 파일의 타입은 백엔드 DTO가 `isHost` / `isSecret` 키로 직렬화한다는 전제로 작성되었다.
 * (FE-TASK-02, 개발명세서 기준)
 *
 * 전제 조건: `QuickStartResponseDto` / `RoomSummaryDto` / `RoomParticipantDto`의
 * `boolean isHost` · `boolean isSecret` 필드에 `@JsonProperty("isHost")` ·
 * `@JsonProperty("isSecret")`가 선언되어 있어야 한다.
 *
 * 이 어노테이션이 없으면 Lombok 기본 getter(`isHost()`, `isSecret()`)를 거쳐 Jackson이
 * `host` / `secret` 키로 직렬화하고, 아래 필드는 전부 `undefined`(→ falsy)가 된다.
 * 그 경우 방장 권한과 비밀방 표시가 조용히 사라진다. (과거 두 차례 발생한 버그)
 *
 * 백엔드 DTO를 바꾸는 경우 이 타입도 반드시 같이 바꿔야 한다.
 */

/** 방 참가자 1명. userId는 36자리 UUID 문자열, slotId = 4구역 중 담당 구역 번호(1~4). */
export type RoomParticipant = {
  userId: string
  nickname: string
  slotId: number
  /** 서버 JSON 키: isHost (DTO에 @JsonProperty("isHost") 필요) */
  isHost: boolean
  /** 서버 JSON 키: isReady (방장은 항상 true) */
  isReady: boolean
}

/** 대기방 요약 (로비 목록용) — `GET /api/v1/rooms` */
export type RoomSummary = {
  roomId: string
  roomCode: string
  title: string
  /** 서버 JSON 키: isSecret (비밀방 여부, DTO에 @JsonProperty("isSecret") 필요) */
  isSecret: boolean
  currentCapacity: number
  maxCapacity: number
  hostNickname: string
}

/** 방 생성/입장/조회 상세 응답 */
export type QuickStartResult = {
  roomId: string
  roomCode: string
  title: string
  /** 서버 JSON 키: isSecret (비밀방 여부, DTO에 @JsonProperty("isSecret") 필요) */
  isSecret: boolean
  /** 내가 배정받은 구역 번호 */
  slotId: number
  /** 서버 JSON 키: isHost (DTO에 @JsonProperty("isHost") 필요) */
  isHost: boolean
  /** 방장이 현재 선택한 스테이지 */
  selectedStageId: number
  /** 방장이 설정한 게임 컷씬 사용 여부 */
  cutscenesEnabled: boolean
  participants: RoomParticipant[]
}

export type RoomStageChangeResponse = {
  roomId: string
  roomCode: string
  selectedStageId: number
}

export type RoomCutsceneSettingResponse = {
  roomId: string
  roomCode: string
  cutscenesEnabled: boolean
}

export type RoomCreateRequest = {
  title: string
  /** 비밀방이 아니면 null */
  password?: string | null
  /**
   * 방을 만들면서 플레이할 맵을 지정한다. (창작마당의 "이 맵으로 방 만들기")
   * 생략하면 서버 기본 스테이지가 선택되어 기존 방 만들기 흐름이 그대로 유지된다.
   */
  stageId?: number
}

export type RoomJoinRequest = {
  roomCode: string
  /** 공개방이면 null */
  password?: string | null
}

/** 대기 중인 방 목록 조회 */
export function getWaitingRooms() {
  return request<RoomSummary[]>('/api/v1/rooms', { method: 'GET' })
}

/**
 * 방 생성 (생성자가 방장이 된다)
 *
 * `stageId`는 지정했을 때만 body에 넣는다. 항상 null로 보내면 서버가 기본 스테이지 분기를
 * 타지 못할 수 있어, 기존 로비의 방 만들기 동작이 바뀔 위험이 있다.
 */
export function createRoom(payload: RoomCreateRequest) {
  return request<QuickStartResult>('/api/v1/rooms', {
    method: 'POST',
    body: JSON.stringify({
      title: payload.title,
      password: payload.password ?? null,
      ...(payload.stageId != null ? { stageId: payload.stageId } : {}),
    }),
  })
}

/** 방 코드로 입장. 비밀방이면 password 필요 (실패 시 RM003) */
export function joinRoom(payload: RoomJoinRequest) {
  return request<QuickStartResult>('/api/v1/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ roomCode: payload.roomCode, password: payload.password ?? null }),
  })
}

/**
 * MVP 빠른 시작: 대기 중인 방(인원 < 4)이 있으면 자동 참여하고,
 * 없으면 새 방을 생성해 방장으로 배정된다. 서버 세션 인증 필수.
 */
export function quickStartRoom() {
  return request<QuickStartResult>('/api/v1/rooms/quick-start', { method: 'POST' })
}

/**
 * 방 상세 정보 조회.
 * 새로고침·URL 직접 진입으로 라우트 state가 없을 때 방 상태를 복구하는 데 사용한다.
 */
export function getRoomInfo(roomCode: string) {
  return request<QuickStartResult>(`/api/v1/rooms/${roomCode}`, { method: 'GET' })
}

/** 현재 사용자의 준비 상태를 토글한다. */
export function toggleReady(roomCode: string) {
  return request<RoomParticipant>(`/api/v1/rooms/${roomCode}/ready`, {
    method: 'PATCH',
  })
}

/** 방장이 플레이할 스테이지를 변경한다. */
export function changeRoomStage(roomCode: string, stageId: number) {
  return request<RoomStageChangeResponse>(`/api/v1/rooms/${roomCode}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stageId }),
  })
}

/** 방장이 이 방의 스테이지 컷씬 사용 여부를 변경한다. */
export function changeRoomCutsceneSetting(roomCode: string, enabled: boolean) {
  return request<RoomCutsceneSettingResponse>(`/api/v1/rooms/${roomCode}/cutscenes`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
}

/** 게임 종료 후 결과 창에서 로비로 복귀한다. */
export function returnToLobby(roomCode: string) {
  return request<RoomParticipant>(`/api/v1/rooms/${roomCode}/return-to-lobby`, {
    method: 'PATCH',
  })
}
