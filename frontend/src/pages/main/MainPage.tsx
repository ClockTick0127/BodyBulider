import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LoginPanel, type SocialProvider } from '../../features/auth/components/LoginPanel'
import { SignUpModal } from '../../features/auth/components/SignUpModal'
import { authenticateSocial, checkNicknameAvailability, completeSocialSignUp, loginRegular, signUpRegular, type SocialAuthResult } from '../../features/auth/services/authApi'
import { useAuth } from '../../features/auth/context/authContext'
import { beginSocialAuthentication, consumeSocialCallback } from '../../features/auth/services/socialAuth'
import { ArrowIcon } from '../../shared/components/icons/ArrowIcon'

import { GameLogo } from './components/GameLogo'
import { ProfileMenu } from '../../shared/components/ProfileMenu'
import { BgmToggleButton } from '../../shared/components/BgmToggleButton'
import { useBgm } from '../../shared/hooks/useBgm'
import logoHorizontal from '../../assets/BodyBuilder_Horizontal.png'
import journeyHero from '../../assets/duck-journey-hero.png'

type SignUpState =
  | { mode: 'regular' }
  | { mode: 'social'; provider: SocialProvider }
  | null

export function MainPage() {
  const navigate = useNavigate()
  const startButtonPhysicsRef = useRef<HTMLSpanElement>(null)
  const { user, isSessionLoading, setAuthenticatedUser } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [signUp, setSignUp] = useState<SignUpState>(null)
  const { isBgmOn, toggleBgm } = useBgm('/sounds/Main_bgm.mp3')

  const finishAuthentication = useCallback((authenticatedUser: Parameters<typeof setAuthenticatedUser>[0]) => {
    setAuthenticatedUser(authenticatedUser)
  }, [setAuthenticatedUser])

  const applySocialResult = useCallback((result: SocialAuthResult, provider: SocialProvider) => {
    if (result.status === 'NICKNAME_REQUIRED') {
      setSignUp({ mode: 'social', provider })
      return
    }
    finishAuthentication(result.user)
    setNotice(`${result.user.nickname}님, 로그인되었습니다.`)
  }, [finishAuthentication])

  useEffect(() => {
    let callbackData
    try {
      callbackData = consumeSocialCallback()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '소셜 로그인에 실패했습니다.')
      return
    }
    if (!callbackData) return

    const { credential, provider } = callbackData
    setIsLoading(true)
    authenticateSocial(credential)
      .then((result) => applySocialResult(result, provider))
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : `${provider} 로그인에 실패했습니다.`))
      .finally(() => setIsLoading(false))
  }, [applySocialResult])

  const handleSocialLogin = async (provider: SocialProvider) => {
    setIsLoading(true)
    setNotice('')
    try {
      const credential = await beginSocialAuthentication(provider)
      if (!credential) return
      applySocialResult(await authenticateSocial(credential), provider)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${provider} 로그인에 실패했습니다.`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegularLogin = async (nickname: string, password: string) => {
    setIsLoading(true)
    try {
      const result = await loginRegular(nickname, password)
      finishAuthentication(result.user)
      setNotice(`${result.user.nickname}님, 로그인되었습니다.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '로그인에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignUpComplete = async (nickname: string, password: string) => {
    if (!signUp) return
    const result = signUp.mode === 'social'
      ? await completeSocialSignUp(nickname)
      : await signUpRegular(nickname, password)
    setSignUp(null)
    finishAuthentication(result.user)
    setNotice(`${result.user.nickname}님, 가입이 완료되었습니다!`)
  }

  const handleStart = () => {
    if (!user) {
      setNotice('게임을 시작하려면 먼저 로그인해 주세요.')
      document.querySelector<HTMLInputElement>('#login-nickname')?.focus()
      return
    }
    navigate('/rooms')
  }

  return (
    <main className="landing" style={{ '--journey-hero': `url(${journeyHero})` } as CSSProperties}>
      <div className="ambient ambient--one" /><div className="ambient ambient--two" /><div className="ambient ambient--three" /><div className="grid-pattern" />
      <header className="topbar">
        <Link className="mini-brand" to="/" aria-label="홈으로 이동">
          <img src={logoHorizontal} alt="Body Builder" className="mini-brand__logo" />
        </Link>
        <div className="topbar__account">
          <BgmToggleButton isBgmOn={isBgmOn} onToggle={toggleBgm} />
          {user && <ProfileMenu />}
        </div>
      </header>
      <section className="hero-section" aria-labelledby="main-title">
        <div className="intro">
          <span className="eyebrow"><span>✦</span> BUILD TOGETHER, PLAY TOGETHER</span>
          <GameLogo startButtonRef={startButtonPhysicsRef} />
          <p className="tagline">내가 발판이 되어줄게!</p>
          <p className="description">길을 잃은 아기 오리가 무사히 엄마 오리에게 갈 수 있도록<br />다리를 만들어주세요.</p>
        </div>
        {user ? (
          <div className="authenticated-column">
            <div className="login-panel authenticated-panel">
              <span className="panel-number">SESSION ACTIVE</span>
              <h2>{user.nickname}님 환영합니다</h2>
              <p>로그인 상태가 모든 페이지에 안전하게 공유되고 있습니다.</p>
            </div>
            <div style={{ marginTop: '40px', textAlign: 'center' }}>
              <span ref={startButtonPhysicsRef} className="start-button-physics">
                <button className="start-button" type="button" onClick={handleStart} disabled={isSessionLoading}><span>{isSessionLoading ? 'CHECKING...' : 'START'}</span><span className="start-button__arrow"><ArrowIcon /></span></button>
              </span>
              <p className="start-hint">PRESS TO ENTER THE LOBBY</p>
            </div>
          </div>
        ) : (
          <LoginPanel onLogin={handleRegularLogin} onSignUp={() => setSignUp({ mode: 'regular' })} onSocialLogin={handleSocialLogin} isLoading={isLoading} />
        )}
      </section>
      <section className="start-area">
        <p className={`notice ${notice ? 'is-visible' : ''}`} role="status">{notice || '\u00a0'}</p>
      </section>
      <footer><span>© 2026 SYNCUP</span><span>VER 1.0.0</span></footer>
      {signUp && <SignUpModal {...signUp} onClose={() => setSignUp(null)} onCheckNickname={async (nickname) => (await checkNicknameAvailability(nickname)).available} onComplete={handleSignUpComplete} />}
    </main>
  )
}
