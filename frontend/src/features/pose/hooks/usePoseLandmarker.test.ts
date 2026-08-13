import { describe, expect, it } from 'vitest'
import { getPoseDetectionBlockReasons, type PoseVideoState } from './usePoseLandmarker'

const readyVideo: PoseVideoState = {
  readyState: HTMLMediaElement.HAVE_ENOUGH_DATA,
  paused: false,
  ended: false,
  width: 640,
  height: 480,
  currentTime: 1,
}

describe('getPoseDetectionBlockReasons', () => {
  it('reports every active reason instead of silently skipping detection', () => {
    expect(getPoseDetectionBlockReasons(false, {
      ...readyVideo,
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
      paused: true,
    })).toEqual([
      'LANDMARKER_NOT_READY',
      'VIDEO_PAUSED',
      'VIDEO_READY_STATE_INSUFFICIENT',
    ])
  })

  it('allows detection when model and video are ready', () => {
    expect(getPoseDetectionBlockReasons(true, readyVideo)).toEqual([])
  })
})
