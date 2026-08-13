import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/authContext'
import { SettingsModal } from './SettingsModal'
import './ProfileMenu.css'

type ProfileMenuProps = {
  /** 트리거 버튼에 표시할 내용 (기본: "ME"). 아바타 이미지 등을 넘길 수 있다. */
  triggerContent?: React.ReactNode
  /** 트리거 버튼에 붙일 클래스 (호출부 스타일에 맞춤) */
  triggerClassName?: string
  triggerAriaLabel?: string
  /** 드롭다운 정렬 방향 */
  align?: 'left' | 'right'
}

export function ProfileMenu({
  triggerContent,
  triggerClassName,
  triggerAriaLabel = '프로필 메뉴',
  align = 'right',
}: ProfileMenuProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const { user, logout } = useAuth()
  const nickname = user?.nickname ?? '게스트'
  const avatarLabel = nickname.trim().slice(0, 1).toUpperCase() || 'ME'

  // 바깥 클릭 · Esc 로 닫기
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleLogout = async () => {
    setOpen(false)
    await logout().catch(() => undefined)
    navigate('/')
  }

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        type="button"
        className={triggerClassName ?? 'profile-menu__trigger'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerAriaLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {triggerContent ?? <span aria-hidden="true">{avatarLabel}</span>}
      </button>

      {open && (
        <div className={`profile-menu__dropdown profile-menu__dropdown--${align}`} role="menu">
          <p className="profile-menu__nickname">
            <b>{nickname}</b>님
          </p>
          {user?.role === 'ADMIN' && (
            <button
              type="button"
              className="profile-menu__item profile-menu__item--admin"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                navigate('/admin/logs')
              }}
              title="관리자 로그"
            >
              관리자 로그
            </button>
          )}
          <button
            type="button"
            className="profile-menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/mypage')
            }}
            title="마이페이지"
          >
            마이페이지
          </button>
          <button
            type="button"
            className="profile-menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setIsSettingsOpen(true)
            }}
            title="설정"
          >
            설정
          </button>
          <div className="profile-menu__divider" role="separator" />
          <button type="button" className="profile-menu__item profile-menu__item--danger" role="menuitem" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      )}

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  )
}
