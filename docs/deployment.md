# 단일 EC2 GitLab CI/CD 배포 절차

현재 확정된 환경:

- Ubuntu 24.04 EC2 한 대
- GitLab CE 18.11.5: `https://lab.ssafy.com`
- 기본 브랜치: `master`
- 작업 브랜치: `infra/cicd`
- EC2 private IP: `172.26.9.199`
- EC2 public IP: `43.201.103.98`
- GitLab Container Registry는 사용하지 않음
- 자동 rollback은 사용하지 않음

## 0. 시작 전 판정

저장소 안에서 확인할 수 있는 부분은 검증했다. 하지만 AWS와 GitLab 서버의 실제 상태까지 문서가 보장할 수는 없다. 그래서 각 단계의 확인 명령이 실패하면 다음 단계로 넘어가지 않는다.

현재 확정된 내용:

```text
GitLab project 권한: 최고관리자
GitLab version: 18.11.5
Container Registry: instance에서 제공하지 않음, 사용하지 않기로 결정
EC2 OS/CPU: Ubuntu 24.04 x86_64
EC2 memory/disk: 15 GiB / 여유 305 GiB
EC2 public IP: 43.201.103.98
EC2 port 80: 이전 점검에서는 비어 있었음
SSH: key login 사용, password login 꺼짐
```

아직 외부 확인이 필요한 내용:

1. `43.201.103.98`이 Elastic IP인지 모른다. 일반 public IP면 EC2 stop/start 후 바뀔 수 있다.
2. AWS 상위 Security Group에서 TCP 80 inbound가 허용됐는지 모른다. 배포 후 외부 접속으로 확인한다.
3. 기존 Apache의 8989 전체 공개가 필요한지 모른다. 이번 작업에서는 변경하지 않는다.
4. MySQL은 Docker volume에만 저장된다. EC2 disk 장애까지 대비한 외부 backup은 아직 없다.
5. HTTPS가 없다. HTTP 배포는 기능 확인용이며 실제 사용자 비밀번호를 받으면 안 된다.
6. frontend는 `/ws-stomp`를 호출하지만 backend에는 아직 STOMP endpoint가 없다. 실시간 방 기능은 배포와 별개로 아직 동작하지 않는다.
7. backend 로그인은 UUID 자체를 principal로 저장하지만 사용자 조회 API는 `principal.userId`를 읽으려 한다. 로그인 후 사용자 조회는 application 코드가 수정되기 전까지 오류가 날 수 있다.

1~3번은 CI/CD 설치를 막지는 않는다. 4~7번은 실제 사용자에게 서비스를 열기 전에 해결해야 한다.

## 1. 배포 흐름

```text
Merge Request 생성 또는 MR 브랜치에 추가 push
  -> frontend lint/build
  -> backend test/bootJar
  -> Compose, Nginx, 배포 script 검사
  -> 운영 배포 없음

master merge/push
  -> 같은 검사 실행
  -> 보호된 Deploy Runner가 EC2에서 Docker image를 직접 build
  -> Docker Compose 자동 배포

GitLab에서 master pipeline 직접 실행
  -> 검사 실행
  -> deploy:production 버튼 표시
  -> 버튼을 누르면 EC2에서 build 후 수동 배포
```

Docker image를 외부 Registry에 올렸다가 다시 받지 않는다. EC2에서 만들고 EC2에서 바로 사용한다.

현재 backend에는 frontend가 호출하는 소셜 로그인, 로그인 세션 조회, 기록, 랭킹 API 일부가 아직 없다. Pipeline이 성공해도 해당 화면은 404 또는 미구현 응답이 날 수 있다. 이것은 배포 문제가 아니라 application 구현 문제다.

## 2. 서버에서 건드리지 않을 것

현재 EC2에는 기존 서비스가 실행 중이다.

```text
Gerrit: 29418, 8988
Apache: 8989
```

사용 여부를 모르므로 중지하거나 삭제하지 않는다. UFW의 `8989/tcp ALLOW IN Anywhere`도 담당자 확인 전에는 제거하지 않는다.

BodyBuilder는 host의 80번만 사용한다. 현재 확인한 서비스와 port가 겹치지 않는다.

## 3. master 브랜치 보호

GitLab 프로젝트에서 이동한다.

```text
Settings
-> Repository
-> Protected branches 또는 Branch rules
-> master
```

다음처럼 설정한다.

```text
Allowed to merge: Maintainers
Allowed to push and merge: No one
Force push: 금지
```

Developer도 MR merge를 해야 한다면 `Allowed to merge`만 `Developers + Maintainers`로 바꾼다. `Allowed to push and merge`는 `No one`을 유지한다.

가능하면 pipeline이 성공해야 merge할 수 있도록 설정한다.

CI cache가 보호된 `master`와 일반 작업 브랜치 사이에서 섞이지 않도록 다음 설정도 확인한다.

```text
Settings
-> CI/CD
-> General pipelines
-> Use separate caches for protected branches: 체크
```

## 4. EC2에 Docker 설치

EC2에 `ubuntu` 사용자로 접속해서 실행한다.

먼저 현재 상태를 다시 확인한다.

```bash
cat /etc/os-release | grep PRETTY_NAME
uname -m
free -h
df -h /
sudo ss -lntp 'sport = :80'
```

정상 기준:

```text
Ubuntu 24.04
x86_64
available memory가 충분함
disk 여유가 충분함
80번 조회 결과에 LISTEN process가 없음
```

80번에 process가 나오면 Docker를 설치해도 되지만 BodyBuilder 배포는 하면 안 된다. 해당 process의 용도를 먼저 확인한다.

Docker 공식 package와 충돌할 수 있는 기존 package를 확인한다.

```bash
dpkg-query -W -f='${binary:Package}\n' 2>/dev/null |
  grep -E '^(docker.io|docker-doc|docker-compose|docker-compose-v2|podman-docker|containerd|runc)(:amd64)?$' || true
```

아무것도 출력되지 않아야 한다. 무언가 출력되면 공유 서버의 기존 구성일 수 있으므로 임의로 삭제하지 말고 중단한다.

GitLab과 Docker repository에 연결되는지 확인한다.

```bash
curl -fsS -o /dev/null https://lab.ssafy.com/users/sign_in
curl -fsS -o /dev/null https://download.docker.com/linux/ubuntu/gpg
```

두 명령 모두 아무 출력 없이 끝나야 한다.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

```bash
sudo apt-get update
sudo apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

sudo systemctl enable --now docker
sudo docker version
sudo docker run --rm hello-world
sudo docker compose version
sudo docker compose up --help | grep -q -- '--wait-timeout'
stat -fc %T /sys/fs/cgroup
```

정상 기준:

```text
Docker client/server version이 모두 출력됨
hello-world 성공 문구 출력
docker compose version 출력
--wait-timeout 검사 성공
cgroup2fs 출력
```

하나라도 다르면 Runner를 설치하지 않고 중단한다. `cgroup2fs`가 아니면 CI container의 memory/CPU 제한을 신뢰할 수 없다.

Docker container가 EC2의 AWS 권한 정보를 읽지 못하도록 metadata 주소를 차단한다.

```bash
sudo tee /etc/systemd/system/bodybuilder-block-container-imds.service >/dev/null <<'EOF'
[Unit]
Description=Block Docker containers from EC2 instance metadata
Requires=docker.service
After=docker.service
PartOf=docker.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c '/usr/sbin/iptables -C DOCKER-USER -d 169.254.169.254/32 -j REJECT 2>/dev/null || /usr/sbin/iptables -I DOCKER-USER -d 169.254.169.254/32 -j REJECT'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo systemd-analyze verify \
  /etc/systemd/system/bodybuilder-block-container-imds.service
sudo systemctl daemon-reload
sudo systemctl enable --now bodybuilder-block-container-imds.service
sudo iptables -C DOCKER-USER \
  -d 169.254.169.254/32 -j REJECT
```

마지막 명령이 아무 출력 없이 exit code 0으로 끝나야 한다. 이 rule은 Docker container에만 적용되므로 host의 Amazon SSM Agent는 막지 않는다.

## 5. GitLab Runner 18.11 설치

GitLab이 18.11.5이므로 Runner도 18.11.x를 사용한다.

```bash
curl -fsSL \
  https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh \
  -o /tmp/install-gitlab-runner-repo.sh

less /tmp/install-gitlab-runner-repo.sh
```

내용을 확인한 다음 `q`를 눌러 `less`를 닫고 실행한다.

```bash
sudo bash /tmp/install-gitlab-runner-repo.sh
sudo apt-get update
apt-cache madison gitlab-runner | grep '18\.11'
```

한 줄 이상 출력되어야 한다. 그다음 18.11 계열의 가장 최신 package version을 자동으로 선택해 설치한다.

```bash
RUNNER_VERSION=$(apt-cache madison gitlab-runner |
  awk -F'|' '$2 ~ /18\.11\./ {gsub(/ /, "", $2); print $2; exit}')

if [ -z "$RUNNER_VERSION" ]; then
  echo "GitLab Runner 18.11 package를 찾지 못했습니다." >&2
  exit 1
fi

echo "설치할 Runner: $RUNNER_VERSION"
sudo apt-get install -y \
  "gitlab-runner=$RUNNER_VERSION" \
  "gitlab-runner-helper-images=$RUNNER_VERSION"

sudo systemctl enable --now gitlab-runner
sudo apt-mark hold gitlab-runner gitlab-runner-helper-images
gitlab-runner --version
```

마지막 출력의 version이 `18.11.x`여야 한다. `apt-mark hold`는 GitLab 서버보다 Runner만 새 major version으로 자동 변경되는 것을 막는다.

## 6. Runner 두 개 생성

### Build Runner

GitLab에서 이동한다.

```text
Settings
-> CI/CD
-> Runners
-> Create project runner
```

```text
Operating system: Linux
Tags: bodybuilder-build
Run untagged jobs: 끔
Protected: 끔
Description: bodybuilder-build
```

생성 후 표시되는 `glrt-` token으로 EC2에서 등록한다.

```bash
sudo gitlab-runner register \
  --non-interactive \
  --url "https://lab.ssafy.com" \
  --token "<BUILD_RUNNER_TOKEN>" \
  --executor "docker" \
  --docker-image "alpine:3.21" \
  --description "bodybuilder-build"
```

### Deploy Runner

같은 화면에서 Runner를 하나 더 만든다.

```text
Operating system: Linux
Tags: bodybuilder-deploy
Run untagged jobs: 끔
Protected: 켬
Description: bodybuilder-deploy
```

두 번째 token으로 등록한다.

```bash
sudo gitlab-runner register \
  --non-interactive \
  --url "https://lab.ssafy.com" \
  --token "<DEPLOY_RUNNER_TOKEN>" \
  --executor "shell" \
  --description "bodybuilder-deploy"
```

Token은 저장소, 채팅, 문서에 남기지 않는다.

두 등록이 끝나면 확인한다.

```bash
sudo gitlab-runner list
```

출력에 `bodybuilder-build`의 executor가 `docker`, `bodybuilder-deploy`의 executor가 `shell`로 나와야 한다. 같은 이름이 중복되거나 executor가 다르면 다음 단계로 가지 않는다.

## 7. Runner 설정

```bash
sudo cp /etc/gitlab-runner/config.toml \
  /etc/gitlab-runner/config.toml.before-bodybuilder
sudo nano /etc/gitlab-runner/config.toml
```

아래처럼 수정한 뒤 `Ctrl+O`, `Enter`, `Ctrl+X` 순서로 저장하고 닫는다.

파일 맨 위를 다음처럼 맞춘다. EC2에 swap이 없으므로 job은 한 번에 하나만 실행한다.

```toml
concurrent = 1
```

`name = "bodybuilder-build"`인 block에 다음 설정을 맞춘다. GitLab이 만든 URL과 token은 수정하지 않는다.

```toml
limit = 1
environment = ["FF_NETWORK_PER_BUILD=1"]

[runners.docker]
  image = "alpine:3.21"
  privileged = false
  pull_policy = "if-not-present"
  disable_cache = false
  volumes = ["/cache"]
  memory = "3g"
  memory_swap = "3g"
  cpus = "2"
```

다음 항목은 추가하지 않는다.

```text
/var/run/docker.sock
/srv/bodybuilder mount
privileged = true
```

`name = "bodybuilder-deploy"`인 block은 다음을 확인한다.

```toml
limit = 1
executor = "shell"
```

등록 정보와 설정 파일을 읽을 수 있는지 확인하고 재시작한다. GitLab Runner 18.11.4에는 `gitlab-runner lint` 명령이 없으므로 사용하지 않는다.

```bash
sudo gitlab-runner list
sudo gitlab-runner verify
sudo systemctl restart gitlab-runner
sudo systemctl status gitlab-runner --no-pager
sudo journalctl -u gitlab-runner -n 30 --no-pager
```

두 Runner가 목록에 나오고, 둘 다 `is valid`, service가 `active (running)`이어야 한다. 마지막 log에 `FATAL`, `Failed to load config`, `toml` parsing error가 없어야 한다.

GitLab `Settings -> CI/CD -> Runners`에서 다시 확인한다.

```text
bodybuilder-build: online, tag=bodybuilder-build, Protected=끔
bodybuilder-deploy: online, tag=bodybuilder-deploy, Protected=켬
두 Runner 모두 Run untagged jobs=끔
```

하나라도 다르면 pipeline을 만들기 전에 수정한다.

## 8. Deploy Runner 권한과 운영 `.env`

GitLab Runner service가 Docker executor를 만들고, Deploy Runner가 운영 image를 build할 수 있도록 service 계정을 Docker group에 추가한다. Build job container에는 Docker socket을 mount하지 않으므로 MR script가 host Docker 명령을 직접 실행할 수는 없다.

Linux의 `docker` group은 사실상 관리자 권한이다. 그래서 `bodybuilder-deploy` Runner를 반드시 Protected로 두고, `master` 직접 push를 막는 앞 단계가 빠지면 안 된다.

```bash
sudo usermod -aG docker gitlab-runner
sudo install -d -o gitlab-runner -g gitlab-runner \
  -m 0750 /srv/bodybuilder
sudo install -d -o gitlab-runner -g gitlab-runner \
  -m 0750 /srv/bodybuilder/nginx
sudo install -d -o gitlab-runner -g gitlab-runner \
  -m 0750 /srv/bodybuilder/scripts
sudo systemctl restart gitlab-runner

sudo -u gitlab-runner -H docker version
sudo -u gitlab-runner -H docker compose version
```

비밀번호 세 개를 생성한다.

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

순서대로 MySQL 사용자, MySQL root, Valkey 비밀번호로 사용한다. 서로 같은 값을 쓰지 않는다.

현재 public IP도 다시 확인한다.

```bash
IMDS_TOKEN=$(curl -fsS -X PUT \
  http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')

curl -fsS \
  -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
  http://169.254.169.254/latest/meta-data/public-ipv4
echo
```

`43.201.103.98`이 나와야 아래 양식을 그대로 사용할 수 있다. 다른 IP가 나오면 `CORS_ALLOWED_ORIGIN`에도 그 IP를 사용한다.

```bash
sudo nano /srv/bodybuilder/.env
```

아래 내용을 넣고 placeholder 세 곳을 실제 생성값으로 바꾼다. `Ctrl+O`, `Enter`, `Ctrl+X` 순서로 저장하고 닫는다.

```dotenv
COMPOSE_PROJECT_NAME=bodybuilder

# 최초 배포 job이 실제 local image 이름으로 교체한다.
FRONTEND_IMAGE=bodybuilder/frontend:bootstrap
BACKEND_IMAGE=bodybuilder/backend:bootstrap

HTTP_PORT=80

MYSQL_DATABASE=bodybuilder
MYSQL_USER=bodybuilder
MYSQL_PASSWORD=<첫 번째 생성값>
MYSQL_ROOT_PASSWORD=<두 번째 생성값>

VALKEY_PASSWORD=<세 번째 생성값>

CORS_ALLOWED_ORIGIN=http://43.201.103.98
SESSION_COOKIE_SECURE=false

TZ=Asia/Seoul

GATEWAY_MEMORY_LIMIT=128m
FRONTEND_MEMORY_LIMIT=128m
BACKEND_MEMORY_LIMIT=768m
MYSQL_MEMORY_LIMIT=1024m
VALKEY_MEMORY_LIMIT=256m
```

```bash
sudo chown gitlab-runner:gitlab-runner /srv/bodybuilder/.env
sudo chmod 0600 /srv/bodybuilder/.env
sudo ls -l /srv/bodybuilder/.env
```

`ls` 결과가 `-rw------- gitlab-runner gitlab-runner`여야 한다. placeholder와 필수 값도 내용 출력 없이 검사한다.

```bash
if sudo grep -q '<' /srv/bodybuilder/.env; then
  echo ".env에 바꾸지 않은 placeholder가 있습니다." >&2
  exit 1
fi

sudo -u gitlab-runner -H bash -c '
  set -a
  source /srv/bodybuilder/.env
  set +a
  : "${MYSQL_PASSWORD:?MYSQL_PASSWORD가 비어 있습니다}"
  : "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD가 비어 있습니다}"
  : "${VALKEY_PASSWORD:?VALKEY_PASSWORD가 비어 있습니다}"
  TOKEN=$(curl -fsS -X PUT \
    http://169.254.169.254/latest/api/token \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
  PUBLIC_IP=$(curl -fsS \
    -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/public-ipv4)
  test "$CORS_ALLOWED_ORIGIN" = "http://$PUBLIC_IP"
  test "$SESSION_COOKIE_SECURE" = "false"
'
```

아무 출력 없이 끝나면 정상이다.

`.env` 내용을 Git, GitLab 변수, 채팅, CI log에 올리지 않는다.

`43.201.103.98`이 Elastic IP인지 아직 확인되지 않았다. EC2를 중지 후 시작했을 때 IP가 바뀌면 `.env`의 `CORS_ALLOWED_ORIGIN`도 바꾸고 다시 배포해야 한다.

## 9. 선택 설정

소셜 로그인을 실제로 구현할 때만 GitLab의 `Settings -> CI/CD -> Variables`에 다음 공개 설정을 넣는다.

```text
VITE_GOOGLE_CLIENT_ID
VITE_KAKAO_REST_API_KEY
```

`VITE_*`는 브라우저에 포함되는 값이다. client secret이나 DB 비밀번호를 넣으면 안 된다.

현재는 backend 소셜 로그인과 STOMP가 미구현이므로 위 두 값은 비워 둬도 된다. `VITE_API_BASE_URL`과 `VITE_WS_BASE_URL`도 만들지 않는다. 별도 서버 주소를 지정하지 않으므로 브라우저는 현재 접속한 `http://43.201.103.98`의 `/api`와 `/ws-stomp`를 사용한다.

현재 배포는 SSH로 파일을 전송하지 않으므로 다음 변수는 만들지 않는다.

```text
DEPLOY_HOST
DEPLOY_USER
DEPLOY_PORT
SSH_PRIVATE_KEY
SSH_KNOWN_HOSTS
```

GitLab에 Protected environments 메뉴가 있으면 `production` 배포 권한을 Maintainers로 제한한다.

## 10. SSH와 방화벽

현재 SSH는 password 로그인이 꺼져 있다. 기존 Gerrit/Apache 관리자가 root 또는 다른 계정으로 SSH를 사용하는지 모르므로 SSH 설정은 지금 변경하지 않는다.

UFW를 다시 확인한다.

```bash
sudo ufw status verbose
```

다음 rule은 그대로 둔다.

```text
22: SSH
80: BodyBuilder HTTP
443: 나중에 HTTPS
8989: 기존 Apache
```

80번 rule이 없다면 다음 명령으로 추가한다. 이미 있으면 실행하지 않는다.

```bash
sudo ufw allow 80/tcp comment 'BodyBuilder HTTP'
```

Docker가 공개한 port는 UFW를 우회할 수 있다. 현재 Compose에서는 gateway 80번만 host에 공개하고 DB, Valkey, backend, frontend는 공개하지 않는다.

AWS Console을 사용할 수 없으므로 EC2에 AWS CLI와 조회 권한이 있다면 Security Group도 CLI로 확인한다.

```bash
aws --version

IMDS_TOKEN=$(curl -fsS -X PUT \
  http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
INSTANCE_ID=$(curl -fsS \
  -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
  http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -fsS \
  -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
  http://169.254.169.254/latest/dynamic/instance-identity/document |
  grep -o '"region"[[:space:]]*:[[:space:]]*"[^"]*"' |
  cut -d'"' -f4)

aws ec2 describe-instances \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].SecurityGroups[*].[GroupId,GroupName]' \
  --output table

aws ec2 describe-security-groups \
  --region "$REGION" \
  --group-ids $(aws ec2 describe-instances \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].SecurityGroups[*].GroupId' \
    --output text) \
  --query 'SecurityGroups[*].IpPermissions'
```

마지막 출력에 TCP 80 inbound 허용 rule이 있어야 외부 PC에서 접속할 수 있다. `aws: command not found` 또는 `AccessDenied`가 나오면 임의로 권한을 만들지 말고 AWS 담당자에게 `이 EC2의 Security Group TCP 80 inbound 확인`을 요청한다. 애플리케이션 배포 자체는 할 수 있지만 외부 접속 검증은 여기서 막힌다.

## 11. 최초 CI/CD 실행

EC2에서 외부 연결을 확인한다.

```bash
curl -fsS -o /dev/null https://lab.ssafy.com/users/sign_in
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://registry-1.docker.io/v2/
```

Docker Hub 명령은 `401`이 나오면 정상이다. 서버에 도달했다는 뜻이다.

로컬에서 branch와 최신 master 동기화 상태를 확인한다.

```bash
git branch --show-current
git fetch origin master
git rev-list --left-right --count HEAD...origin/master
```

정상 출력:

```text
infra/cicd
0    0
```

두 숫자가 다르면 commit하지 말고 최신 master를 다시 반영해야 한다.

현재 변경을 검사하고 stage한다.

```bash
git status --short
git diff --check
git add .
git diff --cached --check
git diff --cached --name-only
```

목록에 실제 `.env`, private key, token, password 파일이 없어야 한다. `.env.example`은 양식뿐이므로 포함되어야 한다. 이상이 없으면 commit하고 push한다.

```bash
git commit -m "infra: configure single-host GitLab CI/CD"
git push -u origin infra/cicd
```

feature branch push 자체에는 pipeline이 생기지 않는 것이 정상이다. GitLab에서 branch를 `infra/cicd`로 선택하고 `Build 또는 CI/CD -> Pipeline editor -> Validate`를 실행한다. `Pipeline syntax is correct`가 나오면 문법 검증은 성공이다. 이 브랜치의 일반 push는 `workflow: rules`에서 의도적으로 제외했으므로 CE 18.11 편집기의 추가 simulation에 `The pipeline did not run`이 표시될 수 있으며, 이 메시지만으로 설정 실패로 판단하지 않는다.

GitLab에서 `infra/cicd -> master` Merge Request를 만든다.

MR pipeline에는 다음 job만 나와야 한다.

```text
validate:compose
validate:nginx
validate:shell
test:frontend
test:backend
```

MR에는 `deploy:production`이 나오면 안 된다.

MR pipeline이 전부 성공하면 master로 merge한다. master pipeline에서는 마지막에 `deploy:production`이 자동 실행된다.

Deploy job은 먼저 frontend/backend image를 모두 만든다. 둘 중 하나라도 build에 실패하면 기존에 실행 중인 container는 건드리지 않는다. 둘 다 성공한 뒤에만 Compose 배포를 시작한다.

## 12. 배포 확인

EC2에서 확인한다.

```bash
sudo -u gitlab-runner -H docker compose \
  --env-file /srv/bodybuilder/.env \
  -f /srv/bodybuilder/compose.production.yaml \
  ps
```

모든 service가 `running` 또는 `healthy`여야 한다.

```text
gateway
frontend
backend
mysql
valkey
```

Host에는 80번만 새로 열려야 한다.

```bash
sudo ss -lntp 'sport = :80'
sudo ss -lntp | grep -E ':(3306|6379|8080)[[:space:]]' || true
```

첫 명령에는 Docker가 공개한 80번 listener가 보여야 한다. 두 번째 명령에는 아무것도 나오지 않아야 한다.

```bash
curl -fsS http://127.0.0.1/gateway-health
curl -fsS http://127.0.0.1/
curl -fsS \
  'http://127.0.0.1/api/users/nickname/availability?nickname=deploycheck'
```

그다음 PC 브라우저에서 접속한다.

```text
http://43.201.103.98
```

EC2 안에서는 되는데 PC에서 안 열리면 AWS 상위 network/security rule의 80번이 막힌 것이다. 인프라 담당자에게 `43.201.103.98`의 TCP 80 inbound 허용 여부를 확인한다.

브라우저에서 frontend가 열리고 nickname 확인 API까지 성공하면 CI/CD 배포 경로는 정상이다. `/ws-stomp`, 소셜 로그인, 기록, 랭킹은 현재 backend 구현이 없으므로 이 확인 대상에서 제외한다.

## 13. 수동 배포

GitLab에서 이동한다.

```text
Build 또는 CI/CD
-> Pipelines
-> Run pipeline
-> Branch: master
-> Run pipeline
```

검사가 끝난 뒤 `deploy:production`의 재생 버튼을 누른다.

## 14. 배포 실패

자동 rollback은 하지 않는다. 먼저 상태와 log를 본다.

```bash
sudo -u gitlab-runner -H docker compose \
  --env-file /srv/bodybuilder/.env \
  -f /srv/bodybuilder/compose.production.yaml \
  ps

sudo -u gitlab-runner -H docker compose \
  --env-file /srv/bodybuilder/.env \
  -f /srv/bodybuilder/compose.production.yaml \
  logs --tail=200 backend frontend gateway mysql valkey
```

이전 local image를 확인한다.

```bash
sudo -u gitlab-runner -H docker image ls 'bodybuilder/frontend'
sudo -u gitlab-runner -H docker image ls 'bodybuilder/backend'
```

이전 정상 tag 두 개를 골라 수동 재배포할 수 있다.

```bash
sudo -u gitlab-runner -H \
  /srv/bodybuilder/scripts/deploy.sh \
  bodybuilder/frontend:<PREVIOUS_TAG> \
  bodybuilder/backend:<PREVIOUS_TAG>
```

DB migration이 이미 적용됐다면 이전 backend가 변경된 DB와 호환되는지 확인해야 한다.

## 15. 데이터 보존

MySQL과 Valkey data는 Docker named volume `bodybuilder_mysql_data`, `bodybuilder_valkey_data`에 남으므로 일반 재배포와 container 재생성에는 유지된다.

첫 실행 뒤에는 `.env`의 `MYSQL_PASSWORD`나 `MYSQL_ROOT_PASSWORD`만 바꾸면 안 된다. 기존 volume 속 MySQL 계정 비밀번호는 자동으로 바뀌지 않으므로 backend 접속이 실패한다. 비밀번호 회전은 MySQL에서 계정 비밀번호를 먼저 변경하는 별도 작업으로 진행한다.

다음 명령은 DB data를 지우므로 실행하지 않는다.

```text
docker compose down -v
docker volume rm bodybuilder_mysql_data
docker volume rm bodybuilder_valkey_data
docker system prune --volumes
```

하지만 EC2 disk 자체가 손상되면 이 volume도 사라진다. 실제 사용자 data를 받기 전에는 인프라 담당자와 다음 중 하나를 정해야 한다.

```text
EBS snapshot 정책
외부 저장소로 정기 mysqldump
관리형 DB 사용
```

현재는 backup 위치와 보존 기간이 정해지지 않아 자동 backup을 넣지 않았다. 이 부분은 초기 HTTP 배포 확인에는 필요 없지만 실제 운영 전에는 필수다.

## 16. HTTPS 전환

현재 HTTP는 임시 확인용이다. HTTP 상태에서 실제 사용자 비밀번호나 로그인 cookie를 운영하지 않는다.

도메인을 준비하면 다음을 함께 변경한다.

- DNS를 고정된 EC2 주소에 연결
- Gateway에 인증서와 443 listener 추가
- 80에서 443으로 redirect
- Compose에 443 port publish
- `.env` 변경

```dotenv
CORS_ALLOWED_ORIGIN=https://<DOMAIN>
SESSION_COOKIE_SECURE=true
```
