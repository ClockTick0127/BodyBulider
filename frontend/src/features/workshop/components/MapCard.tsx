import { DiffBadge, MapThumbnail } from './MapThumbnail'
import type { CustomMapSummary } from '../services/customMapApi'

/** 공개 맵 탐색 카드. 누르면 상세 모달을 연다. */
export function MapCard({ map, onClick }: { map: CustomMapSummary; onClick: () => void }) {
  return (
    <button className="map-card" type="button" onClick={onClick}>
      <span className="map-card__thumb">
        <MapThumbnail
          palette={map.palette}
          polygonCount={map.polygonCount}
          gimmickCount={map.gimmickCount}
        />
        <span className="map-card__hover">상세 보기 →</span>
      </span>
      <span className="map-card__body">
        <span className="map-card__title-row">
          <strong className="map-card__title">{map.title}</strong>
          <DiffBadge level={map.difficulty} />
        </span>
        <span className="map-card__creator">{map.creatorNickname}</span>
        <span className="map-card__stats">
          <span title="플레이 수">▶ {map.playCount.toLocaleString()}</span>
          {/* 좋아요는 Phase 2. Phase 1에서는 서버가 항상 0을 준다. */}
          <span title="좋아요 (준비 중)">♡ {map.likeCount.toLocaleString()}</span>
        </span>
      </span>
    </button>
  )
}

type MyMapCardProps = {
  map: CustomMapSummary
  onEdit: () => void
  onTogglePublic: () => void
  onOpenDetail: () => void
  /** 공개 토글 요청 중이면 버튼을 잠근다. */
  isToggling: boolean
}

/** 내 맵 카드. 공개 여부 토글과 편집 진입을 제공한다. */
export function MyMapCard({ map, onEdit, onTogglePublic, onOpenDetail, isToggling }: MyMapCardProps) {
  return (
    <div className="map-card map-card--mine">
      {/*
        카드 전체를 button으로 감싸면 안쪽의 토글·편집 버튼이 중첩된다.
        썸네일 영역만 상세 보기 버튼으로 둔다.
      */}
      <button className="map-card__thumb-button" type="button" onClick={onOpenDetail}>
        <MapThumbnail
          palette={map.palette}
          polygonCount={map.polygonCount}
          gimmickCount={map.gimmickCount}
        />
        <span className="map-card__hover">상세 보기 →</span>
      </button>
      <div className="map-card__body">
        <div className="map-card__title-row">
          <strong className="map-card__title">{map.title}</strong>
          <DiffBadge level={map.difficulty} />
        </div>
        <span className="map-card__creator">{map.createdAt} 생성</span>
        {/* 미검증 맵은 공개할 수 없으므로 이유를 카드에서 바로 알려 준다. */}
        {!map.isCleared && (
          <span className="map-card__unverified" title="에디터에서 테스트 플레이를 성공해야 공개할 수 있습니다.">
            ⚠️ 클리어 미검증
          </span>
        )}
        <div className="map-card__actions">
          {/*
            공개 전환은 목록에서 할 수 없다. 서버가 저장할 때마다 포즈로 클리어를 재현하는데
            목록에는 에디터가 없어 포즈를 만들 수 없다. 비공개로 내리는 것만 여기서 한다.
          */}
          <button
            className={`map-card__toggle${map.isPublic ? ' is-public' : ''}`}
            type="button"
            onClick={onTogglePublic}
            disabled={isToggling || !map.isPublic}
            aria-pressed={map.isPublic}
            title={
              map.isPublic
                ? '비공개로 내립니다.'
                : '공개하려면 편집에서 테스트 플레이를 성공한 뒤 저장해 주세요.'
            }
          >
            {isToggling ? '변경 중…' : map.isPublic ? '● 공개 중' : '○ 비공개'}
          </button>
          <button className="map-card__edit" type="button" onClick={onEdit}>
            ✏ 편집
          </button>
        </div>
      </div>
    </div>
  )
}
