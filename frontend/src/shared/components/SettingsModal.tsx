import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBgmContext } from '../context/BgmContext'
import './SettingsModal.css'

type SettingsModalProps = {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { isBgmOn, bgmVolume, toggleBgm, setBgmVolume, isSfxOn, sfxVolume, toggleSfx, setSfxVolume } = useBgmContext()
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>(
    () => localStorage.getItem('selected_audio_device_id') ?? ''
  )
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>(
    () => localStorage.getItem('selected_video_device_id') ?? ''
  )
  const [savedNotice, setSavedNotice] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let isMounted = true

    const loadDevices = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return
      }

      try {
        // 라벨 정보를 획득하기 위해 미디어 권한 요청을 일시적으로 확인
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
          tempStream.getTracks().forEach((track) => track.stop())
        } catch {
          // 권한 거부 등의 경우 무시하고 enumerateDevices 진행
        }

        const devices = await navigator.mediaDevices.enumerateDevices()
        if (!isMounted) return

        const audioInputs = devices.filter((device) => device.kind === 'audioinput')
        const videoInputs = devices.filter((device) => device.kind === 'videoinput')

        setAudioDevices(audioInputs)
        setVideoDevices(videoInputs)

        // 저장된 선택이 없을 경우 기본 디바이스 선택
        if (!localStorage.getItem('selected_audio_device_id') && audioInputs.length > 0) {
          setSelectedAudioDeviceId(audioInputs[0].deviceId)
        }
        if (!localStorage.getItem('selected_video_device_id') && videoInputs.length > 0) {
          setSelectedVideoDeviceId(videoInputs[0].deviceId)
        }
      } catch (err) {
        console.error('Failed to enumerate media devices:', err)
      }
    }

    loadDevices()

    return () => {
      isMounted = false
    }
  }, [])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    localStorage.setItem('selected_audio_device_id', selectedAudioDeviceId)
    localStorage.setItem('selected_video_device_id', selectedVideoDeviceId)

    setSavedNotice(true)
    setTimeout(() => {
      setSavedNotice(false)
      onClose()
    }, 400)
  }

  return createPortal(
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>

        <div className="settings-modal__header">
          <span className="settings-modal__kicker">SETTINGS</span>
          <h2 id="settings-title" className="settings-modal__title">설정</h2>
        </div>

        <form onSubmit={handleSave} className="settings-modal__form">
          <div className="settings-modal__body">
            {/* BGM (배경음악) 설정 */}
            <div className="settings-field settings-field--toggle">
              <div className="settings-field__info">
                <span className="settings-field__title">배경음악 (BGM)</span>
                <span className="settings-field__desc">배경음악 재생 유무</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={isBgmOn}
                  onChange={toggleBgm}
                />
                <span className="toggle-switch__slider" />
              </label>
            </div>

            <div className="settings-field settings-field--select">
              <div className="settings-field__info" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="bgm-volume-range" className="settings-field__title">BGM 볼륨</label>
                <span className="settings-field__desc" style={{ fontWeight: 700, color: '#315f9d' }}>
                  {Math.round(bgmVolume * 100)}%
                </span>
              </div>
              <input
                id="bgm-volume-range"
                type="range"
                min="0"
                max="100"
                value={Math.round(bgmVolume * 100)}
                onChange={(e) => setBgmVolume(Number(e.target.value) / 100)}
                className="settings-range"
              />
            </div>

            {/* SFX (효과음) 설정 */}
            <div className="settings-field settings-field--toggle">
              <div className="settings-field__info">
                <span className="settings-field__title">효과음 (SFX)</span>
                <span className="settings-field__desc">버튼 클릭 및 게임 효과음 재생 유무</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={isSfxOn}
                  onChange={toggleSfx}
                />
                <span className="toggle-switch__slider" />
              </label>
            </div>

            <div className="settings-field settings-field--select">
              <div className="settings-field__info" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="sfx-volume-range" className="settings-field__title">효과음 볼륨</label>
                <span className="settings-field__desc" style={{ fontWeight: 700, color: '#315f9d' }}>
                  {Math.round(sfxVolume * 100)}%
                </span>
              </div>
              <input
                id="sfx-volume-range"
                type="range"
                min="0"
                max="100"
                value={Math.round(sfxVolume * 100)}
                onChange={(e) => setSfxVolume(Number(e.target.value) / 100)}
                className="settings-range"
              />
            </div>

            <div className="settings-field settings-field--select">
              <div className="settings-field__info">
                <label htmlFor="mic-select" className="settings-field__title">마이크 장치</label>
                <span className="settings-field__desc">음성 입력에 사용할 마이크를 선택합니다.</span>
              </div>
              <select
                id="mic-select"
                className="settings-select"
                value={selectedAudioDeviceId}
                onChange={(e) => setSelectedAudioDeviceId(e.target.value)}
              >
                {audioDevices.length === 0 ? (
                  <option value="">디바이스 없음</option>
                ) : (
                  audioDevices.map((device, idx) => (
                    <option key={device.deviceId || idx} value={device.deviceId}>
                      {device.label || `마이크 ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="settings-field settings-field--select">
              <div className="settings-field__info">
                <label htmlFor="cam-select" className="settings-field__title">카메라 장치</label>
                <span className="settings-field__desc">비디오 입력에 사용할 카메라를 선택합니다.</span>
              </div>
              <select
                id="cam-select"
                className="settings-select"
                value={selectedVideoDeviceId}
                onChange={(e) => setSelectedVideoDeviceId(e.target.value)}
              >
                {videoDevices.length === 0 ? (
                  <option value="">디바이스 없음</option>
                ) : (
                  videoDevices.map((device, idx) => (
                    <option key={device.deviceId || idx} value={device.deviceId}>
                      {device.label || `카메라 ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {savedNotice && <p className="settings-saved-message">설정이 저장되었습니다!</p>}
          </div>

          <div className="settings-modal__actions">
            <button type="button" className="settings-btn settings-btn--cancel" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="settings-btn settings-btn--save">
              저장하기
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}

