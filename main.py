import os
from dotenv import load_dotenv

# Load env vars before anything else
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Ensure logs directory exists
os.makedirs(os.path.join(os.path.dirname(__file__), "logs"), exist_ok=True)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from backend.routes.teams import router as teams_router
from backend.routes.submissions import router as submissions_router
from backend.routes.admin import router as admin_router
from backend.ws_manager import manager
from backend.models import state

app = FastAPI(title="InferenceX LLM Battle Royale", version="2.0.0")

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount route modules
app.include_router(teams_router)
app.include_router(submissions_router)
app.include_router(admin_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "teams": len(state.teams),
        "bracket_round": state.current_bracket_round,
        "sub_round": state.current_sub_round,
    }


@app.get("/api/standings")
async def get_standings():
    """All teams with standings, sorted by total score."""
    return state.get_standings()


@app.get("/api/bracket")
async def get_bracket():
    """Get full bracket state."""
    return {
        "matches": list(state.matches.values()),
        "bracket_rounds": state.bracket_rounds,
        "current_bracket_round": state.current_bracket_round,
        "current_sub_round": state.current_sub_round,
        "total_bracket_rounds": state.total_bracket_rounds,
        "champion": state.champion,
    }


# ── WebSocket endpoint ───────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
