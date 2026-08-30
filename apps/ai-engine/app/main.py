from fastapi import FastAPI

app = FastAPI(title="AI Content Factory Engine", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "ai-engine", "status": "ok"}
