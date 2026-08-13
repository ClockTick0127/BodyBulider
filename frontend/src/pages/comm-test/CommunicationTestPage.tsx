import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Client, type IMessage, type IStompSocket } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useAuth } from '../../features/auth/context/authContext'
import { ApiError, getSessionUser, loginRegular, signUpRegular } from '../../features/auth/services/authApi'
import {
  createRoom,
  joinRoom,
  type QuickStartResult,
} from '../../features/rooms/services/roomsApi'
import { MapConfigViewer } from './MapConfigViewer'
import './CommunicationTestPage.css'

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'
type LogDirection = 'send' | 'receive' | 'system'
type LogItem = {
  id: number
  direction: LogDirection
  title: string
  body: unknown
  time: string
  type?: number
}

type Protocol = {
  id: string
  type?: number
  label: string
  enumName: string
  direction: string
  status: 'implemented' | 'in-progress' | 'defined'
  executable: boolean
  description: string
  payload: unknown
}

type ProtocolConfig = {
  type: string
  destination: string
}

const SAMPLE_ROOM_ID = '4a91cd92-e5a9-4a80-98ec-f303f85a0c77'
const SAMPLE_GAME_ID = '87d7bb21-ec8c-4929-a902-27a4be683f5c'
const GAME_SEND_DESTINATION = '/app/game/message'
const GAME_TOPIC_TEMPLATE = '/topic/rooms/{roomSessionId}/game'

const protocols: Protocol[] = [
  {
    id: 'game-start-request',
    type: 100,
    label: 'STOMP 시작',
    enumName: 'GAME_START_REQUEST',
    direction: 'Client → Server',
    status: 'implemented',
    executable: true,
    description: '선택한 stageId를 공통 destination /app/game/message로 보내며, 성공 결과는 type 101로 broadcast됩니다.',
    payload: { stageId: 1 },
  },
  {
    id: 'game-start-response',
    type: 101,
    label: '시작 응답',
    enumName: 'GAME_START_RESPONSE',
    direction: 'Server → Client',
    status: 'implemented',
    executable: false,
    description: '게임 생성 후 구독 중인 모든 참가자가 받는 응답입니다. 이 탭에서는 수신된 type 101 메시지를 확인합니다.',
    payload: {
      mapId: 1001,
      startedAt: '2026-07-27T15:30:12.123456',
      round: { roundId: 1, roundNo: 1, mapConfig: {} },
      participants: [{ userId: '8ed65eaf-6b29-4275-a9ad-2e18feaffd0d', playerNo: 1 }],
    },
  },
  {
    id: 'capturing-request',
    type: 102,
    label: '촬영 요청',
    enumName: 'GAME_CAPTURING_REQUEST',
    direction: 'Server → Client (예정)',
    status: 'in-progress',
    executable: false,
    description: 'type과 DTO만 정의되어 있으며 서버 발행 로직은 아직 없습니다. payload 예시만 확인할 수 있습니다.',
    payload: { player: 1, captureNo: 1, durationMs: 3000 },
  },
  {
    id: 'capturing-response',
    type: 103,
    label: '좌표 제출',
    enumName: 'GAME_CAPTURING_RESPONSE',
    direction: 'Client → Server',
    status: 'implemented',
    executable: true,
    description: '인증 사용자의 촬영 좌표를 제출합니다. 각 점은 0~1 범위의 [x, y] 두 숫자로 구성해야 합니다.',
    payload: {
      captureNo: 1,
      points: [[0.34, 0.42], [0.38, 0.45], [0.41, 0.49]],
    },
  },
  {
    id: 'simulation-response',
    type: 104,
    label: '시뮬레이션',
    enumName: 'GAME_SIMULATING_RESPONSE',
    direction: 'Server → Client (예정)',
    status: 'in-progress',
    executable: false,
    description: 'type과 DTO만 정의되어 있으며 publisher와 생성 서비스는 아직 없습니다. payload 예시만 확인할 수 있습니다.',
    payload: { intervalMs: 33, points: [[0.1, 0.2], [0.3, 0.4]], result: true },
  },
  {
    id: 'register-request',
    type: 1,
    label: '등록 요청',
    enumName: 'REGISTER_REQUEST',
    direction: '미정',
    status: 'defined',
    executable: false,
    description: 'enum에 type 1만 정의되어 있습니다. payload DTO, 방향, handler, destination이 없어 아직 전송할 수 없습니다.',
    payload: {},
  },
  {
    id: 'register-response',
    type: 2,
    label: '등록 응답',
    enumName: 'REGISTER_RESPONSE',
    direction: '미정',
    status: 'defined',
    executable: false,
    description: 'enum에 type 2만 정의되어 있습니다. payload DTO, 방향, publisher 호출부가 아직 없습니다.',
    payload: {},
  },
]

const sendProtocolIds = new Set([
  'game-start-request',
  'capturing-response',
  'register-request',
])
const sendProtocols = protocols.filter((protocol) => sendProtocolIds.has(protocol.id))
const receiveProtocols = protocols.filter((protocol) => !sendProtocolIds.has(protocol.id))

const defaultProtocolConfigs = Object.fromEntries(protocols.map((protocol) => [
  protocol.id,
  {
    type: protocol.type?.toString() ?? '',
    destination: protocol.id === 'game-start-request' || protocol.id === 'capturing-response'
      ? GAME_SEND_DESTINATION
      : protocol.id === 'register-request' || protocol.id === 'register-response'
        ? ''
        : GAME_TOPIC_TEMPLATE,
  },
])) as Record<string, ProtocolConfig>

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')
const defaultSockJsUrl = `${(import.meta.env.VITE_WS_BASE_URL ?? apiBase).replace(/\/$/, '')}/ws-stomp`
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const pretty = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2)

const localDateTime = () => new Date().toISOString().replace(/Z$/, '')

function parseJson(value: string): unknown {
  return JSON.parse(value)
}

function validatePosePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('points' in payload)) {
    return 'payload.points 배열이 필요합니다.'
  }
  const points = (payload as { points?: unknown }).points
  if (!Array.isArray(points) || points.length === 0) {
    return 'points는 한 개 이상의 좌표를 포함해야 합니다.'
  }
  const invalid = points.some((point) =>
    !Array.isArray(point)
    || point.length !== 2
    || point.some((coordinate) =>
      typeof coordinate !== 'number'
      || !Number.isFinite(coordinate)
      || coordinate < 0
      || coordinate > 1),
  )
  return invalid ? '각 좌표는 0 이상 1 이하의 숫자 두 개 [x, y]여야 합니다.' : null
}

function ProtocolSummary({
  protocol,
  config,
  onConfigChange,
  destinationReadOnly = false,
}: {
  protocol: Protocol
  config: ProtocolConfig
  onConfigChange: (next: ProtocolConfig) => void
  destinationReadOnly?: boolean
}) {
  const statusLabel = {
    implemented: '구현됨',
    'in-progress': '개발 중',
    defined: '타입만 정의',
  }[protocol.status]

  return (
    <div className="comm-protocol">
      <div className="comm-protocol__title">
        <div>
          <span>{config.type ? `TYPE ${config.type}` : 'TYPE 없음'}</span>
          <h2>{protocol.enumName}</h2>
        </div>
        <mark className={`comm-status-badge comm-status-badge--${protocol.status}`}>
          {statusLabel}
        </mark>
      </div>
      <p>{protocol.description}</p>
      <div className="comm-protocol__config">
        <label>
          <span>STOMP 주소</span>
          <input
            value={config.destination}
            onChange={(event) => onConfigChange({ ...config, destination: event.target.value })}
            placeholder="/app 또는 /topic destination"
            readOnly={destinationReadOnly}
          />
        </label>
        <label>
          <span>Packet type</span>
          <input
            type="number"
            value={config.type}
            onChange={(event) => onConfigChange({ ...config, type: event.target.value })}
            placeholder="type 없음"
          />
        </label>
      </div>
      <dl>
        <div><dt>방향</dt><dd>{protocol.direction}</dd></div>
        <div><dt>인증</dt><dd>JSESSIONID · credentials 포함</dd></div>
      </dl>
    </div>
  )
}

export function CommunicationTestPage() {
  const { user, isSessionLoading, setAuthenticatedUser, logout } = useAuth()
  const clientRef = useRef<Client | null>(null)
  const logId = useRef(0)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [authError, setAuthError] = useState('')
  const [roomMode, setRoomMode] = useState<'create' | 'join'>('create')
  const [roomTitle, setRoomTitle] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [isSecretRoom, setIsSecretRoom] = useState(false)
  const [isRoomSubmitting, setIsRoomSubmitting] = useState(false)
  const [roomError, setRoomError] = useState('')
  const [joinedRoom, setJoinedRoom] = useState<QuickStartResult | null>(null)
  const [activeId, setActiveId] = useState('game-start-request')
  const [receiveActiveId, setReceiveActiveId] = useState('game-start-response')
  const [roomId, setRoomId] = useState(SAMPLE_ROOM_ID)
  const [gameSessionId, setGameSessionId] = useState(SAMPLE_GAME_ID)
  const [sockJsUrl, setSockJsUrl] = useState(defaultSockJsUrl)
  const [state, setState] = useState<ConnectionState>('disconnected')
  const [logs, setLogs] = useState<LogItem[]>([])
  const [receivedMapData, setReceivedMapData] = useState<unknown>()
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(protocols.map((item) => [item.id, JSON.stringify(item.payload, null, 2)])),
  )
  const [protocolConfigs, setProtocolConfigs] = useState(defaultProtocolConfigs)

  const active = useMemo(
    () => protocols.find((item) => item.id === activeId) ?? protocols[0],
    [activeId],
  )
  const receiveActive = useMemo(
    () => receiveProtocols.find((item) => item.id === receiveActiveId) ?? receiveProtocols[0],
    [receiveActiveId],
  )
  const topic = `/topic/rooms/${roomId || '{roomSessionId}'}/game`
  const resolveDestination = (destination: string) =>
    destination.replaceAll('{roomSessionId}', roomId.trim() || '{roomSessionId}')
  const configuredType = (protocolId: string) => {
    const value = protocolConfigs[protocolId]?.type.trim()
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const updateProtocolConfig = (protocolId: string, next: ProtocolConfig) => {
    setProtocolConfigs((current) => ({ ...current, [protocolId]: next }))
  }

  const addLog = (direction: LogDirection, title: string, body: unknown, type?: number) => {
    setLogs((current) => [
      ...current,
      { id: ++logId.current, direction, title, body, type, time: new Date().toLocaleTimeString('ko-KR') },
    ])
  }

  const validateIds = (needsGameId: boolean) => {
    if (!uuidPattern.test(roomId.trim())) {
      addLog('system', '입력 오류', 'roomSessionId를 올바른 UUID 형식으로 입력하세요.')
      return false
    }
    if (needsGameId && !uuidPattern.test(gameSessionId.trim())) {
      addLog('system', '입력 오류', 'gameSessionId를 올바른 UUID 형식으로 입력하세요.', configuredType(active.id))
      return false
    }
    return true
  }

  const disconnect = async () => {
    const client = clientRef.current
    clientRef.current = null
    if (client) await client.deactivate()
    setState('disconnected')
    addLog('system', '연결 종료', {
      endpoint: sockJsUrl,
      warning: '서버는 game topic 연결 종료 시 해당 사용자를 방에서 퇴장 처리할 수 있습니다.',
    })
  }

  const connect = () => {
    if (!user) {
      addLog('system', '인증 필요', '로그인 후 STOMP 연결을 시도하세요.')
      return
    }
    if (!validateIds(false) || !sockJsUrl.trim()) return
    if (clientRef.current) void clientRef.current.deactivate()

    const subscribedTopics = [...new Set(
      receiveProtocols
        .map((protocol) => resolveDestination(protocolConfigs[protocol.id].destination))
        .filter(Boolean),
    )]
    if (subscribedTopics.length === 0) {
      addLog('system', '입력 오류', '구독할 게임 topic을 확인하세요.')
      return
    }
    setState('connecting')
    addLog('send', 'SockJS / STOMP CONNECT', {
      endpoint: sockJsUrl,
      authentication: 'HTTP session cookie (JSESSIONID)',
    })

    const client = new Client({
      webSocketFactory: () => new SockJS(sockJsUrl) as unknown as IStompSocket,
      reconnectDelay: 0,
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      debug: () => undefined,
      onConnect: () => {
        setState('connected')
        addLog('receive', 'STOMP CONNECTED', { destinations: subscribedTopics })
        subscribedTopics.forEach((subscribedTopic) => {
          client.subscribe(subscribedTopic, (message: IMessage) => {
            try {
              const parsed = JSON.parse(message.body) as { type?: number }
              addLog('receive', `MESSAGE · ${message.headers.destination ?? subscribedTopic}`, parsed, parsed.type)
              if (parsed.type === configuredType('game-start-response') && typeof parsed === 'object' && parsed !== null) {
                const nextGameSessionId = (parsed as { gameSessionId?: unknown }).gameSessionId
                if (typeof nextGameSessionId === 'string') setGameSessionId(nextGameSessionId)
                setReceivedMapData(parsed)
              }
            } catch {
              addLog('receive', `MESSAGE · ${message.headers.destination ?? subscribedTopic}`, message.body)
            }
          })
          addLog('send', 'STOMP SUBSCRIBE', subscribedTopic)
        })
      },
      onStompError: (frame) => {
        setState('error')
        addLog('system', `STOMP ERROR · ${frame.headers.message ?? 'broker error'}`, frame.body)
      },
      onWebSocketError: () => {
        setState('error')
        addLog('system', 'SockJS 연결 실패', '서버 주소, 로그인 세션, CORS 허용 origin을 확인하세요.')
      },
      onWebSocketClose: (event) => {
        if (clientRef.current === client) {
          setState(event.wasClean ? 'disconnected' : 'error')
          clientRef.current = null
        }
        addLog('system', `WebSocket CLOSE · ${event.code}`, event.reason || '연결이 종료되었습니다.')
      },
    })
    clientRef.current = client
    client.activate()
  }

  useEffect(() => () => {
    void clientRef.current?.deactivate()
  }, [])

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedNickname = nickname.trim()
    if (!trimmedNickname || !password) {
      setAuthError('닉네임과 비밀번호를 모두 입력하세요.')
      return
    }
    if (authMode === 'signup' && password.length < 8) {
      setAuthError('회원가입 비밀번호는 8자 이상 입력하세요.')
      return
    }
    if (authMode === 'signup' && password !== passwordConfirm) {
      setAuthError('비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setIsLoggingIn(true)
    setAuthError('')
    if (clientRef.current) await disconnect()
    const authLabel = authMode === 'signup' ? '회원가입' : '로그인'
    const authPath = authMode === 'signup' ? '/api/v1/auth/signup' : '/api/v1/auth/login'
    addLog('send', `HTTP POST · ${authLabel}`, {
      url: `${apiBase}${authPath}`,
      nickname: trimmedNickname,
      password: '••••••••',
      credentials: 'include',
    })
    try {
      const result = authMode === 'signup'
        ? await signUpRegular(trimmedNickname, password)
        : await loginRegular(trimmedNickname, password)
      const sessionUser = await getSessionUser()
      if (!sessionUser) {
        throw new Error(`${authLabel}은 성공했지만 후속 API에서 세션을 확인하지 못했습니다. JSESSIONID 쿠키와 origin 설정을 확인하세요.`)
      }
      setAuthenticatedUser(sessionUser)
      setPassword('')
      setPasswordConfirm('')
      addLog('receive', `${authLabel} 성공 · 세션 생성`, {
        status: result.status,
        user: sessionUser,
        verification: 'GET /api/v1/users/me/profile · 200 OK',
        next: '이제 SockJS / STOMP 연결을 진행할 수 있습니다.',
      })
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error ? error.message : `${authLabel} 요청에 실패했습니다.`
      setAuthError(message)
      addLog('system', `${authLabel} 실패`, {
        message,
        status: error instanceof ApiError ? error.status : undefined,
      })
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    if (clientRef.current) await disconnect()
    try {
      await logout()
      addLog('receive', '로그아웃 완료', {
        endpoint: '/api/v1/auth/logout',
        session: 'JSESSIONID invalidated',
      })
    } catch (error) {
      addLog('system', '로그아웃 요청 실패', error instanceof Error ? error.message : String(error))
    }
  }

  const handleRoomSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user) {
      setRoomError('방을 생성하거나 참여하려면 먼저 로그인해 주세요.')
      return
    }
    if (state === 'connected' || state === 'connecting') {
      setRoomError('방을 변경하기 전에 현재 STOMP 연결을 해제해 주세요.')
      return
    }

    const title = roomTitle.trim()
    const code = roomCode.trim().toUpperCase()
    if (roomMode === 'create' && !title) {
      setRoomError('방 제목을 입력해 주세요.')
      return
    }
    if (roomMode === 'create' && isSecretRoom && !roomPassword.trim()) {
      setRoomError('비밀방 비밀번호를 입력해 주세요.')
      return
    }
    if (roomMode === 'join' && code.length !== 4) {
      setRoomError('4자리 방 코드를 입력해 주세요.')
      return
    }

    setIsRoomSubmitting(true)
    setRoomError('')
    const endpoint = roomMode === 'create' ? '/api/v1/rooms' : '/api/v1/rooms/join'
    const requestBody = roomMode === 'create'
      ? { title, password: isSecretRoom ? roomPassword : null }
      : { roomCode: code, password: roomPassword || null }
    addLog('send', `HTTP POST · ${roomMode === 'create' ? '방 생성' : '방 참여'}`, {
      endpoint,
      ...requestBody,
      ...(requestBody.password ? { password: '••••••••' } : {}),
    })

    try {
      const result = roomMode === 'create'
        ? await createRoom({ title, password: isSecretRoom ? roomPassword : null })
        : await joinRoom({ roomCode: code, password: roomPassword || null })

      setJoinedRoom(result)
      setRoomId(result.roomId)
      setRoomCode(result.roomCode)
      setRoomPassword('')
      addLog('receive', `${roomMode === 'create' ? '방 생성' : '방 참여'} 성공`, {
        ...result,
        next: 'roomSessionId가 자동 반영되었습니다. STOMP 연결을 진행하세요.',
      })
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error ? error.message : '방 요청에 실패했습니다.'
      setRoomError(message)
      addLog('system', `${roomMode === 'create' ? '방 생성' : '방 참여'} 실패`, {
        message,
        code: error instanceof ApiError ? error.code : undefined,
        status: error instanceof ApiError ? error.status : undefined,
      })
    } finally {
      setIsRoomSubmitting(false)
    }
  }

  const buildEnvelope = () => ({
    type: configuredType(active.id),
    eventId: crypto.randomUUID(),
    roomSessionId: roomId.trim(),
    gameSessionId: active.id === 'game-start-request' ? null : gameSessionId.trim(),
    occurredAt: localDateTime(),
    payload: parseJson(drafts[active.id]),
  })

  const sendGameMessage = () => {
    const packetType = configuredType(active.id)
    const destination = resolveDestination(protocolConfigs[active.id].destination)
    if (!clientRef.current?.connected) {
      addLog('system', '전송 불가', '먼저 STOMP 연결과 구독을 완료하세요.', packetType)
      return
    }
    if (!active.executable || (active.id !== 'game-start-request' && active.id !== 'capturing-response')) {
      addLog('system', '전송 불가', '현재 서버가 Client → Server 메시지로 처리하는 타입이 아닙니다.', packetType)
      return
    }
    if (!destination) {
      addLog('system', '전송 불가', 'STOMP 주소를 입력하세요.', packetType)
      return
    }
    if (!validateIds(active.id === 'capturing-response')) return

    try {
      const envelope = buildEnvelope()
      if (active.id === 'capturing-response') {
        const validationError = validatePosePayload(envelope.payload)
        if (validationError) {
          addLog('system', '좌표 검증 실패', validationError, packetType)
          return
        }
      }
      clientRef.current.publish({
        destination,
        body: JSON.stringify(envelope),
      })
      addLog('send', `STOMP SEND · ${destination}`, envelope, packetType)
    } catch (error) {
      addLog(
        'system',
        'Payload JSON 오류',
        error instanceof Error ? error.message : '올바른 JSON으로 수정하세요.',
        packetType,
      )
    }
  }

  const previewEnvelope = () => {
    try {
      const preview = configuredType(active.id) !== undefined
        ? buildEnvelope()
        : parseJson(drafts[active.id])
      addLog('system', `규약 예시 · ${active.enumName}`, preview, configuredType(active.id))
    } catch (error) {
      addLog(
        'system',
        'Payload JSON 오류',
        error instanceof Error ? error.message : '올바른 JSON으로 수정하세요.',
        configuredType(active.id),
      )
    }
  }

  const receiveType = configuredType(receiveActive.id)
  const visibleLogs = logs.filter((item) => item.type === receiveType)

  const actionLabel = active.id === 'game-start-request' ? 'STOMP로 게임 시작' : '촬영 좌표 제출'

  return (
    <main className="comm-page">
      <header className="comm-header">
        <div>
          <p className="comm-eyebrow">DEVELOPER TOOL · GAME PROTOCOL</p>
          <h1>Game Communication Lab</h1>
          <p>현재 백엔드 규약에 맞춰 /app/game/message 기반 STOMP 게임 통신을 직접 검증하는 개발용 콘솔</p>
        </div>
        <div className={`comm-status comm-status--${state}`}>
          <span />
          {state.toUpperCase()}
        </div>
      </header>

      <section className={`comm-auth ${user ? 'comm-auth--authenticated' : ''}`}>
        <div className="comm-auth__heading">
          <div>
            <span>STEP 01 · HTTP SESSION</span>
            <strong>{isSessionLoading ? '세션 확인 중…' : user ? `${user.nickname}님으로 로그인됨` : '로그인이 필요합니다'}</strong>
          </div>
          <i className={user ? 'is-authenticated' : ''}>{user ? 'AUTHENTICATED' : 'UNAUTHENTICATED'}</i>
        </div>
        {user ? (
          <div className="comm-auth__user">
            <dl>
              <div><dt>nickname</dt><dd>{user.nickname}</dd></div>
              <div><dt>userId</dt><dd><code>{user.uuid}</code></dd></div>
              <div><dt>인증 방식</dt><dd>JSESSIONID · HTTP session</dd></div>
            </dl>
            <button type="button" onClick={() => void handleLogout()}>로그아웃</button>
          </div>
        ) : (
          <>
          <div className="comm-auth__modes" role="tablist" aria-label="인증 방식">
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'login'}
              className={authMode === 'login' ? 'is-active' : ''}
              onClick={() => { setAuthMode('login'); setAuthError('') }}
            >
              로그인
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'signup'}
              className={authMode === 'signup' ? 'is-active' : ''}
              onClick={() => { setAuthMode('signup'); setAuthError('') }}
            >
              회원가입
            </button>
          </div>
          <form className="comm-auth__form" onSubmit={(event) => void handleAuth(event)}>
            <label>
              <span>Nickname</span>
              <input
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                autoComplete="username"
                minLength={authMode === 'signup' ? 2 : undefined}
                maxLength={authMode === 'signup' ? 12 : undefined}
                placeholder={authMode === 'signup' ? '2~12자 닉네임' : '닉네임'}
                disabled={isSessionLoading || isLoggingIn}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                minLength={authMode === 'signup' ? 8 : undefined}
                placeholder={authMode === 'signup' ? '8자 이상 비밀번호' : '비밀번호'}
                disabled={isSessionLoading || isLoggingIn}
              />
            </label>
            {authMode === 'signup' && (
              <label>
                <span>Password confirm</span>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="비밀번호 확인"
                  disabled={isSessionLoading || isLoggingIn}
                />
              </label>
            )}
            <button type="submit" disabled={isSessionLoading || isLoggingIn}>
              {isLoggingIn
                ? authMode === 'signup' ? '가입 중…' : '로그인 중…'
                : authMode === 'signup' ? '회원가입' : '로그인'}
            </button>
            {authError && <p role="alert">{authError}</p>}
          </form>
          </>
        )}
      </section>

      <section className={`comm-room ${joinedRoom ? 'comm-room--joined' : ''}`}>
        <div className="comm-room__heading">
          <div>
            <span>STEP 02 · ROOM SESSION</span>
            <strong>{joinedRoom ? `${joinedRoom.title} 방에 참여 중` : '방을 생성하거나 코드로 참여하세요'}</strong>
          </div>
          <i>{joinedRoom ? `ROOM ${joinedRoom.roomCode}` : 'NOT JOINED'}</i>
        </div>

        {joinedRoom && (
          <dl className="comm-room__result">
            <div><dt>roomSessionId</dt><dd><code>{joinedRoom.roomId}</code></dd></div>
            <div><dt>slotId</dt><dd>{joinedRoom.slotId}</dd></div>
            <div><dt>role</dt><dd>{joinedRoom.isHost ? 'HOST' : 'PARTICIPANT'}</dd></div>
            <div><dt>participants</dt><dd>{joinedRoom.participants.length}</dd></div>
          </dl>
        )}

        <div className="comm-room__modes" role="tablist" aria-label="방 작업">
          <button
            type="button"
            role="tab"
            aria-selected={roomMode === 'create'}
            className={roomMode === 'create' ? 'is-active' : ''}
            onClick={() => { setRoomMode('create'); setRoomError('') }}
            disabled={state === 'connected' || state === 'connecting'}
          >
            방 생성
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={roomMode === 'join'}
            className={roomMode === 'join' ? 'is-active' : ''}
            onClick={() => { setRoomMode('join'); setRoomError('') }}
            disabled={state === 'connected' || state === 'connecting'}
          >
            코드로 참여
          </button>
        </div>

        <form className="comm-room__form" onSubmit={(event) => void handleRoomSubmit(event)}>
          {roomMode === 'create' ? (
            <>
              <label>
                <span>Room title</span>
                <input
                  value={roomTitle}
                  onChange={(event) => setRoomTitle(event.target.value.slice(0, 30))}
                  placeholder="테스트 방 제목"
                  maxLength={30}
                  disabled={!user || isRoomSubmitting || state !== 'disconnected'}
                />
              </label>
              <label className="comm-room__secret">
                <input
                  type="checkbox"
                  checked={isSecretRoom}
                  onChange={(event) => setIsSecretRoom(event.target.checked)}
                  disabled={!user || isRoomSubmitting || state !== 'disconnected'}
                />
                <span>비밀방</span>
              </label>
            </>
          ) : (
            <label>
              <span>Room code</span>
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase())}
                placeholder="ABCD"
                maxLength={4}
                autoComplete="off"
                disabled={!user || isRoomSubmitting || state !== 'disconnected'}
              />
            </label>
          )}
          {(roomMode === 'join' || isSecretRoom) && (
            <label>
              <span>Room password {roomMode === 'join' && '(optional)'}</span>
              <input
                type="password"
                value={roomPassword}
                onChange={(event) => setRoomPassword(event.target.value)}
                placeholder={roomMode === 'join' ? '공개방이면 비워 두세요' : '비밀방 비밀번호'}
                disabled={!user || isRoomSubmitting || state !== 'disconnected'}
              />
            </label>
          )}
          <button
            type="submit"
            disabled={!user || isRoomSubmitting || state !== 'disconnected'}
          >
            {isRoomSubmitting ? '처리 중…' : roomMode === 'create' ? '방 생성하기' : '방 참여하기'}
          </button>
          {roomError && <p role="alert">{roomError}</p>}
        </form>
      </section>

      <section className="comm-connect">
        <label>
          <span>SockJS endpoint</span>
          <input
            value={sockJsUrl}
            onChange={(event) => setSockJsUrl(event.target.value)}
            disabled={state === 'connected'}
            placeholder="http://localhost:8080/ws-stomp"
          />
        </label>
        <label className="comm-connect__room">
          <span>roomSessionId</span>
          <input
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            disabled={state === 'connected'}
          />
        </label>
        {state === 'connected' ? (
          <button className="comm-button comm-button--stop" onClick={() => void disconnect()}>연결 해제</button>
        ) : (
          <button className="comm-button" onClick={connect} disabled={state === 'connecting' || !user || isSessionLoading}>
            {state === 'connecting' ? '연결 중…' : '연결 · 구독'}
          </button>
        )}
      </section>
      <div className="comm-connect-info" aria-label="STOMP 연결 및 구독 정보">
        <span><b>CONNECT</b><code>{sockJsUrl || 'SockJS endpoint 미입력'}</code></span>
        <span><b>자동 SUBSCRIBE</b><code>{topic}</code></span>
        <small>연결 성공 직후 클라이언트가 게임 topic을 구독합니다.</small>
      </div>

      <section className="comm-workspace">
        <div className="comm-session">
          <label>
            <span>gameSessionId</span>
            <input
              value={gameSessionId}
              onChange={(event) => setGameSessionId(event.target.value)}
              placeholder="type 101 수신 시 자동 반영됩니다"
            />
          </label>
          <p>좌표 제출(type 103)에 사용되며, 시작 응답(type 101)을 받으면 자동으로 갱신됩니다.</p>
        </div>

        <div className="comm-columns">
          <section className="comm-channel comm-channel--send">
            <div className="comm-channel__heading">
              <span>01</span>
              <div><b>송신</b><small>CLIENT → SERVER</small></div>
            </div>
            <nav className="comm-tabs" aria-label="송신 통신 규약">
              {sendProtocols.map((item) => (
                <button
                  key={item.id}
                  className={activeId === item.id ? 'is-active' : ''}
                  onClick={() => setActiveId(item.id)}
                >
                  {protocolConfigs[item.id].type && <b>{protocolConfigs[item.id].type}</b>}
                  <span>{item.label}</span>
                  <i className={item.status === 'implemented' ? 'is-live' : item.status === 'in-progress' ? 'is-progress' : ''} />
                </button>
              ))}
            </nav>
            <ProtocolSummary
              protocol={active}
              config={protocolConfigs[active.id]}
              onConfigChange={(next) => updateProtocolConfig(active.id, next)}
            />

            <div className="comm-side comm-side--send">
            <header><span>01</span><div><b>요청 · 예시</b><small>CLIENT → SERVER</small></div></header>
            <label className="comm-editor-label">Payload JSON</label>
            <textarea
              value={drafts[active.id]}
              onChange={(event) => setDrafts((current) => ({ ...current, [active.id]: event.target.value }))}
              spellCheck={false}
              readOnly={!active.executable}
            />
            {active.id === 'game-start-request' || active.id === 'capturing-response' ? (
              <button className="comm-action" onClick={sendGameMessage}>{actionLabel}</button>
            ) : (
              <button className="comm-action comm-action--ghost" onClick={previewEnvelope}>
                메시지 envelope 미리보기
              </button>
            )}
            {active.status !== 'implemented' && (
              <div className="comm-notice">
                서버 처리 로직이 없어 실제 전송하지 않습니다.
              </div>
            )}
            </div>
          </section>

          <section className="comm-channel comm-channel--receive">
            <div className="comm-channel__heading">
              <span>02</span>
              <div><b>수신</b><small>SERVER → CLIENT</small></div>
            </div>
            <nav className="comm-tabs" aria-label="수신 통신 규약">
              {receiveProtocols.map((item) => (
                <button
                  key={item.id}
                  className={receiveActiveId === item.id ? 'is-active' : ''}
                  onClick={() => setReceiveActiveId(item.id)}
                >
                  {protocolConfigs[item.id].type && <b>{protocolConfigs[item.id].type}</b>}
                  <span>{item.label}</span>
                  <i className={item.status === 'implemented' ? 'is-live' : item.status === 'in-progress' ? 'is-progress' : ''} />
                </button>
              ))}
            </nav>
            <ProtocolSummary
              protocol={receiveActive}
              config={protocolConfigs[receiveActive.id]}
              onConfigChange={(next) => updateProtocolConfig(receiveActive.id, next)}
              destinationReadOnly
            />
            <details className="comm-payload-preview">
              <summary>Payload 예시</summary>
              <pre>{pretty(receiveActive.payload)}</pre>
            </details>

            <div className="comm-side comm-side--receive">
            <header><span>02</span><div><b>통신 로그</b><small>REQUEST / RESPONSE / EVENT</small></div></header>
            <div className="comm-log">
              {visibleLogs.length === 0 ? (
                <div className="comm-log__empty">
                  <i>◎</i>
                  <p>아직 이 규약과 관련된 통신 기록이 없습니다.</p>
                </div>
              ) : [...visibleLogs].reverse().map((item) => (
                <article key={item.id} className={`comm-message comm-message--${item.direction}`}>
                  <div><b>{item.title}</b><time>{item.time}</time></div>
                  <pre>{pretty(item.body)}</pre>
                </article>
              ))}
            </div>
            {visibleLogs.length > 0 && (
              <button className="comm-clear" onClick={() => setLogs((current) =>
                current.filter((item) => item.type !== receiveType)
              )}>현재 로그 지우기</button>
            )}
            </div>
          </section>
        </div>
      </section>
      <MapConfigViewer incomingData={receivedMapData} />
    </main>
  )
}
