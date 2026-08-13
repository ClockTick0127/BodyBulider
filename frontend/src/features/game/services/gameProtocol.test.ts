import { describe, expect, it, vi } from 'vitest'
import {
  createGameEnvelope,
  GAME_MESSAGE_TYPE,
  parseGameEvent,
} from './gameProtocol'

describe('gameProtocol', () => {
  it('게임 시작 요청에 stageId, roomSessionId와 null gameSessionId를 넣는다', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'event-id' })

    expect(createGameEnvelope(GAME_MESSAGE_TYPE.START_REQUEST, 'room-id', null, { stageId: 3 })).toMatchObject({
      type: 100,
      eventId: 'event-id',
      roomSessionId: 'room-id',
      gameSessionId: null,
      payload: { stageId: 3 },
    })

    vi.unstubAllGlobals()
  })

  it('type 101 시작 응답에서 gameSessionId와 mapConfig를 추출한다', () => {
    expect(parseGameEvent({
      type: 101,
      gameSessionId: 'game-id',
      payload: {
        mapId: 1001,
        round: {
          mapConfig: {
            startPoint: [1, 2],
            endPoint: [8, 4],
            players: [[1, 3]],
            terrain: [[[0, 5], [2, 5]]],
          },
        },
      },
    })).toEqual({
      type: 'GAME_STARTED',
      gameSessionId: 'game-id',
      roundNo: 1,
      map: {
        mapNum: 1001,
        startPoint: [1, 2],
        endPoint: [8, 4],
        players: [[1, 3]],
        terrain: [[[0, 5], [2, 5]]],
      },
      participants: [],
      placements: [],
      initialDelayMs: 5000,
    })
  })

  it('mapConfig의 clearZone [x,y,w,h]을 보존하고, 형식 불량이면 생략한다', () => {
    const payloadWith = (clearZone: unknown) => ({
      type: 101,
      gameSessionId: 'game-id',
      payload: {
        round: {
          mapConfig: {
            startPoint: [1, 2],
            endPoint: [8, 4],
            players: [[1, 3]],
            terrain: [],
            ...(clearZone !== undefined ? { clearZone } : {}),
          },
        },
      },
    })

    const parsed = parseGameEvent(payloadWith([900, 400, 80, 120]))
    expect(parsed?.type).toBe('GAME_STARTED')
    if (parsed?.type !== 'GAME_STARTED') return
    expect(parsed.map.clearZone).toEqual([900, 400, 80, 120])

    // 없으면 필드 자체가 없다 (기존 x 기준 판정 폴백)
    const withoutZone = parseGameEvent(payloadWith(undefined))
    if (withoutZone?.type !== 'GAME_STARTED') throw new Error('unexpected')
    expect(withoutZone.map.clearZone).toBeUndefined()

    // 원소 부족·0 이하 크기는 무시하고 생략한다
    const malformed = parseGameEvent(payloadWith([900, 400, 80]))
    if (malformed?.type !== 'GAME_STARTED') throw new Error('unexpected')
    expect(malformed.map.clearZone).toBeUndefined()

    const zeroSize = parseGameEvent(payloadWith([900, 400, 0, 120]))
    if (zeroSize?.type !== 'GAME_STARTED') throw new Error('unexpected')
    expect(zeroSize.map.clearZone).toBeUndefined()
  })

  it('type 101 응답의 initialDelayMs를 맵 탐색 시간으로 보존한다', () => {
    expect(parseGameEvent({
      type: 101,
      gameSessionId: 'game-id',
      payload: {
        initialDelayMs: 7000,
        round: {
          mapConfig: {
            startPoint: [1, 2],
            endPoint: [8, 4],
            players: [],
            terrain: [],
          },
        },
      },
    })).toMatchObject({ initialDelayMs: 7000 })
  })

  it('type 101 응답의 참가자별 playerNo를 보존한다', () => {
    expect(parseGameEvent({
      type: 101,
      gameSessionId: 'game-id',
      payload: {
        round: {
          mapConfig: {
            startPoint: [10, 20],
            endPoint: [800, 400],
            players: [],
            terrain: [],
          },
        },
        participants: [{ userId: 'user-1', playerNo: 2 }],
        placements: [{ captureNo: 3, userId: 'user-1', playerNo: 2 }],
      },
    })).toMatchObject({
      participants: [{ userId: 'user-1', playerNo: 2 }],
      placements: [{ captureNo: 3, userId: 'user-1', playerNo: 2 }],
    })
  })

  it('type 105 다음 라운드 응답에서 새 mapConfig를 추출한다', () => {
    expect(parseGameEvent({
      type: 105,
      gameSessionId: 'game-id',
      payload: {
        mapId: 1002,
        round: {
          roundId: 2,
          roundNo: 2,
          mapConfig: {
            startPoint: [20, 30],
            endPoint: [900, 500],
            players: [[200, 300]],
            terrain: [[[0, 600], [1000, 600]]],
          },
        },
      },
    })).toEqual({
      type: 'ROUND_STARTED',
      gameSessionId: 'game-id',
      roundNo: 2,
      map: {
        mapNum: 1002,
        startPoint: [20, 30],
        endPoint: [900, 500],
        players: [[200, 300]],
        terrain: [[[0, 600], [1000, 600]]],
      },
      participants: [],
      placements: [],
      initialDelayMs: 5000,
    })
  })

  it('type 102와 104 payload를 화면 이벤트로 변환한다', () => {
    expect(parseGameEvent({
      type: 102,
      payload: { player: 2, captureNo: 3, durationMs: 3000 },
    })).toEqual({
      type: 'PLAYER_FILMING',
      player: 2,
      captureNo: 3,
      durationMs: 3000,
    })

    expect(parseGameEvent({
      type: 104,
      payload: {
        intervalMs: 33,
        points: [[0.1, 0.2, 1.2, 2.3], [0.3, 0.4, 1.4, 2.5]],
        result: true,
      },
    })).toEqual({
      type: 'SIMULATION_RESULT',
      intervalMs: 33,
      points: [[0.1, 0.2, 1.2, 2.3], [0.3, 0.4, 1.4, 2.5]],
      result: true,
    })
  })

  it('rejects simulation frames that do not contain x, y, vx and vy', () => {
    expect(parseGameEvent({
      type: GAME_MESSAGE_TYPE.SIMULATING_RESPONSE,
      payload: { intervalMs: 50, points: [[90, 870]], result: false },
    })).toBeNull()
  })

  it('type 106 최종 게임 결과를 화면 이벤트로 변환한다', () => {
    expect(parseGameEvent({
      type: GAME_MESSAGE_TYPE.RESULT_RESPONSE,
      payload: { stars: 3, elapsedTimeMs: 65_432, result: true },
    })).toEqual({
      type: 'GAME_RESULT',
      stars: 3,
      elapsedTimeMs: 65_432,
      result: true,
    })
  })

  it('유효하지 않은 type 106 최종 게임 결과를 거부한다', () => {
    expect(parseGameEvent({
      type: GAME_MESSAGE_TYPE.RESULT_RESPONSE,
      payload: { stars: -1, elapsedTimeMs: 1000, result: true },
    })).toBeNull()
  })

  it('rejects a capture request without captureNo', () => {
    expect(parseGameEvent({
      type: GAME_MESSAGE_TYPE.CAPTURING_REQUEST,
      payload: { player: 2, durationMs: 3000 },
    })).toBeNull()
  })

  it('parses a type 107 pose broadcast', () => {
    expect(parseGameEvent({
      type: GAME_MESSAGE_TYPE.POSE_BROADCAST,
      payload: {
        player: 2,
        captureNo: 3,
        points: [[0.1, 0.2], [0.3, 0.4]],
      },
    })).toEqual({
      type: 'POSE_BROADCAST',
      player: 2,
      captureNo: 3,
      points: [[0.1, 0.2], [0.3, 0.4]],
    })
  })

  it('rejects an invalid type 107 pose broadcast', () => {
    expect(parseGameEvent({
      type: GAME_MESSAGE_TYPE.POSE_BROADCAST,
      payload: { player: 1, captureNo: 1, points: [[1.1, 0.2]] },
    })).toBeNull()
  })
})
