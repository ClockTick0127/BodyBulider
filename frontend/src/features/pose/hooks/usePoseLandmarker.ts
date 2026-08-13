import { useEffect, useRef, useState, useCallback } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import {
  DEFAULT_POSE_MODEL_PATH,
  DEFAULT_POSE_WASM_PATH,
  getPoseLandmarkerRuntime,
} from '../services/poseLandmarkerRuntime'

export const LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
} as const

export interface Point2D {
  x: number
  y: number
  visibility: number
}

export const POSE_DETECTION_FAILURE_REASONS = [
  'LANDMARKER_NOT_READY',
  'VIDEO_PAUSED',
  'VIDEO_ENDED',
  'VIDEO_READY_STATE_INSUFFICIENT',
  'NO_LANDMARKS',
  'DETECTION_EXCEPTION',
  'VIDEO_ELEMENT_UNAVAILABLE',
  'CANVAS_UNAVAILABLE',
  'CAMERA_UNAVAILABLE',
  'NO_VALID_POSE',
] as const

export type PoseDetectionFailureReason = typeof POSE_DETECTION_FAILURE_REASONS[number]

export type PoseVideoState = {
  readyState: number
  paused: boolean
  ended: boolean
  width: number
  height: number
  currentTime: number
}

export type PoseDetectionFailure = {
  reason: PoseDetectionFailureReason
  videoState: PoseVideoState
  exceptionName?: string
}

export const readPoseVideoState = (video: HTMLVideoElement): PoseVideoState => ({
  readyState: video.readyState,
  paused: video.paused,
  ended: video.ended,
  width: video.videoWidth,
  height: video.videoHeight,
  currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
})

export const getPoseDetectionBlockReasons = (
  landmarkerReady: boolean,
  videoState: PoseVideoState,
): PoseDetectionFailureReason[] => {
  const reasons: PoseDetectionFailureReason[] = []
  if (!landmarkerReady) reasons.push('LANDMARKER_NOT_READY')
  if (videoState.paused) reasons.push('VIDEO_PAUSED')
  if (videoState.ended) reasons.push('VIDEO_ENDED')
  if (videoState.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
    reasons.push('VIDEO_READY_STATE_INSUFFICIENT')
  }
  return reasons
}

export type TrackedJoints = Record<
  'leftShoulder' | 'rightShoulder' | 'leftElbow' | 'rightElbow' | 'leftWrist' | 'rightWrist',
  Point2D
>

export const INITIAL_JOINTS: TrackedJoints = {
  leftShoulder: { x: 0, y: 0, visibility: 0 },
  rightShoulder: { x: 0, y: 0, visibility: 0 },
  leftElbow: { x: 0, y: 0, visibility: 0 },
  rightElbow: { x: 0, y: 0, visibility: 0 },
  leftWrist: { x: 0, y: 0, visibility: 0 },
  rightWrist: { x: 0, y: 0, visibility: 0 },
}

export const DEFAULT_CONFIDENCE = {
  minPoseDetectionConfidence: 0.35,
  minPosePresenceConfidence: 0.7,
  minTrackingConfidence: 0.5,
} as const

export interface UsePoseLandmarkerOptions {
  modelAssetPath?: string
  wasmPath?: string
  minPoseDetectionConfidence?: number
  minPosePresenceConfidence?: number
  minTrackingConfidence?: number
}

export function usePoseLandmarker(options: UsePoseLandmarkerOptions = {}) {
  const {
    modelAssetPath = DEFAULT_POSE_MODEL_PATH,
    wasmPath = DEFAULT_POSE_WASM_PATH,
    minPoseDetectionConfidence = DEFAULT_CONFIDENCE.minPoseDetectionConfidence,
    minPosePresenceConfidence = DEFAULT_CONFIDENCE.minPosePresenceConfidence,
    minTrackingConfidence = DEFAULT_CONFIDENCE.minTrackingConfidence,
  } = options

  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState('시스템 초기화 중...')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function initMediaPipe() {
      try {
        if (isMounted) setLoadingProgress('Vision AI 라이브러리 로드 중...')
        if (isMounted) setLoadingProgress('모션 인식 AI 모델 설정 중...')
        const poseLandmarker = await getPoseLandmarkerRuntime({
          modelAssetPath,
          wasmPath,
          minPoseDetectionConfidence,
          minPosePresenceConfidence,
          minTrackingConfidence,
        })

        if (isMounted) {
          landmarkerRef.current = poseLandmarker
          setIsLoading(false)
          setLoadingProgress('')
        }
      } catch (err) {
        console.error('Failed to initialize PoseLandmarker:', err)
        if (isMounted) {
          setErrorMsg('MediaPipe 모델 초기화 실패. 인터넷 연결이나 브라우저 환경을 확인해 주세요.')
          setIsLoading(false)
        }
      }
    }

    initMediaPipe()

    return () => {
      isMounted = false
      landmarkerRef.current = null
    }
  }, [modelAssetPath, wasmPath, minPoseDetectionConfidence, minPosePresenceConfidence, minTrackingConfidence])

  /**
   * 비디오 프레임에서 손목-팔꿈치-어깨 6대 관절 픽셀 좌표를 계산하여 반환
   */
  const detectPose = useCallback(
    (
      video: HTMLVideoElement,
      width: number,
      height: number,
      onFailure?: (failure: PoseDetectionFailure) => void,
    ): TrackedJoints | null => {
      const landmarker = landmarkerRef.current
      const videoState = readPoseVideoState(video)
      const blockedReasons = getPoseDetectionBlockReasons(Boolean(landmarker), videoState)
      if (blockedReasons.length > 0) {
        blockedReasons.forEach((reason) => onFailure?.({ reason, videoState }))
        return null
      }
      if (!landmarker) return null

      // VIDEO 모드는 landmarker 인스턴스 전체 수명 동안 단조 증가하는
      // 타임스탬프를 요구한다. video.currentTime은 카메라 재연결 시 0으로
      // 초기화되므로, 페이지 수명 동안 계속 증가하는 시각을 사용한다.
      const timestampMs = performance.now()
      let detections
      try {
        detections = landmarker.detectForVideo(video, timestampMs)
      } catch (error) {
        onFailure?.({
          reason: 'DETECTION_EXCEPTION',
          videoState,
          exceptionName: error instanceof Error ? error.name.slice(0, 100) : 'UnknownError',
        })
        return null
      }

      if (!detections.landmarks || detections.landmarks.length === 0) {
        onFailure?.({ reason: 'NO_LANDMARKS', videoState })
        return null
      }

      const poseLandmarks = detections.landmarks[0]

      const ls = poseLandmarks[LANDMARKS.LEFT_SHOULDER]
      const rs = poseLandmarks[LANDMARKS.RIGHT_SHOULDER]
      const le = poseLandmarks[LANDMARKS.LEFT_ELBOW]
      const re = poseLandmarks[LANDMARKS.RIGHT_ELBOW]
      const lw = poseLandmarks[LANDMARKS.LEFT_WRIST]
      const rw = poseLandmarks[LANDMARKS.RIGHT_WRIST]

      const convert = (lm: typeof ls): Point2D => {
        if (!lm) return { x: 0, y: 0, visibility: 0 }
        return {
          x: width - lm.x * width, // 거울모드 픽셀 변환
          y: lm.y * height,
          visibility: lm.visibility ?? 0,
        }
      }

      return {
        leftShoulder: convert(ls),
        rightShoulder: convert(rs),
        leftElbow: convert(le),
        rightElbow: convert(re),
        leftWrist: convert(lw),
        rightWrist: convert(rw),
      }
    },
    [],
  )

  return {
    landmarkerRef,
    isLoading,
    loadingProgress,
    errorMsg,
    detectPose,
    minPoseDetectionConfidence,
    minPosePresenceConfidence,
    minTrackingConfidence,
  }
}
