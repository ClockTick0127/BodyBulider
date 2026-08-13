import { useCallback, useEffect, useRef } from 'react'
import type { Ref } from 'react'

type GameVideoFeedProps = {
  stream: MediaStream | null
  muted: boolean
  videoRef?: Ref<HTMLVideoElement>
}

export function GameVideoFeed({ stream, muted, videoRef: forwardedRef }: GameVideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video
    if (typeof forwardedRef === 'function') {
      forwardedRef(video)
    } else if (forwardedRef) {
      forwardedRef.current = video
    }
  }, [forwardedRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    return () => {
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream])

  if (!stream) return <span className="ingame-camera__message">카메라 연결 중…</span>
  return <video ref={attachVideo} autoPlay playsInline muted={muted} />
}
