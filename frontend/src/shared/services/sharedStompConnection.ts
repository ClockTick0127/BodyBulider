import {
  Client,
  type IMessage,
  type IStompSocket,
  type StompSubscription,
} from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
export const SHARED_STOMP_ENDPOINT = `${WS_BASE_URL.replace(/\/$/, '')}/ws-stomp`

export type SharedStompStatus = 'connecting' | 'connected' | 'disconnected'

type SubscriptionConfig = {
  destination: string
  onMessage: (message: IMessage) => void
}

type Registration = {
  subscriptions: SubscriptionConfig[]
  onStatusChange?: (status: SharedStompStatus) => void
}

export type SharedStompRegistration = {
  client: Client
  disconnect: () => Promise<void>
}

let client: Client | null = null
let status: SharedStompStatus = 'disconnected'
let nextRegistrationId = 0
let shutdownTimer: ReturnType<typeof setTimeout> | null = null
const registrations = new Map<number, Registration>()
const brokerSubscriptions = new Map<string, StompSubscription>()

const desiredDestinations = () =>
  new Set(
    [...registrations.values()].flatMap((registration) =>
      registration.subscriptions.map((subscription) => subscription.destination),
    ),
  )

const notifyStatus = (nextStatus: SharedStompStatus) => {
  status = nextStatus
  registrations.forEach((registration) => registration.onStatusChange?.(nextStatus))
}

const dispatchMessage = (destination: string, message: IMessage) => {
  registrations.forEach((registration) => {
    registration.subscriptions.forEach((subscription) => {
      if (subscription.destination === destination) subscription.onMessage(message)
    })
  })
}

const subscribeDestination = (destination: string) => {
  if (!client?.connected || brokerSubscriptions.has(destination)) return
  brokerSubscriptions.set(
    destination,
    client.subscribe(destination, (message) => dispatchMessage(destination, message)),
  )
}

const syncSubscriptions = () => {
  const desired = desiredDestinations()
  brokerSubscriptions.forEach((subscription, destination) => {
    if (desired.has(destination)) return
    subscription.unsubscribe()
    brokerSubscriptions.delete(destination)
  })
  desired.forEach(subscribeDestination)
}

const ensureClient = (userId?: string) => {
  if (shutdownTimer != null) {
    clearTimeout(shutdownTimer)
    shutdownTimer = null
  }
  if (client) return client

  const nextClient = new Client({
    webSocketFactory: () => new SockJS(SHARED_STOMP_ENDPOINT) as unknown as IStompSocket,
    connectHeaders: userId ? { userId } : {},
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    debug: () => {},
    onConnect: () => {
      brokerSubscriptions.clear()
      syncSubscriptions()
      notifyStatus('connected')
    },
    onWebSocketClose: () => {
      brokerSubscriptions.clear()
      notifyStatus('disconnected')
    },
    onStompError: (frame) => {
      console.error('[STOMP] broker error:', frame.headers.message, frame.body)
      notifyStatus('disconnected')
    },
  })

  client = nextClient
  notifyStatus('connecting')
  nextClient.activate()
  return nextClient
}

const scheduleShutdownIfUnused = () => {
  if (registrations.size > 0 || shutdownTimer != null) return
  shutdownTimer = setTimeout(() => {
    shutdownTimer = null
    if (registrations.size > 0) return
    const closingClient = client
    client = null
    brokerSubscriptions.clear()
    status = 'disconnected'
    if (closingClient) void closingClient.deactivate()
  }, 0)
}

/**
 * 하나의 SockJS/STOMP 연결에 기능별 구독을 등록한다.
 * disconnect는 해당 기능만 해제하고, 마지막 등록이 사라질 때 물리 연결을 닫는다.
 */
export function registerSharedStomp({
  userId,
  subscriptions,
  onStatusChange,
}: {
  userId?: string
  subscriptions: SubscriptionConfig[]
  onStatusChange?: (status: SharedStompStatus) => void
}): SharedStompRegistration {
  const sharedClient = ensureClient(userId)
  const registrationId = ++nextRegistrationId
  registrations.set(registrationId, { subscriptions, onStatusChange })
  syncSubscriptions()
  onStatusChange?.(sharedClient.connected ? 'connected' : status)

  let disconnected = false
  return {
    client: sharedClient,
    disconnect: async () => {
      if (disconnected) return
      disconnected = true
      registrations.delete(registrationId)
      syncSubscriptions()
      scheduleShutdownIfUnused()
    },
  }
}
