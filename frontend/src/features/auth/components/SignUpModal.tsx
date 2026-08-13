import { useEffect, useState, type FormEvent } from 'react'
import type { SocialProvider } from './LoginPanel'
import { ApiError } from '../services/authApi'

type SignUpModalProps = {
  mode: 'regular' | 'social'
  provider?: SocialProvider
  onClose: () => void
  onCheckNickname: (nickname: string) => Promise<boolean>
  onComplete: (nickname: string, password: string) => Promise<void>
}

export function SignUpModal({ mode, provider, onClose, onCheckNickname, onComplete }: SignUpModalProps) {
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'duplicate' | 'error'>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const checkNickname = async () => {
    if (!nickname.trim()) return
    setStatus('checking')
    try {
      setStatus(await onCheckNickname(nickname.trim()) ? 'available' : 'duplicate')
    } catch {
      setStatus('error')
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mode === 'regular' && (password.length < 8 || password !== confirmPassword)) return
    setIsSubmitting(true)
    try {
      await onComplete(nickname.trim(), password)
    } catch (error) {
      // 사전 확인 이후에도 서버의 UNIQUE 제약이 최종 동시성 충돌을 막습니다.
      setStatus(error instanceof ApiError && error.status === 409 ? 'duplicate' : 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="signup-modal" role="dialog" aria-modal="true" aria-labelledby="signup-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
        <span className="modal-kicker">NEW PLAYER</span>
        <h2 id="signup-title">{mode === 'social' ? '닉네임을 정해 주세요' : '회원가입'}</h2>
        <p className="modal-description">
          {mode === 'social'
            ? `${provider} 인증이 완료되었습니다. 게임에서 사용할 닉네임만 설정하면 가입이 완료됩니다.`
            : '로그인에 사용할 닉네임과 비밀번호를 입력해 주세요.'}
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="signup-nickname">NICKNAME</label>
          <div className="nickname-row">
            <input id="signup-nickname" value={nickname} onChange={(event) => { setNickname(event.target.value); setStatus('idle') }} minLength={2} maxLength={12} pattern="[가-힣A-Za-z0-9_]+" title="한글, 영문, 숫자, 밑줄만 사용할 수 있습니다." placeholder="2~12자 닉네임" autoFocus required />
            <button type="button" onClick={checkNickname} disabled={!nickname.trim() || status === 'checking'}>{status === 'checking' ? '확인 중' : '중복 확인'}</button>
          </div>
          <p className={`field-message field-message--${status}`} aria-live="polite">
            {status === 'available' && '사용 가능한 닉네임입니다.'}
            {status === 'duplicate' && '이미 사용 중인 닉네임입니다.'}
            {status === 'error' && '중복 확인에 실패했습니다. 다시 시도해 주세요.'}
          </p>
          {mode === 'regular' && (
            <>
              <label htmlFor="signup-password">PASSWORD</label>
              <input id="signup-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} placeholder="8자 이상 입력하세요" autoComplete="new-password" required />
              <label htmlFor="signup-confirm-password">CONFIRM PASSWORD</label>
              <input id="signup-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} placeholder="비밀번호를 한번 더 입력하세요" autoComplete="new-password" required />
              {((password.length > 0 && password.length < 8) || confirmPassword.length > 0) && (
                <p className={`field-message field-message--${password.length < 8 || password !== confirmPassword ? 'error' : 'available'}`} aria-live="polite">
                  {password.length < 8
                    ? '비밀번호는 8자 이상이어야 합니다.'
                    : password === confirmPassword
                      ? '비밀번호가 일치합니다.'
                      : '비밀번호가 일치하지 않습니다.'}
                </p>
              )}
            </>
          )}
          <button
            className="modal-submit"
            type="submit"
            disabled={
              status !== 'available' ||
              isSubmitting ||
              (mode === 'regular' && (!password || password.length < 8 || !confirmPassword || password !== confirmPassword))
            }
          >
            {isSubmitting ? '처리 중...' : mode === 'social' ? '가입하고 시작하기' : '가입 완료'}
          </button>
        </form>
        <p className="modal-policy">닉네임은 다른 사용자와 중복될 수 없습니다.</p>
      </section>
    </div>
  )
}
