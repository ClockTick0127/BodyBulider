# 개발명세서 (FE) — 인게임 캐릭터 스프라이트 애니메이션

| 항목 | 내용 |
|---|---|
| 작업 ID | `FE-CHAR-01` ~ `FE-CHAR-07` |
| 담당 | 프론트엔드 |
| 대상 | `frontend` — 인게임 캐릭터 렌더링 |
| **백엔드 변경** | **없음.** 현재 응답(`[x, y, vx, vy]`)만으로 구현한다 |
| 원화 | `C:\Users\SSAFY\Desktop\캐릭터_인게임_디자인(character)` (아기 오리, 8상태 40장) |
| 작성일 | 2026-07-31 (rev.2) |

> **rev.2 변경점** — 백엔드 접지 플래그(`BE-SIM-*`) 의존을 제거했습니다. 낙하 판정을
> **`vy` 변화량 + 최소 지속시간** 기준으로 바꾸고, 매 프레임 판정이 아니라
> **재생 전에 타임라인을 한 번에 계산**하는 방식으로 전환합니다 (§5).
>
> `docs/character-sprite-작업지시서.md` 는 폐기입니다. 거기 임계값(`vx > 25`, `vy > 90`)은
> 맵 스케일을 무시한 값이라 mock 환경에서 캐릭터가 움직이지 않습니다.

---

## 0. 설계 방침

| 결정 | 내용 | 근거 |
|---|---|---|
| 상태 판정 | **클라이언트 단독.** `vy` 변화량 + 최소 지속시간 | 백엔드 변경 없이 진행. `vy` 절대값은 경사면 보행을 낙하로 오인 (§5.2) |
| 판정 시점 | **재생 전 타임라인 일괄 산출** | `SIMULATION_RESULT` 가 전체 궤적을 한 번에 주므로 앞뒤를 다 보고 판정할 수 있다 |
| 프레임 구동 | **CSS `steps()`** | `MapEffects` 가 이미 순수 CSS keyframes + `cqi` 로 연출 구현 중. rAF·프레임 카운터 불필요 |
| 재생 순서 | **시트에 구워서** 납품 | CSS `steps()` 는 핑퐁을 표현 못 함. 런타임에서 `sequence` 개념 제거 |
| 상태 개수 | 5종 (`idle` `move` `fall` `landing` `float`) | 전이 브리지 없이 즉시 전환 |
| 좌표계 | **맵 스케일 정규화** 후 사용 | 실서버 0~1000, MSW mock 0~10 로 스케일이 다름 (§1.3) |

---

## 1. 현황

### 1.1 렌더링

캐릭터는 DOM 요소 하나입니다. Canvas 도 Phaser 도 쓰지 않습니다.

```
frontend/src/pages/game/GamePage.tsx:637   <div className="game-ball">🐥</div>
frontend/src/pages/game/GamePage.css:123   .game-ball { font-size:32px; transform:translate(-50%,-50%); }
```

### 1.2 데이터 흐름

```
SIMULATION_RESULT { intervalMs: 50, points: [[x,y,vx,vy], ...], result }
   → gameProtocol.ts  parseGameEvent()
   → GamePage.tsx     frames state → rAF 로 50ms 간격 재생 → setBall([x, y])
```

**핵심**: `points` 는 궤적 **전체**가 한 번에 옵니다 (최대 15초 / 50ms = 300프레임).
실시간 스트리밍이 아니므로 재생 전에 전 구간을 분석할 수 있습니다. §5 는 이 성질을 씁니다.

현재 `setBall([x, y])` 가 앞의 두 값만 꺼내 쓰고 `vx`, `vy` 를 버립니다.

### 1.3 ⚠️ 맵 좌표 스케일이 두 가지입니다

| 출처 | 스케일 | 예시 속도 |
|---|---|---|
| 실서버 (`GamePhysicsSimulator`, `MAP_SIZE = 1000`) | 0~1000 | `vx` ≈ 190 |
| MSW mock (`mocks/gameSocketMock.ts`) | 0~10 | `vx` = 0.9 |

`GamePage` 는 이미 `mapScale` 로 세 가지(`{1,1}` `{10,6}` `{1000,1000}`)를 분기합니다
(`GamePage.tsx:525`). **절대값 임계값을 쓰면 mock 개발 환경에서 캐릭터가 절대 안 움직입니다.**
모든 속도 임계값은 `mapScale.width` 로 나눈 정규화 값을 씁니다.

---

## 2. 원화 자산과 상태 매핑

### 2.1 인벤토리 (8폴더 40장)

| 폴더 | 원화 | 뷰 | 사용 |
|---|---|---|---|
| `1. 대기(idle)` | 6 | 정면 | ✅ `idle` |
| `2. 전환(conversion)` | 3 | 정면→측면 | ⬜ 미사용 |
| `3_1. 예비(preparation)_시작(start)` | 2 | 측면 | ⬜ 미사용 |
| `3_2. 예비(preparation)_종료(end)` | 3 | 측면 | ⬜ 미사용 |
| `4. 이동(move)` | 8 | 측면(우향) | ✅ `move` |
| `5. 착지(landing)` | 6 | 정면 | ✅ `landing` |
| `6. 추락(fall)` | 6 | 측면(머리 우향) | ✅ `fall` |
| `7. 부유(float)` | 6 | 정면 | ✅ `float` |

`_정렬결과(aligned)` · `_신규아트_검수` 는 원화 폴더가 아니므로 스크립트가 읽지 않습니다.
미사용 3종은 전환 연출 도입에 대비해 시트만 생성해 두고 런타임에서 참조하지 않습니다.

### 2.2 런타임 상태

| 상태 | 조건 | 시트 프레임 | fps | 재생 | 미러링 |
|---|---|---|---|---|---|
| `fall` | 공중 판정 구간 | 10 (핑퐁) | 12 | 루프 | ✅ |
| `landing` | 공중→지상 전이 후 375ms | 6 | 16 | 1회 후 유지 | ❌ |
| `move` | 지상 · `\|vx정규화\| > 0.02` | 8 | 12 | 루프 | ✅ |
| `idle` | 지상 · 그 외 | 10 (핑퐁) | 8 | 루프 | ❌ |
| `float` | 재생 종료 + 라운드 실패 | 6 | 12 | 1회 후 유지 | ❌ |

**상승과 하강을 구분하지 않고 둘 다 `fall` 입니다.** 이 게임에는 점프 입력이 없어
상승은 충돌 반발로만 발생하고, `float`(정면)과 `fall`(측면)을 오가면 공중에서 뷰가 90° 튑니다.
`float` 은 원화 의도(평온→놀람→눈 질끈)대로 **실패 연출**에 씁니다.

**정면 원화(`idle` `landing` `float`)는 미러링 금지** — 좌우 반전 시 광원이 뒤집힙니다.

---

## 3. FE-CHAR-01 — (삭제) 프로토콜 확장

rev.1 에서 백엔드에 접지 플래그를 요청하는 항목이었습니다. **백엔드 변경을 하지 않기로
했으므로 이 작업은 없습니다.** `gameProtocol.ts` 는 손대지 않습니다.

번호는 기존 브랜치·커밋과의 혼선을 막기 위해 비워 둡니다.

> ⚠️ `gameProtocol.ts:220` 의 `point.length !== 4` 검증은 **그대로 두십시오.**
> 서버 응답 형식이 바뀌면 이 검증이 먼저 잡아 줍니다.

---

## 4. FE-CHAR-02 — 스프라이트 정규화 스크립트

**대상**: `frontend/scripts/build_character_sprites.mjs`

### 왜 필요한가

원화 40장 실측 결과 **공통 기준점이 없습니다.**

| 그룹 | 캔버스 크기 | 상태 |
|---|---|---|
| 기존 28장 | 139~181 × 173~190 px | 컷마다 제각각 |
| `fall` 6장 | 181~194 × 124~144 px | 알파 bbox 타이트 크롭 |
| `float` 6장 | 154~161 × **189~214** px | 알파 bbox 타이트 크롭 |

타이트 크롭은 정규화가 **아닙니다.** 프레임마다 캔버스가 다르므로 그대로 이어 붙이면
캐릭터가 떱니다. `float` 은 세로 편차가 25px(12%)라 64px 표시 기준 7~8px 튑니다.
**CSS 로 보정할 수 없습니다.**

### 규격

| 항목 | 값 |
|---|---|
| 프레임 캔버스 | **256 × 256** (정사각 필수 — CSS 계산 단순화) |
| 접지선 `GROUND_Y` | 216 (하단 40px 은 스쿼시·그림자 여유) |
| 공중 앵커 `AIR_Y` | 128 (캔버스 중심) |
| 포맷 | PNG-32 스트레이트 알파 |

### 정렬 모드 2종 ⚠️

| 모드 | 대상 | 세로 정렬 |
|---|---|---|
| `ground` | `idle` `move` `landing` `conversion` `prep_start` `prep_end` | bbox 하단 → `y = 216` |
| `air` | **`fall` `float`** | bbox 중심 → `y = 128` |

> **공중 상태를 접지선(216) 기준으로 중심 정렬하면 캔버스 밖으로 잘립니다.**
> `float_5` 는 내용이 210px 높이라 `216 − 105 = 111` → `y = 111~321` 로 256을 65px 초과합니다.
> 캔버스 중심(128) 기준이면 `23~233` 으로 정상입니다.

**가로 정렬은 두 모드 공통**으로 알파 **질량 중심**을 `x = 128` 에 맞춥니다.
bbox 중심을 쓰면 걷기에서 다리를 뻗은 프레임의 중심이 밀려 몸통이 좌우로 흔들립니다.

### 재생 순서를 시트에 굽는다

CSS `steps()` 는 핑퐁을 표현할 수 없으므로 스크립트가 프레임을 복제해 넣습니다.

| 상태 | 원화 | sequence | 시트 프레임 |
|---|---|---|---|
| `idle` | 6 | `0,1,2,3,4,5,4,3,2,1` | **10** |
| `fall` | 6 | `0,1,2,3,4,5,4,3,2,1` | **10** |
| `move` | 8 | `0..7` | 8 |
| `float` | 6 | `0..5` | 6 |
| `landing` | 6 | `0..5` | 6 |

`fall` 을 핑퐁으로 굽는 이유: 아트 측 실루엣 IoU 측정에서 `6→1` 구간만 0.718 로
평균(0.853) 대비 뚝 떨어져 단순 루프 시 튑니다.

### 기타 요구사항

- 파일명 **끝 숫자**로 정렬 (문자열 정렬 시 `move_10` 이 `move_2` 앞에 옴)
- 캐릭터가 캔버스를 초과하면 **에러로 중단** (조용히 잘리면 안 됨)
- `manifest.json` 출력 — `sheetFrames` / `fps` / `loop` / `mode` 기록 (§9 테스트가 대조)
- QA 어니언 스킨 출력: 전 프레임 30% 겹침 + `y=216` 빨간 선 + `x=128` 파란 선

---

## 5. FE-CHAR-03 — 동작 타임라인 산출 ★ 이번 개정의 핵심

**대상**: `src/features/character/resolveCharacterAction.ts` (전면 재작성) + 테스트

### 5.1 방식 전환 — 프레임별 판정 → 타임라인 일괄 산출

`SIMULATION_RESULT` 는 궤적 **전체**를 한 번에 줍니다. 매 프레임 즉석 판정할 이유가 없고,
즉석 판정으로는 "일정 시간 이상 지속됐는가"를 볼 수 없습니다.

**시뮬레이션 수신 시점에 `CharacterAction[]` 을 한 번 만들어 두고, 재생 중에는 인덱싱만
합니다.** 앞뒤를 모두 볼 수 있으므로 지속시간 필터를 넣을 수 있고, 순수 함수라 테스트도 쉽습니다.

```ts
export function buildActionTimeline(
  frames: SimulationFrame[],
  intervalMs: number,
  mapWidth: number,
): CharacterAction[]
```

최대 300프레임짜리 배열 연산이라 비용은 무시할 수준입니다.

### 5.2 ⚠️ `vy` 절대값으로 판정하면 안 됩니다

`GamePhysicsSimulator` 를 확인한 결과입니다.

- **접지해도 `vy` 가 0이 아닙니다.** 매 스텝 `ball.vy += GRAVITY * dt` 를 더하고 충돌 시
  법선 성분만 보정합니다.
- **경사면 보행이 낙하로 보입니다.** `applyWalkingMotor()` 가 경사 탄젠트 방향으로
  `WALK_SPEED`(190)를 밀어넣으므로, 45° 경사를 걸어 내려가면 `vy ≈ 134` 입니다.
  포즈 다리가 곧 지형이라 경사면이 대부분입니다.

**구분되는 신호는 `vy` 의 크기가 아니라 변화량입니다.**

| 상황 | `vy` | 프레임당 `vy` 증가량 |
|---|---|---|
| 자유낙하 | 계속 증가 | **≈ +36** (`GRAVITY 720 × 0.05s`) |
| 경사면 보행 | 클 수 있음(134) | **≈ 0** (걷기 모터가 속도를 일정하게 유지) |
| 평지 보행 | ≈ 0 | ≈ 0 |

### 5.3 알고리즘

**1단계 — 정규화 변화량**

```ts
const intervalSec = intervalMs / 1000
// 자유낙하 시 프레임당 정규화 vy 증가량. 1000스케일·50ms → 0.036
const GRAVITY_PER_FRAME = 720 * intervalSec / mapWidth
const AIRBORNE_ENTER = GRAVITY_PER_FRAME * 0.5      // 0.018

const dvy = frames.map((f, i) =>
  i === 0 ? 0 : (f[3] - frames[i - 1][3]) / mapWidth)
```

**2단계 — 원시 공중 마스크**

```ts
const raw = dvy.map((d) => d > AIRBORNE_ENTER)
raw[0] = false   // 시작 프레임은 정지 상태
```

**3단계 — 최소 지속시간 필터 (사용자 요청 사항)**

접지 중에도 지형이 울퉁불퉁하면 `dvy` 가 프레임 단위로 튑니다. **짧은 구간을 양방향으로
제거**해 깜빡임을 없앱니다.

```ts
const MIN_AIRBORNE_MS = 150   // 이보다 짧은 공중 구간은 지상으로 되돌린다
const MIN_GROUNDED_MS = 100   // 이보다 짧은 지상 구간은 공중으로 되돌린다 (튕김 중 순간 접촉)

const minAir = Math.max(1, Math.ceil(MIN_AIRBORNE_MS / intervalMs))     // 3
const minGround = Math.max(1, Math.ceil(MIN_GROUNDED_MS / intervalMs))  // 2
```

연속 구간(run)으로 묶어 길이가 기준 미만이면 반대 값으로 뒤집습니다.
**공중 구간을 먼저 정리하고 그다음 지상 구간을 정리**합니다.

> 실제 낙하는 짧아도 5프레임 이상입니다. 20px 낙하 = `√(2×20/720)` ≈ 0.24s = 5프레임.
> `minAir = 3` 은 진짜 낙하를 지우지 않으면서 노이즈만 걷어냅니다.

**4단계 — 동작 배정**

```ts
const MOVE_SPEED = 0.02                 // 정규화 |vx|
const LANDING_DURATION_MS = 375         // landing 6프레임 / 16fps
const landingFrames = Math.ceil(LANDING_DURATION_MS / intervalMs)   // 8

// airborne[i-1] && !airborne[i] 인 지점이 착지 시작
// 그 지점부터 landingFrames 동안, 단 공중으로 다시 바뀌기 전까지만 landing
```

우선순위: `fall` → `landing` → `move` → `idle`

### 5.4 `float` 은 타임라인에 넣지 않습니다

`float` 은 물리 상태가 아니라 **라운드 실패 연출**입니다. `GamePage` 가 재생 종료 후
`result === false` 일 때 덮어씁니다 (§7).

> ⚠️ `result` 는 `SIMULATION_RESULT` 수신 즉시 세팅되므로(`setResult(event.result)`),
> 재생 시작 전부터 `failed` 로 판단하면 **궤적 전체가 `float` 로 재생됩니다.**
> 반드시 `phase === 'FINISHED'` 와 함께 확인하십시오.

### 5.5 임계값 보정 — 실데이터로 반드시 확인할 것

위 숫자는 `GRAVITY = 720` 에서 계산한 출발점입니다. 이 상수는 **지금도 튜닝 중**입니다
(`발 걸리는 현상 수치조절` → `걷기 로직 수정` → `터널링 현상 완화`, `PHYSICS_STEP` 이
1/120 → 1/180 으로 변경됨).

실서버 라운드를 한 판 돌려 확인하십시오.

```ts
// GamePage 의 SIMULATION_RESULT 수신부에 임시로
console.table(event.points.map(([x, y, vx, vy], i, a) => ({
  i, y: Math.round(y), vy: Math.round(vy),
  dvy: i ? Math.round(vy - a[i - 1][3]) : 0,
})))
```

걷는 구간의 `dvy` 분포와 떨어지는 구간의 `dvy` 를 보고 `AIRBORNE_ENTER` 배수(0.5)를 조정합니다.

> 💡 **선택 — 자기 보정**
> 하드코딩된 720 이 부담되면, 해당 라운드 데이터에서 추정할 수 있습니다.
> 양수 `dvy` 의 상위 10% 값이 곧 중력 가속에 해당합니다. 다만 낙하가 전혀 없는 라운드에서는
> 노이즈를 중력으로 오인하므로 **하한값을 반드시 함께 두십시오.**

### 5.6 테스트

| # | 케이스 | 기대 |
|---|---|---|
| 1 | **경사 보행** — `vy=134` 유지, `dvy≈0` | `fall` 아님 ← **핵심 회귀** |
| 2 | 자유낙하 — `dvy≈36` 연속 10프레임 | 해당 구간 `fall` |
| 3 | 1프레임짜리 `dvy` 스파이크 | `fall` 아님 (지속시간 필터) |
| 4 | 튕김 — 공중 사이 1프레임 접촉 | 계속 `fall`, `landing` 아님 |
| 5 | 낙하 → 접지 전이 | 전이 직후 `landing` |
| 6 | 전이 후 8프레임 경과 | `move` 또는 `idle` |
| 7 | 지상 · `vx` 큼 | `move` |
| 8 | 지상 · `vx` 0 | `idle` |
| 9 | **mock 스케일** (`mapWidth=10`, `vx=0.9`) | `move` ← **핵심 회귀** |
| 10 | **실서버 스케일** (`mapWidth=1000`, `vx=190`) | `move` |
| 11 | 타임라인 길이 | `frames.length` 와 동일 |
| 12 | 빈 배열 · `mapWidth=0` | 예외 없이 빈 배열 반환 |

**1번과 9번이 이 명세의 핵심 회귀 테스트입니다.**

---

## 6. FE-CHAR-04 — 컴포넌트와 CSS

**대상**: `src/features/character/SpriteCharacter.tsx` · `SpriteCharacter.css` · `characterSheets.ts`

rev.1 에서 변경 없습니다. 요지만 남깁니다.

### 시트 URL은 CSS 가 아니라 TS 에서

이 저장소는 **CSS `url()` 로 로컬 이미지를 참조한 전례가 없습니다.** 게임 아트는 TS 에서
import 해 인라인 스타일로 넣습니다 (`GamePage.tsx:562` 맵 배경). 같은 패턴을 따르고,
**프레임 수·재생 길이까지 `characterSheets.ts` 한곳에서** 관리합니다.

```tsx
style={{
  left, top,
  '--sheet': `url("${sheet.url}")`,
  '--frames': sheet.frames,
  '--duration': `${sheet.frames / sheet.fps}s`,
} as CSSProperties}
```

CSS 에 프레임 수를 복제하지 마십시오.

### 재생 레시피 2종 — 섞으면 안 됩니다

| 종류 | `to` | 타이밍 | 반복 |
|---|---|---|---|
| 루프 | `-(프레임수) × 폭` | `steps(N)` | `infinite` |
| 1회 후 유지 | `-(프레임수 − 1) × 폭` | `steps(N, jump-none)` | `1 forwards` |

루프 공식을 1회 재생에 쓰면 빈 칸에 멈춥니다.

> ❗ **`background-position-x` 에 % 를 쓰지 마십시오.** 퍼센트는 요소 폭이 아니라
> `(요소 폭 − 이미지 폭)` 기준이라 프레임 경계에 맞지 않습니다.

### 앵커 2종

정렬 모드가 2종이므로 화면 앵커도 2종입니다.

```css
/* 지상: 접지선(216/256 = 84.375%)을 좌표 살짝 아래에 */
.sprite-character { transform: translate(-50%, calc(-1 * var(--ground-ratio) + 1.3cqw)); }
/* 공중: 몸통 중심을 좌표에 */
.sprite-character[data-action="fall"],
.sprite-character[data-action="float"] { transform: translate(-50%, -50%); }
```

`1.3cqw` = 백엔드 `BALL_RADIUS`(13) / `MAP_SIZE`(1000). 물리 좌표는 공의 **중심**이라
반지름만큼 내려야 발이 지면에 닿습니다. `cqw` 는 `.game-board` 의
`container-type: inline-size` 덕에 쓸 수 있습니다.

**미러링은 안쪽 요소에서** — 바깥 `translate` 와 같은 `transform` 에 `scaleX` 를 쓰면
서로 덮어씁니다.

### `prefers-reduced-motion`

프로젝트 전반(5곳)에 대응이 있습니다. 다만 캐릭터 애니메이션은 장식이 아니라 **게임 상태
정보**라 완전히 끄면 정지 이미지가 됩니다. **감속**을 권장합니다.

---

## 7. FE-CHAR-05 — GamePage 연결

**대상**: `src/pages/game/GamePage.tsx`, `GamePage.css`

`ball` 의 타입은 **바꾸지 않습니다.** 타임라인과 재생 인덱스만 추가합니다.

| # | 위치 | 변경 |
|---|---|---|
| 1 | import | `SpriteCharacter`, `buildActionTimeline` |
| 2 | state 선언부 | `const [timeline, setTimeline] = useState<CharacterAction[]>([])`<br>`const [playIndex, setPlayIndex] = useState(0)` |
| 3 | `SIMULATION_RESULT` 수신부 | `setTimeline(buildActionTimeline(event.points, event.intervalMs, mapScale.width))` |
| 4 | 재생 rAF 루프 | `setBall([x,y])` 옆에 `setPlayIndex(frameIndex)` ← **필수** |
| 5 | 라운드 시작 | `setTimeline([])`, `setPlayIndex(0)` |
| 6 | `<div className="game-ball">🐥</div>` | `<SpriteCharacter ... />` 로 교체 |

4번을 빠뜨리면 캐릭터가 첫 동작으로 고정됩니다.

> ⚠️ 3번에서 `mapScale` 은 `map` state 에서 파생됩니다. `SIMULATION_RESULT` 시점에 `map` 이
> 세팅돼 있는지 확인하십시오. 아직이면 재생 시작(`phase === 'PLAYING'`) 시점에
> `useMemo` 로 계산하는 편이 안전합니다.

### action / facing

```tsx
const failed = phase === 'FINISHED' && result === false
const action = failed ? 'float' : (timeline[playIndex] ?? 'idle')
const facing = (frames[playIndex]?.[2] ?? 0) < 0 ? 'left' : 'right'
```

`facing` 은 `vx` 부호만 봅니다. 부호는 스케일과 무관합니다. 경로가 좌→우로 정규화돼 있어
좌향은 드뭅니다.

### ⚠️ CSS 셀렉터 주의

```css
.game-board--sewer-upstream .game-ball { z-index: 7; }
```

맵별 z-index 오버라이드가 **이미 존재합니다**(`GamePage.css:31`). `SpriteCharacter` 최상위
요소에 `game-ball` 클래스를 **함께 부여**하십시오 (`className` prop).

### 선택 — 재생 전에도 캐릭터 보이기

현재 `.game-ball` 은 `phase === 'PLAYING' || 'FINISHED'` 일 때만 렌더됩니다.
`MAP_PREVIEW`·`CAPTURING` 구간에 시작점에서 `idle` 로 서 있게 하면 대기 화면이 살아납니다.
일정이 빠듯하면 후순위입니다.

---

## 8. FE-CHAR-06 — MSW mock 개선 ★ 선행 필수

**대상**: `src/mocks/gameSocketMock.ts`

백엔드 플래그를 안 쓰기로 한 이상, **판정 로직이 맞는지 확인할 수 있는 유일한 로컬 수단이
mock 입니다.** 그런데 현재 mock 프레임은 **속도가 위치와 무관한 상수**입니다.

```ts
// 현재: vx = .9, vy = -.1 고정. 중력이 없어 dvy 가 항상 0
[1.1 + progress * 7.6, 4.05 - Math.sin(progress * Math.PI * 4) * .45 - progress * .75, .9, -.1]
```

`dvy` 가 0이라 **`fall`·`landing` 이 로컬에서 한 번도 재생되지 않습니다.**
일정상 궤적 재생이 8/3~5, 배포가 8/10 이므로 백엔드를 기다렸다 검증하면 시간이 없습니다.
**FE-CHAR-03 보다 먼저 하십시오.**

### 요구사항

1. `vx`, `vy` 를 **실제 위치 변화율과 일치**시킬 것 (현재는 무관한 상수)
2. 낙하 구간에서 `vy` 가 중력 상수만큼 **증가**할 것 — `dvy` 판정의 검증 대상
3. **경사면 보행 구간**을 포함할 것 — `vy` 는 크지만 `dvy ≈ 0` 인 구간. §5.6 1번 케이스의 실제 재현
4. 낙하 → 착지 → 보행이 2~3회 반복되는 궤적
5. 실패 시나리오(`result: false`) 한 종류 — `float` 검증용

mock 은 0~10 스케일을 유지해도 됩니다. 오히려 스케일 정규화 회귀를 상시 검증하는
효과가 있습니다. 단 **중력 상수도 같은 스케일로** 맞춰야 합니다 (`720 × 10/1000 = 7.2`).

---

## 9. FE-CHAR-07 — 검증

### 자동

```bash
npm run lint          # oxlint
npm test              # vitest
npm run build         # tsc -b && vite build
```

추가 테스트

| 대상 | 검증 |
|---|---|
| `buildActionTimeline` | §5.6 의 12종 |
| `characterSheets.ts` ↔ `manifest.json` | `SHEETS[action].frames` 가 스크립트가 실제로 구운 `sheetFrames` 와 일치하는가 |

두 번째가 중요합니다. 원화가 늘거나 줄었는데 스크립트만 다시 돌리고 `SHEETS` 를 안 고치면
애니메이션이 어긋납니다.

### 육안

정지 이미지로는 튐과 표면 부글거림을 **발견할 수 없습니다.** 반드시 재생 상태로 봅니다.
`src/assets/character/preview.html` 을 브라우저에서 바로 열 수 있습니다.

- [ ] 접지선에서 발이 뜨거나 파고들지 않는가
- [ ] 중심선 기준 몸통이 좌우로 흔들리지 않는가
- [ ] 루프 10회 이상 재생 시 마지막→첫 프레임에서 튀지 않는가
- [ ] **경사면 보행이 낙하 모션으로 안 바뀌는가** ← 실서버 라운드로 확인
- [ ] **낙하/착지가 프레임 단위로 깜빡이지 않는가** ← 지속시간 필터 확인
- [ ] 공중 상태에서 캐릭터가 좌표 아래로 처지지 않는가 (앵커 2종)
- [ ] 1회 재생 동작이 빈 칸이 아니라 마지막 프레임에 멈추는가
- [ ] 다크 테마 맵(하수도·강가)에서 캐릭터가 배경에 묻히지 않는가
- [ ] `move`·`fall` 좌향 미러링이 어색하지 않은가

---

## 10. 코드 관례 (이 저장소 기준)

- 페이지·컴포넌트는 **named export** (`App.tsx` 의 `lazy` 매핑 전제)
- 신규 코드는 `@/` path alias
- CSS 는 **컴포넌트별 파일 분리** (`AppHeader.css` 방식)
- 커밋·브랜치에 작업 ID 명시 (`FE-CHAR-03` 등)
- 테스트는 vitest + jsdom + MSW

---

## 11. 팀 확인 필요

| # | 항목 | 내용 |
|---|---|---|
| 1 | **캐릭터 컨셉 불일치** | CLAUDE.md 는 *"엄마 닭을 찾아 떠나는 **병아리**"*, `GamePage` 문구도 *"**병아리**의 이동 경로"*, START 마커는 🐣. 원화는 **아기 오리**. 교체 시 UI 문구·마커도 함께 정리 |
| 2 | `prefers-reduced-motion` | 정지 / 감속 / 예외 중 정책 결정 |
| 3 | 미사용 원화 3종 | `conversion`·`prep_start`·`prep_end` (8장) 전환 연출 도입 여부 |
| 4 | 백엔드 접지 플래그 | 이번에는 안 하기로 했습니다. 물리 튜닝이 끝난 뒤에도 판정이 계속 어긋나면 재검토 대상입니다 (`개발명세서_BE_시뮬레이션_접지플래그.md` 보류 중) |

---

## 12. 원화 측 남은 과제 (아트 요청)

| 항목 | 현황 | 영향 |
|---|---|---|
| 레이어 분리 (잎·먼지·눈물) | 본체에 구워짐 | 착지 강도별 먼지 조절 등 불가 |
| 접지 그림자 | 없음 | 공중에서 높이 판단 어려움. 현재는 CSS `drop-shadow` 로 대체 |
| 텍스처 일관성 (boiling) | 컷마다 깃털 독립 렌더 | 12fps 재생 시 표면이 지글거림. **후처리로 해결 불가** — 마스터 컷 1장을 정하고 나머지를 변형으로 만드는 파이프라인 변경 필요 |
