# 개발명세서 (BE) — 시뮬레이션 접지 플래그 전달

> # ⛔ 보류 (2026-07-31)
>
> **이번 스프린트에서는 진행하지 않습니다.** 프론트엔드가 백엔드 변경 없이
> `vy` 변화량 + 최소 지속시간으로 낙하를 판정하는 방향으로 결정했습니다
> (`개발명세서_FE_캐릭터스프라이트.md` rev.2 §5).
>
> 이 문서는 **참고용으로만** 보관합니다. 물리 튜닝이 끝난 뒤에도 프론트 판정이 계속
> 어긋나면 그때 재검토하십시오. 아래 내용은 그대로 유효합니다.

| 항목 | 내용 |
|---|---|
| 작업 ID | `BE-SIM-01` ~ `BE-SIM-04` |
| 담당 | 백엔드 |
| 대상 모듈 | `backend` — `domain/game` |
| 요청 배경 | 인게임 캐릭터를 이모지에서 스프라이트 애니메이션으로 교체 (FE 명세서 `개발명세서_FE_캐릭터스프라이트.md`) |
| 예상 변경량 | 4개 파일, 실질 20줄 내외 |
| 하위 호환 | **완전 호환** — 기존 프론트는 변경 없이 그대로 동작 |
| 작성일 | 2026-07-31 |

---

## 1. 요청 요약

시뮬레이션 응답에 **프레임별 접지 여부** 배열 하나를 추가해 주십시오.

```jsonc
{
  "intervalMs": 50,
  "points":   [[x, y, vx, vy], ...],   // 기존 그대로, 변경 없음
  "grounded": [false, false, true, true, ...],   // ★ 신규. points 와 같은 길이
  "result": true
}
```

---

## 2. 왜 필요한가

프론트는 캐릭터가 **걷는 중인지 떨어지는 중인지**에 따라 다른 스프라이트를 재생해야 합니다.
현재 응답에는 그 정보가 없어 `vx`, `vy` 로 역산해야 하는데, 아래 이유로 신뢰할 수 없습니다.

**(1) 접지해도 `vy` 가 0 이 아닙니다.**
`simulateStep()` 은 매 스텝 `ball.vy += GRAVITY * dt` 를 더하고 충돌 시 법선 성분만
보정합니다. 접지 중에도 `vy` 는 0 주변에서 진동합니다.

**(2) 경사면 보행이 낙하로 오인됩니다.**
`applyWalkingMotor()` 가 경사 탄젠트 방향으로 `WALK_SPEED`(190)를 밀어넣으므로,
45° 경사를 걸어 내려가면 `vy ≈ 190 × sin(45°) ≈ 134` 가 나옵니다. 포즈 다리가 곧 지형이라
경사면이 대부분인 이 게임에서는 오판이 상시 발생합니다.

**(3) 물리 튜닝 때마다 프론트가 재보정해야 합니다.**
최근 이 파일만 세 번 바뀌었습니다 (`발 걸리는 현상 수치조절` → `걷기 로직 수정` →
`터널링 현상 완화`, `PHYSICS_STEP` 이 1/120 → 1/180 으로 변경). 속도 임계값 방식은
이런 변경마다 프론트에서 값을 다시 맞춰야 합니다.

**(4) 서버가 이미 정답을 계산하고 있습니다.**
`simulateStep()` 의 지역변수 `walkDirection` 이 `null` 이 아니면 곧
"걸을 수 있는 면과 접촉 중"(법선 `ny < -0.15`)입니다. 매 물리 스텝 정확히 계산해서
`applyWalkingMotor()` 에 쓰고 **그대로 버리고 있습니다.**

> CLAUDE.md 아키텍처 원칙(*"물리 계산을 프론트에서 구현하지 말 것 / 서버 권위형"*)에도
> 프론트 역산보다 서버가 사실을 내려주는 쪽이 맞습니다.

---

## 3. 왜 `points` 에 5번째 원소를 넣으면 안 되는가

⚠️ **`[x, y, vx, vy, grounded]` 형태로 확장하지 마십시오.**

현재 프론트 파서(`gameProtocol.ts:220`)가 이렇게 되어 있습니다.

```ts
if (!Array.isArray(point) || point.length !== 4) return null
```

길이가 4가 아니면 **프레임 전체를 버리고 시뮬레이션 이벤트가 `null` 이 됩니다.**
배포된 프론트가 있는 상태에서 백엔드가 먼저 5개를 보내면 **화면에서 캐릭터가 아예
움직이지 않습니다.** 배포 순서를 강제해야 하는 위험이 생깁니다.

**별도 필드로 추가하면 이 문제가 없습니다.** JSON 파싱 시 모르는 필드는 무시되므로,
구버전 프론트는 `grounded` 를 못 본 채 지금과 똑같이 동작합니다.
→ **배포 순서 제약 없음. 백엔드 먼저 배포해도 안전합니다.**

---

## 4. 작업 항목

### BE-SIM-01 — `simulateStep()` 이 접지 여부를 반환하도록 변경

**대상**: `domain/game/service/GamePhysicsSimulator.java`

```java
// AS-IS
private void simulateStep(Ball ball, List<List<Point>> paths,
                          List<List<Point>> terrainPolygons, double dt) {
    ...
    if (walkDirection != null) {
        applyWalkingMotor(ball, walkDirection, dt);
    }
}

// TO-BE
private boolean simulateStep(Ball ball, List<List<Point>> paths,
                             List<List<Point>> terrainPolygons, double dt) {
    ...
    if (walkDirection != null) {
        applyWalkingMotor(ball, walkDirection, dt);
        return true;
    }
    return false;
}
```

기존 로직은 손대지 않고 반환값만 추가합니다. `walkDirection` 산출 방식은 그대로 둡니다.

---

### BE-SIM-02 — 리포팅 프레임 단위로 접지 상태 집계

**대상**: `GamePhysicsSimulator.simulate()`

물리 스텝은 1/180초, 전송 프레임은 50ms 간격이라 **프레임 1개당 물리 스텝이
`FRAME_STEP`(현재 9)개** 입니다.

⚠️ **샘플 시점 한 스텝만 보고 판단하지 마십시오.** 걷는 도중에도 특정 스텝에서
접촉이 순간적으로 끊길 수 있고, 그 스텝이 하필 샘플 지점이면 프론트에서 캐릭터가
한 프레임 낙하 자세로 깜빡입니다.

**구간 내 한 번이라도 접지했으면 `true`** 로 집계해 주십시오.

```java
Ball ball = new Ball(startPoint.x, startPoint.y);
List<List<Double>> frames = new ArrayList<>();
List<Boolean> grounded = new ArrayList<>();

frames.add(frame(ball));
grounded.add(false);          // 시작 지점은 공중에서 낙하 시작

boolean groundedInWindow = false;

for (int step = 1; step <= maxSteps && !success; step++) {
    groundedInWindow |= simulateStep(ball, paths, terrainPolygons, PHYSICS_STEP);

    if (step % FRAME_STEP == 0) {
        frames.add(frame(ball));
        grounded.add(groundedInWindow);
        groundedInWindow = false;      // 다음 구간을 위해 초기화
    }

    success = ball.x >= endPoint.x;
    if (isOutsideMap(ball)) break;
}

// 마지막 프레임 보정 — 여기서도 반드시 두 배열을 함께 추가
if (frames.isEmpty()
        || frames.getLast().get(0) != ball.x
        || frames.getLast().get(1) != ball.y) {
    frames.add(frame(ball));
    grounded.add(groundedInWindow);
}
```

> 💡 **불변조건: `grounded.size() == points.size()`**
> 이 조건이 깨지면 프론트는 `grounded` 를 통째로 무시하고 폴백 모드로 떨어집니다
> (오류는 나지 않지만 애니메이션 품질이 떨어집니다). BE-SIM-04 테스트로 강제하십시오.

---

### BE-SIM-03 — 응답 모델 확장

**대상 3개 파일**

**① `GamePhysicsSimulator.SimulationResult`**

```java
public record SimulationResult(
        Integer intervalMs,
        List<List<Double>> points,
        List<Boolean> grounded,     // ★ 추가
        Boolean result
) {}
```

**② `failedAt()` — 조기 반환 경로도 길이를 맞춰야 합니다**

```java
private SimulationResult failedAt(Point point) {
    return new SimulationResult(
            FRAME_INTERVAL_MS,
            List.of(List.of(point.x, point.y, 0.0, 0.0)),
            List.of(false),          // ★ points 와 같은 길이(1)
            false
    );
}
```

`simulate()` 안에 `failedAt(startPoint)` 반환 경로가 **2곳**(46행 — 포즈 없음/플레이어 수
부족, 61행 — 경로 없음) 있습니다. 둘 다 이 메서드를 타므로 여기 한 곳만 고치면 됩니다.

**③ `message/payload/GameSimulationPayload`**

```java
public record GameSimulationPayload(
        Integer intervalMs,
        List<List<Double>> points,
        List<Boolean> grounded,     // ★ 추가
        Boolean result
) {}
```

**④ `service/GameSimulationService`** — 생성자 인자 전달

```java
new GameSimulationPayload(
        result.intervalMs(),
        result.points(),
        result.grounded(),          // ★ 추가
        result.result()
)
```

> ⚠️ **필드명을 `isGrounded` 로 짓지 마십시오.**
> 이 프로젝트는 Lombok `boolean isHost` / `isSecret` 이 Jackson 에서 `host` / `secret`
> 으로 직렬화돼 프론트가 항상 false 로 받는 사고를 **두 번** 겪었습니다
> (CLAUDE.md 기록). `List<Boolean> grounded` 는 boolean 접두사 규칙에 걸리지 않지만,
> 혼동을 피하기 위해 이름에 `is` 를 붙이지 않습니다.

---

### BE-SIM-04 — 테스트

**대상**: `backend/src/test/.../game/service/GamePhysicsSimulatorTest.java`

기존 테스트 케이스의 맵 설정을 재사용해 아래를 추가해 주십시오.

| # | 검증 내용 | 판정 기준 |
|---|---|---|
| 1 | **길이 일치** | 모든 케이스에서 `grounded.size() == points.size()` |
| 2 | 낙하 시작 | 첫 프레임 `grounded[0] == false` |
| 3 | 지상 보행 구간 | 평지 위를 걷는 구간의 프레임이 `true` |
| 4 | 공중 구간 | 길이 없는 구간을 지날 때 `false` 가 연속으로 나옴 |
| 5 | `failedAt` 경로 | 포즈가 비었을 때 `grounded == [false]`, 길이 1 |
| 6 | 회귀 | 기존 테스트의 `points` 값이 이번 변경으로 달라지지 않음 |

**6번이 중요합니다.** 이번 작업은 관측값 추가일 뿐 물리 거동을 바꾸면 안 됩니다.
`simulateStep()` 의 반환값 추가가 기존 좌표 결과에 영향을 주지 않는지 확인해 주십시오.

---

## 5. 하지 않아도 되는 것

| 항목 | 판단 |
|---|---|
| 상태 enum(idle/walk/fall) 을 서버가 결정 | **불필요.** 서버는 물리적 사실(접촉 여부)만 내려주고, 어떤 모션을 재생할지는 프론트가 정합니다. 연출 정책이 바뀔 때마다 백엔드를 고치지 않기 위함입니다 |
| 상승/하강 구분값 | **불필요.** `vy` 부호로 프론트가 판단합니다. 부호는 스케일과 무관해 안전합니다 |
| 착지 이벤트 별도 전달 | **불필요.** `grounded` 배열에서 `false → true` 전이로 프론트가 계산합니다 |
| `points` 정밀도·구조 변경 | **하지 마십시오.** 프론트 파서가 길이 4를 강제합니다 |

---

## 6. 배포

`grounded` 는 **신규 필드 추가**이므로 순서 제약이 없습니다.

- 백엔드 먼저 배포 → 구버전 프론트는 필드를 무시하고 기존과 동일하게 동작
- 프론트 먼저 배포 → 필드가 없으므로 속도 추론 폴백으로 동작 (FE 명세서 `FE-CHAR-03`)

다만 **프론트 애니메이션 품질은 이 필드가 있어야 제대로 나옵니다.** 8/10 배포 일정과
프론트 작업(8/3~5 궤적 재생)을 고려해 **8/2 까지 반영**되면 프론트가 실서버로 검증할
시간이 확보됩니다.

---

## 7. 확인 요청 사항

1. `walkDirection != null` 을 "접지"로 해석하는 것이 물리 구현 의도와 맞는지 확인 부탁드립니다.
   지형(`resolveTerrainCollision`)과 길(path) 양쪽에서 산출되는데, 프론트는 **둘을 구분하지
   않고** "발이 뭔가를 딛고 있다"로만 씁니다.
2. `PHYSICS_STEP` 이 다시 바뀔 예정이 있다면 알려 주십시오. `FRAME_STEP` 집계 로직이
   그 값에 의존합니다 (로직 자체는 자동으로 따라가지만 검증 필요).
3. 최대 프레임 수는 `MAX_PLAY_SECONDS / (FRAME_INTERVAL_MS/1000)` = 300 개로 봤습니다.
   `grounded` 배열도 같은 상한이라 페이로드 증가는 300 bytes 내외로 추정합니다.
