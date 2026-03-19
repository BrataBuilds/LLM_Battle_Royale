from fastapi import APIRouter, HTTPException
import httpx
import time
from backend.models import state, TeamCreate, TeamOut
from backend.ws_manager import manager

router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.post("", response_model=TeamOut)
async def register_team(team: TeamCreate):
    # Check for duplicate name
    if state.get_team_by_name(team.name):
        raise HTTPException(status_code=400, detail="Team name already taken")

    if len(team.members) < 1 or len(team.members) > 4:
        raise HTTPException(status_code=400, detail="Teams must have 1-4 members")

    # Basic endpoint URL validation
    url = team.endpoint_url.strip()
    if not url.startswith(("http://", "https://")) and url != "DUMMY":
        raise HTTPException(status_code=400, detail="Endpoint URL must start with http:// or https:// (or be 'DUMMY' for testing)")

    new_team = state.add_team(team.name, team.members, url)
    await manager.broadcast("team_registered", new_team)
    return new_team


@router.get("", response_model=list[TeamOut])
async def list_teams():
    return list(state.teams.values())


@router.get("/{team_id}", response_model=TeamOut)
async def get_team(team_id: str):
    if team_id not in state.teams:
        raise HTTPException(status_code=404, detail="Team not found")
    return state.teams[team_id]


@router.post("/login")
async def login_team(data: dict):
    """Simple login by team name — returns team data."""
    name = data.get("name", "")
    team = state.get_team_by_name(name)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.post("/test-endpoint")
async def test_endpoint(data: dict):
    """Test a team's LLM endpoint URL — no auth required."""
    url = data.get("url", "").strip()
    if not url:
        return {"success": False, "error": "URL is required"}

    prompt = data.get("prompt", "What is 2+2? Answer in one line.")

    try:
        start = time.time()
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                json={"prompt": prompt},
                headers={"Content-Type": "application/json"},
            )
            latency_ms = round((time.time() - start) * 1000, 1)

            if response.status_code >= 400:
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}",
                }

            resp_data = response.json()
            if isinstance(resp_data, str):
                response_text = resp_data
            elif isinstance(resp_data, dict):
                response_text = (
                    resp_data.get("response")
                    or resp_data.get("text")
                    or resp_data.get("output")
                    or resp_data.get("generated_text")
                    or str(resp_data)
                )
            else:
                response_text = str(resp_data)

            return {
                "success": True,
                "response": response_text,
                "latency_ms": latency_ms,
                "status_code": response.status_code,
            }

    except httpx.TimeoutException:
        return {"success": False, "error": "Endpoint timed out after 10 seconds"}
    except httpx.HTTPStatusError as e:
        return {"success": False, "error": f"HTTP {e.response.status_code}: {str(e)[:200]}"}
    except Exception as e:
        return {"success": False, "error": str(e)[:300]}

