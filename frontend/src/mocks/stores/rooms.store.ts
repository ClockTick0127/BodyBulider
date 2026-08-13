import { defaultRooms } from '../data/rooms'
import type { MockRoom } from '../types'
import { readSessionStorage, writeSessionStorage } from '../utils/storage'

const ROOMS_KEY = 'msw:rooms'

const cloneDefaultRooms = () =>
  defaultRooms.map((room) => ({
    ...room,
    participants: room.participants.map((participant) => ({ ...participant })),
  }))

const loadRooms = () =>
  readSessionStorage<MockRoom[]>(ROOMS_KEY, cloneDefaultRooms()).map((room) => ({
    ...room,
    // 이전 숫자형 roomId가 sessionStorage에 남아 있어도 문자열 계약으로 복구한다.
    roomId: String(room.roomId),
  }))

let rooms = loadRooms()

export const roomsStore = {
  list: () => rooms,

  add(room: MockRoom) {
    rooms.push(room)
    this.save()
  },

  findByCode(roomCode: string) {
    return rooms.find((room) => room.roomCode === roomCode.toUpperCase())
  },

  findByParticipant(userId: string) {
    return rooms.find((room) => room.participants.some((participant) => participant.userId === userId))
  },

  findAvailablePublicRoom() {
    return rooms.find((room) => !room.isSecret && room.participants.length < room.maxCapacity)
  },

  save() {
    writeSessionStorage(ROOMS_KEY, rooms)
  },
}
