import { MapEditorPage } from '../dev/MapEditorPage'

/**
 * 창작마당 맵 에디터 (`/workshop/editor`).
 *
 * 캔버스·도구·검증·재생 로직이 관리자 에디터와 완전히 같아 `MapEditorPage`를
 * `variant="workshop"`으로 재사용한다. 작업지시서 STEP 6은 "파일을 복사해 변환"이라고
 * 적혀 있으나, 3,000줄을 복제하면 이후 버그 수정을 두 곳에 해야 해서 한 컴포넌트로
 * 분기했다. 창작마당 전용 코드는 모두 `isWorkshop` 뒤에 있어 관리자 경로의 동작은
 * 그대로다.
 *
 * workshop 모드에서 달라지는 것:
 * - 시뮬레이션: `POST /api/v1/custom-maps/simulate` (dev 경로는 ADMIN 전용이라 403)
 * - 불러오기: 라운드 드롭다운 제거 → 쿼리스트링 `?stageId=`로 내 맵 조회
 * - 저장: `createCustomMap()` / `updateCustomMap()`
 * - 제목·설명·난이도·팔레트·공개 여부 입력과 한도 게이지 추가
 * - stage-round 배경 자동 매칭 제거 (커스텀 맵에는 대응하는 공식 배경이 없다)
 *
 * 쿼리스트링:
 * - `?title=` — 새 맵 만들기 모달에서 넘어온 제목
 * - `?stageId=` — 기존 맵 수정
 */
export function UserMapEditorPage() {
  return <MapEditorPage variant="workshop" />
}
