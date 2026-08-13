export type MockUser = {
  id: number
  nickname: string
  password?: string
  role?: 'USER' | 'ADMIN'
}

export type MockParticipant = {
  userId: string
  nickname: string
  slotId: number
  isHost: boolean
  isReady: boolean
}

export type MockRoom = {
  roomId: string
  roomCode: string
  title: string
  isSecret: boolean
  /** 비밀방 비밀번호. API 응답에는 포함하지 않는다. */
  password: string | null
  maxCapacity: number
  selectedStageId: number
  cutscenesEnabled: boolean
  participants: MockParticipant[]
}
