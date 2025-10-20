# Quickstart: Spring Boot + FastAPI + MySQL + Redis (Docker Desktop, Local)

## Prereqs
- Docker Desktop (or Docker Engine + Compose v2)
- Ports 3306, 6379, 8080, 8000 available

## How to run
```bash
cd my-app
# set demo secrets (edit .env if you like)
# then build & run
docker compose up -d --build
```

## Verify
- Spring: http://localhost:8080/  and  http://localhost:8080/actuator/health
- FastAPI: http://localhost:8000/  and  http://localhost:8000/health

## Stop
```bash
docker compose down
```
