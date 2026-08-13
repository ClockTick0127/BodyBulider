import { useEffect } from 'react'
import { DiffBadge, MapThumbnail } from './MapThumbnail'
import type { CustomMapSummary } from '../services/customMapApi'

type MapDetailModalProps = {
  map: CustomMapSummary
  onClose: () => void
  /** "이 맵으로 방 만들기" — 방 생성 모달을 여는 것은 호출 측 책임이다. */
  onCreateRoom: (map: CustomMapSummary) => void
}

/**
 * 맵 상세 모달.
 *
 * Phase 1 범위는 썸네일·제작자·설명·통계·방 만들기까지다.
 * 좋아요·평점·댓글은 Phase 2이므로 **지우지 않고 자리만 비워 둔다.**
 * 나중에 API만 붙이면 되도록 레이아웃을 미리 잡아 두기 위함이다.
 */
export function MapDetailModal({ map, onClose, onCreateRoom }: MapDetailModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const stats = [
    { label: '플레이', value: map.playCount.toLocaleString() },
    { label: '폴리곤', value: `${map.polygonCount}개` },
    { label: '기믹', value: `${map.gimmickCount}개` },
    // 평점은 Phase 2. 값이 없다는 뜻으로 —를 쓴다. (0.0으로 두면 '최저 평점'으로 읽힌다)
    { label: '평점', value: '—' },
  ]

  return (
    <div
      className="workshop-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-detail-title"
      // 모달 안에서 드래그를 끝냈을 때 닫히지 않도록 mousedown 대상까지 확인한다.
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="map-detail">
        <div className="map-detail__hero">
          <MapThumbnail palette={map.palette} large />
          <button className="map-detail__close" type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
          <div className="map-detail__hero-info">
            <div>
              <p className="map-detail__kicker">CUSTOM MAP · STAGE {map.stageId}</p>
              <h2 id="map-detail-title">{map.title}</h2>
            </div>
            <DiffBadge level={map.difficulty} />
          </div>
        </div>

        <div className="map-detail__body">
          <section className="map-detail__meta">
            <div className="map-detail__creator">
              <span className="map-detail__avatar" aria-hidden="true">
                {map.creatorNickname.slice(0, 1)}
              </span>
              <div>
                <strong>{map.creatorNickname}</strong>
                <small>{map.createdAt} 제작</small>
              </div>
            </div>
            {/* Phase 2: 좋아요. 동작하지 않는다는 것이 보이도록 비활성으로 둔다. */}
            <button className="map-detail__like" type="button" disabled title="좋아요는 준비 중입니다.">
              ♡ {map.likeCount.toLocaleString()}
            </button>
          </section>

          <p className="map-detail__description">{map.description}</p>

          <section className="map-detail__stats" aria-label="맵 통계">
            {stats.map((stat) => (
              <div key={stat.label}>
                <small>{stat.label}</small>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </section>

          {/*
            Phase 2 자리(평점 별·댓글 목록/작성).
            레이아웃을 다시 잡지 않아도 되도록 영역과 제목만 남겨 둔다.
          */}
          <section className="map-detail__phase2" aria-label="유저 평가 및 댓글">
            <p className="map-detail__phase2-title">유저 평가 · 댓글</p>
            <p className="map-detail__phase2-note">평점과 댓글은 준비 중입니다.</p>
          </section>
        </div>

        <div className="map-detail__actions">
          <button className="workshop-button workshop-button--ghost" type="button" onClick={onClose}>
            닫기
          </button>
          <button
            className="workshop-button workshop-button--primary map-detail__cta"
            type="button"
            onClick={() => onCreateRoom(map)}
          >
            이 맵으로 방 만들기 →
          </button>
        </div>
      </div>
    </div>
  )
}
