import type { GameEvent, SimulationFrame } from '../features/game/services/gameProtocol'
import type { GameConnection, GameSocketStatus } from '../features/game/services/gameSocket'
import { getStageCutscene } from '../features/cutscenes/cutsceneCatalog'
import { roomsStore } from './stores/rooms.store'

const MAP = {
  mapNum: 10001,
  startPoint: [1.1, 4.1] as [number, number],
  endPoint: [8.7, 3.2] as [number, number],
  players: [[1.4, 4.7], [3.4, 4.7], [5.5, 4.7], [7.6, 4.7]] as [number, number][],
  terrain: [
    [[0, 5.2], [2.1, 5.2], [2.1, 6], [0, 6]],
    [[7.9, 4.2], [10, 4.2], [10, 6], [7.9, 6]],
  ] as [number, number][][],
  gimmicks: [],
}

/**
 * 궤적 생성 — 캐릭터 동작 판정을 로컬에서 검증할 수 있는 유일한 수단이다.
 *
 * 예전 mock 은 vx·vy 가 위치와 무관한 상수(.9, -.1)라 프레임당 vy 변화량이 늘 0이었고,
 * 그 결과 `fall`·`landing` 을 한 번도 볼 수 없었다. 여기서 만드는 vx·vy 는
 * 다음 프레임 위치와 정확히 일치한다.
 *
 * 특히 **경사면 보행 구간**을 반드시 포함한다. vy 는 크지만 변화량은 0인 구간으로,
 * "vy 절대값으로 판정하면 안 된다"는 회귀를 상시 검증한다.
 *
 * 좌표는 mock 스케일(0~10)을 유지하므로 중력도 같은 스케일로 환산한다.
 * 720 × (10 / 1000) = 7.2
 */
const DT = 0.05
const GRAVITY = 7.2
const WALK_SPEED = 1.6
const IDLE_FRAMES = 10

/**
 * 지형 높이. 평지 → 계단 낙하 → 경사면 → 계단 낙하 → 평지 순으로 구성한다.
 * (y 가 클수록 화면 아래)
 *
 * 경사면 구간이 핵심이다. 여기서 vy 는 커지지만 **프레임당 변화량은 0**이라
 * "vy 절대값으로 낙하를 판정하면 안 된다"는 회귀를 상시 검증한다.
 */
function groundAt(x: number): number {
  if (x < 2.4) return 4.1                      // 평지
  if (x < 3.6) return 4.7                      // 계단 1 (낙차 0.6)
  if (x < 5.8) return 4.7 + (x - 3.6) * 0.5    // 경사면
  return 6.5                                   // 계단 2 (낙차 0.7) 후 평지
}

/** 한 프레임에 따라갈 수 없는 낙차. 이보다 크면 지형 추종이 아니라 낙하다. */
const STEP_DROP = 0.1

function simulate(fail: boolean): SimulationFrame[] {
  const points: SimulationFrame[] = []
  let x = 1.1
  let y = 4.1
  let vy = 0

  for (let index = 0; index < 160; index += 1) {
    // 실패 시나리오: 마지막 구간에서 발판이 사라져 그대로 추락한다.
    const isVoid = fail && x > 7.0
    const floor = isVoid ? Number.POSITIVE_INFINITY : groundAt(x)
    const vx = index < IDLE_FRAMES ? 0 : WALK_SPEED

    if (y >= floor - 1e-9) {
      y = floor
      const nextFloor = groundAt(x + vx * DT)
      const drop = nextFloor - y
      // 완만하면 지형을 따라가고(경사면), 낙차가 크면 낙하로 전환한다(계단).
      vy = drop > STEP_DROP ? GRAVITY * DT : Math.max(0, drop) / DT
    } else {
      vy += GRAVITY * DT
    }

    points.push([x, y, vx, vy])
    x += vx * DT
    y += vy * DT
  }

  return points
}

/**
 * MSW와 같은 VITE_ENABLE_MSW 플래그로 켜지는 STOMP 시나리오 Mock.
 * SockJS/STOMP 프레이밍은 HTTP MSW handler가 흉내 내기 어려워 transport 경계에서 대체한다.
 */
export function connectMockGameSocket(
  roomSessionId: string,
  onEvent: (event: GameEvent) => void,
  onStatusChange: (status: GameSocketStatus) => void,
): GameConnection {
  let closed = false
  const timers = new Set<number>()
  const schedule = (callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer)
      if (!closed) callback()
    }, delayMs)
    timers.add(timer)
  }
  const emit = (event: GameEvent, delayMs = 0) => schedule(() => onEvent(event), delayMs)

  onStatusChange('connecting')
  schedule(() => onStatusChange('connected'), 250)

  /** fail=true 면 마지막 구간에서 추락해 라운드 실패로 끝난다. (float 연출 검증용) */
  const begin = (stageId: number, fail: boolean) => {
    const room = roomsStore.list().find((item) => item.roomId === roomSessionId)
    const hasStartCutscene = room?.cutscenesEnabled === true
      && getStageCutscene(stageId, 'start') != null
    const initialDelayMs = hasStartCutscene ? 16_000 : 5_000
    const delayOffsetMs = initialDelayMs - 5_000
    const mockParticipants = room?.participants ?? []
    const placementOwners = [...mockParticipants]
    while (placementOwners.length > 0 && placementOwners.length < 4) {
      placementOwners.push(mockParticipants[Math.floor(Math.random() * mockParticipants.length)])
    }
    for (let index = placementOwners.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[placementOwners[index], placementOwners[swapIndex]] = [placementOwners[swapIndex], placementOwners[index]]
    }
    const placements = placementOwners.map((participant, index) => ({
      captureNo: index + 1,
      userId: participant.userId,
      playerNo: participant.slotId,
    }))
    emit({
      type: 'GAME_STARTED',
      gameSessionId: '00000000-0000-4000-8000-000000000002',
      roundNo: 2,
      map: MAP,
      participants: mockParticipants.map((participant) => ({
        userId: participant.userId,
        playerNo: participant.slotId,
      })),
      placements,
      initialDelayMs,
    }, 250)
    for (let captureNo = 1; captureNo <= 4; captureNo += 1) {
      const player = placements[captureNo - 1]?.playerNo ?? captureNo
      emit({
        type: 'PLAYER_FILMING',
        player,
        captureNo,
        durationMs: 3000,
      }, 5250 + delayOffsetMs + (captureNo - 1) * 3200)
      emit({
        type: 'POSE_BROADCAST',
        player,
        captureNo,
        points: [[0.08, 0.78], [0.28, 0.45], [0.5, 0.7], [0.52, 0.7], [0.74, 0.35], [0.94, 0.62]],
      }, 8250 + delayOffsetMs + (captureNo - 1) * 3200)
    }
    emit({ type: 'SIMULATION_RESULT', intervalMs: 50, points: simulate(fail), result: !fail }, 18000 + delayOffsetMs)
    emit({ type: 'GAME_RESULT', stars: fail ? 0 : 1, elapsedTimeMs: 23_950, result: !fail }, 23950 + delayOffsetMs)
  }

  return {
    // 4번 스테이지(스타 하버, 최고 난도)를 고르면 실패 시나리오를 재생한다.
    startGame: (stageId) => begin(stageId, stageId === 4),
    submitPose: (_captureNo, _points, _diagnostic) => { },
    disconnect: async () => {
      closed = true
      timers.forEach(window.clearTimeout)
      timers.clear()
      onStatusChange('idle')
    },
  }
}

