# CLAUDE.md — 웹캠 모션인식 협동 게임 (가제: 길을 잇는 게임)

이 문서는 Claude Code가 이 프로젝트에서 작업할 때 항상 참조해야 하는 컨텍스트다.
**나는 프론트엔드 담당자다.** 백엔드(Spring)·AI(모델 파인튜닝)는 다른 팀원이 맡는다.

## 프로젝트 개요

1~4명이 웹캠 앞에서 몸(팔·포즈)으로 화면 속 '길(다리)'을 만들고, 캐릭터(공)가
그 길을 따라 목적지에 도착하면 클리어하는 **협동 웹게임**.

- MediaPipe로 포즈(스켈레톤)를 인식하고, WebRTC로 참가자 영상·음성을 공유한다.
- 게임엔진(Unity 등) 없이 브라우저에서 실행되는 웹게임이다.
- 표현 방식: 촬영 **이미지가 아닌 스켈레톤 선(line)** 으로 길을 그린다. (확정)
- 컨셉: 엄마 닭을 찾아 떠나는 병아리에게 길을 이어주어 찾아가게 하는 협동 게임.
  (스테이지/맵 이름은 이 컨셉에 맞게 추후 변경 예정)

## 확정된 게임 규칙 (변경 금지 — 바꾸려면 팀 회의 필요)

- **인원**: 방 정원 최대 4명, 1~4명 플레이 가능. 맵은 항상 4인(4구역) 기준으로
  제작되며, 인원이 부족하면 나머지 인원이 남는 구역을 추가 담당한다. (혼자면 4구역 전부)
- **촬영 방식**: 순차 자동 촬영. 카메라 4개(4구역)가 표시되고, 시스템이 정한 시간에
  일정 간격(기본 5초)으로 1번→2번→3번→4번 슬롯이 자동 촬영된다.
  사용자가 촬영 타이밍을 직접 선택할 수 없다. 촬영 순서는 게임 시작 시 서버가 **랜덤 배정**한다.
- **비공개 규칙**: 전원 촬영 완료 전까지 다른 플레이어의 촬영 결과(스켈레톤 선)는 비공개.
  전 구역 촬영 완료 후 완성 맵을 일괄 공개한다.
- **캐릭터 이동**: 전원 촬영 완료 후 캐릭터(공)가 일괄 이동한다. ("공은 다 찍히면 가게끔")
- **스테이지 구조**: 하나의 스테이지 = 여러 세부 스테이지(라운드). 라운드 클리어 시
  간단한 연출만 하고 즉시 다음 라운드로 진행. 상세 결과는 스테이지 종료 후 **마지막에 일괄 정산**.
- **실패 처리**: 라운드 실패 시 게임 종료 → [다시하기(스테이지 처음부터)] 또는 [로비 나가기].
  **인게임 재시도(리겜)·되돌아가기 버튼은 없다.** 실패 리스크로 긴장감을 유지하는 설계.
- **기록/점수**: **클리어 시간 단일 승부.** 점수(pts)·별 등급 시스템은 폐지됐다.
  결과 화면에는 클리어 시간과 랭크 정도만 표시. (랭크 부여 기준안은 보류)
  - 기록 단위는 **스테이지 단위**다. 스테이지 클리어 시간 = 각 라운드 클리어 시간의 **합산**.
    라운드별로 개별 기록을 남기지 않는다.
- **랭킹**: 맵(스테이지)별 · **개인** 기록. 함께 플레이한 전원이 동일 기록을 개인 기록으로
  획득하며, 역대 최고 기록(최단 시간)만 랭킹에 등재/갱신된다.
  - 즉 팀 4명이 함께 클리어하면 4명 각자의 해당 스테이지 개인 기록에 같은 시간이 기록되고,
    랭킹 보드에는 개인별 최단 기록만 정렬되어 노출된다. (팀 단위 랭킹 아님)
- **맵 개방**: 전 스테이지 상시 개방(해금/이어하기 없음). 미클리어 스테이지는
  **블러 처리**로 지형·기믹 정보를 가린다.
- **클리어 조건**: 캐릭터가 목적지에 도착하면 클리어. (확정)

## 계정/인증 (확정)

- **OAuth 소셜 로그인: 구글, 카카오 2종.** 별도 로그인 페이지 없이 메인 화면 내 처리.
- **세션 기반 인증 (JWT 사용 안 함).** 서버가 세션 생성, 쿠키(Set-Cookie)로 유지.
  → 모든 API 요청에 `credentials: 'include'` (axios: `withCredentials: true`) 필수.
- 회원탈퇴는 soft delete: 닉네임을 '삭제된 이용자'로 표기, 기록은 보존.
- 유저 정보는 닉네임/랭킹/최고기록 3종만. **레벨 시스템 없음.**
- 방 입장 코드: 임의의 **영어 대문자 4글자**.

## 아키텍처 원칙 (가장 중요)

**서버 권위형(Server-Authoritative).** 프론트엔드는 판정·계산을 하지 않는다.

- 서버(Spring)가 최종 결정: 방/게임 상태, 촬영 순서, 길 연결 판정, 물리 시뮬레이션,
  클리어 시간, 랭킹.
- 프론트엔드의 역할: ① 입력 수집(웹캠 프레임 → MediaPipe → 관절 좌표) ② 서버 전송
  ③ 서버가 내려준 결과를 화면에 재생(애니메이션) ④ 실시간 연결 관리 ⑤ 모든 UI.
- **물리 계산을 프론트에서 구현하지 말 것.** 서버가 위치 시퀀스(키프레임)를 일괄로
  내려주면 requestAnimationFrame 루프로 보간하며 재생만 한다.
- 채널 분리: **영상·음성 = WebRTC** (4인 Mesh, 상대마다 RTCPeerConnection 1개,
  STUN/TURN 사용) / **게임 이벤트·스켈레톤 좌표 = Spring WebSocket(STOMP)**.
  스켈레톤 좌표는 WebRTC DataChannel이 아니라 인증된 WebSocket으로 보낸다.
- SDP/ICE 시그널링도 Spring WebSocket이 중계한다. 동시 Offer 충돌은 Perfect
  Negotiation 패턴으로 처리. 음소거는 재협상 없이 트랙 `enabled` 토글로만.

## 기술 스택

- **프론트엔드**: React + Vite, React Router, axios(withCredentials 기본),
  STOMP.js(WebSocket), MediaPipe Tasks Vision(Pose Landmarker), Canvas 2D
  - 현재 저장소는 fetch 기반(`credentials: 'include'`)으로 REST를 호출하고 있고,
    개발 중에는 **MSW**로 API를 목킹한다. (axios/STOMP 도입은 실연동 시 정리)
- **백엔드**: Spring Boot (세션 인증, 방/게임 상태, 길 판정, 2D 물리 시뮬레이션) — 타 팀원 담당
- **데이터**: Redis(실시간 상태), RDB(유저·스테이지·랭킹) — 타 팀원 담당
- MediaPipe는 기본 모델로 우선 연동하되, AI 담당자의 파인튜닝 모델로 교체 가능하도록
  **모델 경로를 설정값으로 분리**해둘 것.

## WebSocket 이벤트 (API 명세 기준 — 이름·페이로드는 백엔드와 최종 확인)

구독: 개인 큐 `/user/queue/games`, 방 전체 `/topic/rooms/{roomSessionId}`
송신: `/app/game/{gameSessionId}/rounds/{roundNo}/pose` (관절 좌표 제출)

주요 이벤트: `GAME_STARTED`(카메라 슬롯 배정·게임 시작) → `ROUND_STARTED`(맵 설정)
→ `CAPTURE_TURN_STARTED`(슬롯별 촬영 차례) → `POSE_SUBMISSION_RESULT`(개인 응답)
→ `BRIDGE_SLOT_COMPLETED`(다리 데이터) → `SIMULATION_STARTED` → `SIMULATION_READY`
(궤적 프레임 일괄) → `ROUND_CLEARED`/`ROUND_FAILED` → `GAME_RESULT` →
`ROOM_RETURNED_TO_LOBBY`(30초 대기 후 자동 로비 복귀)

좌표 제출 시 포함: 정규화(0~1) 관절 좌표, `submissionId`(멱등 처리), `mirrored` 플래그.
좌표계·미러링 기준·신뢰도 임계값은 5-3-1 규격 설계 때 백엔드와 문서로 합의한다.

## 화면 흐름

메인(로고+로그인, 로그인 후 START 노출) → 방 모집(공개방 목록·코드 입장·방 생성)
→ 로비(스테이지 선택·참가자/준비 상태·웹캠 뱃지·방장 시작) → 게임(4구역 순차 촬영
→ 캐릭터 이동) → 결과(최종 일괄 정산 → 로비/다시하기/다음) / 마이페이지(좌측에
맵별 최고기록 나열) / 랭킹(맵별 랭킹 보드)

## 코드 구조 (제안 — 초기 세팅 시 준수)

```
src/
  api/        # axios 인스턴스(withCredentials), REST 함수
  sockets/    # STOMP 클라이언트, 이벤트 구독/핸들러
  hooks/      # usePoseLandmarker, useWebcam, usePeerConnections 등
  pages/      # Main, Rooms, Lobby, Game, Result, MyPage, Ranking
  components/ # 공용 UI
  game/       # 캔버스 렌더링, 궤적 재생(보간), 카운트다운 등 게임 화면 로직
  stores/     # 전역 상태 (Zustand)
```

> 참고: 현재 저장소는 feature 단위 구조도 함께 쓰고 있다.
> `src/features/<도메인>/{components,services}`, 공용은 `src/shared/{api,components,utils}`,
> 화면은 `src/pages/<페이지>`. 위 제안 구조와 실제 구현이 다르면 실제 코드를 따른다.

- 세션 확인은 앱 진입 시 1회 호출 → 전역 상태 공유. 미인증 내부 경로 접근은 라우트 가드로 차단.
- getUserMedia 예외(권한 거부/장치 없음/점유 중)는 원인별 안내 UI로 처리하고,
  로컬 장치 연결 상태와 Peer 연결 상태를 **별도 상태**로 관리한다.
- 연결 장애: ICE `disconnected`는 즉시 퇴장 아님(복구 대기) → `failed` 시 ICE restart
  → 실패 시 PeerConnection 재생성. 스테이지 종료/결과/로비 복귀만으로는 WebRTC 연결을
  해제하지 않고, **방을 나갈 때만** close + track.stop + srcObject 해제.

## 미확정/보류 사항 — 임의로 구현하지 말고 팀 확인 후 진행

- 카메라 페이드아웃(7-4) 연출: 순차 촬영 확정으로 적용 방식 재검토 중 (삭제 예상 코멘트 있음)
- 캠 구역 드래그 배치(5-6): 선택기능, 미확정 기믹
- 방장 나가기(승계 vs 방 종료) 정책, 재접속 유예시간 값
- 랭크 부여 기준안, 촬영 간격 설정과 랭킹 공정성 규칙
- 완성 장면 스냅샷(7-11), AI 길 생성(7-12), 리플레이(9-3): 보류

## 일정 컨텍스트 (간트차트 기준, 배포 8/10)

7/20~21 로그인·메인·MediaPipe 연동 → 7/27~29 방 모집·로비 → 7/30~8/1 WebRTC 영상·음성
→ 8/3~5 순차 촬영·좌표 전송·궤적 재생 → 8/5~7 라운드 연출·결과 화면 → 8/8 마이페이지·선택 기능
→ 8/10 부하 테스트·배포. 선택기능(1-6, 4-4, 5-6, 7-9, 7-11, 9-3)은 필수가 밀리면 후순위.

## 작업 스타일

- 기능 단위는 기능명세서 v0.5의 ID(예: 6-2-1)를 커밋/브랜치에 명시한다.
- 확정 규칙과 어긋나는 구현 요청을 받으면 먼저 이 문서와의 충돌을 지적할 것.
- 시퀀스 다이어그램(기능.md)과 API 명세가 진실의 원천(source of truth)이다.
  이 문서와 다르면 그쪽을 확인하고 이 문서를 갱신한다.

---

## 프론트엔드 작업 로그

### 마이페이지 · 랭킹 구현 (2026-07-21)

담당(프론트) 화면 중 **마이페이지(`/mypage`)** 와 **랭킹(`/ranking`)** 을 기존
메인/회원가입 코드 스타일(App.css 팔레트, feature 단위 API, MSW 목킹)에 맞춰 구현했다.
빌드·린트 통과 및 브라우저 실동작(데이터 로딩·탭 전환·프로필 카드 갱신) 확인 완료.

**구현 내용**
- 마이페이지: 상단 AppHeader + 좌측 "최고 기록"(스테이지별 클리어 시간 목록,
  미클리어는 `--:--.--` 표기) + 우측 프로필 카드(닉네임·나의 최고 랭킹).
  RANKING 뱃지로 랭킹 페이지 이동.
- 랭킹: 상단 heading + 맵(스테이지) 탭. "전체보기"는 맵별 1위 요약 카드 + 바로가기,
  개별 맵 탭은 TOP N 보드(1~3위 노란 뱃지). 우측 프로필 카드에 해당 맵 내 랭킹 표시.

**와이어프레임 대비 확정 규칙에 맞춘 정정 (CLAUDE.md 지침대로 충돌 지적 후 반영)**
- `LV 5` 뱃지·`레벨` 필터 → 레벨 시스템 없음(확정) → 스테이지 코드 뱃지로 대체.
- `별 개수`·`고수 전용` 필터 → 클리어 시간 단일 승부(확정) → 맵별 탭으로 대체.
- `수집 아이템`·`글로벌 랭킹 10%` → 유저 정보 3종 제한(확정) → 맵별 최고 클리어 시간 +
  개인 순위로 대체.
- 라운드처럼 보이던 코드(`1-1`, `1-2`) → **스테이지 단위**(`01`~`04`)로 변경.
  기록은 스테이지 클리어 시간(라운드 합산)임을 마이페이지 캡션으로 명시.

**헤더 통일**
- 페이지별로 달랐던 타이틀 헤더를 제거하고, 로비/메인과 동일한 `mini-brand`
  (파란 마크 + `COLLABORATION`, 클릭 시 메인 `/`로 이동)로 좌상단을 통일.
- 우측에 마이페이지 / 랭킹 내비게이션(NavLink, 현재 페이지 active 강조) + 설정 아이콘(준비 중).

**생성/변경 파일**
- `src/pages/mypage/MyPage.tsx`, `src/pages/ranking/RankingPage.tsx`
- `src/features/records/services/recordsApi.ts` (기록·랭킹 REST 함수 + 응답 타입)
- `src/shared/api/request.ts` (공통 fetch 래퍼, `credentials: 'include'` / ApiError)
- `src/shared/components/AppHeader.tsx`, `src/shared/components/ProfileCard.tsx`
- `src/shared/components/icons/SettingsIcon.tsx`, `.../UserIcon.tsx`
  (UserIcon은 현재 미사용, 추후 재사용 대비 보존)
- `src/shared/utils/formatClearTime.ts` (`m:ss.cc` 포맷)
- `src/mocks/handlers.ts` (아래 3개 엔드포인트 목 핸들러 추가)
- `src/App.tsx` (`/mypage`, `/ranking` 라우트 추가), `src/App.css` (스타일 추가)
- `.claude/launch.json` (dev 서버 프리뷰용, port 5173)
- **삭제**: `src/pages/rooms/RoomListPage.tsx` 및 `/rooms` 라우트·CSS
  (병합 대상 저장소에 이미 `/rooms` 구현이 있어 충돌 방지 목적. 단 메인의
  START 버튼은 여전히 `navigate('/rooms')` 호출 → 병합 후 상대 구현과 연결됨.
  경로명이 다르면 MainPage.tsx의 navigate 대상을 맞춰야 함)

**더미 데이터 위치**
- 모든 목 데이터는 `src/mocks/handlers.ts` 상단 상수에 있다:
  `stages`(맵 목록), `rankingBoards`(맵별 개인 순위), `myRecords`(내 맵별 최고 기록).
- MSW는 개발 모드에서만 활성(`src/mocks/enableMocking.ts`, `browser.ts`).
  메모리 변수라 새로고침 시 초기값으로 리셋된다.

**프론트가 가정한 API 계약 (⚠ 백엔드 명세와 최종 확인 필요 — 확정 시 이 문서/타입 갱신)**
- `GET /api/users/me/records` →
  `{ totalStages, clearedStages, bestRank, records: [{ stage, bestTimeMs, rank }] }`
- `GET /api/rankings` →
  `{ items: [{ stage, topEntry, totalPlayers }], myBestRank }`
- `GET /api/rankings/stages/{stageId}` →
  `{ stage, entries: [{ rank, nickname, clearTimeMs }], myRank }`
- 공통 타입: `StageSummary { id, code, name }`,
  `RankingEntry { rank, nickname, clearTimeMs }`. 시간 단위는 ms.
- 실연동 전환: 화면은 `recordsApi.ts` 함수만 호출하므로 MSW 목킹만 끄고 응답 JSON
  형태를 맞추면 컴포넌트 코드 변경 없이 연동된다.

**남은 확인/후속 작업**
- 라우트 가드(미인증 내부 경로 차단)가 아직 프로젝트 전역에 없음 → 세션 확인 로직
  도입 시 `/mypage`, `/ranking`에도 함께 적용.
- 프로필 카드 닉네임은 현재 `sessionStorage`의 로그인 정보를 읽고, 비로그인 시 '게스트'.
- 랭킹 응답에 '팀 4명이 각각 별도 행으로 노출되는가?'는 백엔드와 확인 필요
  (확정 규칙상 개인 4행이 맞음. 현재 목 데이터도 개인 단위로 구성).
- 맵/스테이지 이름은 병아리·엄마 닭 컨셉으로 추후 교체 예정 (현재 값은 임시 placeholder).

### 방 로비 · 프로필 드롭다운 구현 (2026-07-21)

와이어프레임의 **방 로비** 화면을 신설하고(`/rooms/:code`), 로비(`/rooms`) 우상단
`ME` 버튼을 프로필 드롭다운으로 교체했다. 기존 스타일(App.css 팔레트·카드 그림자)에
맞춰 구현했고 빌드/린트 통과 및 브라우저 실동작 확인 완료.

**방 로비 (`/rooms/:code`)**
- 헤더: `로비` 타이틀 + 방 이름/방 코드 + 설정 아이콘 + 프로필 드롭다운.
  방 제목은 `/rooms`에서 라우트 state(`{ title }`)로 전달, 코드는 URL 파라미터.
- 맵 선택 캐러셀: 스테이지(01~04, handlers.ts와 동일 셋) 카드 + 좌우 화살표
  (scroll-snap). 카드별 `맵 선택`(미리보기 포커스) / `기록 보기` / `결정`(방장만).
  `결정된 맵` 뱃지 표시.
- 하단 CTA: 방장 → `게임 시작`(결정된 맵 없으면 비활성), 그 외 → `준비하기` 토글.
- 우측 참가자 패널: `N/4 ONLINE`, 플레이어 목록(방장 왕관·본인 뱃지·접속/오프라인·
  웹캠 뱃지), 빈 자리 슬롯, `나가기`(→ `/rooms`).

**와이어프레임 대비 확정 규칙에 맞춘 정정 (CLAUDE.md 지침대로 충돌 지적 후 반영)**
- `성과 확인` → **`기록 보기`**: 점수·별 등급 폐지·클리어 시간 단일 승부(확정)에 맞춰
  '성과(별/업적)'가 아니라 맵 최고 클리어 시간 + 내 순위를 노출하도록 구현.
- 방장만 맵 `결정`·`게임 시작` 가능(화면 흐름의 "방장 시작" 규칙). 참가자는 `준비` 토글.
- 참가자 패널에 `웹캠 뱃지`(화면 흐름의 로비 요소) 반영. 정원 4명 규칙 준수(빈 자리 슬롯).

**프로필 드롭다운 (`ProfileMenu`)**
- `/rooms` 우상단 `ME`(및 로비 아바타) 클릭 시 드롭다운: 닉네임(헤더, 비선택) →
  마이페이지 → 설정 → 구분선 → 로그아웃. 바깥 클릭·Esc로 닫힘, `role="menu"`.
- 로그아웃: 서버 세션 무효화 후 전역 인증 사용자 상태 정리
  (`POST /api/auth/logout`) 후 메인(`/`)으로 이동.

**생성/변경 파일**
- `src/pages/lobby/LobbyPage.tsx` (신규), `src/App.tsx`(`/rooms/:code` 라우트),
  `src/App.css`(`.lobby-*`, `.profile-menu__*` 스타일 추가).
- `src/shared/components/ProfileMenu.tsx`(신규, 공용),
  `AuthProvider`의 `/api/auth/session` 조회 결과를 프로필 및 로비에서 공통 사용.
- `src/pages/rooms/RoomListPage.tsx`(ME→ProfileMenu, 입장/생성 시 로비로 이동).
- `src/features/auth/services/authApi.ts`(best-effort `logout`),
  `src/mocks/handlers.ts`(`POST /api/auth/logout` 목 핸들러 204).

**남은 확인/후속 작업**
- 로비는 아직 실시간 연동 전 placeholder. 플레이어 목록·방장 여부·맵 확정 상태는
  STOMP `/topic/rooms/{roomSessionId}` 구독으로 교체 필요(코드에 TODO 표기).
- `게임 시작`은 현재 안내 문구만 노출 → 게임 화면(`/game`)·`GAME_STARTED` 연동 시 이동.
- 방 제목을 라우트 state로만 전달 중(새로고침·직접 URL 진입 시 기본값). 방 정보 API 도입 시
  코드로 조회하도록 보완.
- 로비 우상단 프로필 드롭다운의 `ME`/아바타 닉네임도 비로그인 시 '게스트'.

**후속 수정 (2026-07-21, 리뷰 반영)**
- 드롭다운 세로 깨짐 수정: `.room-profile button` 선택자가 드롭다운 메뉴 버튼(설정·로그아웃)까지
  34px 원형으로 강제해 글자가 세로로 넘쳤음. → `.room-profile .profile-menu > button`(트리거 한정)으로
  범위를 좁혀 해결. (게임 로비 드롭다운은 `.lobby-header__actions` 소속이라 영향 없었음.)
- `/rooms` 우상단 `ONLINE` 옆에 접속 인원수 표시(`room-profile__count`). 현재는 방 참여 인원 합계
  기준(목 데이터) → 실연동 시 접속자 수 API로 교체.
- 마이페이지·랭킹 좌상단: `a.mini-brand` → **뒤로가기 버튼**(`AppHeader`, `navigate(-1)`,
  히스토리 없으면 `/rooms` 폴백). 방 모집→마이페이지/랭킹 진입 시 방 모집으로, 게임 로비→진입 시
  게임 로비로 복귀. (`.back-button` 스타일 추가. `.page-topbar .mini-brand` CSS는 미사용으로 남음.)
- 로비 맵 선택 방식 변경: `맵 선택`·`결정` 버튼 삭제 → **맵 카드 클릭 시 즉시 결정**
  (카드에 `role="button"`/`tabIndex`/`aria-pressed`, Enter·Space 지원). `기록 보기`는 유지하되
  카드 클릭과 겹치지 않게 `stopPropagation`. 맵 결정은 방장만(확정 규칙). `previewId` 상태 및
  `.is-preview`/`.is-active`/`.lobby-map-btn--decide` CSS 제거.
- 변경 파일: `src/App.css`, `src/pages/rooms/RoomListPage.tsx`, `src/pages/lobby/LobbyPage.tsx`,
  `src/shared/components/AppHeader.tsx`.

### MVP 서버 연동 · 실시간(STOMP)·WebRTC 준비 (2026-07-24)

메인 `START` 버튼을 백엔드 Quick Start API에 연동하고, 방 로비의 참가자 목록을
STOMP 웹소켓으로 실시간 갱신하도록 구현했다. WebRTC 시그널링은 담당자 작업용
연결 지점(`onSignal` 패스스루)만 남겨두었다. 빌드/린트 통과, MSW + 로컬 STOMP
테스트 서버로 실동작 검증 완료.

**메인 START → Quick Start (HTTP)**
- `POST /api/v1/rooms/quick-start`: 대기 방 있으면 자동 참여, 없으면 새 방 생성 후 방장 배정.
  응답(`roomId·roomCode·slotId·host·participants`)을 라우트 state로 로비에 전달.
- `START` 클릭 시 `MATCHING...` 표시 후 `/rooms/{roomCode}`로 이동. `features/rooms/services/roomsApi.ts` 신규.

**STOMP 실시간 연동**
- `@stomp/stompjs` + `sockjs-client` 도입. `/topic/rooms/{roomId}` 구독.
- `roomSocket.ts`(연결·구독·재연결), `useRoomSocket.ts`(생명주기 훅) 신규.
- 본인이 보낸 메세지(`senderId === myUserId`) 필터링 후, room 이벤트(`PLAYER_JOINED`/`PLAYER_LEFT`)는
  `onRoomEvent`로, 시그널링(OFFER/ANSWER/CANDIDATE)은 `onSignal`로 분기. **수신 시 receiverId 필터는
  WebRTC 담당자가 처리해야 함.**
- 로비 참가자 목록을 이벤트로 실시간 갱신(입장 추가·퇴장 제거·방장 승계). 연결 상태 배지 표시.
- `vite.config.ts`에 `global: 'globalThis'`(sockjs-client 요구), `.env.example`에 `VITE_WS_BASE_URL` 추가.

**⚠️ 백엔드 직렬화 함정 — 반드시 준수**
- Lombok `boolean isHost`/`isSecret`은 `@JsonProperty` 재정의가 없으면 Jackson이 **`host`/`secret`**
  키로 직렬화한다. `isHost`/`isSecret`로 두면 방장/비밀방이 **항상 false로 잡힌다.**
  (실제로 이 버그를 두 번 겪음)
- **2026-07-27 변경**: FE-TASK-02(개발명세서)에 따라 프론트 타입을 `isHost`/`isSecret`으로
  전환했다. → 아래 "isSecret/isHost 규격 전환" 절의 **미해결 전제**를 반드시 먼저 확인할 것.

### UUID · API 표준(/api/v1) 정합성 (2026-07-24)

백엔드 D203 표준 전환에 맞춰 엔드포인트·식별자를 정합화했다.
- 식별자 UUID 문자열화: `ServiceUser.uuid`, `RoomParticipant.userId` 등 `number`→`string`.
  비교는 전부 `String(...)` 안전 비교로 통일(타입 혼용으로 `isMe`가 false 되는 것 방지).
- 엔드포인트 `/api/v1` 전환: `users/me/profile`(세션 확인), `auth/logout|login|signup|social`,
  `users/nickname/availability`, `users/me/records`, `rooms/*`.
- **`getSessionUser` 이중 언래핑 주의**: 공통 `request()`가 이미 `BaseResponse.data`를 벗겨 반환하므로
  `.data`를 또 읽으면 항상 `undefined` → 세션 복구 실패. 단일 언래핑으로 구현.
- `request()`의 인증 경로 판정에 `/api/v1/auth`·`/api/v1/users/me/profile` 추가(미반영 시 세션 확인
  401이 세션 만료 이벤트를 잘못 발생).
- STOMP 채널 `/sub/room/{id}` → `/topic/rooms/{id}`. (백엔드는 두 채널 모두 발행)

### 로비 새로고침 복구 (2026-07-24)

- `roomData` 상태 도입: 라우트 state가 없으면(F5·URL 직접 진입) `GET /api/v1/rooms/{roomCode}`로 복구,
  실패 시 `/rooms`로 이동. 조회 중 로딩 화면.
- 다른 방 코드로 이동 시 재조회: `/rooms/:code`는 같은 라우트라 언마운트되지 않으므로 코드 비교 필요.
- MSW 목 세션/방을 `sessionStorage`에 보존 → 실제 쿠키 세션처럼 F5 후에도 유지되어 복구 검증 가능.

### 대기방 목록 · 방 만들기 · 비밀방 입장 (2026-07-24, 브랜치 `fe/feat/rooms`)

- `GET /api/v1/rooms` 목록: 방 제목·🔒·`n/maxCapacity`·`방장: 닉네임`, 새로고침 버튼, 빈 목록 문구,
  정원 초과 비활성화. `RoomSummary` 타입.
- `CreateRoomModal`(제목 필수 + 비밀방 토글 + 비밀번호 → `POST /api/v1/rooms`),
  `JoinPasswordModal`(비밀방 클릭 시, 실패해도 유지) 신규.
- 입장 분기: 공개방 즉시 `POST /api/v1/rooms/join`, 비밀방은 모달 경유. 에러 코드 처리 —
  **RM003**(비번 불일치, 모달 유지) / **RM004**(정원 초과) / **RM001**(없는 방) → 경고 후 목록 새로고침.
- 이를 위해 공통 `ApiError`에 **`code` 필드 추가**(없으면 도메인 코드 분기 불가).
- 대기실 헤더에 `🔒 비밀방` 뱃지 + 방 제목(서버 `title` 우선) 표시.
- 명세와 다르게 반영: `isSecret`→`secret`(위 직렬화 함정), `RoomParticipant.isReady` 제외(백엔드
  DTO에 없음), 라우트는 기존 `/rooms/{roomCode}` 유지(새로고침 복구·가드 연결).

**남은 확인/후속 작업**
- WebRTC 시그널링(3번) 미구현 — `onSignal` 수신 + `clientRef.current.publish('/pub/signal/*')` 발신으로
  연결. receiverId 필터·Perfect Negotiation·로컬 스트림(getUserMedia) 필요.
- 백엔드 방 기능은 `fe/feat/rooms` 실연동 시점 기준으로 확인. 세션 프로필 응답에 `uuid` 포함 여부,
  `records`/`rankings` 경로 정합성은 백엔드와 재확인.
- 저장소 이관: 작업 거점을 `S15P12D203`(팀 저장소)로 옮김. 이후 작업은 이 저장소에서 진행.

### 스캔 보고서 개선 6종 (2026-07-27, 브랜치 `fe/refactor/fe-improvements`)

개발명세서(FE-TASK-01~06)에 따른 개선. `npm run lint`·`npm run build`·`npm run test` 통과,
브라우저 실동작(메인 렌더·로그인·방 목록 PUBLIC/PRIVATE 표기) 확인 완료.

**FE-TASK-01 라우트 코드 스플리팅** — `App.tsx`의 정적 import를 `React.lazy`로 전환하고
`<Suspense fallback={<LoadingSpinner />}>` 적용. 결과: `LobbyPage`(63kB)·`GamePageMvp`(147kB)·
`stomp.umd`(23kB)가 초기 번들에서 분리되어 필요 시점에 로드된다.
- 이 저장소의 페이지는 모두 **named export**라 `lazy(() => import(...).then(m => ({ default: m.X })))`
  매핑이 필요하다. (명세서 샘플은 default export 전제라 그대로 쓰면 깨진다)
- `BrowserRouter`는 `main.tsx`에 있으므로 `App.tsx`에 중복 추가하지 않았다.
- 라우트 경로는 기존 구현 유지(`/rooms/:code`, `/game`). 명세서의 `/lobby/:roomCode`,
  `/game/:roomId`를 그대로 쓰면 기존 내비게이션이 전부 끊긴다.
- `LoadingSpinner` 신규(`shared/components/`, prefers-reduced-motion 대응).

**FE-TASK-02 `isSecret`/`isHost` 전환 — ⚠️ 백엔드 선행 작업 필요 (미해결)**
- 프론트 전 계층을 `secret`→`isSecret`, `host`→`isHost`로 변경:
  `roomsApi.ts` 타입, `LobbyPage.tsx`, `RoomListPage.tsx`,
  목 계층(`mocks/types.ts`, `data/rooms.ts`, `factories/room.ts`,
  `handlers/rooms.handlers.ts`, `stores/rooms.store.ts`).
- **전제 조건(아직 충족되지 않음)**: 작업 시점의 백엔드 코드를 확인한 결과
  `QuickStartResponseDto`·`RoomSummaryDto`·`RoomParticipantDto`에는 `@JsonProperty`가 **없다.**
  (`@JsonProperty("isSecret")`은 Redis 내부 모델 `RoomSession.java`에만 존재하며, 이는 API 응답과 무관)
  전역 `PropertyNamingStrategy` 설정도 없다. 즉 현재 서버는 여전히 **`secret`/`host`로 직렬화**한다.
- 따라서 **백엔드 DTO 3종에 `@JsonProperty("isSecret")`/`@JsonProperty("isHost")`가 추가·배포되기
  전까지 실서버 연동 시 방장 권한과 비밀방 표시가 깨진다.** (MSW 목 환경에서는 정상 동작)
- 백엔드 담당자와 반드시 배포 순서를 맞출 것. 되돌리려면 이 커밋의 `isSecret`/`isHost`를
  `secret`/`host`로 되돌리면 된다.

**FE-TASK-03 ErrorBoundary** — `shared/components/ErrorBoundary.tsx` 신규, `main.tsx` 최상위에 적용.
렌더링 예외로 화면이 백지가 되는 것을 막고 새로고침 UI 제공. `verbatimModuleSyntax` 때문에
`ReactNode`·`ErrorInfo`는 `import type`으로 분리해야 한다.
(주의: 이벤트 핸들러·Promise rejection은 ErrorBoundary가 잡지 못한다)

**FE-TASK-04 explicit any 제거** — `LobbyPage`의 `signalHandlerRef`를
`useRef<((msg: SignalMessage) => void) | undefined>`로 교체(`roomSocket`의 기존 타입 재사용).

**FE-TASK-05 Path alias `@/`** — `vite.config.ts` + `tsconfig.app.json`.
- 이 저장소는 `package.json`에 `"type": "module"`이라 config가 ESM이다. **명세서의
  `path.resolve(__dirname, ...)`는 ESM에 `__dirname`이 없어 쓸 수 없다.**
  → `fileURLToPath(new URL('./src', import.meta.url))` 사용.
- TypeScript 6부터 `baseUrl`이 deprecated라 빌드가 실패한다(TS5101).
  → `baseUrl` 없이 `paths: { "@/*": ["./src/*"] }`만 선언(tsconfig 위치 기준 해석).
- 기존 상대경로 import는 그대로 두었다. 신규 코드부터 `@/` 사용 권장.

**FE-TASK-06 Vitest + MSW** — `vitest`·`jsdom` 설치, `test`/`test:watch` 스크립트,
`vitest.config.ts`, `src/mocks/setupTests.ts`(MSW `setupServer`) 신규.
- `vitest.config.ts`가 있으면 `vite.config.ts`는 자동 적용되지 않는다 → `mergeConfig`로 상속해
  react 플러그인·`@` alias 중복 선언을 피했다.
- 테스트는 `browser.ts`(setupWorker)와 **동일한 핸들러**를 공유한다.
- 스모크 테스트 2종 추가: `formatClearTime.test.ts`(순수 함수),
  `rooms.handlers.test.ts`(MSW 가로채기 확인 — 세션 없으면 401 AU001).

**남은 확인/후속 작업**
- (최우선) 백엔드 DTO `@JsonProperty` 적용 여부 확인 → 미적용 시 FE-TASK-02 되돌리기.
- MSW 목 방 정보는 `sessionStorage`에 저장된다. 이번 키 변경(`secret`→`isSecret`) 때문에
  **이전 세션 데이터가 남아 있으면 방이 공개방으로 보인다.** 테스트 전 sessionStorage 비울 것.
- 컴포넌트 렌더링 테스트는 아직 없다(`@testing-library/react` 미설치). 필요 시 추가.
  → 아래 "랭킹·마이페이지 기록 기능" 작업에서 도입 완료.

### 랭킹 · 마이페이지 기록 기능 (2026-07-27, 브랜치 `fe/feat/records-ranking`)

개발명세서(FE-RANK-01~05) 기준. **프론트엔드 범위만** 구현했고 백엔드 기록 저장·DB·API
구현은 포함하지 않는다. `lint`·`test`(5파일 30테스트)·`build` 통과, 브라우저 실동작 확인 완료.

**FE-RANK-01 API 타입 · MSW 목업**
- `recordsApi.ts`에 `getMyStageRecords(stageId)` / `getMyRecordRounds(recordId)` 및
  `MyStageHistoryResult` · `MyRecordRoundsResult` 타입 추가.
- **랭킹 경로 정정**: `/api/rankings` → `/api/v1/rankings`,
  `/api/rankings/stages/{id}` → `/api/v1/rankings/stages/{id}`. (기존 코드가 v1 표준에서 누락돼 있었음)
- `mocks/data/game.ts`에 `myClearHistory`(스테이지별 클리어 이력 + 라운드 시간) 추가.
  **시간의 진실은 이력 한 곳**이며, `myRecords`는 순위만 들고 있고 최고기록은
  `bestTimeOfStage()`로 계산한다. (중복 관리로 값이 어긋나는 것을 막기 위함)
- 라운드 시간의 합 = 총 클리어 시간이 되도록 목 데이터를 맞춰 두었다(테스트로 검증).
- 목 404는 공통 `apiError()` 규격(`code`/`status`/`message`)으로 통일.

**FE-RANK-02 랭킹 화면**
- 요약/보드의 로딩·오류 상태를 **분리**했다. 기존에는 `error` 하나를 공유해
  한 번 실패하면 탭을 바꿔도 오류 문구가 남았다.
- 탭 전환 시 보드 상태를 초기화하고, 각 오류에 `다시 시도` 버튼을 제공한다.
- 빈 목록·기록 없는 스테이지 안내 문구 유지.

**FE-RANK-03·04 마이페이지 3단계 화면**
- `최고 기록 목록 → 스테이지 클리어 이력 → 라운드 상세`를 `View` 판별 유니온으로 관리
  (`{ step: 'list' | 'stage' | 'record' }`). 각 단계에 뒤로가기 버튼 제공.
- 기록이 있는 스테이지 행만 `<button>`으로 활성화하고, 미클리어는 `disabled` + 안내.
  → 미클리어 스테이지는 상세 조회 요청을 아예 보내지 않는다.
- 이력은 최근 클리어순, 각 행에 클리어 일시 + 총 클리어 시간. 라운드 상세는 라운드별 시간.
- 날짜 표기용 `shared/utils/formatClearedAt.ts` 신규(Intl, ISO 8601 입력).

**FE-RANK-05 상태 처리 · 테스트**
- `@testing-library/react` · `user-event` · `jest-dom` 도입, `setupTests.ts`에 jest-dom 매처와
  `cleanup()` · `sessionStorage.clear()` 추가(테스트 간 목 세션 누수 방지).
- `src/test/renderWithProviders.tsx` 신규 — 페이지가 `MemoryRouter`(AppHeader)와
  `AuthProvider`(ProfileCard의 `useAuth`)를 요구하므로 함께 감싼다.
- 테스트: `formatClearTime`(경계값 7종), `recordsApi`(정렬·null·404 계약 11종),
  `RankingPage`(탭 전환·바로가기·빈 목록·오류 6종), `MyPage`(3단계 이동·뒤로가기·오류 6종).

**⚠️ 백엔드 협업 확인 필요 (아직 미확정)**
`recordsApi.ts`의 응답 타입은 **프론트가 가정한 계약**이다. 백엔드 구현 완료 시 대조할 것 —
확정 요청 경로, 응답 필드명/자료형, 시간 단위(ms)·날짜 형식(ISO 8601),
순위 산정·동점 처리 기준, 페이지네이션 적용 여부, 오류 응답 규격/상태 코드.
목업은 이 타입과 동일한 형태를 반환하므로 실연동 시 목킹만 끄면 된다.

**남은 확인/후속 작업**
- 백엔드 기록 저장(게임 완료 시점) 및 랭킹·기록 조회 API는 백엔드 담당자 작업.
- 랭킹 목록이 길어질 경우의 페이지네이션 정책 미정 — 현재는 전체를 한 번에 렌더링한다.
- 동점 처리는 목업에서 "먼저 기록한 사용자 우선"으로 가정했다. 백엔드 기준과 대조 필요.

> ⚠️ 위 절의 API 계약은 **2026-07-27 API 명세서 4종 수령으로 상당 부분 폐기**되었다.
> 최신 규격은 아래 "스테이지·랭킹 API 명세 반영" 절을 따를 것.

### 스테이지·랭킹 API 명세 반영 (2026-07-27, 브랜치 `fe/change/stages-ranking-api`)

백엔드 API 명세서 4종(`GET /api/v1/stages`, `/api/v1/stages/{id}`,
`/api/v1/stages/{id}/rankings?limit=`, `/api/v1/users/me/records`) 기준으로 연동 규격을 맞췄다.
`lint`·`test`(6파일 39테스트)·`build` 통과, 브라우저 실동작 및 네트워크 경로 확인 완료.

**snake_case ↔ camelCase 경계 규칙 (신규 · 이후 작업도 준수)**
- 서버는 snake_case(`stage_id`, `stage_clear_time_ms`, `thumbnail_url`, `created_at`)로 응답한다.
- **변환은 API 모듈(`stagesApi.ts` / `recordsApi.ts`)에서만** 하고, 컴포넌트는 camelCase만 본다.
- 목 데이터(`mocks/data/game.ts`)도 실제 API와 같은 snake_case로 두어, 목업이 변환 누락을
  가려 주지 않도록 했다. (테스트로 snake_case 키가 새어 나오지 않는지 검증)

**FE-STAGE-01·02 스테이지 API 도입**
- `features/stages/services/stagesApi.ts` 신규: `getStages()` / `getStageDetail(stageId)`,
  `toStageCode(stageId)`(목록 API에 code가 없어 `String(id).padStart(2,'0')`로 생성).
- `mocks/handlers/stages.handlers.ts` 신규. 목록 응답에는 rounds를 포함하지 않는다.
- **로비의 하드코딩 `STAGES` 상수 제거** → `GET /api/v1/stages` 연동.
  `name`·`difficulty`(상/중/하 배지)·`description`·`thumbnailUrl`을 카드에 연결하고,
  로딩·오류·빈 목록 상태를 추가했다.
- API가 제공하지 않아 **로비 카드에서 뺀 것**: `subtitle`, 맵별 `bestTimeMs`/`myRank`
  (→ `기록 보기` 버튼과 관련 CSS 삭제. 내 기록은 마이페이지에서 확인).
- ⚠️ **상세 조회 명세 불일치**: 필드 표는 `rounds_id`, 예시 JSON은 `round_id`다.
  확정 전까지 `round_id ?? rounds_id` 양쪽을 수용하도록 해 두었으니, 확정되면 하나만 남길 것.

**FE-RANK-01 랭킹 API 규격 변경**
- 경로: `/api/v1/rankings/stages/{id}` → **`/api/v1/stages/{id}/rankings?limit=`**
- 응답: 래퍼 객체 → **순위 배열**. `clearTimeMs` → `stage_clear_time_ms`,
  `uuid`·`created_at` 추가.
- **전체보기 전용 API가 없다.** `getStages()` 후 각 스테이지에 `limit=1`을 병렬 호출해 조합한다.
  (스테이지 수만큼 요청이 나가므로, 스테이지가 많아지면 전용 API를 요청할 것)
- `myRank`·`totalPlayers`가 응답에 없어 **참가자 수 표기를 제거**했다.

**FE-RECORD-01 내 최고기록 규격 변경**
- 응답이 `{ records, totalStages, clearedStages, bestRank }` → **최고기록 배열**로 바뀌었다.
- 클리어한 스테이지만 내려오므로, **미클리어 포함 전체 표시는 `getStages()`와 조합**한다.
- 개인 순위가 사라져 `개인 N위` 표기를 **달성 일시(`created_at`)로 대체**했다.
- `ProfileCard`에 `rankUnavailable` prop 추가 — 순위 API가 없어 값을 모르는 상태를
  `--`로 표기한다. 기록이 없다는 뜻의 `기록 없음`과 구분하기 위함.

**FE-API-01 명세 미제공 API 분리**
- `getMyStageRecords` / `getMyRecordRounds`(마이페이지 이력·라운드 상세)는 **PDF 명세가 없다.**
  실제 백엔드와 연동된 적이 없으며 MSW 목업으로만 동작한다.
  `recordsApi.ts`·목 핸들러·컴포넌트에 경고 주석을 달아 실연동 대상과 분리했다.
- 백엔드에 요청할 명세: ① 스테이지별 내 전체 클리어 이력 ② 특정 기록의 라운드별 기록.
  확정 시 경로·필드명(`recordId`/`roundNo`/`stage_clear_time_ms`/`created_at`)에 맞춰
  타입·목업·UI·테스트를 함께 수정해야 한다.

**남은 확인/후속 작업**
- (최우선) 스테이지 상세의 `round_id` vs `rounds_id` 확정.
- 마이페이지 이력·라운드 상세 API 명세 요청.
- 전체보기 N+1 호출을 대체할 요약 API 필요 여부 협의.
- 랭킹 `limit` 기본값·페이지네이션 정책, 동점 처리 기준(목업은 "먼저 기록한 사용자 우선") 확인.

### 마이페이지·랭킹 UI 개선 (2026-07-29, 브랜치 `fe/feat/mypage-ranking-ui`)

Jira S15P12D203-67 기반 UI 개선(FE-RANK-01~05). `lint`·`test`(8파일 55테스트)·`build` 통과,
브라우저 실동작(데스크톱·모바일 375px) 확인 완료.

**상단바 / 서브바 구조 변경**
- `AppHeader`: 마이페이지·랭킹 `NavLink` 제거, 뒤로가기 버튼 제거, 좌측에 `BodyBuilder` 로고 추가.
  스타일을 `AppHeader.css`로 분리했다(기존에는 `records.css`에 있었음).
- `PageHeaderWithBack` 신규: 상단바 아래 서브바. 좌측 `‹ 로비로`, 우측 `[마이 페이지 | 랭킹]`
  세그먼트 탭(Link 기반, `role="tab"`). **이 탭이 화면 제목을 겸하므로 두 페이지의
  `record-heading` 제목을 제거**했다.
- 마이페이지 카드의 노란 `RANKING` 배지 삭제(서브바 탭으로 대체).

**역대 기록 모달 (3단계 인라인 → 모달 + Slide-in)**
- `features/records/components/StageRecordModal.tsx` 신규. 기존 `StageHistoryCard`·
  `RecordRoundsCard` 인라인 교체 방식을 제거하고, 스테이지 클릭 시 모달을 띄운다.
- 좌측 날짜별 이력 → 항목 선택 시 우측 패널이 `.is-open`으로 슬라이드(`transform: translateX`).
- 닫기: X 버튼 / ESC / 백드롭 클릭(`onMouseDown` + `target === currentTarget`으로
  내부 드래그 종료 시 닫히지 않게 함).
- **접근성**: 닫힌 패널은 화면 밖에 있을 뿐 DOM에 남으므로, 내부 버튼으로 탭 이동되지 않도록
  **패널 내용을 열렸을 때만 렌더링**한다. (`aria-hidden` 요소 안에 포커스 가능 요소를 두지 않기 위함)
- 768px 이하에서는 우측 패널이 전체를 덮고 `‹ 날짜 목록` 버튼으로 복귀한다.
- 명세서 CSS는 다크 팔레트(`#1e1e24`)였으나 이 앱은 라이트 테마라 **색만 프로젝트 팔레트로
  치환**하고 클래스명·구조·애니메이션 규격은 그대로 따랐다.

**데이터 계층**
- `MyStageHistoryResult`를 부록 규격 `{ stageId, bestTimeMs, entries }`로 변경
  (기존 중첩 `stage` 객체 제거). 스테이지명은 응답에 없으므로 목록에서 받은 값을 모달에 넘긴다.
- 목 핸들러도 동일 형태로 갱신.

**⚠️ 명세서와 실제 코드가 달랐던 점**
- FE-RANK-01의 배경("로비·방 목록·인게임 상단바에도 메뉴버튼 노출")은 **사실과 다르다.**
  `AppHeader`는 `/mypage`·`/ranking`에서만 쓰이고, 로비·방 목록·인게임은 각각
  `lobby-header`·`room-header`·`ingame-header`를 쓴다. 변경 자체는 유효하여 그대로 수행했다.
- **부록 3번의 랭킹 API 경로는 확정 명세와 충돌한다.** 부록은 `/api/v1/rankings`,
  `/api/v1/rankings/stages/{stageId}`로 적혀 있으나, 앞선 API 명세서(PDF) 기준으로
  이미 `/api/v1/stages/{stageId}/rankings?limit=`으로 구현·병합되었다.
  **프론트 경로는 되돌리지 않았다.** 백엔드와 어느 쪽이 최종인지 확인 필요.

**남은 확인/후속 작업**
- 부록 3번 랭킹 API 경로 확정(위 충돌).
- 부록 1·2번(이력·라운드 상세) 실제 구현 여부 — 현재도 MSW 목업 전용이다.
- 로컬 `.env`가 `VITE_ENABLE_MSW=false`(실백엔드 연동)로 바뀌어 있다. 목업으로 UI를 보려면
  `VITE_ENABLE_MSW=true npm run dev`로 실행할 것.


### 인게임 캐릭터 스프라이트 (2026-07-31, 브랜치 `fe/feat/character-sprite`)

개발명세서 `docs/개발명세서_FE_캐릭터스프라이트.md` **rev.2** (`FE-CHAR-02`~`07`) 기준.
`.game-ball` 의 🐥 이모지를 아기 오리 스프라이트 애니메이션 5종으로 교체했다.
`lint`·`test`(16파일 115테스트)·`build` 통과.

**rev.2 에서 바뀐 설계 (rev.1 구현을 되돌린 부분)**
- **백엔드 접지 플래그를 쓰지 않는다.** `FE-CHAR-01`(프로토콜 확장)은 삭제되었고
  `gameProtocol.ts` 는 손대지 않는다.
- 매 프레임 즉석 판정 → **재생 전 타임라인 일괄 산출**(`buildActionTimeline`).
  `SIMULATION_RESULT` 가 궤적 전체를 한 번에 주므로 앞뒤를 다 보고 판정할 수 있고,
  그래야 "일정 시간 이상 지속됐는가"(지속시간 필터)를 볼 수 있다.

**낙하 판정 — `vy` 절대값을 쓰면 안 된다**
- 걷기 모터가 경사 탄젠트 방향으로 속도를 밀어넣어 45° 경사 보행 시 `vy ≈ 134` 가 나온다.
  구분되는 신호는 크기가 아니라 **프레임당 변화량**이다.
- 지형 요철·튕김으로 프레임 단위 깜빡임이 생기므로 **최소 지속시간 필터**를 넣었다.
  (공중 150ms 미만 → 지상 / 지상 100ms 미만 → 공중. 공중을 먼저 정리한다)

> ⚠️ **명세서 §5.3 공식에 오류가 있어 고쳤다.**
> `airborneEnter = 720 × intervalSec / mapWidth × 0.5` 는 1000스케일 전제라
> mock(10스케일)에서 임계값이 **100배**가 되어 낙하를 영영 못 잡는다.
> 정규화 `dvy` 는 두 스케일 모두 0.036 이므로 **정규화된 중력(0.72)은 스케일 무관 상수**여야 한다.
> → `GRAVITY_NORMALIZED * intervalSec * 0.5`. 회귀 테스트로 고정해 두었다.

**FE-CHAR-02 시트 빌드** — `frontend/scripts/build_character_sprites.mjs`
- ⚠️ 명세서는 Python+Pillow 를 지정했으나 작업 PC 에 Python 이 없어 **Node 로 구현**했다.
  이 저장소가 JS/TS 툴체인이라 오히려 일관적이다. (`pngjs` devDependency 1개 추가)
- **원화 8폴더 40장을 직접 정렬한다.** `_정렬결과(aligned)`·`_신규아트_검수` 는 원화가
  아니므로 읽지 않는다. (그 폴더의 landing 은 원화에 없는 7·8번이 섞인 구버전이었다)
- 정렬 모드 2종 — `ground`(bbox 하단 → y=216) / `air`(bbox 중심 → y=128).
  **공중 상태를 접지선 기준으로 정렬하면 `float` 이 캔버스 밖으로 잘린다.**
  가로는 두 모드 공통으로 알파 **질량중심** → x=128. (bbox 중심을 쓰면 다리를 뻗은
  프레임에서 몸통이 좌우로 흔들린다)
- 캔버스를 벗어나면 조용히 잘리지 않도록 **에러로 중단**한다.
- 재생 순서를 시트에 굽는다. CSS `steps()` 는 핑퐁을 표현 못 하므로 `idle`·`fall` 은
  프레임을 복제해 10프레임으로 만든다.
- 산출물: `src/assets/character/duck_*.png` + `manifest.json` + `preview.html`.
  QA 어니언 스킨은 재생성 가능한 검수용이라 `.gitignore` 처리했다.
- 실행: `node scripts/build_character_sprites.mjs [--art <원화폴더>]`

**FE-CHAR-04 컴포넌트/CSS** — `SpriteCharacter.tsx` · `.css` · `characterSheets.ts`
- 프레임 수·fps·loop 는 `characterSheets.ts` **한 곳**에만 둔다. CSS 에 숫자를 복제하지 않는다.
  `characterSheets.test.ts` 가 `manifest.json` 과 대조해 어긋남을 막는다.
- **루프와 1회 재생은 공식이 다르다.** 루프는 `-(N)×폭` + `steps(N)`,
  1회는 `-(N-1)×폭` + `steps(N, jump-none)`. 섞으면 빈 칸에 멈춘다.
- 앵커도 2종이다. 지상은 접지선(84.375%), 공중(`fall`·`float`)은 몸통 중심(50%).
  미러링은 **안쪽 요소**에 걸어 바깥 `translate` 를 덮어쓰지 않게 한다.
- 정면 원화(`idle`·`landing`·`float`)는 미러링 금지 — 반전 시 광원이 뒤집힌다.

**FE-CHAR-05 GamePage 연결**
- 타임라인은 state 가 아니라 **`useMemo` 파생값**으로 계산한다. `mapScale` 이 수신
  핸들러보다 뒤에 선언돼 있어 순서 문제가 생기고, state 로 들면 라운드마다 초기화를
  빠뜨릴 여지가 있다. (명세서 §7 도 이 방식을 권한다)
- 재생 rAF 루프에서 `setPlayIndex(frameIndex)` 를 **반드시** 갱신한다. 빠뜨리면
  캐릭터가 첫 동작으로 고정된다.
- `float` 은 `phase === 'FINISHED' && result === false` 로 판정한다. `result` 는
  수신 즉시 세팅되므로 `phase` 를 함께 보지 않으면 궤적 전체가 `float` 으로 재생된다.
- `.game-ball` 클래스를 함께 부여했다. 맵별 z-index 오버라이드가 이 셀렉터를 쓴다.

**FE-CHAR-06 mock** — 접지 보행·계단 낙하·**경사면 보행**이 번갈아 나오도록 실제로 적분한다.
- 예전 mock 은 vx·vy 가 상수라 프레임당 변화량이 늘 0이었고 `fall`·`landing` 을
  한 번도 볼 수 없었다.
- 중력도 같은 스케일로 환산한다: `720 × (10/1000) = 7.2`.
- 실측 결과 `idle → move → fall → landing → move → fall → landing → move` 로 재생되고,
  경사면 구간은 `|vy|` 최대 0.80 이지만 `|dvy| = 0` 이라 `move` 로 판정된다.
  **이 구간이 "vy 절대값 판정 금지" 회귀를 상시 검증한다.**
- **4번 스테이지를 고르면 실패 시나리오**(추락 → `float`)가 재생된다.

**남은 확인/후속 작업**
- **인게임 실제 재생 육안 확인이 남았다.** 이 환경은 브라우저 창이 표시되지 않아
  애니메이션이 합성되지 않는다. CSS 레시피는 애니메이션을 직접 진행시켜 수치로 검증했고
  (`landing`/`float` 종료 −800px, `move` −1120px, `idle`/`fall` −1440px 로 모두 정확),
  `src/assets/character/preview.html` 을 열면 빌드 없이 재생을 볼 수 있다.
- **임계값을 실서버 데이터로 재확인할 것.** `GRAVITY_NORMALIZED`·`AIRBORNE_RATIO` 는
  `GRAVITY = 720` 기준 출발점이며, 백엔드 물리는 지금도 튜닝 중이다
  (`PHYSICS_STEP` 1/120 → 1/180, 걷기 로직 수정, **인게임 점프대 추가**).
  라운드를 한 판 돌려 걷는 구간과 떨어지는 구간의 `dvy` 분포를 보고 조정한다.
- **점프대가 추가되어** 상승 구간이 의도적으로 생긴다. 상승·하강을 모두 `fall` 로
  처리하므로 로직은 그대로 유효하지만, 점프 연출을 따로 두고 싶으면 재검토 대상이다.
- **캐릭터 컨셉 불일치**: CLAUDE.md·`GamePage` 문구는 "병아리", START 마커는 🐣 인데
  원화는 **아기 오리**다. 교체 시 UI 문구·마커도 함께 정리해야 한다.
- `prefers-reduced-motion` 은 정지 대신 **감속**(2s)으로 처리했다. 캐릭터 애니메이션은
  장식이 아니라 게임 상태 정보라 끄면 정보가 사라진다. 팀 정책 확인 필요.
- 미사용 원화 3종(`conversion`·`prep_start`·`prep_end`)은 시트만 만들어 두었고
  런타임에서 참조하지 않는다.

### 창작마당 (2026-08-05, 브랜치 `fe/feat/workshop`)

작업지시서 `창작마당_작업지시서_FE.md`(상위: `창작마당_구현명세서_v9.md`) STEP 1~8.
Figma 프로토타입의 `App.tsx`를 화면 구성·문구·인터랙션의 기준으로 삼았다.

> **이 문서들은 저장소에 없다.** 폐기 예정이라 커밋하지 않기로 했다(2026-08-05 결정).
> 아래 로그에 판단 근거를 최대한 옮겨 두었으니, 원문이 필요하면 작성자에게 요청할 것.

`lint`(신규 경고 0)·`test`(27파일 182테스트 중 신규 36개 전부 통과)·`build` 통과.
MSW 목으로 브라우저 실동작 확인 완료.

**STEP 1 `mapDesign.ts` 배경 오매칭 (🐛 실사용 버그)**
- `resolveMapDesign()`이 mapId의 **첫 자리·끝 자리**를 잘라 배경을 골랐다. 커스텀 맵
  `10000001`(stage 10000)이 `'1-1'`로 잡혀 **하수도 배경 + Stage1 BGM**이 씌워진다.
- 백엔드 인코딩은 `stageId * 1000 + roundNo` 하나뿐이다(`GameConstants.ROUND_MODULAR`).
  → `Math.floor(mapNum/1000)` / `mapNum % 1000`으로 고치고 `MAP_DESIGNS['custom']` fallback 추가.
- ⚠️ **기존 `mapDesign.test.ts`를 고칠 수밖에 없었다.** 예전 테스트는 `10002`·`20001` 같은
  5자리 형태를 검증했는데, 그건 자릿수를 자르던 구현에 맞춘 값이라 새 인코딩과 양립하지 않는다.
  (지금 인코딩에서 `10002`는 stage 10·round 2다) 폐기 이유를 테스트 상단 주석에 남겼다.
- custom 배경은 **전용 에셋을 만들지 않았다.** `example_image.png`는 7.6MB라 게임 배경으로
  매번 받게 하면 안 되고, 다른 스테이지 이미지를 재사용하면 "엉뚱한 배경" 문제가 남는다.
  → `MapDesign.backgroundImage`를 `string | null`로 넓히고, null이면 `GamePage`가 인라인
  스타일을 걸지 않아 `.game-board--custom` CSS 그라디언트가 그려지도록 했다.

**STEP 2 라우팅·헤더** — `/workshop`·`/workshop/editor` 추가(lazy + `ProtectedRoute`,
`allowedRoles` 없음). 중앙 네비 `LOBBY 모집 | WORKSHOP 창작마당` 추가.

> ⚠️ **상단바가 화면마다 다르다. 한 곳에만 넣으면 진입 경로가 없다.**
> 처음에 `AppHeader`에만 네비를 넣었는데, `AppHeader`는 **마이페이지·랭킹·창작마당에서만**
> 쓰이고 **방 목록(`/rooms`)은 자체 헤더(`.room-header`)를 쓴다.** 그래서 정작 주 진입 화면인
> 방 목록에 버튼이 없어 URL을 직접 쳐야만 창작마당에 갈 수 있었다. (사용자 지적으로 발견)
> → `shared/components/TopNav.tsx`로 분리해 **두 헤더가 같은 컴포넌트를 쓰도록** 했다.
> 스타일도 `TopNav.css`가 직접 들고 있다. 페이지 CSS에 두면 한쪽에만 적용된다.
> `TopNav.test.tsx`가 두 화면 모두에서 링크가 뜨는지 검증해 재발을 막는다.
>
> 방 목록 헤더의 중앙 고정 라벨(`.room-header__middle`)을 이 네비로 교체했고,
> 좁은 화면에서 그 라벨을 숨기던 CSS도 제거했다. **숨기면 갈 방법이 사라진다.**
>
> 게임 중(`/game`)·방 안(`/rooms/:code`)에는 넣지 않는다. 전용 헤더가 따로 있고
> 플레이 도중 이탈을 유도하지 않기 위함이다.

**STEP 3 API·MSW** — `features/workshop/services/customMapApi.ts` 신설(`dev/devMapApi`와 분리).
- ⚠️ **simulate 요청 키가 다르다.** `/dev/simulate`는 `mapConfig`, `/custom-maps/simulate`는
  **`map_config`**. 그대로 두면 서버가 null로 읽어 400이다. 회귀 테스트로 고정해 두었다.
- ⚠️ **`map_config` 내부는 변환하지 않는다.** `startPoint`·`launchVelocity`가 그대로 저장되어
  서버 물리 엔진이 읽는다. 바깥 껍데기(`stage_id` → `stageId`)만 바꾼다.
- **공개 토글은 요청 2회다.** `PUT`이 부분 수정이 아니라 전체 갱신이고 목록 응답에는
  `map_config`가 없다. `is_public`만 보내면 맵이 비워지거나 400이 난다.
  → `setCustomMapVisibility()`가 상세를 먼저 읽고 나머지를 되돌려 보낸다.
  서버에 부분 수정 API가 생기면 이 함수만 바꾸면 된다.
- `roomsApi.createRoom`에 `stageId` 선택 필드. **지정했을 때만 body에 넣는다.** 항상 null을
  보내면 서버가 기본 스테이지 분기를 못 타서 기존 방 만들기가 깨질 수 있다.
- MSW 목은 서버 `MapConfigValidator`와 같은 검증을 구현했다. 400 메시지가 화면까지 오는
  경로를 목으로도 검증하기 위함이다. `/custom-maps/me`·`/simulate`를 `/:stageId`보다 앞에 둘 것.
- `rooms.handlers`의 `stageId 1~4` 하드코딩을 `isSelectableStage()`로 교체 —
  커스텀 맵(≥10000)도 고를 수 있어야 하고, **남의 비공개 맵은 막아야 한다**(서버 ⑤와 동일 규칙).

**STEP 4·5 창작마당 페이지·상세 모달** — 검색은 서버 쿼리라 **300ms 디바운스**한다.
Phase 2(좋아요·평점·댓글)는 지우지 않고 **자리만 비활성으로** 남겼다. 평점은 `0.0`이 아니라
`—`로 둔다. 0.0은 "최저 평점"으로 읽힌다.

**STEP 6 에디터 — ⚠️ 지시서와 다르게 구현했다**
- 지시서는 `MapEditorPage`(2,947줄)를 **복사해 변환**하라고 했으나, 복제하면 이후 버그 수정을
  두 곳에 해야 한다. → `variant?: 'admin' | 'workshop'` prop으로 **한 컴포넌트에서 분기**하고
  `pages/workshop/UserMapEditorPage.tsx`는 얇은 래퍼로 두었다.
  창작마당 코드는 전부 `isWorkshop` 뒤에 있어 **관리자 경로의 동작은 그대로다.**
- workshop에서 달라지는 것: 시뮬레이션 경로(`/custom-maps/simulate` — 안 바꾸면 일반 유저 403),
  라운드 드롭다운 제거 → `?stageId=`로 내 맵 조회, `createCustomMap`/`updateCustomMap`,
  제목·설명·난이도·팔레트·공개 입력, 한도 게이지, `findMapDesign` 배경 자동 매칭 제거.
- **제목은 수정 모드에서 읽기 전용이다.** `PUT`이 `title`을 받지 않는다(`stages.name` UNIQUE).
- **신규 저장 후 `?stageId=`로 replace한다.** 안 그러면 다시 저장할 때 사본이 계속 생긴다.
- `limitIssues`는 `runServerSim`보다 **먼저 선언**해야 한다(TDZ).

**STEP 7 로비 캐러셀** — `getStages()` + `getCustomMaps()`를 `mapCards`로 합쳐 한 트랙에 렌더.
- 커스텀 맵 조회 실패는 **무시한다.** 창작마당이 죽어도 공식 맵은 플레이할 수 있어야 한다.
- `stages.find(...)`로 이름을 찾던 3곳(`navigateToGame`·`STAGE_CHANGED`·`decidedStage`)을
  전부 합친 목록 기준으로 바꿨다. 공식 목록만 보면 **커스텀 맵 이름이 안 나온다.**
- 커스텀 맵 선택 시 컷씬이 자동 비활성되는 것은 의도된 동작이다(실동작 확인).

**브라우저 실동작 확인 (MSW)**
탐색 6개 → 검색·난이도 필터 → 내 맵 2개 → 비공개 토글 → 탐색 7개로 반영 →
상세 모달(STAGE 10000, 평점 —, 좋아요 비활성) → 이 맵으로 방 만들기 → 방 `JQUD` 생성 →
로비 캐러셀에 공식 3 + UGC 7, `하늘 위의 도전`이 `결정된 맵` → 에디터에서 10006 불러오기 →
`POST /custom-maps/simulate 200`. **`/api/v1/dev/**` 호출은 0건**이다.

**남은 확인/후속 작업**
- **BE 미구현.** 지금은 MSW 목으로만 동작한다. BE STEP 5(마이그레이션·API 6종) 완료 후
  지시서 STEP 8의 #5·#7·#8·#10을 실서버로 다시 확인해야 한다.
- **커스텀 맵 인게임 플레이 육안 확인이 남았다.** 웹캠이 필요해 이 환경에서 못 돌렸다.
  배경이 하수도가 아닌 custom인지, 클리어 시 별 3개인지 확인할 것.
- `map_config`에 `palette`·난이도 같은 메타가 없어 **에디터에서 새 맵을 만들 때 팔레트 기본값**
  (`#315f9d`/`#8bc4e8`/`#f5d652`)이 그대로 저장된다. 유저가 안 바꾸면 썸네일이 다 비슷해진다.
- 목의 `is_mine`은 UUID가 없어 **시드 맵 2개(10000·10006)를 항상 내 맵으로 취급**한다.
  실서버는 `creator_uuid`로 판정하므로 동작이 다르다.
- ⚠️ **기존 테스트 13개가 master에서 이미 깨져 있다.** (`stagesApi`·`recordsApi`·`RankingPage`·
  `StageRecordModal`) 커밋 `7240e53 Fe/fix/stageselect`가 목 스테이지를 4개→3개로 줄이면서
  테스트를 안 고친 회귀다. **이 브랜치와 무관하며 별도로 처리해야 한다.**

### 커스텀 맵 클리어 검증 (2026-08-05, 브랜치 `fe/feat/workshop`)

명세서 `커스텀 맵 클리어 검증 - 프론트엔드 개발 계획서` 기준. 공개 업로드 전에
테스트 플레이 성공을 필수로 요구하고, 맵을 고치면 검증을 무효화한다.
`lint` 신규 경고 0 · `build` 통과 · 신규/갱신 테스트 전부 통과. 브라우저 실동작 확인 완료.

**왜 필요한가** — 깰 수 없는 맵이 공개되면 다른 유저가 시간을 버린다. 제작자 본인이
한 번은 깨 보게 만드는 게 가장 싼 품질 장치다. 서버도 저장 시 같은 포즈로 재현해 확인한다.

**무효화 조건 — 포즈 변경은 무효화하지 않는다**
- `commitState`는 지형과 포즈를 함께 커밋한다. 여기에 무턱대고 무효화를 걸면
  **포즈를 다시 그릴 때마다 검증이 풀린다.** 하지만 이미 저장해 둔 `lastClearedPoses`로는
  여전히 깰 수 있으므로 재검증할 이유가 없다.
- → `exportJson(이전) !== exportJson(다음)`으로 **맵이 실제로 바뀐 경우에만** 무효화한다.
  `undo`/`redo`도 같은 비교를 거친다.
- `commitState`는 여러 콜백이 의존성으로 들고 있어 참조가 안정적이어야 한다.
  `mapState`를 의존성에 넣으면 매 렌더 새로 만들어지므로 **`mapStateRef`로 우회**했다.

**불러오기 순서 함정**
- 기존 맵을 열면 `commitState`가 먼저 돌아 검증을 무효화한다. 그래서 `setIsMapCleared(detail.isCleared)`는
  **반드시 `commitState` 뒤에** 와야 한다. 순서를 바꾸면 검증된 맵도 미검증으로 보인다.
- 포즈는 서버에만 있어 불러올 때 받지 않는다. 맵을 고치지 않고 다시 저장하면 `poses` 없이
  요청이 나가고 서버가 기존 검증 결과를 유지한다. **`null`이 아니라 키 자체를 뺀다** —
  `null`은 "검증 없음"으로 읽힐 수 있다.

**목록에서의 공개 토글**
- `WorkshopPage`에는 에디터가 없어 포즈를 만들 수 없다. 그래서 미검증 맵의 공개 토글은
  **버튼 자체를 비활성**하고 이유를 카드에 적었다. `setCustomMapVisibility()`도 요청 전에
  `ST004`로 막는다. (서버까지 갔다가 400을 받는 것보다 낫다)
- 비공개로 내리는 것은 검증과 무관하므로 막지 않는다. 검증 상태도 유지된다.

**MSW 목** — `is_public && 유효 포즈 없음` → `400 ST004`.
`PUT`은 맵이 그대로면 기존 `is_cleared`를 유지하고, 바뀌었으면 이번 포즈로 다시 판정한다.
목의 클리어 판정은 simulate 핸들러와 같은 규칙(유효 포즈 1개 이상)이어야 화면 흐름이 어긋나지 않는다.

**테스트 배치 — 명세서와 다르다**
- 명세서는 검증 테스트를 `WorkshopPage.test.tsx`에 두라고 했으나, 검증 상태는 **에디터**가
  들고 있고 WorkshopPage에는 에디터가 없다. → `UserMapEditorPage.test.tsx` 신설(10개).
  WorkshopPage 쪽에는 목록에서 확인 가능한 것(토글 잠금·미검증 뱃지)만 두었다.
- 에디터를 jsdom에서 렌더하려면 **`ResizeObserver` 스텁**이 필요하다(`setupTests.ts`에 추가).
  캔버스는 별도 폴리필 없이도 렌더된다.

**브라우저 실동작 (MSW)**
새 맵 → `⚠️ 클리어 미검증` + 공개 경고 → 미검증 공개 저장 시도 → 차단(요청 미발생) →
포즈 없이 테스트 플레이 → `✖ 실패`, 미검증 유지 → 포즈 적용 후 재시도 → `✅ 클리어 검증 완료`,
경고 사라짐 → 공개 저장 `201` → `?stageId=10007` 수정 모드 전환 → 프리셋 변경 → 즉시 미검증 복귀.

**남은 확인/후속 작업**
- 구버전 응답에 `is_cleared`가 없으면 `false`(미검증)로 본다. 공개를 막는 쪽이 안전해서다.
- 현재는 "한 번 깼다"만 본다. 운·프레임 편차로 겨우 깬 맵도 통과하므로,
  품질 기준을 높이려면 서버에서 N회 재현을 요구하는 편이 낫다.

> ⚠️ **아래 "BE 규격 대조" 절에서 이 절의 전제 일부가 뒤집혔다.** 함께 읽을 것.

### 드래그 이동 시 검증 무효화 누락 (2026-08-05, 브랜치 `fe/feat/workshop`)

바로 위 클리어 검증 작업의 버그 수정. **검증을 마친 뒤 지형·기믹·시작점을 마우스로 옮겨도
`⚠️ 클리어 미검증`으로 바뀌지 않아, 옛 포즈 그대로 공개 저장이 통과했다.**

**원인 — 드래그는 `commitState`를 거치지 않는다**
- 드래그 중에는 `setMapState`만 하고, 드래그가 끝나는 `onMouseUp`에서 히스토리·스냅샷을
  **직접** 갱신한다. 그래서 `commitState` 안에 넣어 둔 무효화가 실행되지 않는다.
- 무효화를 "맵 상태를 바꾸는 함수"가 아니라 "`commitState`"에 걸었던 것이 실수다.
  맵을 바꾸는 경로가 하나가 아니었다. → `onMouseUp`의 `changed` 분기에도 추가했다.
- 드래그가 건드리는 것은 지형·기믹·시작/도착점·플레이어뿐(포즈는 별도 도구)이라
  `changed`가 참이면 곧 맵이 바뀐 것이다. 단순 클릭은 `changed === false`라 풀리지 않는다.

**테스트 — jsdom에서 드래그를 재현할 때 걸리는 것 두 가지**
- `fitView`는 `clientWidth`가 0이면 조기 반환한다. jsdom에서는 레이아웃이 없으므로
  뷰 변환이 초기값(배율 1·오프셋 0)으로 남고, 결과적으로 **화면 좌표 = 맵 좌표**다.
  `getBoundingClientRect`도 0이라 `clientX`를 그대로 맵 x로 쓰면 된다.
- **`dispatchEvent`를 직접 쓰면 안 된다.** `mousemove`의 `setMapState`가 다음 이벤트 전에
  반영되지 않아, `mouseup`이 옛 `mapState`를 보고 "안 바뀜"으로 판단한다.
  `fireEvent`(내부에서 `act`로 감싼다)를 써야 한다.
- 수정을 빼면 실패하고 넣으면 통과하는 것을 확인했다. (테스트가 실제로 이 버그를 잡는다)

**남은 주의**
- 앞으로 맵 상태를 바꾸는 경로를 새로 만들면 **무효화를 함께 붙여야 한다.**
  현재 경로는 `commitState`·`undo`·`redo`·드래그 종료 4곳이다.

### BE 규격 대조 — 공개 저장은 매번 포즈가 필요하다 (2026-08-05)

`1a71150 [BE]feat: 미검증 맵 등록 불가 기능 추가`가 머지되어 실제 백엔드 코드로 계약을 확인했다.
**요청·응답 키는 전부 맞았지만, 재저장 동작 전제가 틀려서 프론트를 고쳤다.**

**일치한 것** — `poses`(요청, 리네임 없음) · `is_public` · `map_config` · `is_cleared`(응답,
`@JsonProperty`) · `ST004`(`CUSTOM_MAP_NOT_CLEARED`, 400).

**⚠️ 뒤집힌 전제 — `poses` 생략 시 기존 검증을 유지하지 않는다**
- `CustomMapService.verifyClear()`는 `poses`가 `null`이고 공개 요청이면
  **저장된 `is_cleared`를 보지 않고 곧바로 `ST004`를 던진다.**
  주석에도 *"클라이언트의 성공 플래그는 믿지 않는다"*고 적혀 있다. 매번 `PhysicsSimulator`로 재현한다.
- 즉 기존 공개 맵을 열어 **설명만 고쳐 저장해도 테스트 플레이를 한 번 해야 한다.**
- 원래 프론트는 불러올 때 `setIsMapCleared(detail.isCleared)`로 배지를 ✅ 로 띄우고
  `poses` 없이 저장했다. 그대로 두면 **"검증 완료라는데 저장은 400"** 이 된다.

**고친 내용**
- 배지는 이제 **"이 세션에서 검증 포즈를 들고 있는가"**를 뜻한다. 불러온 맵은 항상 미검증에서 시작한다.
  저장된 상태는 `savedIsCleared`로 따로 두고 안내 문구에만 쓴다.
  ("이미 검증된 상태로 저장돼 있지만 수정 없이 저장할 때도 한 번 실행해야 합니다")
- **목록에서 공개 전환은 불가능하다.** `setCustomMapVisibility(id, true)`는 요청 전에 막고
  에디터로 안내한다. 목록에는 에디터가 없어 포즈를 만들 수단이 자체가 없다.
  비공개로 내리는 것은 그대로 된다. `MyMapCard`의 토글도 공개 맵에서만 활성이다.
- **비공개 저장은 `is_cleared`를 지운다.** `verifyClear`가 `poses` 없으면 `false`를 돌려주고
  그 값이 그대로 저장되기 때문이다. 다시 공개하려면 재검증해야 한다.
- MSW 목도 같은 규칙으로 맞췄다. **저장된 `is_cleared`를 보지 않고 이번 요청의 `poses`로만 판정한다.**
  목이 서버보다 관대하면 실연동에서만 터지는 400을 못 잡는다.

**교훈** — "서버가 알아서 유지해 주겠지"를 전제로 키를 생략하지 말 것.
생략의 의미(유지 vs 초기화)는 서버 구현에 달려 있고, 이 프로젝트에서는 초기화였다.

### 창작마당 맵 진입 격리 (2026-08-05, 브랜치 `fe/feat/workshop-room-isolation`)

명세서 `일반 방 맵 선택 및 창작마당(UGC) 맵 진입 격리` 기준.
**커스텀 맵은 `/workshop` 의 "이 맵으로 방 만들기" 로만 방에 걸린다.**
`lint` 신규 경고 0 · `build` 통과 · 신규 테스트 7개 통과 · 브라우저 3시나리오 확인 완료.

**왜 필요한가** — 직전 작업(STEP 7)에서 로비 캐러셀에 공식 맵과 커스텀 맵을 합쳐 놓았다.
그 결과 일반 방 방장이 남의 UGC 맵을 아무거나 걸 수 있었다. 창작마당 맵은 제작자 의도대로
창작마당에서 진입해야 하고, 방에 한 번 걸리면 바뀌지 않아야 한다.

**대역 판별은 상수 하나로** — `customMapApi.ts` 에 `CUSTOM_STAGE_ID_MIN = 10000` 과
`isCustomStageId()` 를 두고 로비가 그것만 쓴다. `>= 10000` 을 여기저기 흩뿌리면
나중에 대역이 바뀔 때 누락이 생긴다.

**로비 구조 — 목록을 세 갈래로 나눴다**
- `officialMapCards` : 캐러셀에 올릴 공식 맵. **서버가 커스텀 stageId 를 흘려도 한 번 더 거른다.**
  (`GET /api/v1/stages` 가 `is_official` 필터를 빠뜨리는 사고를 대비)
- `workshopMapCard` : 이 방에 걸린 커스텀 맵 한 장. 고정 뷰에 쓴다.
- `knownMapCards` : 위 둘의 합. **이름 조회 전용**이다.
  캐러셀에 안 뜨더라도 게임 진입 state·`STAGE_CHANGED` 안내·시작 버튼 라벨에는 이름이 나와야 한다.
  이걸 `officialMapCards` 로만 두면 창작마당 방에서 맵 이름이 통째로 빈다.

**목록 조회 → 단건 조회로 바꿨다**
- 예전에는 `getCustomMaps()` 로 공개 맵 전체를 받아 캐러셀에 합쳤다.
  지금은 **방에 걸린 맵 하나만** `getCustomMap(decidedId)` 로 조회한다.
- 이 경로를 방장·참가자가 똑같이 타므로, 코드로 들어온 참가자도 라우트 state 없이
  이름·난이도·설명이 복구된다. (브라우저에서 `routeState: null` 상태로 확인)
- 조회 실패해도 카드 자리는 유지한다. 맵 정보가 없다고 방 진입까지 막을 이유는 없다.

**맵 변경 차단은 두 겹으로**
- UI 에서 캐러셀 자체를 감추고,
- `decideStage()` 안에서도 `isWorkshopRoom` 이면 되돌린다.
  키보드 핸들러·개발자도구로 호출되는 경로가 남지 않게 하기 위함이다.

**테스트에서 걸린 것 — `useParams` 는 Route 없이 비어 있다**
- `renderWithProviders(<LobbyPage />)` 로는 `params.code` 가 `undefined` 라
  **방 조회 effect 가 통째로 건너뛰어진다.** roomData 가 null 이니 창작마당 분기도 안 탄다.
- `<Routes><Route path="/rooms/:code" element={<LobbyPage />} /></Routes>` 로 감싸야 한다.
  이걸 모르면 "일반 방" 케이스만 통과해서 격리가 된 것처럼 보인다.

**남은 확인/후속 작업**
- 서버도 같은 규칙을 강제하는지 확인할 것. `RoomService.changeStage()` 가 커스텀 맵을
  받아 주면 프론트만 막은 셈이 된다. (명세서 §5-⑤ 는 공개 맵 허용이 전제였다)
- 창작마당 방에서 "다른 맵으로 바꾸기"를 원한다는 요구가 나오면, 방을 새로 만들게 할지
  창작마당 맵끼리는 교체를 허용할지 정해야 한다. 지금은 전자다.
