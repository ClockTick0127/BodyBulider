import { useState } from 'react'
import type { FormEvent } from 'react'

type JoinPasswordModalProps = {
  roomTitle: string
  onClose: () => void
  /**
   * 비밀번호 제출. 실패(RM003 등) 시 예외를 던지면 모달을 유지한 채
   * 메세지를 보여주고 다시 입력받는다.
   */
  onSubmit: (password: string) => Promise<void>
}

export function JoinPasswordModal({ roomTitle, onClose, onSubmit }: JoinPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password.trim()) return setError('비밀번호를 입력해 주세요.')

    setError('')
    setIsSubmitting(true)
    try {
      await onSubmit(password)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '입장하지 못했습니다.')
      setPassword('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="join-room-title">
      <div className="signup-modal room-modal">
        <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
        <span className="modal-kicker">🔒 PRIVATE ROOM</span>
        <h2 id="join-room-title">비밀번호 입력</h2>
        <p className="modal-description">
          <strong>{roomTitle}</strong> 방은 비밀방이에요. 입장하려면 비밀번호가 필요합니다.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="join-room-password">비밀번호</label>
          <input
            id="join-room-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호를 입력하세요"
            autoFocus
          />

          <p className={`field-message${error ? ' field-message--error' : ''}`}>{error || ' '}</p>

          <button className="modal-submit" type="submit" disabled={isSubmitting || !password.trim()}>
            {isSubmitting ? '입장 중…' : '입장하기'}
          </button>
        </form>
      </div>
    </div>
  )
}
