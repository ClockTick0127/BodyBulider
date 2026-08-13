# Bodybuilder Backend Template

Spring Boot 백엔드 프로젝트를 빠르게 시작하기 위한 기본 템플릿입니다.

공통 응답과 예외 처리, 로컬 회원가입·로그인, JPA 사용자 모델, Spring Security, CORS, Redis JSON 직렬화 설정까지 포함합니다. OAuth 로그인, Redis 기반 세션, WebSocket/STOMP는 아직 구현되지 않았습니다.

## 1. 기술 스택

| 구분 | 버전 또는 구성 |
| --- | --- |
| Java | JDK 21 |
| Spring Boot | 3.5.14 |
| Gradle | 8.14.4 Wrapper |
| 데이터베이스 | MySQL |
| ORM | Spring Data JPA / Hibernate |
| 보안 | Spring Security |
| Redis 클라이언트 | Spring Data Redis / Lettuce |
| API 문서 | springdoc-openapi 2.8.16 |
| 테스트 DB | H2 |

Spring Boot는 Maven Central에 배포된 정식 `3.5.14` 버전을 사용합니다.

## 2. 주요 의존성

`build.gradle`에 다음 의존성이 포함되어 있습니다.

- `spring-boot-starter-web`: REST API와 내장 Tomcat
- `spring-boot-starter-data-jpa`: 엔티티 및 Repository 기반 DB 접근
- `spring-boot-starter-security`: 인증·인가 필터 체인
- `spring-boot-starter-validation`: 요청 값 검증
- `spring-boot-starter-data-redis`: Redis/Valkey 연결과 `RedisTemplate`
- `spring-boot-starter-actuator`: 컨테이너 상태 확인용 health endpoint
- `flyway-core`, `flyway-mysql`: 버전 관리되는 운영 DB 마이그레이션
- `springdoc-openapi-starter-webmvc-ui`: OpenAPI 및 Swagger UI
- `mysql-connector-j`: 운영용 MySQL 드라이버
- `lombok`: Getter, 생성자, Builder 코드 생성
- `spring-boot-starter-test`, `spring-security-test`, `h2`: 테스트 지원

아직 포함하지 않은 의존성:

- OAuth 로그인: `spring-boot-starter-oauth2-client`
- Redis 세션: `spring-session-data-redis`
- WebSocket/STOMP: `spring-boot-starter-websocket`

## 3. 디렉터리 구조

```text
src
├─ main
│  ├─ java/org/ssafy/bodybuilder
│  │  ├─ BodyBuilderApplication.java
│  │  ├─ common
│  │  │  ├─ config
│  │  │  │  └─ EnableConfigurationPropertiesConfig.java
│  │  │  ├─ error
│  │  │  │  ├─ GlobalException.java
│  │  │  │  └─ GlobalExceptionHandler.java
│  │  │  ├─ model
│  │  │  │  └─ BaseTimeEntity.java
│  │  │  ├─ response
│  │  │  │  ├─ BaseResponse.java
│  │  │  │  ├─ ErrorCode.java
│  │  │  │  └─ SuccessCode.java
│  │  │  └─ security
│  │  │     └─ config
│  │  │        ├─ SecurityConfig.java
│  │  │        └─ properties/CorsProperties.java
│  │  ├─ domain
│  │  │  └─ user
│  │  │     ├─ api/UserController.java
│  │  │     ├─ dao/UserRepository.java
│  │  │     ├─ dto/UserInfoDto.java
│  │  │     ├─ model/User.java, UserRole.java
│  │  │     └─ service/UserService.java
│  │  └─ infra
│  │     └─ config/RedisConfig.java
│  └─ resources
│     ├─ application.yml
│     ├─ application-dev.yml
│     ├─ application-prod.yml
│     └─ db/migration/V1__create_users.sql
└─ test
   ├─ java/org/ssafy/bodybuilder/BodyBuilderApplicationTests.java
   └─ resources/application.yml
```

패키지 역할:

- `common`: 여러 도메인에서 함께 쓰는 응답, 예외, 보안 설정
- `domain`: 실제 비즈니스 기능. 현재는 사용자 조회 예제만 포함
- `infra`: Redis처럼 외부 인프라와 연결되는 공통 설정
- `api`: HTTP 요청을 받는 Controller
- `service`: 비즈니스 로직과 트랜잭션 경계
- `dao`: JPA Repository 등 데이터 접근
- `dto`: API 또는 계층 사이에서 전달할 데이터
- `model`: JPA Entity와 도메인 타입

## 4. 현재 구현된 기능

### 공통 API 응답

`BaseResponse<T>`를 통해 성공과 실패 응답 형식을 통일합니다.

```json
{
  "code": "C003",
  "status": 401,
  "message": "인증 정보가 유효하지 않습니다."
}
```

성공·실패 코드와 HTTP 상태는 `SuccessCode`, `ErrorCode`에서 관리합니다.

### 공통 예외 처리

`GlobalExceptionHandler`가 다음 예외를 공통 JSON 응답으로 변환합니다.

- `GlobalException`: 프로젝트에서 의도적으로 발생시킨 예외
- `MethodArgumentNotValidException`: 요청 값 검증 실패
- 그 외 `Exception`: 서버 내부 오류

### 사용자 조회 예제

```http
GET /api/v1/user
```

`User.id`는 Hibernate의 `@UuidGenerator`로 생성하며 MySQL `BINARY(16)` 컬럼에 저장합니다.

인증 principal에서 `userId`를 UUID로 받아 사용자를 조회하는 형태만 구현되어 있습니다.

```java
@AuthenticationPrincipal(expression = "userId") UUID userId
```

현재 로컬 로그인은 UUID 자체를 principal로 저장합니다. 따라서 이 API의 `@AuthenticationPrincipal(expression = "userId")`와 principal 형식이 아직 일치하지 않으며, 실제 사용 전에 둘 중 하나로 통일해야 합니다.

### 로컬 회원가입과 로그인

```http
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
```

회원가입과 로그인 성공 시 Spring Security 세션을 만들고 `JSESSIONID` 쿠키를 사용합니다. frontend가 호출하는 세션 조회 API와 소셜 로그인 API는 아직 구현되지 않았습니다.

### Spring Security 기본 틀

`SecurityConfig`에는 다음 설정이 있습니다.

- 폼 로그인과 HTTP Basic 비활성화
- 인증되지 않은 요청은 401 JSON 응답
- 권한이 부족한 요청은 403 JSON 응답
- CORS 설정
- 필요할 때만 HTTP 세션 생성
- `SecurityContext`를 `HttpSession`에 저장
- `POST /api/auth/logout` 요청 시 세션 무효화 및 로그아웃 JSON 응답
- OAuth 기본 경로 `/oauth2/**`, `/login/oauth2/**` 허용

현재 OAuth 인증 기능은 구현되어 있지 않습니다. CSRF는 현재 비활성화되어 있으므로 HTTPS와 CSRF 정책을 확정하기 전에는 실제 사용자 인증 정보를 운영하지 않습니다.

### Redis/Valkey 기본 틀

Spring Boot가 활성 프로필의 Redis 설정을 읽어 `RedisConnectionFactory`를 자동 생성합니다.

`RedisConfig`는 애플리케이션 데이터 저장에 사용할 `RedisTemplate<String, Object>` Bean을 제공합니다. 현재 HTTP 세션은 Redis에 저장되지 않습니다.

## 5. 설정

공통 설정은 `application.yml`, 로컬 기본값은 `application-dev.yml`, 운영에서
반드시 주입할 값은 `application-prod.yml`에 둡니다. 프로필을 지정하지 않으면
`dev`가 기본으로 활성화되고 운영 Compose는 `SPRING_PROFILES_ACTIVE=prod`를
명시합니다.

### 운영 필수 환경변수

| 환경변수 | 설명 |
| --- | --- |
| `MYSQL_URL` | MySQL JDBC URL |
| `MYSQL_USER` | MySQL 사용자 이름 |
| `MYSQL_PASSWORD` | MySQL 비밀번호 |

### 개발 환경변수 오버라이드

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `CORS_ALLOWED_ORIGIN` | `http://localhost:5173` | 허용할 프론트엔드 Origin |
| `SESSION_COOKIE_SECURE` | `false` | HTTPS에서만 세션 쿠키 전송 여부 |
| `VALKEY_HOST` | `localhost` | Redis/Valkey 호스트 |
| `VALKEY_HOST_PORT` | `6379` | Redis/Valkey 포트 |
| `VALKEY_PASSWORD` | 빈 값 | Redis/Valkey 인증 비밀번호 |

JPA의 `open-in-view`는 `false`입니다. 따라서 필요한 엔티티 조회와 DTO 변환은 서비스 트랜잭션 안에서 끝내는 것을 기본으로 합니다.

## 6. 로컬 실행

전체 로컬 스택은 저장소 루트에서 Docker Compose로 실행할 수 있습니다.

```bash
docker compose -f deploy/compose.development.yaml up -d --build
```

Backend만 호스트에서 실행하려면 다음 순서를 사용합니다.

1. JDK 21, MySQL, Redis/Valkey를 실행합니다.
2. 환경변수를 설정합니다.
3. Gradle Wrapper로 애플리케이션을 실행합니다.

PowerShell 예시:

```powershell
$env:MYSQL_URL='jdbc:mysql://localhost:3306/bodybuilder'
$env:MYSQL_USER='root'
$env:MYSQL_PASSWORD='<LOCAL_MYSQL_PASSWORD>'
$env:VALKEY_HOST='localhost'
$env:VALKEY_HOST_PORT='6379'
# 인증을 사용한다면 다음 값도 지정합니다.
# $env:VALKEY_PASSWORD='<LOCAL_VALKEY_PASSWORD>'
./gradlew.bat bootRun
```

## 7. 테스트

```powershell
./gradlew.bat test
```

테스트 환경에서는 MySQL 대신 인메모리 H2를 사용합니다. 인증되지 않은 보호 API 요청의 401 응답과 익명 Actuator health 조회를 확인합니다.

## 8. 앞으로 구현할 부분

- OAuth 제공자 설정과 사용자 매핑
- 세션 조회 API와 frontend가 기대하는 principal 형식 통일
- 필요하면 `spring-session-data-redis`를 이용한 Redis/Valkey 세션 저장
- CSRF 및 세션 쿠키 운영 정책 확정
- 후속 스키마 변경마다 새 Flyway 버전 마이그레이션 추가
- 운영 DB 변경은 버전이 증가하는 Flyway migration으로 추가하고 적용 전에 SQL을 검토
- 필요 시 WebSocket/STOMP와 다중 서버 메시지 동기화

## 9. 주의사항

- `BaseTimeEntity`의 `created_at`, `updated_at`은 애플리케이션이 아니라 DB가 생성하고 갱신합니다. DB 스키마에 기본값과 갱신 규칙을 정의해야 합니다.
- Spring Session을 추가하면 기본 세션 쿠키 이름과 현재 로그아웃 쿠키 삭제 설정이 일치하는지 확인해야 합니다.
- `build/`가 과거에 Git에 이미 추적된 적이 있다면 `.gitignore`만으로 제거되지 않습니다. 커밋 전에 추적 상태를 확인해야 합니다.
