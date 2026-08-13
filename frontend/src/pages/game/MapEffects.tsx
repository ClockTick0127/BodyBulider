import type { MapEffect } from './mapDesign'

type MapEffectsProps = {
  effects: MapEffect[]
}

const RAIN_DROPS = Array.from({ length: 28 })
const WATER_DROPS = Array.from({ length: 8 })
const WIND_STREAKS = Array.from({ length: 7 })

export function MapEffects({ effects }: MapEffectsProps) {
  const has = (effect: MapEffect) => effects.includes(effect)

  return (
    <div className="map-effects" aria-hidden="true">
      {has('rain') && (
        <div className="map-rain">
          {RAIN_DROPS.map((_, index) => <i key={index} />)}
        </div>
      )}

      {has('falling-water') && (
        <div className="map-waterfall">
          <div className="map-waterfall__outlet" />
          <div className="map-waterfall__stream">
            {WATER_DROPS.map((_, index) => <i key={index} />)}
          </div>
          <div className="map-waterfall__splash"><i /><i /><i /></div>
        </div>
      )}

      {has('wind') && (
        <div className="map-wind">
          {WIND_STREAKS.map((_, index) => <i key={index} />)}
          <span>←</span>
        </div>
      )}
    </div>
  )
}
