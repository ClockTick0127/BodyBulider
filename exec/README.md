# BodyBuilder 빌드·배포 및 시연 가이드

이 문서는 GitLab 저장소를 새 환경에 복제한 뒤 빌드·배포하고 시연하기 위한 가이드 문서입니다. 

## 1. 실행 환경과 버전

| 구분 | 제품/버전 | 주요 설정 |
| --- | --- | --- |
| JVM | Eclipse Temurin JDK 21 | Gradle Java toolchain 21, 운영 이미지는 `eclipse-temurin:21-jre-alpine` |
| WAS | Spring Boot embedded Tomcat (Spring Boot 3.5.14) | 내부 포트 8080, 세션 만료 1일, Forwarded Header 사용 |
| 웹 서버 | nginx-unprivileged 1.30.4 | 정적 파일 및 SPA fallback, 내부 포트 8080 |
| 게이트웨이 | nginx-unprivileged 1.30.4 | 80/443, SSL 종료, `/api`, `/ws-stomp` reverse proxy |
| Backend build | Gradle Wrapper 8.14.4 | `clean test bootJar` |
| Frontend | Node.js 22 Alpine, React 19.2, TypeScript 6.0, Vite 8.1 | `npm ci`, `npm run build` |
| DB | MySQL 8.4 | `utf8mb4`, `utf8mb4_0900_ai_ci`, Flyway migration |
| 세션/캐시 | Valkey 8.1 | AOF, 비밀번호 인증, Spring Session namespace `spring:session` |
| 컨테이너 | Docker, Docker Compose v2 | 개발/운영 Compose 분리 |
| IDE | Visual Studio Code 1.131.0, IntelliJ IDEA Ultimate 2026.2 | 기타 JDK 21과 Node.js 22를 인식하는 IntelliJ IDEA 또는 VS Code 모두 사용 가능 |

## 2. 클론 후 로컬 빌드 및 실행

```bash
git clone https://lab.ssafy.com/s15-webmobile1-sub2/S15P12D203.git
cd S15P12D203
cp deploy/dev.env.example deploy/.env.dev
docker compose --env-file deploy/.env.dev -f deploy/compose.development.yaml up -d --build
```

| 서비스 | 기본 주소/포트 |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend/Swagger | `http://localhost:18080`, `/swagger-ui/index.html` |
| MySQL | `127.0.0.1:13306` |
| Valkey | `127.0.0.1:16379` |

상태 확인과 종료:

```bash
docker compose --env-file deploy/.env.dev -f deploy/compose.development.yaml ps
docker compose --env-file deploy/.env.dev -f deploy/compose.development.yaml logs -f backend
docker compose --env-file deploy/.env.dev -f deploy/compose.development.yaml down
```

`down -v`는 MySQL/Valkey 볼륨까지 삭제하므로 데이터 초기화가 필요할 때만 사용합니다.

컨테이너 없이 검증하려면 다음 명령을 사용합니다.

```bash
cd frontend
npm ci
npm run lint
npm run build

cd ../backend
./gradlew clean test bootJar       # Windows: .\gradlew.bat clean test bootJar
```

## 3. 환경 변수

### Frontend 빌드 변수

Vite 변수는 이미지 빌드 시 JavaScript에 포함되어 사용자에게 공개됩니다. secret 또는 DB 비밀번호를 절대 넣지 않습니다.

| 변수 | 필수 여부/기본값 | 설명 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 운영은 빈 값 권장 | API origin. 빈 값이면 현재 origin의 `/api` 사용 |
| `VITE_WS_BASE_URL` | 선택 | STOMP origin. 생략 시 API origin 사용, endpoint는 `/ws-stomp` |
| `VITE_ENABLE_MSW` | `false` | 개발용 Mock Service Worker 활성화 |
| `VITE_GOOGLE_CLIENT_ID` | Google 로그인 시 필수 | 공개 가능한 Google Web client ID |
| `VITE_KAKAO_REST_API_KEY` | Kakao 로그인 시 필수 | 공개 가능한 Kakao REST API key |
| `VITE_TURN_URLS` | 선택 | TURN URL. 쉼표로 여러 주소 지정 |
| `VITE_TURN_USERNAME` | TURN 사용 시 필수 | TURN 사용자명 |
| `VITE_TURN_CREDENTIAL` | TURN 사용 시 필수 | TURN credential(공개 번들 포함에 유의) |

현재 Dockerfile build args는 API, MSW, Google, Kakao 네 변수만 전달합니다. 운영 TURN을 사용할 경우 `frontend/Dockerfile`, `.gitlab-ci.yml`에도 TURN build args를 추가해야 합니다.

### Backend/Compose 런타임 변수

| 변수 | 필수 여부/예시 | 설명 |
| --- | --- | --- |
| `SPRING_PROFILES_ACTIVE` | 운영 `prod` | 개발 Compose는 `dev` |
| `MYSQL_DATABASE` | `bodybuilder` | Compose가 생성할 DB |
| `MYSQL_USER`, `MYSQL_PASSWORD` | 필수 | 애플리케이션 DB 계정 |
| `MYSQL_ROOT_PASSWORD` | 필수 | MySQL 관리 계정 비밀번호 |
| `MYSQL_URL` | Compose에서 조립 | JDBC URL |
| `VALKEY_HOST`, `VALKEY_HOST_PORT` | `valkey:6379` | 세션 저장소 접속 주소 |
| `VALKEY_PASSWORD` | 필수 | Valkey 인증 비밀번호 |
| `CORS_ALLOWED_ORIGIN` | 필수 | scheme/port 포함, trailing slash 없는 정확한 frontend origin |
| `SESSION_COOKIE_SECURE` | HTTPS에서 `true` | Secure session cookie 설정 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google 로그인 시 필수 | Google OAuth 서버 설정 |
| `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI` | Kakao 로그인 시 필수 | Kakao OAuth 서버 설정 |
| `HTTP_PORT`, `HTTPS_PORT` | `80`, `443` | 운영 gateway 공개 포트 |
| `FRONTEND_IMAGE`, `BACKEND_IMAGE` | 운영 필수 | 배포할 로컬 이미지 tag |
| `*_MEMORY_LIMIT` | `.env.example` 참고 | Gateway 128m, Frontend 128m, Backend 768m, MySQL 1024m, Valkey 256m |
| `TZ` | `Asia/Seoul` | 컨테이너 시간대 |

설정 원본은 `.env.example`, `deploy/dev.env.example`, `deploy/compose.*.yaml`입니다. 운영 `/srv/bodybuilder/.env`는 권한을 `600`으로 두고 Git에 커밋하지 않습니다.

## 4. DB 최신본

최신 덤프는 `exec/db_dump_260805/`에 있습니다. 덤프를 복원할 MySQL 서버를 먼저 실행한 뒤, MySQL Workbench 또는 MySQL client 중 한 가지 방법으로 가져옵니다.

### MySQL Workbench에서 가져오기

1. MySQL Workbench에서 복원 대상 서버 연결을 엽니다. 개발 Compose 기본 설정은 호스트 `127.0.0.1`, 포트 `13306`, 사용자 `root`이며 비밀번호는 `deploy/.env.dev`의 `MYSQL_ROOT_PASSWORD` 값입니다.
2. 상단 메뉴에서 **Server > Data Import**를 선택합니다. 왼쪽 **Navigator > Administration > Data Import/Restore**를 선택해도 같습니다.
3. **Import from Dump Project Folder**를 선택하고, 폴더 선택 버튼(`...`)으로 저장소의 `exec/db_dump_260805` 폴더를 지정합니다. 개별 SQL 파일이나 상위 `exec` 폴더가 아니라, 테이블별 SQL 파일들이 들어 있는 폴더 자체를 선택합니다.
4. **Load Folder Contents**를 눌러 덤프 내용을 읽은 뒤, **Select Database Objects to Import**에서 `bodybuilder` 스키마와 가져올 테이블을 모두 선택합니다. 목록이 이미 모두 선택되어 있다면 그대로 진행합니다.
5. 오른쪽 아래의 **Start Import**를 누릅니다. **Import Progress** 탭에서 진행 상태와 로그를 확인하고, 완료 후 왼쪽 **Schemas** 영역을 새로 고침하여 `bodybuilder` 스키마와 테이블이 생성되었는지 확인합니다.

이 절차는 Workbench의 SQL Data Import/Restore 기능을 사용하는 것입니다. 테이블의 우클릭 메뉴에 있는 **Table Data Import Wizard**는 CSV/JSON용이므로 이 덤프 복원에는 사용하지 않습니다.

### MySQL client에서 가져오기

`bodybuilder_import.sql`이 같은 디렉터리의 테이블별 덤프 파일을 `source`하므로, 반드시 해당 디렉터리로 이동한 뒤 실행합니다.

```bash
cd exec/db_dump_260805
mysql -h 127.0.0.1 -P 13306 -u root -p < bodybuilder_import.sql
```

개발 Compose 기본 설정을 변경하지 않았다면 root 비밀번호는 `deploy/.env.dev`의 `MYSQL_ROOT_PASSWORD` 값입니다. 덤프 파일이 `bodybuilder` 데이터베이스를 생성·선택하고 기존 테이블을 `DROP TABLE IF EXISTS` 후 복원하므로, 기존 데이터가 필요한 DB에는 실행하지 않습니다. 복원 후 backend를 재시작하면 포함된 `flyway_schema_history`를 기준으로 이후 migration만 적용됩니다.

## 5. 특이사항

- 카메라와 마이크는 secure context가 필요하므로 실서비스는 HTTPS로 시연합니다.
- Nginx 인증서 경로와 도메인 `bodybuilder.kro.kr`가 고정되어 있습니다. 도메인 변경 시 `deploy/nginx/default.conf`도 수정합니다.
- WebSocket proxy와 긴 게임 연결을 위해 gateway 설정을 임의로 일반 HTTP proxy로 축소하지 않습니다.
- Flyway가 시작 시 V1→V2를 적용하고 JPA는 `ddl-auto=validate`이므로 애플리케이션이 스키마를 자동 변경하지 않습니다.
- 운영 기준 최소 메모리는 8 GiB로 문서화되어 있습니다. 작은 인스턴스에서는 memory limit를 함께 조정합니다.
- 배포 실패 시 새 컨테이너 health check가 통과하지 않습니다. `docker compose logs backend gateway` 확인 후 직전 image tag로 `.env`를 되돌려 재실행합니다.
- 상세 장애 대응 및 인증서 절차는 `docs/deployment.md`, `docs/https-deployment-runbook.md`를 따릅니다.

## 6. 계정 및 프로퍼티 파일 목록

| 파일 | 정의 내용 |
| --- | --- |
| `.env.example` | 운영 DB/Valkey/OAuth/포트/이미지/메모리 변수 템플릿 |
| `deploy/dev.env.example` | 로컬 DB 계정, 포트, OAuth dummy/redirect 값 |
| `frontend/.env.example` | API, STOMP, MSW, Google/Kakao 공개 키, TURN |
| `backend/src/main/resources/application.yml` | 공통 세션/JPA/OAuth endpoint/물리 엔진 설정 |
| `backend/src/main/resources/application-dev.yml` | 개발 MySQL/Valkey/CORS/OAuth 기본값 |
| `backend/src/main/resources/application-prod.yml` | 운영 환경변수 매핑 |
| `deploy/compose.development.yaml` | 개발 컨테이너 접속 정보와 포트 |
| `deploy/compose.production.yaml` | 운영 네트워크, health check, resource limit |
| `backend/src/main/resources/db/migration/V1__create_initial_schema.sql` | 사용자, 소셜 연결, 스테이지, 기록 테이블 |
| `backend/src/main/resources/db/migration/V2__create_admin_observability_schema.sql` | 게임 세션, 이벤트, 오류, replay 테이블 |
| `backend/src/main/resources/db/seed/dev-test-data.sql` | 개발 전용 계정/스테이지/기록 데이터 |
| `deploy/db_dump_260805/bodybuilder_import.sql` | 2026-08-05 기준 DB 전체 덤프를 순서대로 불러오는 진입 파일 |
| `deploy/db_dump_260805/bodybuilder_*.sql` | 테이블별 구조 및 데이터 덤프 파일 |

개발 seed 계정은 `관리자`, `하이`, `바이`이며 공통 비밀번호는 `123123123`입니다. 운영 환경에는 seed 파일을 적용하지 않습니다.

## 7. 외부 서비스

### Google OAuth 2.0

1. Google Cloud Console에서 프로젝트 생성 후 OAuth consent screen을 구성합니다.
2. OAuth client type을 Web application으로 생성합니다.
3. 승인된 JavaScript origin에 서비스 origin, redirect URI에 `${서비스 origin}/api/v1/auth/google/callback`을 등록합니다.
4. Web client ID를 frontend `VITE_GOOGLE_CLIENT_ID`와 backend `GOOGLE_CLIENT_ID`에 동일하게 넣고, secret은 backend `GOOGLE_CLIENT_SECRET`에만 둡니다.
5. scope는 `openid email profile`입니다.

### Kakao Login

1. Kakao Developers에서 애플리케이션을 생성하고 플랫폼 Web 사이트 도메인을 등록합니다.
2. 카카오 로그인 활성화 후 Redirect URI `${서비스 origin}/api/v1/auth/kakao/callback`을 등록합니다.
3. 동의 항목에서 필요한 프로필 정보를 설정합니다.
4. REST API key를 `VITE_KAKAO_REST_API_KEY`, `KAKAO_CLIENT_ID`에 넣고 Client Secret 사용 시 `KAKAO_CLIENT_SECRET`에만 둡니다.

### MediaPipe/Google Storage

- `@mediapipe/tasks-vision`이 브라우저에서 포즈를 추론합니다.
- 모델은 실행 시 `https://storage.googleapis.com/mediapipe-models/.../pose_landmarker_full.task`에서 내려받습니다.
- 별도 가입/API key는 없지만 시연망에서 Google Storage 접근이 가능해야 합니다. 폐쇄망 시 모델을 자체 정적 자산으로 내려받고 코드 URL을 변경해야 합니다.

### WebRTC STUN/TURN

- 기본 STUN은 `stun:stun.l.google.com:19302`이며 가입이 필요 없습니다.
- NAT/방화벽 환경에서 P2P가 실패할 수 있으므로 운영에서는 coturn 또는 TURN SaaS 계정과 URL/username/credential을 준비하는 것이 안전합니다.
- 영상·음성은 peer 간 전송되고 STOMP는 SDP/ICE 시그널링만 담당합니다.

별도의 Photon Cloud 또는 외부 코드 컴파일 서비스는 사용하지 않습니다. 게임 물리는 backend의 dyn4j, frontend/backend 컴파일은 GitLab Runner에서 수행합니다.

```bash
cd ../..
docker compose --env-file deploy/.env.dev -f deploy/compose.development.yaml restart backend
```

이 덤프에는 사용자 및 운영 데이터와 비밀번호 hash가 포함될 수 있으므로 외부 공유와 운영 환경 반입 전에 내용을 확인합니다.

## 8. 시연 시나리오

### 사전 준비

1. HTTPS 서비스와 backend health를 확인하고 Chrome 최신 버전 PC 2~4대를 준비합니다.
2. 각 기기의 카메라/마이크 권한을 허용하고 한 공간에서는 음향 하울링 방지를 위해 한 기기만 스피커를 켭니다.
3. 각 플레이어가 카메라에 상반신과 양팔이 모두 보이도록 약 1.5~2 m 거리를 확보합니다.
4. 소셜 로그인 시연 전 Google/Kakao redirect URI가 현재 도메인과 정확히 일치하는지 확인합니다.

### 기본 시연(약 7분)

| 순서 | 화면 | 클릭/행동 | 확인할 내용 |
| --- | --- | --- | --- |
| 1 | 메인 `/` | 중앙 `START` 클릭 | 비로그인 상태면 로그인 패널 표시 |
| 2 | 로그인 | 닉네임/비밀번호 입력 후 로그인, 또는 Google/Kakao 버튼 클릭 | 로그인 성공 후 사용자 메뉴 표시 |
| 3 | 방 목록 `/rooms` | 우측 `방 만들기` → 제목/정원/비밀번호 입력 → 생성 | 생성자는 방장으로 로비 이동 |
| 4 | 다른 PC 방 목록 | 방 카드의 `참여하기` 또는 4자리 코드 입력 후 `입장하기` | 비밀방이면 비밀번호 modal 처리; `빠른 매칭`도 대안 |
| 5 | 로비 `/rooms/:roomCode` | 브라우저 권한 `허용`; 카메라/마이크 버튼 확인 | 참가자 영상과 음성, 접속 슬롯 표시 |
| 6 | 로비(방장) | 좌우 화살표 또는 stage card를 눌러 스테이지 선택, 필요 시 컷씬 toggle | 선택 정보가 전원에게 동기화 |
| 7 | 로비(참가자) | 우측 하단 `준비하기` 클릭 | 버튼이 `준비 완료됨`으로 변경 |
| 8 | 로비(방장) | 리소스/AI 모델 준비 완료 후 `게임 시작` 클릭 | 시작 컷씬과 게임 화면 전환 |
| 9 | 게임 | `CURRENT TURN`에 자신의 닉네임이 뜨면 양팔로 앞 사람의 선과 다음 지점을 잇는 자세 유지 | 3초 촬영 진행률, 6개 관절 skeleton과 생성된 다리 확인 |
| 10 | 게임 | 다른 플레이어 차례에는 영상으로 자세를 조율 | 네 번 촬영 후 서버 시뮬레이션이 모두에게 동일하게 재생 |
| 11 | 결과 modal | 실패 시 `다시 도전`, 성공 시 다음 라운드 진행 | 3라운드 완료 후 별점/시간 결과 확인 |
| 12 | 결과 modal | `로비로` 클릭 후 상단 사용자 메뉴의 랭킹/마이페이지 이동 | 기록과 stage ranking 반영 확인 |

### 보조 시연 및 장애 대응

- 방이 없으면 `빠른 매칭`이 새 방을 생성할 수 있습니다.
- 카메라가 꺼졌다면 게임 화면 자신의 영상 영역의 `카메라 켜기` 또는 로비의 `다시 연결`을 누릅니다.
- 모델 최초 다운로드가 느릴 수 있으므로 본 시연 전에 한 번 로비에서 preload를 완료합니다.
- WebRTC만 실패하면 TURN 설정과 브라우저 권한을 확인합니다. 게임 상태는 STOMP로 계속 동기화됩니다.
- 관리자 계정으로 `/admin/logs`에 접속하면 활성/종료 게임 세션과 오류를 보조 시연할 수 있습니다.
