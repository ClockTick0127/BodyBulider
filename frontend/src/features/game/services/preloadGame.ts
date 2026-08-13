import { getStageCutscene } from '../../cutscenes/cutsceneCatalog'
import { DEFAULT_CONFIDENCE } from '../../pose/hooks/usePoseLandmarker'
import {
  DEFAULT_POSE_MODEL_PATH,
  DEFAULT_POSE_WASM_PATH,
  getPoseLandmarkerRuntime,
} from '../../pose/services/poseLandmarkerRuntime'

export type GamePreloadProgress = {
  step: 'code' | 'assets' | 'ai' | 'ready'
  message: string
}

const GAME_SOUNDS = [
  '/sounds/Countdown.mp3', '/sounds/Failed.mp3', '/sounds/Jump_Platforms.mp3',
  '/sounds/Shooting_Sound.mp3', '/sounds/Success.mp3', '/sounds/Walking.mp3',
  '/sounds/Walking_Wet.mp3', '/sounds/Windy.mp3',
]

const preloadPromises = new Map<string, Promise<void>>()

async function fetchAndCache(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} 다운로드 실패 (${response.status})`)
  await response.blob()
}

export function preloadGame(stageId: number, cutscenesEnabled: boolean, onProgress?: (value: GamePreloadProgress) => void) {
  const key = `${stageId}:${cutscenesEnabled}`
  const existing = preloadPromises.get(key)
  if (existing) return existing
  const preloadPromise = (async () => {
    onProgress?.({ step: 'code', message: '게임 화면을 미리 준비하는 중…' })
    const [{ getStageAssetUrls }, { SHEETS }] = await Promise.all([
      import('../../../pages/game/mapDesign'),
      import('../../character/characterSheets'),
      import('../../../pages/game/GamePage'),
    ])

    onProgress?.({ step: 'assets', message: '맵과 효과음을 다운로드하는 중…' })
    const cutsceneUrls = cutscenesEnabled
      ? (['start', 'success', 'failure'] as const)
          .map((kind) => getStageCutscene(stageId, kind)?.src)
          .filter((url): url is string => Boolean(url))
      : []
    const characterUrls = Object.values(SHEETS).map((sheet) => sheet.url)
    await Promise.all([
      ...getStageAssetUrls(stageId),
      ...characterUrls,
      ...GAME_SOUNDS,
      ...cutsceneUrls,
    ].map(fetchAndCache))

    onProgress?.({ step: 'ai', message: 'AI 모델 다운로드 및 GPU 워밍업 중…' })
    await getPoseLandmarkerRuntime({
      modelAssetPath: DEFAULT_POSE_MODEL_PATH,
      wasmPath: DEFAULT_POSE_WASM_PATH,
      ...DEFAULT_CONFIDENCE,
    })
    onProgress?.({ step: 'ready', message: '게임 준비가 완료되었습니다.' })
  })().catch((error) => {
    preloadPromises.delete(key)
    throw error
  })
  preloadPromises.set(key, preloadPromise)
  return preloadPromise
}
