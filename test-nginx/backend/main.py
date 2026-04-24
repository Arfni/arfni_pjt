from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "fastapi-backend"}

@app.get("/api/hello")
def hello():
    return {"message": "Hello from FastAPI!", "version": "1.0"}

@app.get("/api/items")
def items():
    return {"items": ["item1", "item2", "item3"]}
