import { request } from '../../../shared/api/request'
export { ApiError } from '../../../shared/api/request'

export type ServiceUser = {
  /** 36자리 UUID 문자열 */
  uuid: string
  nickname: string
  role: 'USER' | 'ADMIN'
}

export type AuthenticatedResult = {
  status: 'AUTHENTICATED'
  user: ServiceUser
}

export type NicknameRequiredResult = {
  status: 'NICKNAME_REQUIRED'
}

export type SocialAuthResult = AuthenticatedResult | NicknameRequiredResult

export type SocialCredential =
  | { provider: 'GOOGLE'; credentialType: 'ACCESS_TOKEN' | 'AUTHORIZATION_CODE'; credential: string; redirectUri?: string }
  | { provider: 'KAKAO'; credentialType: 'AUTHORIZATION_CODE'; credential: string; redirectUri: string }

const KNOWN_SESSION_KEY = 'auth:known-session'

export function hasKnownSession() {
  return sessionStorage.getItem(KNOWN_SESSION_KEY) === 'true'
}

export function rememberSession() {
  sessionStorage.setItem(KNOWN_SESSION_KEY, 'true')
}

export function forgetSession() {
  sessionStorage.removeItem(KNOWN_SESSION_KEY)
}

export function authenticateSocial(credential: SocialCredential) {
  return request<SocialAuthResult>('/api/v1/auth/social', {
    method: 'POST',
    body: JSON.stringify(credential),
  })
}

export function completeSocialSignUp(nickname: string) {
  return request<AuthenticatedResult>('/api/v1/auth/social/complete', {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  })
}

export function checkNicknameAvailability(nickname: string) {
  const query = new URLSearchParams({ nickname })
  return request<{ available: boolean }>(`/api/v1/users/nickname/availability?${query}`)
}

export function signUpRegular(nickname: string, password: string) {
  return request<AuthenticatedResult>('/api/v1/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ nickname, password }),
  })
}

export function loginRegular(nickname: string, password: string) {
  return request<AuthenticatedResult>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ nickname, password }),
  })
}


/**
 * 세션 프로필 조회. 새로고침 시 로그인 상태 복구에 사용한다.
 * 공통 request()가 `{ status, data }` 봉투를 이미 벗겨 주므로 여기서 다시 .data를 읽지 않는다.
 * (이중 언래핑하면 항상 undefined가 되어 세션이 복구되지 않는다.)
 */
export async function getSessionUser(): Promise<ServiceUser | null> {
  try {
    return await request<ServiceUser>('/api/v1/users/me/profile')
  } catch {
    return null
  }
}

export function logout() {
  return request<void>('/api/v1/auth/logout', { method: 'POST' })
}
