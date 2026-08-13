import { useCallback, useEffect, useRef } from 'react'
import './CutscenePlayer.css'

type CutscenePlayerProps = {
  src: string
  label: string
  onEnded: () => void
}

/** 등록된 영상을 전체 화면으로 한 번 재생한다. 재생 실패 시 게임 흐름을 막지 않는다. */
export function CutscenePlayer({ src, label, onEnded }: CutscenePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const completedRef = useRef(false)

  const finish = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    onEnded()
  }, [onEnded])

  useEffect(() => {
    completedRef.current = false
    const video = videoRef.current
    if (!video) return

    video.currentTime = 0
    video.muted = false
    void video.play().catch(() => {
      // 일부 브라우저는 페이지 이동 직후 음성 자동 재생을 막는다.
      // 그 경우 영상 자체는 무음으로 끝까지 재생해 전체 게임 흐름을 보장한다.
      video.muted = true
      void video.play().catch(finish)
    })
  }, [finish, src])

  return (
    <div className="cutscene-player" role="dialog" aria-label={label} aria-modal="true">
      <video
        ref={videoRef}
        className="cutscene-player__video"
        src={src}
        autoPlay
        playsInline
        preload="auto"
        disablePictureInPicture
        onEnded={finish}
        onError={finish}
      />
    </div>
  )
}
