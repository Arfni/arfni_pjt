from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "hello from fastapi"}

@app.get("/health")
def health():
    return {"ok": True}
