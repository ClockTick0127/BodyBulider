import type { MockRoom } from '../types'
import { mockUserUuid } from '../factories/identifiers'

export const defaultRooms: MockRoom[] = [
  {
    roomId: '00000000-0000-4000-9000-000000000101',
    roomCode: 'B7K2',
    title: '초보 환영! 같이 다리 만들어요',
    isSecret: false,
    password: null,
    maxCapacity: 4,
    selectedStageId: 1,
    cutscenesEnabled: false,
    participants: [{ userId: mockUserUuid(1), nickname: 'syncup', slotId: 1, isHost: true, isReady: true }],
  },
  {
    roomId: '00000000-0000-4000-9000-000000000102',
    roomCode: 'N0VA',
    title: '친구들과 즐기는 저녁 게임',
    isSecret: true,
    password: '1234',
    maxCapacity: 4,
    selectedStageId: 1,
    cutscenesEnabled: false,
    participants: [{ userId: mockUserUuid(2), nickname: 'google_player', slotId: 1, isHost: true, isReady: true }],
  },
]
