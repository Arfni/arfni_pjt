# ic-skeleton (fixed MVP)

Go CLI that reads `stack.yaml` and runs Docker Compose locally.
Includes:
- `${secret:KEY}` -> `${KEY}` normalization
- Proper relative paths (build context, dockerfile, volumes) from `.infracanvas/compose`
- Windows path normalization
- Better error surfacing from `docker` commands

## Build
```bash
go mod tidy
go build -o ic ./cmd/ic
```

## Run (from your project root containing stack.yaml)
```bash
/path/to/ic -f stack.yaml   # Windows: .\ic.exe -f stack.yaml
```

The tool will:
1. Preflight: check `docker` and `docker compose`
2. Ensure `.env` exists at project root (writes CHANGE_ME if absent)
3. Generate `.infracanvas/compose/docker-compose.yaml`
4. Run `docker compose up -d --build` with that file and `.env`
