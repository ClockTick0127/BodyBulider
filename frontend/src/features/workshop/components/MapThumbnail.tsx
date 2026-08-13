import { paletteGradient } from '../services/customMapApi'

type MapThumbnailProps = {
  palette: string[]
  /** 우하단 `{n}P · {n}G` 뱃지. 둘 다 없으면 뱃지를 그리지 않는다. */
  polygonCount?: number
  gimmickCount?: number
  /** 상세 모달용 와이드 비율(16:7) */
  large?: boolean
}

/**
 * 맵 썸네일.
 *
 * 이미지 업로드가 아니라 palette 3색 CSS 그라디언트로 그린다.
 * 스토리지·업로드 인프라가 필요 없고, 목록에서 이미지를 내려받지 않아 가볍다.
 */
export function MapThumbnail({ palette, polygonCount, gimmickCount, large }: MapThumbnailProps) {
  const hasCounts = polygonCount != null && gimmickCount != null

  return (
    <div
      className={`map-thumb${large ? ' map-thumb--large' : ''}`}
      style={{ background: paletteGradient(palette) }}
    >
      {/* 어느 맵이든 '지형처럼' 보이도록 하는 장식. 실제 지형과는 무관하다. */}
      <svg className="map-thumb__deco" viewBox="0 0 160 90" aria-hidden="true">
        <rect x="10" y="60" width="50" height="6" rx="3" />
        <rect x="80" y="40" width="40" height="6" rx="3" />
        <rect x="110" y="70" width="35" height="6" rx="3" />
        <circle cx="148" cy="12" r="6" className="map-thumb__deco-accent" />
        <circle cx="18" cy="52" r="4" className="map-thumb__deco-accent" />
      </svg>
      {hasCounts && (
        <span className="map-thumb__counts">
          {polygonCount}P · {gimmickCount}G
        </span>
      )}
    </div>
  )
}

/** 난이도 뱃지. 하=초록 / 중=주황 / 상=빨강 */
export function DiffBadge({ level }: { level: string }) {
  const tone = level === '하' ? 'low' : level === '중' ? 'mid' : 'high'
  return <span className={`diff-badge diff-badge--${tone}`}>{level}</span>
}
