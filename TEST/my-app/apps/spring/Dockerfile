# ---- build stage ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace

# 의존성 캐시
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline

# 소스 복사 후 패키징 (부트 JAR 생성)
COPY src ./src
RUN mvn -q -DskipTests package

# ---- runtime stage ----
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /workspace/target/*.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
