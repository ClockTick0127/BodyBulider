import { delay, http, HttpResponse } from 'msw'
import type {
  AuthenticatedResult,
  ServiceUser,
  SocialAuthResult,
  SocialCredential,
} from '../../features/auth/services/authApi'
import { mockUserUuid } from '../factories/identifiers'
import { authStore } from '../stores/auth.store'
import type { MockUser } from '../types'
import { api } from '../utils/api'
import type { MockApiResponse } from '../utils/errors'

type Credentials = { nickname?: string; password?: string }
type SocialSignUp = { nickname?: string }

const authenticated = (user: MockUser): AuthenticatedResult => ({
  status: 'AUTHENTICATED',
  user: {
    uuid: mockUserUuid(user.id),
    nickname: user.nickname,
    role: user.role ?? 'USER',
  },
})

export const authHandlers = [
  http.post<never, Credentials, MockApiResponse<AuthenticatedResult>>(
    api('/api/v1/auth/login'),
    async ({ request }) => {
      await delay(350)
      const body = await request.json()
      const user = body.nickname ? authStore.findUser(body.nickname) : undefined

      if (!user || user.password !== body.password) {
        return HttpResponse.json(
          { message: '닉네임 또는 비밀번호가 올바르지 않습니다.' },
          { status: 401 },
        )
      }

      authStore.setSessionUser(user)
      return HttpResponse.json(authenticated(user))
    },
  ),

  http.post<never, Credentials, MockApiResponse<AuthenticatedResult>>(
    api('/api/v1/auth/signup'),
    async ({ request }) => {
      await delay(450)
      const body = await request.json()
      const nickname = body.nickname?.trim() ?? ''

      if (!nickname || !body.password || body.password.length < 8) {
        return HttpResponse.json(
          { message: '닉네임과 8자 이상의 비밀번호를 입력해 주세요.' },
          { status: 400 },
        )
      }
      if (authStore.findUser(nickname)) {
        return HttpResponse.json({ message: '이미 사용 중인 닉네임입니다.' }, { status: 409 })
      }

      const user = authStore.createUser(nickname, body.password)
      authStore.setSessionUser(user)
      return HttpResponse.json(authenticated(user), { status: 201 })
    },
  ),

  http.get(api('/api/v1/users/nickname/availability'), async ({ request }) => {
    await delay(250)
    const nickname = new URL(request.url).searchParams.get('nickname')?.trim() ?? ''
    return HttpResponse.json({ available: Boolean(nickname) && !authStore.findUser(nickname) })
  }),

  http.post<never, SocialCredential, MockApiResponse<SocialAuthResult>>(
    api('/api/v1/auth/social'),
    async ({ request }) => {
      await delay(450)
      const body = await request.json()

      if (!body.credential || !body.provider) {
        return HttpResponse.json({ message: '소셜 인증 정보가 올바르지 않습니다.' }, { status: 400 })
      }

      if (body.provider === 'GOOGLE') {
        const googleUser = authStore.getUserAt(1)
        if (!googleUser) {
          return HttpResponse.json({ message: '목 사용자를 찾을 수 없습니다.' }, { status: 500 })
        }
        authStore.setSessionUser(googleUser)
        return HttpResponse.json(authenticated(googleUser))
      }

      authStore.setSocialSignUpPending(true)
      return HttpResponse.json({ status: 'NICKNAME_REQUIRED' })
    },
  ),

  http.post<never, SocialSignUp, MockApiResponse<AuthenticatedResult>>(
    api('/api/v1/auth/social/complete'),
    async ({ request }) => {
      await delay(450)
      const body = await request.json()
      const nickname = body.nickname?.trim() ?? ''

      if (!authStore.isSocialSignUpPending()) {
        return HttpResponse.json(
          { message: '만료되었거나 올바르지 않은 가입 요청입니다.' },
          { status: 401 },
        )
      }
      if (!nickname) {
        return HttpResponse.json({ message: '닉네임을 입력해 주세요.' }, { status: 400 })
      }
      if (authStore.findUser(nickname)) {
        return HttpResponse.json({ message: '이미 사용 중인 닉네임입니다.' }, { status: 409 })
      }

      const user = authStore.createUser(nickname)
      authStore.setSessionUser(user)
      authStore.setSocialSignUpPending(false)
      return HttpResponse.json(authenticated(user), { status: 201 })
    },
  ),

  http.get<never, never, MockApiResponse<ServiceUser>>(api('/api/v1/users/me/profile'), async () => {
    await delay(150)
    const user = authStore.getSessionUser()
    if (!user) {
      return HttpResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 })
    }
    return HttpResponse.json({
      uuid: mockUserUuid(user.id),
      nickname: user.nickname,
      role: user.role ?? 'USER',
    })
  }),

  http.post(api('/api/v1/auth/logout'), async () => {
    await delay(150)
    authStore.setSessionUser(null)
    authStore.setSocialSignUpPending(false)
    return new HttpResponse(null, { status: 204 })
  }),
]
