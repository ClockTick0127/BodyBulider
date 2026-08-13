import { describe, expect, it } from 'vitest'
import type { RoomParticipant } from '../../rooms/services/roomsApi'
import { shouldInitiateOffer } from './useWebRTC'

const participant = (userId: string, slotId: number): RoomParticipant => ({
  userId,
  slotId,
  nickname: userId,
  isHost: false,
  isReady: false,
})

describe('shouldInitiateOffer', () => {
  it('lets the newly assigned higher slot initiate toward an existing peer', () => {
    const existing = participant('existing', 1)
    const newcomer = participant('newcomer', 2)

    expect(shouldInitiateOffer(newcomer, existing)).toBe(true)
    expect(shouldInitiateOffer(existing, newcomer)).toBe(false)
  })

  it('selects exactly one initiator for every pair', () => {
    const participants = [
      participant('first', 1),
      participant('second', 2),
      participant('third', 3),
      participant('fourth', 4),
    ]

    for (let left = 0; left < participants.length; left += 1) {
      for (let right = left + 1; right < participants.length; right += 1) {
        const leftInitiates = shouldInitiateOffer(participants[left], participants[right])
        const rightInitiates = shouldInitiateOffer(participants[right], participants[left])
        expect(Number(leftInitiates) + Number(rightInitiates)).toBe(1)
      }
    }
  })

  it('does not initiate until the local participant is present', () => {
    expect(shouldInitiateOffer(undefined, participant('remote', 1))).toBe(false)
  })
})
