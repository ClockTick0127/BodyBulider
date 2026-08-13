import { delay, http, HttpResponse } from 'msw'
import type {
  QuickStartResult,
  RoomCreateRequest,
  RoomJoinRequest,
  RoomParticipant,
  RoomStageChangeResponse,
  RoomCutsceneSettingResponse,
  RoomSummary,
} from '../../features/rooms/services/roomsApi'
import {
  createMockRoom,
  createParticipant,
  findAvailableSlot,
  toRoomDetail,
  toRoomSummary,
} from '../factories/room'
import { mockUserUuid } from '../factories/identifiers'
import { authStore } from '../stores/auth.store'
import { customMapsStore } from '../stores/customMaps.store'
import { roomsStore } from '../stores/rooms.store'
import { stages } from '../data/game'
import { api } from '../utils/api'
import { apiError } from '../utils/errors'
import type { MockApiResponse } from '../utils/errors'

/**
 * 방에 걸 수 있는 맵인지 확인한다. (서버 `RoomService.changeStage()` 규칙)
 * 공식 스테이지는 제한 없고, 커스텀 맵은 공개된 것 또는 본인 맵만 허용한다.
 * stage_id를 추측해 남의 비공개 맵을 방에 거는 우회 경로를 막기 위한 검증이다.
 */
function isSelectableStage(stageId: number, nickname: string | null) {
  if (!Number.isInteger(stageId)) return false
  if (stages.some((stage) => stage.stage_id === stageId)) return true

  const customMap = customMapsStore.find(stageId)
  if (!customMap) return false
  return customMap.is_public || customMapsStore.isMine(customMap, nickname)
}

export const roomHandlers = [
  http.get<never, never, MockApiResponse<RoomSummary[]>>(api('/api/v1/rooms'), async () => {
    await delay(300)
    if (!authStore.getSessionUser()) return apiError('AU001', '로그인이 필요합니다.', 401)

    return HttpResponse.json(
      roomsStore
        .list()
        .filter((room) => room.participants.length < room.maxCapacity)
        .map(toRoomSummary),
    )
  }),

  http.post<never, RoomCreateRequest, MockApiResponse<QuickStartResult>>(
    api('/api/v1/rooms'),
    async ({ request }) => {
      await delay(400)
      const currentUser = authStore.getSessionUser()
      if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

      const body = await request.json()
      const title = body.title?.trim() ?? ''
      if (!title) return apiError('RM005', '방 제목은 필수입니다.', 400)

      const password = body.password?.trim() ? body.password : null
      if (body.stageId != null && !isSelectableStage(body.stageId, currentUser.nickname)) {
        return apiError('ST001', '선택할 수 없는 스테이지입니다.', 400)
      }
      const room = createMockRoom(currentUser, { title, password, stageId: body.stageId })
      roomsStore.add(room)
      return HttpResponse.json(toRoomDetail(room, room.participants[0]), { status: 201 })
    },
  ),

  http.post<never, RoomJoinRequest, MockApiResponse<QuickStartResult>>(
    api('/api/v1/rooms/join'),
    async ({ request }) => {
      await delay(350)
      const currentUser = authStore.getSessionUser()
      if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

      const body = await request.json()
      const room = roomsStore.findByCode(String(body.roomCode ?? ''))
      if (!room) return apiError('RM001', '해당 방을 찾을 수 없습니다.', 404)

      const currentUserId = mockUserUuid(currentUser.id)
      const existing = room.participants.find((participant) => participant.userId === currentUserId)
      if (existing) return HttpResponse.json(toRoomDetail(room, existing))

      if (room.isSecret && room.password !== (body.password ?? null)) {
        return apiError('RM003', '방 비밀번호가 일치하지 않습니다.', 400)
      }
      if (room.participants.length >= room.maxCapacity) {
        return apiError('RM004', '방의 정원이 가득 찼습니다.', 400)
      }

      const participant = createParticipant(currentUser, findAvailableSlot(room), room.participants.length === 0)
      room.participants.push(participant)
      roomsStore.save()
      return HttpResponse.json(toRoomDetail(room, participant))
    },
  ),

  http.post<never, never, MockApiResponse<QuickStartResult>>(api('/api/v1/rooms/quick-start'), async () => {
    await delay(400)
    const currentUser = authStore.getSessionUser()
    if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

    const currentUserId = mockUserUuid(currentUser.id)
    let room = roomsStore.findByParticipant(currentUserId)
    if (!room) {
      room = roomsStore.findAvailablePublicRoom()
      if (!room) {
        room = createMockRoom(currentUser, {
          title: `${currentUser.nickname}님의 방`,
          password: null,
        })
        roomsStore.add(room)
      } else {
        room.participants.push(
          createParticipant(currentUser, findAvailableSlot(room), room.participants.length === 0),
        )
        roomsStore.save()
      }
    }

    const me = room.participants.find((participant) => participant.userId === currentUserId)
    return HttpResponse.json(toRoomDetail(room, { slotId: me?.slotId ?? 1, isHost: me?.isHost ?? false }))
  }),

  http.get<{ roomCode: string }, never, MockApiResponse<QuickStartResult>>(
    api('/api/v1/rooms/:roomCode'),
    async ({ params }) => {
      await delay(250)
      const currentUser = authStore.getSessionUser()
      if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

      const room = roomsStore.findByCode(params.roomCode)
      if (!room) return apiError('RM001', '존재하지 않는 방입니다.', 404)

      const currentUserId = mockUserUuid(currentUser.id)
      let participant = room.participants.find((item) => item.userId === currentUserId)
      if (!participant) {
        participant = createParticipant(
          currentUser,
          findAvailableSlot(room),
          room.participants.length === 0,
        )
        room.participants.push(participant)
        roomsStore.save()
      }

      return HttpResponse.json(toRoomDetail(room, participant))
    },
  ),

  http.patch<{ roomCode: string }, never, MockApiResponse<RoomParticipant>>(
    api('/api/v1/rooms/:roomCode/ready'),
    async ({ params }) => {
      await delay(150)
      const currentUser = authStore.getSessionUser()
      if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

      const room = roomsStore.findByCode(params.roomCode)
      if (!room) return apiError('RM001', '존재하지 않는 방입니다.', 404)

      const participant = room.participants.find(
        (item) => item.userId === mockUserUuid(currentUser.id),
      )
      if (!participant) return apiError('RM006', '방 참가자가 아닙니다.', 403)
      if (!participant.isHost) participant.isReady = !participant.isReady
      roomsStore.save()
      return HttpResponse.json(participant)
    },
  ),

  http.patch<
    { roomCode: string },
    { stageId: number },
    MockApiResponse<RoomStageChangeResponse>
  >(
    api('/api/v1/rooms/:roomCode/stage'),
    async ({ params, request }) => {
      await delay(150)
      const currentUser = authStore.getSessionUser()
      if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

      const room = roomsStore.findByCode(params.roomCode)
      if (!room) return apiError('RM001', '존재하지 않는 방입니다.', 404)

      const participant = room.participants.find(
        (item) => item.userId === mockUserUuid(currentUser.id),
      )
      if (!participant?.isHost) return apiError('RM007', '방장만 스테이지를 변경할 수 있습니다.', 403)

      const { stageId } = await request.json()
      // 공식 스테이지뿐 아니라 창작마당 맵(stage_id >= 10000)도 선택할 수 있다.
      if (!isSelectableStage(stageId, currentUser.nickname)) {
        return apiError('ST001', '존재하지 않거나 선택할 수 없는 스테이지입니다.', 404)
      }

      room.selectedStageId = stageId
      roomsStore.save()
      return HttpResponse.json({
        roomId: room.roomId,
        roomCode: room.roomCode,
        selectedStageId: room.selectedStageId,
      })
    },
  ),
  http.patch<
    { roomCode: string },
    { enabled: boolean },
    MockApiResponse<RoomCutsceneSettingResponse>
  >(
    api('/api/v1/rooms/:roomCode/cutscenes'),
    async ({ params, request }) => {
      await delay(150)
      const currentUser = authStore.getSessionUser()
      if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

      const room = roomsStore.findByCode(params.roomCode)
      if (!room) return apiError('RM001', '존재하지 않는 방입니다.', 404)

      const participant = room.participants.find(
        (item) => item.userId === mockUserUuid(currentUser.id),
      )
      if (!participant?.isHost) return apiError('RM007', '방장만 컷씬 설정을 변경할 수 있습니다.', 403)

      const { enabled } = await request.json()
      if (typeof enabled !== 'boolean') return apiError('C001', '컷씬 사용 여부가 필요합니다.', 400)

      room.cutscenesEnabled = enabled
      roomsStore.save()
      return HttpResponse.json({
        roomId: room.roomId,
        roomCode: room.roomCode,
        cutscenesEnabled: room.cutscenesEnabled,
      })
    },
  ),
]
