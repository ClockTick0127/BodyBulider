import { useState, type FormEvent } from 'react'
import { ArrowIcon } from '../../../shared/components/icons/ArrowIcon'
import { GoogleIcon } from '../../../shared/components/icons/GoogleIcon'
import { KakaoIcon } from '../../../shared/components/icons/KakaoIcon'

export type SocialProvider = 'Google' | 'Kakao'

type LoginPanelProps = {
  onLogin: (nickname: string, password: string) => void
  onSignUp: () => void
  onSocialLogin: (provider: SocialProvider) => void
  isLoading?: boolean
}

export function LoginPanel({ onLogin, onSignUp, onSocialLogin, isLoading = false }: LoginPanelProps) {
  const [nickname, setNickname] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onLogin(nickname.trim(), String(form.get('password') ?? ''))
  }

  return (
    <div className="login-panel" id="login-panel">
      <div className="panel-heading">
        <div>
          <h2>WELCOME BACK</h2>
        </div>
        <span className="panel-symbol" aria-hidden="true">✦</span>
      </div>

      <form onSubmit={handleSubmit}>
        <label htmlFor="login-nickname">NICKNAME</label>
        <input id="login-nickname" name="nickname" type="text" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="닉네임을 입력하세요" autoComplete="username" required />
        <label htmlFor="password">PASSWORD</label>
        <input id="password" name="password" type="password" placeholder="비밀번호를 입력하세요" autoComplete="current-password" required />
        <div className="form-options">
          <label className="remember"><input type="checkbox" /> <span>로그인 유지</span></label>
          <button type="button" className="text-button">비밀번호 찾기</button>
        </div>
        <button type="submit" className="login-button" disabled={isLoading}>{isLoading ? 'CONNECTING...' : <>LOGIN <ArrowIcon /></>}</button>
      </form>

      <div className="divider"><span>OR CONTINUE WITH</span></div>
      <div className="social-buttons">
        <button type="button" className="social-button social-button--google" onClick={() => onSocialLogin('Google')} disabled={isLoading}>
          <span className="social-button__icon"><GoogleIcon /></span>
          <span>Google 계정으로 로그인</span>
        </button>
        <button type="button" className="social-button social-button--kakao" onClick={() => onSocialLogin('Kakao')} disabled={isLoading}>
          <span className="social-button__icon"><KakaoIcon /></span>
          <span>카카오 로그인</span>
        </button>
      </div>
      <p className="signup">처음이신가요? <button type="button" onClick={onSignUp}>회원가입</button></p>
    </div>
  )
}
