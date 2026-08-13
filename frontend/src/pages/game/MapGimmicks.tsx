import type { CSSProperties } from 'react'
import type { GameGimmick } from '../../features/game/services/gameProtocol'

type MapGimmicksProps = { gimmicks: GameGimmick[]; mapWidth: number; mapHeight: number; minX: number; renderWidth: number }

export function MapGimmicks({ gimmicks, mapWidth, mapHeight, minX, renderWidth }: MapGimmicksProps) {
  const left = (x: number) => `${((x - minX) / renderWidth) * 100}%`
  const top = (y: number) => `${(y / mapHeight) * 100}%`
  const width = (value: number) => `${(value / renderWidth) * 100}%`
  const height = (value: number) => `${(value / mapHeight) * 100}%`

  return <div className="map-gimmicks" aria-hidden="true">
    {gimmicks.map((gimmick, index) => {
      if (gimmick.type === 'JUMP_PAD' && gimmick.position && gimmick.size) {
        const [x, y] = gimmick.position; const [w, h] = gimmick.size
        return <div key={index} className="map-gimmick map-gimmick--jump-pad" style={{ left: left(x - w / 2), top: top(y - h / 2), width: width(w), height: height(h) }}><span>↑</span></div>
      }
      if (gimmick.type === 'WIND' && gimmick.band) {
        const [yTop, yBottom] = gimmick.band
        return <div key={index} className="map-gimmick map-gimmick--wind" style={{ left: left(0), top: top(yTop), width: width(mapWidth), height: height(yBottom - yTop), '--wind-strength': gimmick.strength ?? 0 } as CSSProperties}><i /><i /><i /><span>←</span></div>
      }
      if (gimmick.type === 'KILL_ZONE' && gimmick.area) {
        const [x, y, w, h] = gimmick.area
        return <div key={index} className="map-gimmick map-gimmick--kill-zone" style={{ left: left(x), top: top(y), width: width(w), height: height(h) }} />
      }
      return null
    })}
  </div>
}
