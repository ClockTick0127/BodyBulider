export class MediaManager {
  private localStream: MediaStream | null = null
  private pendingStream: Promise<MediaStream> | null = null

  async getLocalStream(): Promise<MediaStream> {
    if (this.localStream) return this.localStream
    if (this.pendingStream) return this.pendingStream
    this.pendingStream = this.acquireLocalStream()
    try {
      return await this.pendingStream
    } finally {
      this.pendingStream = null
    }
  }

  private async acquireLocalStream(): Promise<MediaStream> {

    const savedAudioId = localStorage.getItem('selected_audio_device_id')
    const savedVideoId = localStorage.getItem('selected_video_device_id')

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(savedAudioId ? { deviceId: { exact: savedAudioId } } : {}),
    }

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 24, max: 30 },
      ...(savedVideoId ? { deviceId: { exact: savedVideoId } } : {}),
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      })
      return this.localStream
    } catch (error) {
      console.warn('Failed to get local stream with saved device constraints, falling back to default devices:', error)
      try {
        // 특정 디바이스 ID 연결 실패 시 기본 설정으로 fallback
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        return this.localStream
      } catch (fallbackError) {
        console.error('Failed to get local stream with default constraints', fallbackError)
        // 한 장치/권한 실패가 사용 가능한 다른 미디어까지 막지 않게 한다.
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false })
          return this.localStream
        } catch {
          try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: audioConstraints })
            return this.localStream
          } catch {
            throw fallbackError
          }
        }
      }
    }
  }

  toggleVideo(enabled: boolean) {
    if (!this.localStream) return
    this.localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled
    })
  }

  toggleAudio(enabled: boolean) {
    if (!this.localStream) return
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled
    })
  }

  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }
  }
}
