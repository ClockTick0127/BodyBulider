import { useEffect, useRef, useState } from 'react'
import './VideoGrid.css'
import type { MediaState } from '../services/peerManager'
import happyDuck from '../../../assets/happy-duck-with-background.png'

const SPEAKING_RMS_THRESHOLD = 0.045
const SPEAKING_RELEASE_FRAMES = 10

type VideoGridProps = {
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  remoteMediaStates: Map<string, MediaState>
  isLocalVideoOn: boolean
  isLocalAudioOn: boolean
  players: {
    id: string
    nickname: string
    online: boolean
    isMe: boolean
    isHost: boolean
    isReady: boolean
  }[]
  myUserId: string | null
}

function MediaOffIcon({ type }: { type: 'camera' | 'microphone' }) {
  return type === 'camera' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 10l4.5-2.5v9L15 14" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="M3 3l18 18" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 10V5a3 3 0 0 0-5.8-1" />
      <path d="M5 10v2a7 7 0 0 0 11.1 5.7M19 12v-2M12 19v3M8 22h8M3 3l18 18" />
    </svg>
  )
}

function VideoBox({
  stream,
  nickname,
  isMe,
  isOnline,
  isHost,
  isReady,
  localVideoOn,
  localAudioOn,
  remoteMediaState,
}: {
  stream: MediaStream | null
  nickname: string
  isMe: boolean
  isOnline: boolean
  isHost: boolean
  isReady: boolean
  localVideoOn?: boolean
  localAudioOn?: boolean
  remoteMediaState?: MediaState
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [volume, setVolume] = useState(1.0)
  const isSpeakingRef = useRef(false)
  const [, setTrackStateVersion] = useState(0)

  useEffect(() => {
    if (!stream) return
    const tracks = stream.getTracks()
    const updateTrackState = () => setTrackStateVersion((version) => version + 1)
    tracks.forEach((track) => {
      track.addEventListener('mute', updateTrackState)
      track.addEventListener('unmute', updateTrackState)
      track.addEventListener('ended', updateTrackState)
    })
    return () => tracks.forEach((track) => {
      track.removeEventListener('mute', updateTrackState)
      track.removeEventListener('unmute', updateTrackState)
      track.removeEventListener('ended', updateTrackState)
    })
  }, [stream])

  useEffect(() => {
    if (videoRef.current && !isMe) {
      videoRef.current.volume = volume
    }
  }, [volume, isMe, stream])

  const hasLiveTrack = (kind: 'audio' | 'video') => stream?.getTracks().some(
    (track) => track.kind === kind && track.readyState === 'live' && track.enabled && !track.muted,
  ) ?? false
  const isCameraOff = isMe
    ? localVideoOn === false
    : remoteMediaState
      ? !remoteMediaState.videoEnabled
      : Boolean(stream) && !hasLiveTrack('video')
  const isMicrophoneOff = isMe
    ? localAudioOn === false
    : remoteMediaState
      ? !remoteMediaState.audioEnabled
      : Boolean(stream) && !hasLiveTrack('audio')

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    if (!stream || isMicrophoneOff || stream.getAudioTracks().length === 0) {
      isSpeakingRef.current = false
      setIsSpeaking(false)
      return
    }

    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const analyser = context.createAnalyser()
    const source = context.createMediaStreamSource(stream)
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.72
    const samples = new Uint8Array(analyser.fftSize)
    source.connect(analyser)

    let frameId = 0
    let quietFrames = 0
    const updateSpeaking = (next: boolean) => {
      if (isSpeakingRef.current === next) return
      isSpeakingRef.current = next
      setIsSpeaking(next)
    }
    const detectVoice = () => {
      analyser.getByteTimeDomainData(samples)
      const meanSquare = samples.reduce((sum, sample) => {
        const normalized = (sample - 128) / 128
        return sum + normalized * normalized
      }, 0) / samples.length
      const rms = Math.sqrt(meanSquare)

      if (rms >= SPEAKING_RMS_THRESHOLD) {
        quietFrames = 0
        updateSpeaking(true)
      } else if (++quietFrames >= SPEAKING_RELEASE_FRAMES) {
        updateSpeaking(false)
      }
      frameId = requestAnimationFrame(detectVoice)
    }
    detectVoice()

    return () => {
      cancelAnimationFrame(frameId)
      source.disconnect()
      void context.close()
      isSpeakingRef.current = false
    }
  }, [stream, isMicrophoneOff])

  return (
    <div
      className={`video-box${isOnline ? '' : ' is-offline'}${isSpeaking ? ' is-speaking' : ''}${isCameraOff ? ' is-camera-off' : ''}`}
      aria-label={`${nickname}${isSpeaking ? ', 말하는 중' : ''}${isCameraOff ? ', 카메라 꺼짐' : ''}${isMicrophoneOff ? ', 마이크 꺼짐' : ''}`}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMe} // 자기 자신은 하울링 방지를 위해 무조건 muted
          className="video-box__element"
        />
      ) : (
        <div className="video-box__placeholder">
          {isOnline ? '연결 중...' : '오프라인'}
        </div>
      )}
      {isCameraOff && (
        <div className="video-box__camera-off" role="status">
          <MediaOffIcon type="camera" />
          <span>카메라 꺼짐</span>
        </div>
      )}
      {isMicrophoneOff && (
        <span className="video-box__mic-off" title="마이크 꺼짐" aria-label="마이크 꺼짐">
          <MediaOffIcon type="microphone" />
        </span>
      )}
      <div className="video-box__overlay">
        <span className="video-box__nickname">
          {nickname} {isMe && <span className="video-box__me-badge">나</span>}
        </span>
        {!isMe && stream && (
          <div className="video-box__volume-ctrl" title={`음성 크기: ${Math.round(volume * 100)}%`}>
            <button
              type="button"
              className="video-box__volume-btn"
              onClick={() => setVolume((v) => (v > 0 ? 0 : 1))}
              aria-label={`${nickname} 음성 ${volume === 0 ? '음소거 해제' : '음소거'}`}
            >
              {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="video-box__volume-slider"
              aria-label={`${nickname} 음성 크기 조절`}
            />
          </div>
        )}
        <span className="video-box__badges">
          {isSpeaking && <span className="video-box__speaking">말하는 중</span>}
          {isHost ? (
            <span className="video-box__status video-box__status--host">♛ 방장</span>
          ) : (
            <span className={`video-box__status${isReady ? ' is-ready' : ''}`}>
              {isReady ? '✓ 준비 완료' : '대기 중'}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

export function VideoGrid({ localStream, remoteStreams, remoteMediaStates, isLocalVideoOn, isLocalAudioOn, players }: VideoGridProps) {
  // 항상 4개의 칸을 렌더링하도록 4칸 배열을 맞춘다.
  const slots = Array.from({ length: 4 }).map((_, index) => {
    const player = players[index]
    if (!player) {
      return { isEmpty: true, id: `empty-${index}` }
    }
    return {
      isEmpty: false,
      id: player.id,
      nickname: player.nickname,
      isMe: player.isMe,
      online: player.online,
      isHost: player.isHost,
      isReady: player.isReady,
      stream: player.isMe ? localStream : remoteStreams.get(player.id) || null,
    }
  })

  return (
    <div className="video-grid">
      {slots.map((slot) => {
        if (slot.isEmpty) {
          return (
            <div className="video-box video-box--empty" key={slot.id}>
              <div className="video-box__empty-content">
                <img className="video-box__empty-image" src={happyDuck} alt="" />
                <span className="video-box__empty-label">불러줘</span>
              </div>
            </div>
          )
        }
        return (
          <VideoBox
            key={slot.id}
            stream={slot.stream as MediaStream | null}
            nickname={slot.nickname as string}
            isMe={slot.isMe as boolean}
            isOnline={slot.online as boolean}
            isHost={slot.isHost as boolean}
            isReady={slot.isReady as boolean}
            localVideoOn={slot.isMe ? isLocalVideoOn : undefined}
            localAudioOn={slot.isMe ? isLocalAudioOn : undefined}
            remoteMediaState={slot.isMe ? undefined : remoteMediaStates.get(slot.id)}
          />
        )
      })}
    </div>
  )
}
