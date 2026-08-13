import { Link } from 'react-router-dom'
import { ProfileMenu } from './ProfileMenu'
import { BgmToggleButton } from './BgmToggleButton'
import { TopNav } from './TopNav'
import { useBgm } from '../hooks/useBgm'
import bodyBuilderLogo from '../../assets/BodyBuilder_Horizontal.png'
import './AppHeader.css'

/**
 * 마이페이지·랭킹·창작마당 공통 상단바.
 *
 * 마이페이지/랭킹 전환은 서브바(PageHeaderWithBack)의 세그먼트 탭이 담당하므로
 * 상단바에는 링크를 두지 않는다. 뒤로가기 버튼도 서브바로 옮겼다.
 *
 * 중앙 네비는 방 목록(.room-header)과 공유하는 TopNav 컴포넌트다.
 */
export function AppHeader() {
  const { isBgmOn, toggleBgm } = useBgm('/sounds/Main_bgm.mp3')

  return (
    <header className="page-topbar">
      <div className="page-topbar__logo">
        <Link to="/rooms">
          <img src={bodyBuilderLogo} alt="BodyBuilder" className="page-topbar__logo-img" />
        </Link>
      </div>
      <TopNav />
      <div className="page-topbar__right">
        <BgmToggleButton isBgmOn={isBgmOn} onToggle={toggleBgm} />
        <ProfileMenu />
      </div>
    </header>
  )
}

