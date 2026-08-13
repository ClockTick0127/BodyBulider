export function formatClearTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const centis = Math.floor((ms % 1000) / 10)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}
