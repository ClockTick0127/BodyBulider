import type { SimulationFrame } from '@/features/game/services/gameProtocol'

export type CharacterAction = 'idle' | 'move' | 'fall' | 'landing' | 'float'

/**
 * **맵 폭으로 정규화한** 중력 가속도(1/s²).
 *
 * 백엔드 `GamePhysicsSimulator` 는 1000스케일에서 GRAVITY=720 을 쓴다 → 720/1000 = 0.72.
 * mock 은 10스케일이라 원시 중력이 7.2 지만 정규화하면 7.2/10 = 0.72 로 같다.
 *
 * ⚠️ 이 값을 다시 `mapWidth` 로 나누면 안 된다. 이미 정규화된 값이라 한 번 더 나누면
 * mock(10스케일)에서 임계값이 100배가 되어 낙하를 영영 못 잡는다.
 * (개발명세서 §5.3 의 `720 * intervalSec / mapWidth` 공식은 1000스케일 전제라 이 함정이 있다)
 */
const GRAVITY_NORMALIZED = 0.72
/** 중력 가속의 절반을 넘으면 공중으로 본다. 실데이터로 재확인할 것. */
const AIRBORNE_RATIO = 0.5

/** 이보다 짧은 공중 구간은 지형 요철로 보고 지상으로 되돌린다. */
const MIN_AIRBORNE_MS = 150
/** 이보다 짧은 지상 구간은 튕김 중 순간 접촉으로 보고 공중으로 되돌린다. */
const MIN_GROUNDED_MS = 100

/** 정규화 |vx| 가 이보다 크면 걷는 중으로 본다. */
const MOVE_SPEED = 0.02
/** landing 시트 6프레임 / 16fps */
const LANDING_DURATION_MS = 375

/** 연속 구간(run) 중 minRun 보다 짧은 `value` 구간을 반대 값으로 뒤집는다. */
function flipShortRuns(mask: boolean[], value: boolean, minRun: number) {
  let start = 0
  while (start < mask.length) {
    if (mask[start] !== value) {
      start += 1
      continue
    }
    let end = start
    while (end < mask.length && mask[end] === value) end += 1
    if (end - start < minRun) {
      for (let i = start; i < end; i += 1) mask[i] = !value
    }
    start = end
  }
}

/**
 * 궤적 전체를 훑어 프레임별 캐릭터 동작을 미리 계산한다.
 *
 * `SIMULATION_RESULT` 는 궤적을 한 번에 주므로 앞뒤를 모두 보고 판정할 수 있다.
 * 매 프레임 즉석 판정으로는 "일정 시간 이상 지속됐는가"를 볼 수 없어 낙하·착지가
 * 프레임 단위로 깜빡인다.
 *
 * ⚠️ 낙하 판정에 **`vy` 절대값을 쓰면 안 된다.** 걷기 모터가 경사 탄젠트 방향으로
 * 속도를 밀어넣기 때문에 45° 경사 보행 시 `vy ≈ 134` 가 나온다. 자유낙하와 보행을
 * 가르는 신호는 크기가 아니라 **프레임당 변화량**이다.
 *
 * `float` 은 물리 상태가 아니라 라운드 실패 연출이므로 타임라인에 넣지 않는다.
 * (`GamePage` 가 재생 종료 후 덮어쓴다)
 *
 * @param mapWidth 맵 스케일. mock 은 10, 실서버는 1000. 절대값 임계값을 쓰면
 *   mock 환경에서 캐릭터가 아예 움직이지 않는다.
 */
export function buildActionTimeline(
  frames: SimulationFrame[],
  intervalMs: number,
  mapWidth: number,
): CharacterAction[] {
  if (frames.length === 0 || intervalMs <= 0 || mapWidth <= 0) return []

  // 자유낙하 시 프레임당 정규화 vy 증가량은 50ms 기준 0.036 이다. (스케일 무관)
  // 그 절반인 0.018 을 진입 임계값으로 쓴다.
  const airborneEnter = GRAVITY_NORMALIZED * (intervalMs / 1000) * AIRBORNE_RATIO

  // 1단계 — 정규화 vy 변화량
  const airborne = frames.map((frame, index) => {
    if (index === 0) return false // 시작 프레임은 정지 상태
    return (frame[3] - frames[index - 1][3]) / mapWidth > airborneEnter
  })

  // 2단계 — 최소 지속시간 필터. 공중을 먼저 정리하고 그다음 지상을 정리한다.
  flipShortRuns(airborne, true, Math.max(1, Math.ceil(MIN_AIRBORNE_MS / intervalMs)))
  flipShortRuns(airborne, false, Math.max(1, Math.ceil(MIN_GROUNDED_MS / intervalMs)))

  // 3단계 — 동작 배정. 우선순위 fall → landing → move → idle
  const landingFrames = Math.max(1, Math.ceil(LANDING_DURATION_MS / intervalMs))
  const timeline: CharacterAction[] = []
  let landingUntil = -1

  for (let index = 0; index < frames.length; index += 1) {
    if (airborne[index]) {
      landingUntil = -1
      timeline.push('fall')
      continue
    }
    // 공중 → 지상 전이 지점부터 착지 모션을 재생한다.
    if (index > 0 && airborne[index - 1]) landingUntil = index + landingFrames
    if (index < landingUntil) {
      timeline.push('landing')
      continue
    }
    timeline.push(
      Math.abs(frames[index][2] / mapWidth) > MOVE_SPEED ? 'move' : 'idle',
    )
  }

  return timeline
}
