FROM eclipse-temurin:21-jdk-alpine@sha256:1ff763083f2993d57d0bf374ab10bb3e2cb873af6c13a04458ebbd3e0337dc76 AS build

WORKDIR /workspace

COPY gradle gradle
COPY gradlew build.gradle settings.gradle ./
RUN sed -i 's/\r$//' gradlew \
    && chmod +x gradlew \
    && ./gradlew --no-daemon dependencies

COPY src src
RUN ./gradlew --no-daemon clean bootJar \
    && find build/libs -maxdepth 1 -type f -name '*.jar' ! -name '*-plain.jar' \
       -exec cp '{}' /tmp/app.jar \; \
    && test -s /tmp/app.jar

FROM eclipse-temurin:21-jre-alpine@sha256:3f08b13888f595cc49edabea7250ba69499ba25602b267da591720769400e08c

RUN apk add --no-cache wget \
    && addgroup -S spring \
    && adduser -S spring -G spring

WORKDIR /app
COPY --from=build --chown=spring:spring /tmp/app.jar /app/app.jar

USER spring:spring
EXPOSE 8080

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
