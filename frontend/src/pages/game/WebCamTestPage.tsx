import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWebcam } from '../../shared/hooks/useWebcam'
import {
  usePoseLandmarker,
  INITIAL_JOINTS,
} from '../../features/pose/hooks/usePoseLandmarker'
import type { TrackedJoints } from '../../features/pose/hooks/usePoseLandmarker'
import { drawSkeletonBridge } from '../../features/pose/utils/drawSkeletonBridge'
import { resolveTrackedJoints } from '../../features/pose/utils/resolvePosePoints'
import './WebCamTestPage.css'

export function WebCamTestPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)

  // 1. 웹캠 장치 제어 훅 (useWebcam)
  const { videoRef, isCameraActive, errorMsg: cameraError, startCamera, stopCamera } = useWebcam({
    width: 640,
    height: 480,
    frameRate: 30,
  })

  // 2. MediaPipe 포즈 랜드마커 6대 관절 인지 훅 (usePoseLandmarker)
  const { isLoading, loadingProgress, errorMsg: poseError, detectPose, minPosePresenceConfidence } = usePoseLandmarker()

  const errorMsg = cameraError || poseError

  // 테스트 전용 상태 관리
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [isLocked, setIsLocked] = useState(false)
  const [activeTab, setActiveTab] = useState<'table' | 'json'>('table')

  // 트래킹된 6대 관절 좌표 state & ref (UI 실시간 렌더링용)
  const [trackedPoints, setTrackedPoints] = useState<TrackedJoints>({ ...INITIAL_JOINTS })
  const trackedPointsRef = useRef<TrackedJoints>({ ...INITIAL_JOINTS })
  const lockedPointsRef = useRef<TrackedJoints>({ ...INITIAL_JOINTS })

  // 3. 카메라 자동 시작
  useEffect(() => {
    if (!isLoading && !errorMsg) {
      startCamera()
    }
  }, [isLoading, errorMsg, startCamera])

  // 4. 좌표 고정 (Lock) 테스트 토글
  const toggleLock = () => {
    if (!isLocked) {
      // 현재 좌표 스냅샷 저장
      lockedPointsRef.current = JSON.parse(JSON.stringify(trackedPointsRef.current))
    }
    setIsLocked(!isLocked)
  }

  // 5. 실시간 렌더링 및 모션 인식 테스트 루프
  useEffect(() => {
    if (!isCameraActive || !videoRef.current || !canvasRef.current) {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastVideoTime = -1
    let lastUiUpdateTime = 0

    const testLoop = () => {
      // --- [모듈 2 최적화]: 비디오의 새로운 프레임이 도착했을 때만 MediaPipe 추론 실행 ---
      if (
        !video.paused &&
        !video.ended &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }

        const detectedPoints = detectPose(video, canvas.width, canvas.height)
        if (detectedPoints) {
          const resolved = resolveTrackedJoints(
            detectedPoints,
            trackedPointsRef.current,
            minPosePresenceConfidence,
          )
          trackedPointsRef.current = resolved

          // 🚀 최적화 핵심: 매 프레임(60fps)마다 React setState를 호출하면 CPU 병목 및 랙이 발생함.
          // UI 텍스트 수치 업데이트는 100ms(초당 10회) 주기로 스로틀링 처리
          const now = performance.now()
          if (now - lastUiUpdateTime > 100) {
            lastUiUpdateTime = now
            setTrackedPoints(resolved)
          }
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // --- [모듈 3 테스트]: 관절 좌표 기반 가상 선분(다리) 및 노드 캔버스 렌더링 ---
      const activePoints = isLocked ? lockedPointsRef.current : trackedPointsRef.current

      drawSkeletonBridge(ctx, activePoints, {
        isLocked,
        showSkeleton,
        minVisibility: minPosePresenceConfidence,
      })

      animationFrameRef.current = requestAnimationFrame(testLoop)
    }

    testLoop()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isCameraActive, showSkeleton, isLocked, detectPose, videoRef, minPosePresenceConfidence])

  const jointsList: { key: keyof TrackedJoints; label: string; nameKr: string }[] = [
    { key: 'leftShoulder', label: 'LS (11)', nameKr: '왼쪽 어깨' },
    { key: 'rightShoulder', label: 'RS (12)', nameKr: '오른쪽 어깨' },
    { key: 'leftElbow', label: 'LE (13)', nameKr: '왼쪽 팔꿈치' },
    { key: 'rightElbow', label: 'RE (14)', nameKr: '오른쪽 팔꿈치' },
    { key: 'leftWrist', label: 'LW (15)', nameKr: '왼쪽 손목' },
    { key: 'rightWrist', label: 'RW (16)', nameKr: '오른쪽 손목' },
  ]

  const displayPoints = isLocked ? lockedPointsRef.current : trackedPoints

  return (
    <main className="game-page">
      <header className="game-header">
        <Link className="game-brand" to="/rooms" onClick={stopCamera}>
          <span className="game-brand__mark">←</span>
          <span>LOBBY</span>
        </Link>
        <div className="game-header__middle">
          <span>POSE & WEBCAM BENCH</span>
          <strong>모듈별 연동 및 좌표 인식 테스트</strong>
        </div>
        <div className="game-status-indicator">
          <span className={`status-dot ${isCameraActive ? 'status-dot--active' : ''}`} />
          {isCameraActive ? 'WEBCAM ACTIVE' : 'NO CAMERA'}
        </div>
      </header>

      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className="game-loading-overlay">
          <div className="game-loader">
            <div className="game-loader__spinner" />
            <p>{loadingProgress}</p>
          </div>
        </div>
      )}

      <div className="game-container">
        {/* 왼쪽: 카메라 비디오 및 캔버스 스켈레톤 뷰 */}
        <section className="viewport-section">
          <div className="viewport-wrapper">
            <video
              ref={videoRef}
              className="webcam-video"
              autoPlay
              playsInline
              muted
              style={{ opacity: isCameraActive ? 0.4 : 0 }}
            />
            <canvas ref={canvasRef} className="overlay-canvas" />

            {!isCameraActive && !isLoading && (
              <div className="camera-placeholder">
                <span className="placeholder-icon">🎥</span>
                <h3>웹캠 장치 연결 필요</h3>
                <p>
                  [useWebcam] 모듈 테스트를 위해 웹캠 권한을 승인해 주세요.
                </p>
                <button className="btn-primary" onClick={startCamera}>
                  웹캠 시작하기
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="error-alert">
                <span className="error-icon">⚠</span>
                <p>{errorMsg}</p>
                <button className="btn-retry" onClick={startCamera}>
                  다시 연결 시도
                </button>
              </div>
            )}
          </div>

          {/* 제어 컨트롤러 패널 */}
          <div className="viewport-controls">
            <button
              className={`btn-control ${isCameraActive ? 'btn-control--active' : ''}`}
              onClick={isCameraActive ? stopCamera : startCamera}
              disabled={isLoading}
            >
              {isCameraActive ? '카메라 OFF' : '카메라 ON'}
            </button>

            <button
              className={`btn-control ${showSkeleton ? 'btn-control--active' : ''}`}
              onClick={() => setShowSkeleton(!showSkeleton)}
              disabled={!isCameraActive}
            >
              스켈레톤 선분: {showSkeleton ? '표시 중' : '숨김'}
            </button>

            <button
              className={`btn-control ${isLocked ? 'btn-control--red' : 'btn-control--active'}`}
              onClick={toggleLock}
              disabled={!isCameraActive}
            >
              {isLocked ? '🔒 좌표 고정 해제 (UnLock)' : '🔓 현재 좌표 고정 (Lock Snapshot)'}
            </button>
          </div>
        </section>

        {/* 오른쪽: 6개 관절 좌표 모니터링 대시보드 */}
        <aside className="dashboard-section">
          <div className="status-panel-card">
            <span className="stat-label">MODULE TESTING STATUS</span>
            <div className="current-phase-box">
              {isLocked ? (
                <span className="phase-badge bg-orange">LOCKED SNAPSHOT</span>
              ) : (
                <span className="phase-badge bg-green">REAL-TIME TRACKING</span>
              )}
            </div>
            <p className="phase-description">
              분리된 3개 모듈이 정상 동작 중입니다:<br />
              1. <strong>useWebcam</strong>: 비디오 스트림 통제<br />
              2. <strong>usePoseLandmarker</strong>: 6개 관절 추출<br />
              3. <strong>drawSkeletonBridge</strong>: 5개 가상 선분 캔버스 그리기
            </p>
          </div>

          {/* 6대 관절 수치 모니터링 및 JSON 확인 탭 */}
          <div className="data-panel">
            <div className="data-panel__header">
              <h2>6대 관절 텔레메트리 (Telemetry)</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn-control ${activeTab === 'table' ? 'btn-control--active' : ''}`}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  onClick={() => setActiveTab('table')}
                >
                  테이블
                </button>
                <button
                  className={`btn-control ${activeTab === 'json' ? 'btn-control--active' : ''}`}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  onClick={() => setActiveTab('json')}
                >
                  JSON Payload
                </button>
              </div>
            </div>

            {activeTab === 'table' ? (
              <div className="joints-compact-list" style={{ marginTop: '0.5rem' }}>
                {jointsList.map((joint) => {
                  const pt = displayPoints[joint.key]
                  const isVisible = pt.visibility >= minPosePresenceConfidence && (isCameraActive || isLocked)
                  return (
                    <div
                      key={joint.key}
                      className="joint-item"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '6px',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ fontSize: '0.85rem', color: '#fff' }}>{joint.nameKr}</strong>
                        <span style={{ fontSize: '0.7rem', color: '#8c96be' }}>{joint.label}</span>
                      </div>

                      <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        <div style={{ fontSize: '0.8rem', color: '#00f0ff' }}>
                          X: {pt.x.toFixed(1)} | Y: {pt.y.toFixed(1)}
                        </div>
                        <span
                          className={isVisible ? 'status-ok' : 'status-lost'}
                          style={{ fontSize: '0.7rem' }}
                        >
                          Vis: {(pt.visibility * 100).toFixed(0)}% [{isVisible ? 'OK' : 'LOST'}]
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <pre
                style={{
                  background: '#04050a',
                  padding: '1rem',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  color: '#39ff14',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  fontFamily: 'JetBrains Mono, monospace',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                {JSON.stringify(displayPoints, null, 2)}
              </pre>
            )}

            <div className="debug-hint-box" style={{ marginTop: '0.75rem' }}>
              💡 <strong>웹소켓 전송 테스트 팁</strong>: [현재 좌표 고정] 버튼을 눌러 스냅샷을 찍은 후 상단의 JSON Payload 탭을 확인하면 백엔드로 전송할 좌표 데이터를 확인할 수 있습니다.
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
