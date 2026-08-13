import { useState } from 'react'
import type { FormEvent } from 'react'

type CreateRoomModalProps = {
  onClose: () => void
  /** 제출 시 호출. 실패하면 예외를 던져 모달을 유지한다. */
  onSubmit: (title: string, password: string | null) => Promise<void>
  /** 창작마당의 "이 맵으로 방 만들기"처럼 제목을 미리 채워야 할 때 쓴다. */
  defaultTitle?: string
  /** 미리 선택된 맵 이름. 넘기면 상단에 안내 태그를 보여 준다. */
  selectedMapLabel?: string
}

export function CreateRoomModal({
  onClose,
  onSubmit,
  defaultTitle = '',
  selectedMapLabel,
}: CreateRoomModalProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [isSecret, setIsSecret] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return setError('방 제목을 입력해 주세요.')
    if (isSecret && !password.trim()) return setError('비밀방 비밀번호를 입력해 주세요.')

    setError('')
    setIsSubmitting(true)
    try {
      await onSubmit(title.trim(), isSecret ? password : null)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '방을 만들지 못했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-room-title">
      <div className="signup-modal room-modal">
        <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
        {/* 어디서 연 모달인지에 따라 맵이 정해지는 방식이 다르다. 그 차이를 먼저 알려 준다. */}
        <span className="modal-kicker">{selectedMapLabel ? 'WORKSHOP ROOM' : 'NEW ROOM'}</span>
        <h2 id="create-room-title">방 만들기</h2>
        <p className="modal-description">
          {selectedMapLabel
            ? '창작마당 맵으로 방을 만듭니다. 이 방의 맵은 나중에 바꿀 수 없어요.'
            : '기본 방을 만듭니다. 맵은 방에 들어가서 공식 스테이지 중에 고를 수 있어요.'}
        </p>

        {selectedMapLabel && (
          <p className="room-modal__map-tag">
            <span aria-hidden="true">●</span> 선택된 창작마당 맵: <strong>{selectedMapLabel}</strong>
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="create-room-title-input">방 제목</label>
          <input
            id="create-room-title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 30))}
            placeholder="어떤 모험을 시작할까요?"
            maxLength={30}
            autoFocus
          />

          <label className="room-modal__toggle">
            <input type="checkbox" checked={isSecret} onChange={(event) => setIsSecret(event.target.checked)} />
            <span>🔒 비밀방으로 만들기</span>
          </label>

          {isSecret && (
            <>
              <label htmlFor="create-room-password">비밀번호</label>
              <input
                id="create-room-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="입장 시 필요한 비밀번호"
              />
            </>
          )}

          <p className={`field-message${error ? ' field-message--error' : ''}`}>{error || ' '}</p>

          <button className="modal-submit" type="submit" disabled={isSubmitting || !title.trim()}>
            {isSubmitting ? '만드는 중…' : '방 만들기'}
          </button>
        </form>
      </div>
    </div>
  )
}
