export type CutsceneKind = 'start' | 'success' | 'failure'

export type CutsceneAsset = {
  src: string
  durationMs: number
}

type StageCutscenes = Partial<Record<CutsceneKind, CutsceneAsset>>

const CUTSCENES_BY_STAGE: Record<number, StageCutscenes> = {
  1: {
    start: { src: '/cutscenes/stage-1-start.mp4', durationMs: 10_000 },
    success: { src: '/cutscenes/stage-1-success.mp4', durationMs: 4_000 },
    failure: { src: '/cutscenes/stage-1-failure.mp4', durationMs: 1_000 },
  },
  2: {
    start: { src: '/cutscenes/stage-2-start.mp4', durationMs: 8_000 },
    success: { src: '/cutscenes/stage-2-success.mp4', durationMs: 8_000 },
    failure: { src: '/cutscenes/stage-2-failure.mp4', durationMs: 2_000 },
  },
}

export function getStageCutscene(stageId: number, kind: CutsceneKind) {
  return CUTSCENES_BY_STAGE[stageId]?.[kind] ?? null
}

export function hasStageCutscenes(stageId: number) {
  return Object.values(CUTSCENES_BY_STAGE[stageId] ?? {}).some(Boolean)
}
