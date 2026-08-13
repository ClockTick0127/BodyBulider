import { useAuth } from '../../features/auth/context/authContext'

type ProfileCardProps = {
  rankLabel: string
  rank: number | null
  stages?: {
    stageId: number
    stageName: string
    totalParticipants: number
  }[]
  /**
   * 순위를 제공하는 API가 없어 값을 알 수 없을 때 true.
   * '기록 없음'(=기록이 없다)과 구분해 '--'로 표기한다.
   */
  rankUnavailable?: boolean
}

export function ProfileCard({
  rankLabel,
  rank,
  stages = [],
  rankUnavailable = false,
}: ProfileCardProps) {
  const { user } = useAuth()
  const nickname = user?.nickname ?? '게스트'

  const rankText = rankUnavailable
    ? '--'
    : rank == null
      ? '기록 없음'
      : `${rank.toLocaleString()}위`

  return (
    <aside className="profile-card" aria-label="내 랭킹 요약">
      <div className="profile-card__inner">
        <p className="profile-card__nickname">{nickname}님</p>
        <p className="profile-card__rank">
          {rankLabel}
          <b>{rankText}</b>
        </p>
        {!rankUnavailable && stages.length > 0 && (
          <div className="profile-card__stages" aria-label="최고 순위 달성 스테이지">
            {stages.length > 1 && (
              <p>{stages.length}개 스테이지에서 달성</p>
            )}
            <ul>
              {stages.map((stage) => (
                <li key={stage.stageId}>
                  <span>{stage.stageName}</span>
                  <small>전체 {stage.totalParticipants.toLocaleString()}명 중</small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  )
}
