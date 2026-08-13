import { useState } from 'react'
import type { FormEvent } from 'react'
import { MAP_LIMITS, ALLOWED_GIMMICK_TYPES } from '../services/customMapApi'

type NewMapModalProps = {
  onClose: () => void
  /** 제목만 받아 에디터로 넘긴다. 나머지 정보는 에디터에서 입력한다. */
  onConfirm: (title: string) => void
}

/**
 * 새 맵 만들기 모달.
 *
 * 제한 안내는 서버 `MapConfigValidator`와 같은 수치다. 여기서 미리 알려 주면
 * 에디터에서 한참 그린 뒤 저장 단계에서 400을 받는 상황을 줄일 수 있다.
 */
export function NewMapModal({ onClose, onConfirm }: NewMapModalProps) {
  const [title, setTitle] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    onConfirm(title.trim())
  }

  return (
    <div
      className="workshop-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-map-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="new-map-modal">
        <div className="new-map-modal__head">
          <p className="new-map-modal__kicker">MAP EDITOR</p>
          <h2 id="new-map-title">새 맵 만들기</h2>
        </div>
        <form className="new-map-modal__body" onSubmit={handleSubmit}>
          <label htmlFor="new-map-title-input">맵 제목</label>
          <input
            id="new-map-title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 100))}
            placeholder="나만의 맵 이름을 입력하세요"
            maxLength={100}
            autoFocus
          />

          <div className="new-map-modal__limits">
            <p>맵 제한 (검증 기준)</p>
            <p>
              • 지형 폴리곤 최대 <strong>{MAP_LIMITS.polygons}개</strong>, 정점 최대{' '}
              <strong>{MAP_LIMITS.verticesMax}개</strong>
            </p>
            <p>
              • 기믹 최대 <strong>{MAP_LIMITS.gimmicks}개</strong> ({ALLOWED_GIMMICK_TYPES.join(', ')})
            </p>
          </div>

          <div className="new-map-modal__actions">
            <button className="workshop-button workshop-button--ghost" type="button" onClick={onClose}>
              취소
            </button>
            <button
              className="workshop-button workshop-button--accent"
              type="submit"
              disabled={!title.trim()}
            >
              에디터 열기 →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
