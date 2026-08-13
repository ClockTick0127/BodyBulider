# Bodybuilder HTTPS 배포 실행 문서

- 도메인: `bodybuilder.kro.kr`
- 공인 IP: `43.201.103.98`
- 배포 경로: `/srv/bodybuilder`
- 구성: 기존 Docker Gateway Nginx가 HTTP와 HTTPS를 모두 처리

```text
외부 HTTP  :80  -> Gateway Nginx :8080 -> HTTPS로 리다이렉트
외부 HTTPS :443 -> Gateway Nginx :8443 -> frontend/backend
```

별도의 호스트 Nginx나 Caddy는 추가하지 않는다. Certbot은 인증서 발급 때만 일회성 Docker 컨테이너로 실행한다.

## 현재까지 완료된 작업

- `bodybuilder.kro.kr`의 A 레코드가 `43.201.103.98`을 가리킴
- Ubuntu UFW에서 TCP 80과 443 허용
- 아래 디렉터리 생성

```text
/srv/bodybuilder/certbot/conf
/srv/bodybuilder/certbot/lib
/srv/bodybuilder/certbot/log
```

Lightsail 외부 방화벽의 443 허용 여부는 아직 확인하지 못했다. Gateway가 443에서 실행된 후 외부 PC에서 접속 테스트해 판단한다.

---

## 1. root 셸로 전환

실행 위치: **Lightsail 서버 SSH**

`/srv/bodybuilder`는 `gitlab-runner` 전용 권한이므로 root 셸로 전환한다.

```bash
sudo -i
cd /srv/bodybuilder
pwd
```

마지막 명령의 결과가 아래와 같아야 한다.

```text
/srv/bodybuilder
```

이 문서의 서버 명령은 이후부터 root 셸에서 실행하므로 `sudo`를 붙이지 않는다.

## 2. DNS를 다시 확인

실행 위치: **Lightsail 서버 SSH**

```bash
getent ahostsv4 bodybuilder.kro.kr
```

출력에 `43.201.103.98`이 있어야 한다. 다른 IP가 나오면 인증서를 발급하지 말고 DNS부터 수정한다.

## 3. Gateway를 잠시 중지

실행 위치: **Lightsail 서버 SSH**

Certbot이 호스트의 80번 포트를 잠깐 사용해야 하므로 기존 Gateway만 중지한다. Backend, Frontend, MySQL, Valkey는 중지하지 않는다.

```bash
docker compose \
  --env-file /srv/bodybuilder/.env \
  -f /srv/bodybuilder/compose.production.yaml \
  stop gateway
```

80번 포트가 비었는지 확인한다.

```bash
ss -lntp | grep ':80 ' || echo 'OK: port 80 is free'
```

`OK: port 80 is free`가 나오면 다음 단계로 진행한다. 다른 프로세스가 출력되면 해당 결과를 확인하기 전에는 Certbot을 실행하지 않는다.

## 4. 무료 인증서 발급

실행 위치: **Lightsail 서버 SSH**

먼저 Let's Encrypt 만료 안내를 받을 이메일을 입력한다.

```bash
read -rp 'Lets Encrypt email: ' CERT_EMAIL
```

이어서 Certbot 컨테이너를 한 번 실행한다.

```bash
docker run --rm \
  --name bodybuilder-certbot \
  --publish 80:80 \
  --volume /srv/bodybuilder/certbot/conf:/etc/letsencrypt \
  --volume /srv/bodybuilder/certbot/lib:/var/lib/letsencrypt \
  --volume /srv/bodybuilder/certbot/log:/var/log/letsencrypt \
  certbot/certbot:latest \
  certonly \
  --standalone \
  --domain bodybuilder.kro.kr \
  --email "$CERT_EMAIL" \
  --agree-tos \
  --no-eff-email
```

성공하면 출력에 다음 문구와 인증서 경로가 표시된다.

```text
Successfully received certificate.
/etc/letsencrypt/live/bodybuilder.kro.kr/fullchain.pem
/etc/letsencrypt/live/bodybuilder.kro.kr/privkey.pem
```

### 발급에 실패한 경우

서비스부터 복구한다.

```bash
docker compose \
  --env-file /srv/bodybuilder/.env \
  -f /srv/bodybuilder/compose.production.yaml \
  start gateway
```

그다음 Certbot 오류 전체를 확인한다. 인증서 발급에 실패한 상태에서 HTTPS 설정을 배포하면 안 된다.

## 5. 인증서 파일 확인

실행 위치: **Lightsail 서버 SSH**

```bash
ls -l /srv/bodybuilder/certbot/conf/live/bodybuilder.kro.kr/
```

최소한 아래 파일이 보여야 한다.

```text
fullchain.pem
privkey.pem
```

인증서 내용을 확인한다.

```bash
openssl x509 \
  -in /srv/bodybuilder/certbot/conf/live/bodybuilder.kro.kr/fullchain.pem \
  -noout -subject -issuer -dates
```

## 6. Gateway Nginx가 인증서를 읽을 수 있게 권한 설정

실행 위치: **Lightsail 서버 SSH**

Gateway 이미지에서 Nginx 사용자의 그룹 ID를 확인한다.

```bash
NGINX_GID=$(docker compose \
  --env-file /srv/bodybuilder/.env \
  -f /srv/bodybuilder/compose.production.yaml \
  run --rm --no-deps --entrypoint id gateway -g)

echo "$NGINX_GID"
```

숫자가 출력되어야 한다. 그 숫자를 인증서 디렉터리의 그룹으로 지정한다.

```bash
chmod 0755 /srv/bodybuilder/certbot/conf
chgrp -R "$NGINX_GID" /srv/bodybuilder/certbot/conf/live
chgrp -R "$NGINX_GID" /srv/bodybuilder/certbot/conf/archive

find /srv/bodybuilder/certbot/conf/live \
  -type d -exec chmod 0750 {} +

find /srv/bodybuilder/certbot/conf/archive \
  -type d -exec chmod 0750 {} +

find /srv/bodybuilder/certbot/conf/archive/bodybuilder.kro.kr \
  -type f -name 'privkey*.pem' -exec chmod 0640 {} +

find /srv/bodybuilder/certbot/conf/archive/bodybuilder.kro.kr \
  -type f ! -name 'privkey*.pem' -exec chmod 0644 {} +
```

## 7. 현재 HTTP Gateway 복구

실행 위치: **Lightsail 서버 SSH**

HTTPS 코드가 아직 배포되지 않았으므로 우선 기존 HTTP Gateway를 다시 실행한다.

```bash
docker compose \
  --env-file /srv/bodybuilder/.env \
  -f /srv/bodybuilder/compose.production.yaml \
  start gateway
```

상태를 확인한다.

```bash
docker compose \
  --env-file /srv/bodybuilder/.env \
  -f /srv/bodybuilder/compose.production.yaml \
  ps gateway

curl -i http://127.0.0.1/gateway-health
```

`gateway`가 실행 중이고 HTTP 응답 본문에 `ok`가 나오면 복구 완료다.

## 8. 저장소에 HTTPS 설정 반영

실행 위치: **개발 PC의 프로젝트 저장소**

`be/feat/webrtc` 브랜치에는 다음 변경을 반영한다.

1. `deploy/compose.production.yaml`
   - 호스트 `443`을 Gateway 컨테이너 `8443`에 연결
   - `/srv/bodybuilder/certbot/conf`에 해당하는 Compose 상대 경로 `./certbot/conf`를 `/etc/letsencrypt:ro`로 마운트
2. `deploy/nginx/default.conf`
   - `8080` HTTP 서버는 `/gateway-health`를 제외하고 HTTPS로 리다이렉트
   - `8443 ssl` HTTPS 서버 추가
   - 인증서 경로를 아래와 같이 설정
     - `/etc/letsencrypt/live/bodybuilder.kro.kr/fullchain.pem`
     - `/etc/letsencrypt/live/bodybuilder.kro.kr/privkey.pem`
   - HTTPS 서버에 `/`, `/api/`, `/ws-stomp` 프록시 설정 유지
3. `.env.example`
   - `HTTPS_PORT=443` 추가
4. `.gitlab-ci.yml`
   - 실제 운영 인증서를 저장소에 넣지 않고도 TLS Nginx 설정을 검사할 수 있도록 CI용 임시 인증서를 생성한 뒤 `nginx -t` 실행

> 인증서 발급 전에는 위 HTTPS 설정을 운영 서버에 배포하지 않는다. 인증서 파일이 없으면 Gateway Nginx가 시작하지 못한다.

## 9. 운영 환경 변수 변경

실행 위치: **Lightsail 서버 SSH의 root 셸**

```bash
nano /srv/bodybuilder/.env
```

아래 값을 추가하거나 기존 값을 수정한다. 기존 DB 비밀번호나 이미지 값은 건드리지 않는다.

```dotenv
HTTP_PORT=80
HTTPS_PORT=443
CORS_ALLOWED_ORIGIN=https://bodybuilder.kro.kr
SESSION_COOKIE_SECURE=true
```

저장한 뒤 권한을 확인한다.

```bash
chmod 0600 /srv/bodybuilder/.env
```

## 10. HTTPS 코드 배포

실행 위치: **개발 PC 및 GitLab**

HTTPS 설정 변경을 리뷰·머지한 뒤 `master`의 운영 배포 파이프라인을 실행한다. 현재 배포 스크립트가 아래 파일을 `/srv/bodybuilder`로 복사하고 Gateway를 재생성한다.

```text
deploy/compose.production.yaml
deploy/nginx/default.conf
deploy/scripts/deploy.sh
```

배포가 성공한 후 서버에서 상태를 확인한다.

```bash
docker compose \
  --env-file /srv/bodybuilder/.env \
  -f /srv/bodybuilder/compose.production.yaml \
  ps
```

Gateway의 포트에 아래 두 매핑이 보여야 한다.

```text
0.0.0.0:80->8080/tcp
0.0.0.0:443->8443/tcp
```

서버 내부에서 확인한다.

```bash
curl -I http://bodybuilder.kro.kr
curl -i https://bodybuilder.kro.kr/gateway-health
```

정상 결과:

- 첫 번째 명령: `301` 또는 `308`과 `Location: https://bodybuilder.kro.kr/...`
- 두 번째 명령: `200`과 본문 `ok`

## 11. Lightsail 외부 443 포트 확인

실행 위치: **Lightsail SSH가 아니라 개발 PC의 PowerShell**

```powershell
Test-NetConnection bodybuilder.kro.kr -Port 443
```

정상 결과:

```text
TcpTestSucceeded : True
```

이어서 인증서와 HTTPS 응답을 확인한다.

```powershell
curl.exe -I https://bodybuilder.kro.kr
curl.exe https://bodybuilder.kro.kr/gateway-health
```

`TcpTestSucceeded : False`라면 다음 조건을 먼저 확인한다.

1. 배포 후 Gateway가 실제로 `443:8443`으로 실행 중인지
2. Ubuntu UFW에서 443이 허용되어 있는지
3. 위 두 조건이 맞으면 Lightsail 외부 IPv4 방화벽에서 TCP 443을 허용해야 함

AWS CLI는 서버에 반드시 설치할 필요가 없다. 마지막 경우에만 AWS 권한이 있는 PC의 CLI 또는 Lightsail 콘솔이 필요하다.

## 12. WebRTC 최종 확인

실행 위치: **개발 PC 브라우저**

1. `https://bodybuilder.kro.kr` 접속
2. 인증서 경고가 없는지 확인
3. 카메라와 마이크 권한 허용
4. 일반 창과 시크릿 창 등 서로 다른 로그인 세션 두 개 사용
5. 두 사용자를 같은 대기방에 입장시킴
6. 영상과 음성이 양쪽에서 연결되는지 확인
7. 브라우저 개발자 도구에서 `/ws-stomp` WebSocket 연결이 성공하는지 확인

STUN만 사용하는 MVP이므로 회사 네트워크 등에서 P2P 연결이 실패할 수 있다. HTTPS와 WebSocket이 정상인데 ICE 연결만 실패하면 그때 TURN 서버를 추가한다.

## 작업 종료

서버에서 root 셸을 빠져나온다.

```bash
exit
```
