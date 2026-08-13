import { useRef, useState, useCallback } from 'react'

export interface UseWebcamOptions {
  width?: number
  height?: number
  frameRate?: number
}

export function useWebcam(options: UseWebcamOptions = {}) {
  const { width = 640, height = 480, frameRate = 30 } = options

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsCameraActive(false)
  }, [])

  const startCamera = useCallback(async () => {
    setErrorMsg(null)
    try {
      if (streamRef.current) {
        stopCamera()
      }

      const savedVideoId = localStorage.getItem('selected_video_device_id')
      const videoConstraints: MediaTrackConstraints = {
        width,
        height,
        frameRate: { ideal: frameRate },
        ...(savedVideoId ? { deviceId: { exact: savedVideoId } } : {}),
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })
      } catch (err) {
        console.warn('Failed to start camera with saved deviceId, trying default camera:', err)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width, height, frameRate: { ideal: frameRate } },
          audio: false,
        })
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setIsCameraActive(true)
      }
    } catch (err) {
      console.error('Camera access error:', err)
      setErrorMsg('카메라 장치에 접근할 수 없습니다. 카메라 권한 설정을 확인해 주세요.')
      setIsCameraActive(false)
    }
  }, [width, height, frameRate, stopCamera])

  return {
    videoRef,
    streamRef,
    isCameraActive,
    errorMsg,
    startCamera,
    stopCamera,
  }
}
