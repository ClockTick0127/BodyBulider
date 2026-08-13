import type { GameGimmick } from '../../features/game/services/gameProtocol'

export const hasMapGimmick = (gimmicks: GameGimmick[] | undefined, type: string) =>
  gimmicks?.some((gimmick) => gimmick.type === type) ?? false
