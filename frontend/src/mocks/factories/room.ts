import type { QuickStartResult, RoomSummary } from '../../features/rooms/services/roomsApi'
import type { MockParticipant, MockRoom, MockUser } from '../types'
import { createRoomCode, createRoomUuid, mockUserUuid } from './identifiers'

export function createMockRoom(
  owner: MockUser,
  input: { title: string; password: string | null; stageId?: number | null },
): MockRoom {
  return {
    roomId: createRoomUuid(),
    roomCode: createRoomCode(),
    title: input.title,
    isSecret: Boolean(input.password),
    password: input.password,
    maxCapacity: 4,
    // 창작마당의 "이 맵으로 방 만들기"는 stageId를 함께 보낸다. 없으면 기본 스테이지.
    selectedStageId: input.stageId ?? 1,
    cutscenesEnabled: false,
    participants: [createParticipant(owner, 1, true)],
  }
}

export function createParticipant(
  user: MockUser,
  slotId: number,
  isHost: boolean,
): MockParticipant {
  return {
    userId: mockUserUuid(user.id),
    nickname: user.nickname,
    slotId,
    isHost,
    isReady: isHost,
  }
}

export function findAvailableSlot(room: MockRoom) {
  const usedSlots = room.participants.map((participant) => participant.slotId)
  return [1, 2, 3, 4].find((slot) => !usedSlots.includes(slot)) ?? 1
}

export function toRoomDetail(room: MockRoom, me: Pick<MockParticipant, 'slotId' | 'isHost'>): QuickStartResult {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    title: room.title,
    isSecret: room.isSecret,
    slotId: me.slotId,
    isHost: me.isHost,
    selectedStageId: room.selectedStageId,
    cutscenesEnabled: room.cutscenesEnabled,
    participants: room.participants,
  }
}

export function toRoomSummary(room: MockRoom): RoomSummary {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    title: room.title,
    isSecret: room.isSecret,
    currentCapacity: room.participants.length,
    maxCapacity: room.maxCapacity,
    hostNickname: room.participants.find((participant) => participant.isHost)?.nickname ?? '알 수 없음',
  }
}
