# 관리자용 방·게임 관측 MVP

## 1. 목표

관리자가 진행 중인 방·게임의 현재 상태를 확인하고, 종료된 게임의 과거 타임라인과 오류 상세를 조회할 수 있게 한다. 방 이력은 MySQL에 보존하지 않는다.

MVP에서는 전체 payload와 포즈 좌표 원문을 저장하지 않고 SUMMARY만 수집한다.

---

## 2. 전체 구조

```text
진행 중
├─ 현재 방·게임 상태     → Valkey
├─ 임시 SUMMARY 이벤트   → Valkey Stream
└─ 관리자 실시간 전달    → STOMP

게임 정상·비정상 종료
├─ 최종 게임 결과        → MySQL game_sessions
└─ 게임 SUMMARY 타임라인 → MySQL session_events 일괄 저장

중요 서버 오류
└─ 오류 상세             → MySQL error_details 즉시 저장
```

진행 중에는 정상 이벤트 때문에 MySQL을 갱신하지 않는다. 게임이 종료될 때 게임 Stream을 MySQL로 옮긴다. 방 Stream은 방 종료 후 짧은 TTL로 삭제한다.

---

## 3. 관리자 화면

### 3.1 진행 중인 세션

관리자 화면에 처음 들어오면 Valkey에서 현재 상태와 지금까지의 임시 이벤트를 조회한다. 이후 새 이벤트는 관리자 전용 STOMP 채널로 받는다.

표시 정보:

- 방 코드와 방·게임 세션 ID
- 현재 참가자와 게임 상태
- 스테이지와 라운드
- 시작 시각과 최근 이벤트
- 지금까지의 SUMMARY 타임라인

### 3.2 종료된 게임

MySQL에서 최종 결과와 저장된 타임라인을 조회한다.

```text
14:01:20  GAME_STARTED         stage=1
14:01:25  ROUND_STARTED        round=1
14:01:31  POSE_ACCEPTED        3/4명 제출, 좌표 33개
14:01:36  ROUND_COMPLETED      duration=11s
14:02:18  GAME_ERROR           errorId=ERR-20260731-001
```

일반 이벤트를 선택하면 저장된 SUMMARY를 보여준다.

```text
이벤트 타입     POSE_ACCEPTED
메시지 방향     CLIENT → SERVER
메시지 타입     GAME_CAPTURING_RESPONSE
처리 결과       SUCCESS
처리시간        18ms
요약             captureNo=3, pointCount=33, 제출=3/4
```

오류 이벤트를 선택하면 `error_details`의 오류 코드, 예외 클래스, 메시지와 스택 트레이스를 보여준다.

---

## 4. Valkey

### 4.1 현재 상태

기존 방·게임 상태에 관리자 전체 목록용 인덱스를 추가한다.

```text
room:<roomSessionId>
game:<gameSessionId>
rooms:active
games:active
```

- `rooms:active`: 비밀방, 정원 마감, 게임 중인 방을 포함한 모든 활성 방 ID
- `games:active`: 현재 진행 중인 모든 게임 ID

### 4.2 임시 이벤트

방과 게임에서 발생한 SUMMARY를 각각의 Stream에 순서대로 추가한다.

```text
admin:events:room:<roomSessionId>
admin:events:game:<gameSessionId>
```

예시:

```json
{
  "eventId": "event-uuid",
  "eventType": "POSE_ACCEPTED",
  "occurredAt": "2026-07-31T05:01:31.512Z",
  "summary": {
    "captureNo": 3,
    "pointCount": 33,
    "submittedCount": 3,
    "participantCount": 4
  }
}
```

- 관리자가 중간에 접속하면 Stream에서 이전 이벤트를 먼저 읽는다.
- 이후 이벤트는 STOMP로 이어서 받는다.
- 게임 Stream은 MySQL 저장 성공 후 짧은 유예 기간을 두고 삭제한다.
- 방 Stream은 MySQL에 저장하지 않고 방 종료 후 1~6시간 내 삭제한다.

---

## 5. MySQL

### 5.1 `game_sessions`

종료된 게임의 최종 결과를 한 행으로 저장한다. 진행 중에는 행을 생성하거나 갱신하지 않는다.

| 컬럼 | 역할 |
|---|---|
| `game_session_id` | PK. `gameSessionId`를 그대로 사용 |
| `room_session_id` | 게임이 진행된 방 ID |
| `room_code` | 사용자 문의와 관리자 검색에 사용할 방 코드 |
| `room_title` | 게임 시작 당시 방 제목 |
| `stage_id` | 플레이한 스테이지 |
| `final_status` | 종료 원인. `COMPLETED`, `ERROR`, `ABORTED` |
| `game_result` | 정상 종료 결과. `CLEARED`, `NOT_CLEARED`, 오류 종료는 `NULL` |
| `started_at` | 게임 시작 시각 |
| `ended_at` | 게임 종료 시각 |
| `created_at` | 종료 결과를 MySQL에 아카이브한 시각 |

저장 시점:

- 게임 정상 종료: `final_status=COMPLETED`, `game_result=CLEARED` 또는 `NOT_CLEARED`
- 게임 로직 오류: `final_status=ERROR`, `game_result=NULL`
- 서버 재시작 또는 장시간 무응답 복구: `final_status=ABORTED`, `game_result=NULL`

현재 참가자 수, 현재 라운드, 비밀방 여부 등 변동이 잦거나 로그 검색에 불필요한 값은 저장하지 않는다. 방 코드와 제목은 게임 검색을 위한 스냅샷으로만 저장한다.

### 5.2 `session_events`

Valkey Stream에 임시 저장한 SUMMARY를 세션 종료 시 일괄 INSERT한다.

| 컬럼 | 역할 |
|---|---|
| `session_event_id` | DB 내부 자동 증가 PK |
| `game_session_id` | 이벤트가 속한 종료 게임 FK. 값은 `gameSessionId` |
| `sequence_no` | 해당 게임 안에서의 이벤트 순서 |
| `event_id` | 이벤트 UUID. 재시도 시 중복 저장 방지 |
| `event_type` | 관리자 타임라인용 이벤트 이름 |
| `message_type` | 관련 STOMP 메시지 타입. 내부 이벤트는 `NULL` 가능 |
| `severity` | `INFO`, `WARN`, `ERROR` |
| `direction` | `INBOUND`, `OUTBOUND`, `INTERNAL` |
| `result` | `SUCCESS`, `REJECTED`, `FAILED` |
| `actor_uuid` | 이벤트를 발생시킨 사용자 ID |
| `summary` | 관리자에게 보여줄 요약 JSON |
| `payload_size_bytes` | 원본 payload 크기. 원본 자체는 저장하지 않음 |
| `duration_ms` | 서버 처리시간 |
| `error_id` | 관련 오류가 있으면 `error_details` 참조 |
| `occurred_at` | 도메인 또는 클라이언트 기준 발생 시각 |
| `server_received_at` | 서버가 실제로 수신한 시각 |
| `schema_version` | `summary` JSON 구조 버전 |
| `created_at` | MySQL에 아카이브한 시각 |

- `sequence_no`는 해당 게임 아카이브 안에서 이벤트 순서를 보장한다.
- `event_id` UNIQUE로 종료 처리 재시도 시 중복 저장을 방지한다.
- 포즈 이벤트는 좌표 원문 대신 좌표 개수, 제출 인원과 처리시간만 저장한다.

### 5.3 `error_details`

REST, STOMP 또는 스케줄러에서 발생한 중요한 서버 예외를 발생 즉시 저장한다.

| 컬럼 | 역할 |
|---|---|
| `error_id` | 오류 UUID PK |
| `source` | 발생 경로. `REST`, `STOMP`, `SCHEDULER` |
| `severity` | `WARN` 또는 `ERROR` |
| `error_code` | 애플리케이션 오류 코드 |
| `exception_class` | Java 예외 클래스 |
| `message` | 민감정보를 제거한 내부 오류 메시지 |
| `stack_trace` | 개발자 디버깅용 스택 트레이스 |
| `room_session_id` | 관련 방 ID. 시스템 오류는 `NULL` |
| `game_session_id` | 관련 게임 ID |
| `user_uuid` | 오류를 발생시킨 요청의 사용자 ID |
| `request_id` | REST 요청 추적 ID |
| `trace_id` | 서비스 간 추적 ID |
| `event_id` | 관련 STOMP·게임 이벤트 ID |
| `context` | HTTP 경로, STOMP destination 등의 요약 JSON |
| `created_at` | 오류 발생·저장 시각 |
| `expires_at` | 상세 오류 자동 삭제 기준 시각 |

진행 중에는 `game_sessions` 행이 아직 없으므로 오류는 `room_session_id`와 `game_session_id`로 연결한다. 종료 시 저장되는 `session_events.error_id`가 오류 상세를 참조한다.

다음 오류는 상세 저장한다.

- 예상하지 못한 HTTP 500
- Redis 또는 MySQL 접근 실패
- 게임 상태 데이터 불일치
- 메시지 역직렬화 실패
- 게임 스케줄러 실패
- STOMP 처리 중 예상하지 못한 예외

잘못된 비밀번호, 가득 찬 방, 잘못된 입력, 중복 이벤트 같은 예상된 거절은 스택 트레이스를 저장하지 않고 SUMMARY만 남긴다.

---

## 6. 상황별 처리

### 정상 종료

```text
GAME_COMPLETED
    ↓
Valkey Stream 조회
    ↓
MySQL 트랜잭션
├─ game_sessions 1행 INSERT
└─ session_events N행 일괄 INSERT
    ↓
저장 성공 후 Valkey Stream 만료
```

### 중요 오류

```text
예외 발생
├─ error_details 즉시 INSERT
├─ Valkey Stream에 errorId가 포함된 GAME_ERROR 추가
└─ 관리자 STOMP 채널로 즉시 전송
```

오류가 게임 종료로 이어지면 최종 결과와 전체 타임라인을 MySQL에 일괄 저장한다.

### 서버 강제 종료

Valkey에 임시 로그가 남아 있으므로 재시작 후 복구 작업이 미완료 세션을 찾는다.

```text
미완료 게임 발견
    ↓
final_status = ABORTED
    ↓
Valkey SUMMARY를 MySQL에 일괄 저장
```

복구 대상 예시:

- 백엔드 시작 시 Valkey에 남아 있는 진행 중 게임
- 마지막 이벤트 이후 일정 시간 동안 무응답인 게임
- 참가자가 모두 연결 해제된 게임
- TTL 만료가 가까운 미완료 세션

---

## 7. API와 실시간 채널

REST API 예시:

```text
GET /api/v1/admin/sessions/active
GET /api/v1/admin/sessions/archived
GET /api/v1/admin/sessions/{sessionId}/events
GET /api/v1/admin/errors
GET /api/v1/admin/errors/{errorId}
```

실시간 채널 예시:

```text
/topic/admin/sessions
/topic/admin/sessions/{sessionId}
```

REST와 STOMP 구독 모두 `ROLE_ADMIN`을 확인한다.

---

## 8. 저장하지 않는 정보

- 방 비밀번호
- 세션 쿠키
- OAuth 및 Authorization 토큰
- WebRTC SDP와 ICE candidate 원문
- 포즈 좌표 원문
- 전체 REST/STOMP payload

권장 보존 기간:

| 데이터 | 보존 기간 |
|---|---|
| Valkey 임시 이벤트 | 종료 후 수 시간 또는 MySQL 저장 확인 시까지 |
| 게임 최종 결과와 SUMMARY | 7~30일 |
| 오류 상세와 스택 트레이스 | 7일 |

---

## 9. 구현 순서

1. Valkey 활성 방·게임 인덱스와 임시 이벤트 Stream
2. 관리자 전용 REST/STOMP 권한 검증
3. 진행 중 세션 목록과 실시간 타임라인
4. REST/STOMP 공통 오류 즉시 저장
5. 게임 정상 종료 시 최종 결과와 이벤트 일괄 저장
6. 비정상 종료 복구 및 중복 방지
7. 종료 게임과 오류 상세 화면
8. 보존 기간에 따른 자동 삭제
