import { useEffect } from 'react'
import { useBgmContext } from '../context/BgmContext'

export function useBgm(soundUrl: string) {
  const { isBgmOn, toggleBgm, playBgm } = useBgmContext()

  useEffect(() => {
    playBgm(soundUrl)
  }, [soundUrl, playBgm])

  return { isBgmOn, toggleBgm }
}
