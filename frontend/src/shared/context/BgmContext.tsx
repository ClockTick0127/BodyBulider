import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

type BgmContextType = {
  // BGM (배경음악)
  isBgmOn: boolean
  bgmVolume: number
  toggleBgm: () => void
  setBgmVolume: (volume: number) => void
  playBgm: (soundUrl: string) => void
  pauseBgm: () => void
  resumeBgm: () => void

  // SFX (효과음)
  isSfxOn: boolean
  sfxVolume: number
  toggleSfx: () => void
  setSfxVolume: (volume: number) => void
  playSfx: (soundUrl: string) => void
  playButtonClick: () => void
}

const BgmContext = createContext<BgmContextType | null>(null)

export function BgmProvider({ children }: { children: React.ReactNode }) {
  // === BGM (배경음악) 상태 ===
  const [isBgmOn, setIsBgmOn] = useState<boolean>(() => {
    const saved = sessionStorage.getItem('bgm_enabled')
    return saved !== null ? saved === 'true' : true
  })

  const [bgmVolume, setBgmVolumeState] = useState<number>(() => {
    const saved = sessionStorage.getItem('bgm_volume')
    return saved !== null ? Number(saved) : 0.4
  })

  // === SFX (효과음) 상태 ===
  const [isSfxOn, setIsSfxOn] = useState<boolean>(() => {
    const saved = sessionStorage.getItem('sfx_enabled')
    return saved !== null ? saved === 'true' : true
  })

  const [sfxVolume, setSfxVolumeState] = useState<number>(() => {
    const saved = sessionStorage.getItem('sfx_volume')
    return saved !== null ? Number(saved) : 0.5
  })

  const [currentSoundUrl, setCurrentSoundUrl] = useState<string | null>(null)
  const bgmRef = useRef<HTMLAudioElement | null>(null)

  // Ref로 최신 상태 보장
  const isBgmOnRef = useRef<boolean>(isBgmOn)
  const bgmVolumeRef = useRef<number>(bgmVolume)
  const isSfxOnRef = useRef<boolean>(isSfxOn)
  const sfxVolumeRef = useRef<number>(sfxVolume)

  // BGM 상태 저장
  useEffect(() => {
    isBgmOnRef.current = isBgmOn
    sessionStorage.setItem('bgm_enabled', String(isBgmOn))
  }, [isBgmOn])

  useEffect(() => {
    bgmVolumeRef.current = bgmVolume
    sessionStorage.setItem('bgm_volume', String(bgmVolume))
    if (bgmRef.current) {
      bgmRef.current.volume = bgmVolume
    }
  }, [bgmVolume])

  // SFX 상태 저장
  useEffect(() => {
    isSfxOnRef.current = isSfxOn
    sessionStorage.setItem('sfx_enabled', String(isSfxOn))
  }, [isSfxOn])

  useEffect(() => {
    sfxVolumeRef.current = sfxVolume
    sessionStorage.setItem('sfx_volume', String(sfxVolume))
  }, [sfxVolume])

  const setBgmVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume))
    setBgmVolumeState(clamped)
  }, [])

  const setSfxVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume))
    setSfxVolumeState(clamped)
  }, [])

  const toggleSfx = useCallback(() => {
    setIsSfxOn((prev) => !prev)
  }, [])

  // 효과음 전용 재생 함수
  const playSfx = useCallback((soundUrl: string) => {
    if (!isSfxOnRef.current) return
    const sfx = new Audio(soundUrl)
    sfx.volume = sfxVolumeRef.current
    sfx.play().catch(() => {})
  }, [])

  // 수동 버튼 클릭 효과음
  const playButtonClick = useCallback(() => {
    playSfx('/sounds/Button_Click.mp3')
  }, [playSfx])

  // 전역 버튼/인터랙티브 요소 클릭 시 Button_Click.mp3 자동 재생
  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      if (!isSfxOnRef.current) return

      const target = event.target as HTMLElement | null
      if (!target) return

      const clickable = target.closest('button, a, [role="button"], input[type="button"], input[type="submit"]')
      if (clickable) {
        const clickSound = new Audio('/sounds/Button_Click.mp3')
        clickSound.volume = sfxVolumeRef.current
        clickSound.play().catch(() => {})
      }
    }

    document.addEventListener('click', handleGlobalClick, true)
    return () => {
      document.removeEventListener('click', handleGlobalClick, true)
    }
  }, [])

  // 탭/창이 백그라운드로 이동할 때 BGM 일시정지, 포커스 복귀 시 재개 (Page Visibility API)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!bgmRef.current || !isBgmOnRef.current) return

      if (document.hidden) {
        bgmRef.current.pause()
      } else {
        bgmRef.current.play().catch(() => {})
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const playBgm = useCallback((soundUrl: string) => {
    // 1. 이미 동일한 음원이 생성되어 있는 경우
    if (bgmRef.current && currentSoundUrl === soundUrl) {
      bgmRef.current.volume = bgmVolumeRef.current
      if (isBgmOnRef.current && bgmRef.current.paused) {
        bgmRef.current.play().catch(() => {})
      } else if (!isBgmOnRef.current && !bgmRef.current.paused) {
        bgmRef.current.pause()
      }
      return
    }

    // 2. 다른 음원이 재생 중이었으면 이전 오디오 정지
    if (bgmRef.current) {
      bgmRef.current.pause()
      bgmRef.current.currentTime = 0
      bgmRef.current = null
    }

    setCurrentSoundUrl(soundUrl)

    const bgm = new Audio(soundUrl)
    bgm.loop = true
    bgm.volume = bgmVolumeRef.current
    bgmRef.current = bgm

    if (isBgmOnRef.current) {
      const startBgm = () => {
        if (bgmRef.current && isBgmOnRef.current) {
          bgmRef.current.play().catch(() => {})
        }
      }

      bgm.play().catch(() => {
        window.addEventListener('click', startBgm, { once: true })
        window.addEventListener('keydown', startBgm, { once: true })
      })
    }
  }, [currentSoundUrl])

  const toggleBgm = useCallback(() => {
    setIsBgmOn((prev) => {
      const nextState = !prev
      if (bgmRef.current) {
        if (nextState) {
          bgmRef.current.play().catch(() => {})
        } else {
          bgmRef.current.pause()
        }
      }
      return nextState
    })
  }, [])

  const pauseBgm = useCallback(() => {
    bgmRef.current?.pause()
  }, [])

  const resumeBgm = useCallback(() => {
    if (bgmRef.current && isBgmOnRef.current) {
      bgmRef.current.play().catch(() => {})
    }
  }, [])

  return (
    <BgmContext.Provider
      value={{
        isBgmOn,
        bgmVolume,
        toggleBgm,
        setBgmVolume,
        playBgm,
        pauseBgm,
        resumeBgm,
        isSfxOn,
        sfxVolume,
        toggleSfx,
        setSfxVolume,
        playSfx,
        playButtonClick,
      }}
    >
      {children}
    </BgmContext.Provider>
  )
}

export function useBgmContext() {
  const context = useContext(BgmContext)
  if (!context) {
    throw new Error('useBgmContext must be used within BgmProvider')
  }
  return context
}
