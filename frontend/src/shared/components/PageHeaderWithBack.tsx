import { Link, useLocation, useNavigate } from 'react-router-dom'
import './PageHeaderWithBack.css'

/**
 * 마이페이지·랭킹 공통 서브바.
 *
 * 좌측은 뒤로가기(상단바에서 이전), 우측은 두 화면을 오가는 세그먼트 탭이다.
 * 탭이 화면 제목 역할을 겸하므로 각 페이지에서 별도 제목을 두지 않는다.
 */
export function PageHeaderWithBack() {
  const navigate = useNavigate()
  const location = useLocation()
  const isMyPage = location.pathname.startsWith('/mypage')

  // 방 목록 화면(/rooms)으로 이동
  const handleBack = () => {
    navigate('/rooms')
  }

  return (
    <div className="page-sub-header">
      <button className="sub-header__back" type="button" onClick={handleBack} aria-label="나가기">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        <span>나가기</span>
      </button>

      <div className="sub-header__tabs" role="tablist" aria-label="마이페이지 및 랭킹 전환">
        <Link
          to="/mypage"
          className={`sub-header__tab${isMyPage ? ' is-active' : ''}`}
          role="tab"
          aria-selected={isMyPage}
        >
          마이 페이지
        </Link>
        <Link
          to="/ranking"
          className={`sub-header__tab${!isMyPage ? ' is-active' : ''}`}
          role="tab"
          aria-selected={!isMyPage}
        >
          랭킹
        </Link>
      </div>
    </div>
  )
}
