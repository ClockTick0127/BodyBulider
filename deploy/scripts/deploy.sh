#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <frontend-image-or-empty> <backend-image-or-empty>" >&2
  exit 64
fi

frontend_image=$1
backend_image=$2
deploy_frontend=false
deploy_backend=false
recreate_gateway=${RECREATE_GATEWAY:-false}
source_dir=$(cd "$(dirname "$0")/../.." && pwd)
deploy_dir=${DEPLOY_PATH:-/srv/bodybuilder}
compose_file="$deploy_dir/compose.production.yaml"
env_file="$deploy_dir/.env"
health_timeout=${HEALTH_TIMEOUT_SECONDS:-180}
image_retention_count=${DEPLOY_IMAGE_RETENTION_COUNT:-3}
temp_env=""

cleanup() {
  if [[ -n "$temp_env" && -f "$temp_env" ]]; then
    rm -f -- "$temp_env"
  fi
}
trap cleanup EXIT

if [[ -n "$frontend_image" ]]; then
  deploy_frontend=true
fi

if [[ -n "$backend_image" ]]; then
  deploy_backend=true
fi

if [[ "$deploy_frontend" == false && "$deploy_backend" == false ]]; then
  echo "At least one deployment image must be provided." >&2
  exit 64
fi

if [[ "$recreate_gateway" != true && "$recreate_gateway" != false ]]; then
  echo "RECREATE_GATEWAY must be true or false." >&2
  exit 64
fi

if [[ ! -f "$env_file" ]]; then
  echo "Create $env_file before the first deployment." >&2
  exit 66
fi

current_image() {
  local key=$1
  awk -F= -v key="$key" '
    $1 == key {
      sub(/^[^=]*=/, "")
      print
      found = 1
      exit
    }
    END { if (!found) exit 1 }
  ' "$env_file"
}

if [[ "$deploy_frontend" == false ]]; then
  frontend_image=$(current_image FRONTEND_IMAGE) || {
    echo "FRONTEND_IMAGE must exist in $env_file for a backend-only deployment." >&2
    exit 65
  }
fi

if [[ "$deploy_backend" == false ]]; then
  backend_image=$(current_image BACKEND_IMAGE) || {
    echo "BACKEND_IMAGE must exist in $env_file for a frontend-only deployment." >&2
    exit 65
  }
fi

for image in "$frontend_image" "$backend_image"; do
  if [[ ! "$image" =~ ^[A-Za-z0-9._:/@-]+$ ]] || [[ "$image" == *:latest ]]; then
    echo "Use an explicit image tag or digest; latest is not allowed." >&2
    exit 64
  fi
done

if [[ ! "$health_timeout" =~ ^[0-9]+$ ]] || (( health_timeout < 30 )); then
  echo "HEALTH_TIMEOUT_SECONDS must be an integer of at least 30." >&2
  exit 64
fi

if [[ ! "$image_retention_count" =~ ^[0-9]+$ ]] || (( image_retention_count < 1 )); then
  echo "DEPLOY_IMAGE_RETENTION_COUNT must be a positive integer." >&2
  exit 64
fi

cleanup_old_images() {
  local repository=$1
  local keep_count=$2
  local image_ref
  local containers
  local -a image_refs=()

  # Sort explicitly by the image creation timestamp and preserve the newest
  # keep_count tags as deployment rollback candidates.
  mapfile -t image_refs < <(
    docker image ls \
      --filter "reference=${repository}:*" \
      --format '{{.Repository}}:{{.Tag}}' |
      while IFS= read -r image_ref; do
        printf '%s\t%s\n' \
          "$(docker image inspect --format '{{.Created}}' "$image_ref")" \
          "$image_ref"
      done |
      sort -r |
      cut -f2-
  )

  if (( ${#image_refs[@]} <= keep_count )); then
    echo "Image cleanup: ${repository} has ${#image_refs[@]} image(s); nothing to remove."
    return
  fi

  for image_ref in "${image_refs[@]:keep_count}"; do
    containers=$(docker container ls -a --filter "ancestor=$image_ref" --format '{{.ID}}')
    if [[ -n "$containers" ]]; then
      echo "Image cleanup: keeping $image_ref because a container still references it." >&2
      continue
    fi

    if ! docker image rm -- "$image_ref"; then
      echo "Image cleanup: failed to remove $image_ref; continuing deployment." >&2
    fi
  done
}

docker image inspect "$frontend_image" >/dev/null
docker image inspect "$backend_image" >/dev/null

install -d -m 0750 "$deploy_dir/nginx" "$deploy_dir/scripts"
if [[ -f "$source_dir/deploy/compose.production.yaml" ]]; then
  install -m 0644 "$source_dir/deploy/compose.production.yaml" "$compose_file"
  install -m 0644 "$source_dir/deploy/nginx/default.conf" "$deploy_dir/nginx/default.conf"
  install -m 0755 "$source_dir/deploy/scripts/deploy.sh" "$deploy_dir/scripts/deploy.sh"
elif [[ ! -f "$compose_file" || ! -f "$deploy_dir/nginx/default.conf" ]]; then
  echo "Deployment configuration is missing from both $source_dir and $deploy_dir." >&2
  exit 66
fi

env FRONTEND_IMAGE="$frontend_image" BACKEND_IMAGE="$backend_image" \
  docker compose --env-file "$env_file" -f "$compose_file" config --quiet

temp_env=$(mktemp "$deploy_dir/.env.tmp.XXXXXX")
chmod 0600 "$temp_env"
awk -v frontend="$frontend_image" -v backend="$backend_image" '
  BEGIN { found_frontend = 0; found_backend = 0 }
  /^FRONTEND_IMAGE=/ { print "FRONTEND_IMAGE=" frontend; found_frontend = 1; next }
  /^BACKEND_IMAGE=/  { print "BACKEND_IMAGE=" backend; found_backend = 1; next }
  { print }
  END { if (!found_frontend || !found_backend) exit 42 }
' "$env_file" > "$temp_env" || {
  echo "FRONTEND_IMAGE and BACKEND_IMAGE must exist in $env_file." >&2
  exit 65
}
mv -f -- "$temp_env" "$env_file"
temp_env=""

compose=(docker compose --env-file "$env_file" -f "$compose_file")
"${compose[@]}" up -d --wait --wait-timeout "$health_timeout" mysql valkey

deployment_services=()
if [[ "$deploy_backend" == true ]]; then
  deployment_services+=(backend)
fi
if [[ "$deploy_frontend" == true ]]; then
  deployment_services+=(frontend)
fi

"${compose[@]}" up -d --no-deps --force-recreate --wait \
  --wait-timeout "$health_timeout" "${deployment_services[@]}"

if [[ "$recreate_gateway" == true ]]; then
  "${compose[@]}" up -d --no-deps --force-recreate --wait \
    --wait-timeout "$health_timeout" gateway
else
  "${compose[@]}" up -d --no-deps --wait \
    --wait-timeout "$health_timeout" gateway
fi

cleanup_old_images "bodybuilder/frontend" "$image_retention_count"
cleanup_old_images "bodybuilder/backend" "$image_retention_count"

echo "Production deployment completed."
echo "Frontend: $frontend_image (deployed: $deploy_frontend)"
echo "Backend:  $backend_image (deployed: $deploy_backend)"
