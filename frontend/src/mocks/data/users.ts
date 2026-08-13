import type { MockUser } from '../types'

export const defaultUsers: MockUser[] = [
  { id: 1, nickname: 'syncup', password: 'password123' },
  { id: 2, nickname: 'google_player' },
  { id: 3, nickname: 'admin', password: 'admin1234', role: 'ADMIN' },
]
