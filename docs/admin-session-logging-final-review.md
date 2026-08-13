# 관리자용 세션 로그 최종 점검

## 결론

현재 방향은 적절하며, 아래 필수 항목을 보완하는 조건으로 승인한다.

```text
진행 상태·임시 SUMMARY → Valkey
실시간 전달            → STOMP
종료 게임·타임라인     → MySQL 일괄 저장
중요 오류 상세         → MySQL 즉시 저장
```

정상 이벤트마다 MySQL을 갱신하지 않는다.

## 최종 처리 방식

| 상황 | 처리 |
|---|---|
| 방 생성·참가·퇴장 | Valkey 방 상태·Stream 저장 후 STOMP 전송 |
| 게임 진행 | Valkey 게임 상태·Stream에 SUMMARY 저장 후 STOMP 전송 |
| 중요 서버 오류 | 민감정보를 제거한 `error_details` 저장 시도 |
| 게임 종료 | `game_sessions`와 `session_events`를 한 트랜잭션으로 저장 |
| 방 종료 | DB에 저장하지 않고 방 Stream을 짧은 TTL 후 삭제 |
| DB 장애 | Stream을 보존하고 재시도하며 게임 처리는 막지 않음 |
| 서버 재시작 | 남은 게임을 `ABORTED` 처리 후 동일하게 아카이브 |

저장 대상은 종료된 게임의 결과, 방 코드·제목 스냅샷, 시각, 이벤트 타입, 인원·좌표 개수·처리시간 등의 SUMMARY다.

비밀번호, 토큰, 쿠키, 포즈 좌표, SDP/ICE, 전체 payload는 저장하지 않는다.

## 구현 전 필수 수정

1. `/api/v1/admin/**`, `/topic/admin/**`에 `ROLE_ADMIN`을 강제한다.
2. WebSocket Origin `*`를 제거하고 운영 프론트 도메인만 허용한다.
3. 방 Stream은 실시간 확인용으로만 사용하고 게임 Stream만 MySQL에 저장한다.
4. 마지막 Stream cursor를 고정하고 종료 아카이브를 멱등 처리한다.
5. MySQL 커밋 전에는 Stream을 삭제하지 않고 성공 후에도 짧은 TTL을 둔다.
6. `GAME_STARTED`와 종료 이벤트에 방 코드·제목·stage·startedAt을 스냅샷한다.
7. Scheduler 예외도 공통 종료 로직에서 `ERROR` 또는 `ABORTED` 처리한다.
8. `STOMP_DISCONNECTED`와 실제 `PLAYER_LEFT`를 분리한다.
9. 관리자 조회는 방 TTL을 갱신하지 않는 별도 조회를 사용한다.
10. Stream `MAXLEN`, TTL, payload·SUMMARY 크기 상한을 둔다.

## 스키마 점검

- `session_events.event_id`는 서버 생성 UUID를 사용한다.
- 클라이언트 메시지 ID는 nullable `message_event_id`로 분리한다.
- `game_sessions`는 게임만 저장하며 `game_session_id`를 `gameSessionId`로 사용한다.
- 게임 전용이므로 `game_sessions`와 `session_events`에는 `session_type`을 두지 않는다.
- `final_status`는 `COMPLETED/ERROR/ABORTED`처럼 게임 종료 원인만 표현한다.
- 게임 결과는 `CLEARED/NOT_CLEARED` 같은 별도 `game_result`로 둔다.
- `server_received_at`에는 DB 저장 시각이 아니라 Stream 수신 시각을 넣는다.
- 향후 연동을 위해 nullable `request_id`, `trace_id`, `source_channel`을 검토한다.
- `session_events → game_sessions` FK만 유지하고 stage·user·error FK는 제거를 권장한다.
- 보존 기간 삭제를 위해 `game_sessions(ended_at)` 인덱스를 검토한다.
- 아직 배포되지 않은 스키마 변경은 V2에 통합하고, 배포 후에는 기존 마이그레이션을 수정하지 않는다.

## 효율·보안

- 이벤트 생성은 도메인 상태 변경 지점 한 곳으로 통일한다.
- Valkey 저장과 STOMP 발행은 `SessionEventRecorder`가 담당한다.
- 전역 토픽에는 생성·종료만, 포즈 등은 세션 상세 토픽에만 전송한다.
- active 목록은 Sorted Set과 pipeline/MGET으로 조회한다.
- Stream이 잘리면 관리자 UI에 이력 누락 경고를 표시한다.
- 반복 가능한 잘못된 요청·인증 실패는 `error_details`에 건별 저장하지 않는다.
- 오류 저장 실패가 게임 종료나 세션 아카이브를 막아서는 안 된다.
- 관리자 API는 비밀번호가 없는 전용 DTO를 반환한다.
- OAuth 오류 응답 원문 로그는 제거하거나 마스킹한다.
- 오류 상세 응답은 `no-store`, UI 문자열은 plain text로 처리한다.

## Nginx 등 확장

```text
방 SUMMARY               → Valkey에서만 임시 보존
게임 SUMMARY             → Valkey/MySQL
Nginx·Backend·Frontend 로그 → OTel/Alloy → Loki/Grafana
```

두 로그는 `request_id`, `trace_id`, `event_id`, 방·게임 ID로 연결한다. Nginx 원본 로그를 `session_events`에 넣지 않는다.

현재 Simple Broker는 다중 백엔드에서 누락될 수 있으므로 publisher 인터페이스 뒤에 숨기고, 확장 시 외부 broker 또는 공용 Pub/Sub을 사용한다.

## 구현 순서

1. 관리자 권한·Origin·입력 제한
2. 이벤트 ID·Stream 범위·종료 상태 규격
3. 방·게임 Stream과 active 인덱스
4. 공통 기록기·멱등 아카이브·재시작 복구
5. 관리자 UI·보존 정리·장애 테스트

## 승인 기준

- 일반 사용자가 관리자 데이터에 접근할 수 없다.
- 정상·오류·강제 종료가 같은 아카이브 경로를 탄다.
- 중간 장애에도 세션이 중복 저장되거나 유실되지 않는다.
- 관리자 조회나 재연결이 실제 방 상태를 변경하지 않는다.
- 민감정보와 원본 포즈가 저장되지 않는다.
- Stream과 DB 저장량에 상한이 있다.
