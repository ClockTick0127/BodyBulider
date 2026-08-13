
# React + TypeScript + Vite


### 후속 개발 안내

정식 기능 개발 시에는 실제 서비스 명세에 따라 START 흐름을 복원하고, 서버를 기준으로
방 상태를 조회·복구할 수 있도록 방 입장과 재접속 구조를 다시 구현해야 합니다. 또한
STOMP 이벤트 및 WebRTC 연결의 생성·수신·정리 과정도 확정된 프로토콜과 생명주기에 맞춰
교체해야 합니다.

따라서 현재 구현과 `docs/작업요청사항.md`는 MVP 시연 범위의 참고 자료로만 사용하고,
새 기능의 설계 근거나 재사용 가능한 운영 코드로 취급하지 마세요.

## 인게임 통신 테스트

`/comm-test` 경로에서 통신 테스트 페이지에 접근할 수 있습니다.

연결을 수립하기 전에 Backend의 `SecurityConfig`에서 테스트에 사용하는 API의 접근 권한을
허용해야 합니다. 해당 권한이 열려 있지 않으면 연결할 수 없습니다.

## MSW 인증 모킹

`npm run dev`로 개발 서버를 실행하면 MSW가 기본적으로 활성화됩니다. 실제 API 서버에
연결할 때는 `.env.local`에 `VITE_ENABLE_MSW=false`를 설정하세요.

테스트 계정 및 시나리오:

- 일반 로그인: 닉네임 `syncup`, 비밀번호 `password123`
- 일반 회원가입: 사용 가능한 닉네임과 8자 이상의 비밀번호 입력
- 닉네임 중복 확인: `syncup` 또는 `google_player`(대소문자 구분 없음)
- Google: 기존 사용자인 `google_player`로 즉시 로그인
- Kakao: 최초 소셜 회원가입을 위한 닉네임 설정 화면 표시

회원가입으로 생성한 모의 사용자는 페이지를 완전히 새로고침하기 전까지 메모리에 유지됩니다.

## 인증 설정

`.env.example`을 `.env.local`로 복사한 후 서비스 API URL과 소셜 앱 키를 설정하세요.

프런트엔드는 다음 서비스 엔드포인트를 사용합니다.

- `POST /api/auth/social`: Google 액세스 토큰 또는 Kakao 인가 코드를 받아 `AUTHENTICATED`나 `NICKNAME_REQUIRED`를 반환합니다. 인증 및 가입 대기 상태는 서버 세션에 저장합니다.
- `POST /api/auth/social/complete`: 서버 세션에 저장된 가입 대기 상태와 닉네임으로 최초 소셜 회원가입을 완료합니다.
- `GET /api/users/nickname/availability?nickname=...`: 닉네임 사용 가능 여부를 확인합니다. 데이터베이스에도 닉네임 고유성 제약 조건을 반드시 적용해야 합니다.
- `POST /api/auth/signup`, `POST /api/auth/login`: `nickname`을 로그인 식별자로 사용하는 일반 회원가입 및 로그인 엔드포인트입니다. 별도의 아이디는 사용하지 않습니다.
- `GET /api/auth/session`: 현재 세션의 로그인 사용자를 반환하며, 미인증 상태에서는 `401`을 반환합니다.
- `POST /api/auth/logout`: 현재 서버 세션을 무효화하고 `204`를 반환합니다.

인증 성공 응답은 `{ status: 'AUTHENTICATED', user }` 형태이며 JWT를 포함하지 않습니다. 서버는 세션 ID를 `HttpOnly` 쿠키로 발급하고, 프런트엔드는 모든 API 요청에 `credentials: 'include'`를 사용합니다. 운영 환경에서는 쿠키에 `Secure`와 서비스 구성에 맞는 `SameSite` 속성을 적용해야 합니다.

Kakao 개발자 설정에서 프런트엔드 페이지 URL을 허용된 리디렉션 URI로 등록해야 합니다.
서비스 서버는 반환된 인가 코드를 Kakao 토큰으로 교환하며 해당 토큰을 브라우저에 노출하지 않습니다.


