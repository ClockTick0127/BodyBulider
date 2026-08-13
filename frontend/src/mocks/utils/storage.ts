export function readSessionStorage<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeSessionStorage(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장 실패 시 메모리 상태는 그대로 유지한다.
  }
}

export function removeSessionStorage(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // 저장소에 접근할 수 없는 환경에서는 무시한다.
  }
}
