/**
 * 클리어 일시(ISO 8601 문자열)를 화면 표시용으로 변환한다.
 * 예: '2026-07-24T12:14:00.000Z' → '2026. 07. 24. 21:14' (실행 환경의 시간대 기준)
 */
export function formatClearedAt(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
