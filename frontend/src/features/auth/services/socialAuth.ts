import type { SocialProvider } from '../components/LoginPanel'
import type { SocialCredential } from './authApi'
import { isMockingEnabled } from '../../../mocks/enableMocking'

const GOOGLE_STATE_KEY = 'syncup:google-oauth-state'
const KAKAO_STATE_KEY = 'syncup:kakao-oauth-state'

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string }

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: GoogleTokenResponse) => void
            error_callback: () => void
          }): { requestAccessToken(config?: { prompt?: string }): void }
        }
      }
    }
  }
}


function startGoogleAuthorization() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('Google 클라이언트 ID가 설정되지 않았습니다.')
  const redirectUri = `${window.location.origin}${window.location.pathname}`
  const state = crypto.randomUUID()
  sessionStorage.setItem(GOOGLE_STATE_KEY, state)

  const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString()
  window.location.assign(authorizeUrl)
}


function startKakaoAuthorization() {
  const clientId = import.meta.env.VITE_KAKAO_REST_API_KEY
  if (!clientId) throw new Error('Kakao REST API 키가 설정되지 않았습니다.')
  const redirectUri = `${window.location.origin}${window.location.pathname}`
  const state = crypto.randomUUID()
  sessionStorage.setItem(KAKAO_STATE_KEY, state)

  const authorizeUrl = new URL('https://kauth.kakao.com/oauth/authorize')
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  }).toString()
  window.location.assign(authorizeUrl)
}

export async function beginSocialAuthentication(provider: SocialProvider) {
  if (isMockingEnabled) {
    return provider === 'Google'
      ? {
        provider: 'GOOGLE',
        credentialType: 'AUTHORIZATION_CODE',
        credential: 'mock-google-authorization-code',
        redirectUri: `${window.location.origin}${window.location.pathname}`,
      } as const
      : {
        provider: 'KAKAO',
        credentialType: 'AUTHORIZATION_CODE',
        credential: 'mock-kakao-authorization-code',
        redirectUri: `${window.location.origin}${window.location.pathname}`,
      } as const
  }
  if (provider === 'Google') {
    startGoogleAuthorization()
    return null
  }
  startKakaoAuthorization()
  return null
}

export type ConsumedSocialCallback = {
  credential: SocialCredential
  provider: SocialProvider
}

export function consumeSocialCallback(): ConsumedSocialCallback | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const googleState = sessionStorage.getItem(GOOGLE_STATE_KEY)
  const kakaoState = sessionStorage.getItem(KAKAO_STATE_KEY)
  const hasResponse = code || params.has('error')

  if (!hasResponse) return null

  // URL에서 OAuth query parameter 제거
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)

  // 1. Google OAuth 콜백 검증
  if (googleState && returnedState === googleState) {
    sessionStorage.removeItem(GOOGLE_STATE_KEY)
    if (params.has('error')) throw new Error('Google 로그인이 취소되었습니다.')
    if (!code) throw new Error('Google 로그인 요청을 확인할 수 없습니다.')

    return {
      credential: {
        provider: 'GOOGLE',
        credentialType: 'AUTHORIZATION_CODE',
        credential: code,
        redirectUri: `${window.location.origin}${window.location.pathname}`,
      },
      provider: 'Google',
    }
  }

  // 2. Kakao OAuth 콜백 검증
  if (kakaoState && returnedState === kakaoState) {
    sessionStorage.removeItem(KAKAO_STATE_KEY)
    if (params.has('error')) throw new Error('Kakao 로그인이 취소되었습니다.')
    if (!code) throw new Error('Kakao 로그인 요청을 확인할 수 없습니다.')

    return {
      credential: {
        provider: 'KAKAO',
        credentialType: 'AUTHORIZATION_CODE',
        credential: code,
        redirectUri: `${window.location.origin}${window.location.pathname}`,
      },
      provider: 'Kakao',
    }
  }

  return null
}

// 하위 호환성을 위해 유지
export function consumeKakaoCallback(): SocialCredential | null {
  const result = consumeSocialCallback()
  return result?.provider === 'Kakao' ? result.credential : null
}
