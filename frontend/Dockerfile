FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_* values are public, build-time browser configuration, never server secrets.
ARG VITE_API_BASE_URL=""
ARG VITE_ENABLE_MSW="false"
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_KAKAO_REST_API_KEY=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_ENABLE_MSW=${VITE_ENABLE_MSW} \
    VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID} \
    VITE_KAKAO_REST_API_KEY=${VITE_KAKAO_REST_API_KEY}

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.4-alpine@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html

USER 101:101
RUN nginx -t
EXPOSE 8080
