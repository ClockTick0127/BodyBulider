const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
export const SESSION_UNAUTHORIZED_EVENT = 'session:unauthorized'

export class ApiError extends Error {
  readonly status: number
  /** 백엔드 BaseResponse의 도메인 에러 코드 (예: RM001, RM003, RM004) */
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

// 로그인·로그아웃·세션 확인 자체의 401은 "세션 만료" 이벤트로 보지 않는다.
// (/api/v1 표준과 구 경로를 함께 지원)
const isAuthPath = (path: string) =>
  path.startsWith('/api/auth/') ||
  path.startsWith('/api/v1/auth/') ||
  path.startsWith('/api/v1/users/me/profile')

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; code?: string } | null
    if (response.status === 401 && !isAuthPath(path)) {
      window.dispatchEvent(new Event(SESSION_UNAUTHORIZED_EVENT))
    }
    throw new ApiError(body?.message ?? '요청을 처리하지 못했습니다.', response.status, body?.code ?? null)
  }
  if (response.status === 204) return undefined as T
  const body = await response.json() as T | { data: T }
  // 백엔드 공통 응답(BaseResponse)의 data와 MSW의 직접 응답을 모두 지원한다.
  if (body && typeof body === 'object' && 'data' in body) return body.data
  return body
}
