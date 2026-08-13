import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

export const DEFAULT_POSE_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task'
export const DEFAULT_POSE_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'

export type PoseRuntimeOptions = {
  modelAssetPath: string
  wasmPath: string
  minPoseDetectionConfidence: number
  minPosePresenceConfidence: number
  minTrackingConfidence: number
}

let runtimePromise: Promise<PoseLandmarker> | null = null
let runtimeKey = ''

async function createRuntime(options: PoseRuntimeOptions) {
  const vision = await FilesetResolver.forVisionTasks(options.wasmPath)
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: options.modelAssetPath, delegate: 'GPU' },
    runningMode: 'IMAGE',
    numPoses: 1,
    minPoseDetectionConfidence: options.minPoseDetectionConfidence,
    minPosePresenceConfidence: options.minPosePresenceConfidence,
    minTrackingConfidence: options.minTrackingConfidence,
  })

  const warmupCanvas = document.createElement('canvas')
  warmupCanvas.width = 64
  warmupCanvas.height = 64
  landmarker.detect(warmupCanvas)
  await landmarker.setOptions({ runningMode: 'VIDEO' })
  return landmarker
}

/** Retain one warmed runtime across LobbyPage -> GamePage navigation. */
export function getPoseLandmarkerRuntime(options: PoseRuntimeOptions) {
  const key = JSON.stringify(options)
  if (!runtimePromise || runtimeKey !== key) {
    runtimeKey = key
    runtimePromise = createRuntime(options).catch((error) => {
      runtimePromise = null
      runtimeKey = ''
      throw error
    })
  }
  return runtimePromise
}
