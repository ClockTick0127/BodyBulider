import { NavLink } from 'react-router-dom'
import './TopNav.css'

/**
 * 최상위 네비 (모집 · 창작마당).
 *
 * 프로토타입의 헤더 IA를 따른다. 상단바가 화면마다 달라서(`AppHeader`의 `.page-topbar`,
 * 방 목록의 `.room-header`) **두 곳이 같은 컴포넌트를 쓰도록 분리**했다.
 * 한쪽에만 넣으면 정작 진입 경로인 방 목록에서 창작마당으로 갈 방법이 없어진다.
 *
 * 게임 중(`/game`)·방 안(`/rooms/:code`)에서는 이 컴포넌트를 쓰지 않는다.
 * 두 화면은 전용 헤더(`ingame-header`·`lobby-header`)가 따로 있고,
 * 플레이 도중 이탈을 유도하지 않기 위함이다.
 */
const NAV_ITEMS = [
  { to: '/rooms', en: 'LOBBY', ko: '모집' },
  { to: '/workshop', en: 'WORKSHOP', ko: '창작마당' },
] as const

export function TopNav() {
  return (
    <nav className="top-nav" aria-label="주요 메뉴">
      {NAV_ITEMS.map(({ to, en, ko }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `top-nav__item${isActive ? ' is-active' : ''}`}
        >
          <span className="top-nav__en">{en}</span>
          <span className="top-nav__ko">{ko}</span>
        </NavLink>
      ))}
    </nav>
  )
}
