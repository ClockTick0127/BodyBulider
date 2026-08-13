import { defaultUsers } from '../data/users'
import type { MockUser } from '../types'
import { readSessionStorage, removeSessionStorage, writeSessionStorage } from '../utils/storage'

const SESSION_KEY = 'msw:session-user'
const users = defaultUsers.map((user) => ({ ...user }))

let nextUserId = users.length + 1
let sessionUser = readSessionStorage<MockUser | null>(SESSION_KEY, null)
let socialSignUpPending = false

const normalizeNickname = (nickname: string) => nickname.trim().toLocaleLowerCase()

export const authStore = {
  getSessionUser: () => sessionUser,

  setSessionUser(user: MockUser | null) {
    sessionUser = user
    if (user) writeSessionStorage(SESSION_KEY, user)
    else removeSessionStorage(SESSION_KEY)
  },

  findUser(nickname: string) {
    return users.find((user) => normalizeNickname(user.nickname) === normalizeNickname(nickname))
  },

  getUserAt(index: number) {
    return users[index]
  },

  createUser(nickname: string, password?: string) {
    const user: MockUser = {
      id: nextUserId++,
      nickname,
      role: 'USER',
      ...(password ? { password } : {}),
    }
    users.push(user)
    return user
  },

  isSocialSignUpPending: () => socialSignUpPending,

  setSocialSignUpPending(pending: boolean) {
    socialSignUpPending = pending
  },
}
