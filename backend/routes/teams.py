from fastapi import APIRouter, HTTPException
import httpx
import time
from backend.models import state, TeamCreate, TeamOut, TeamLogin, TeamEndpointUpdate
from backend.ws_manager import manager
from backend.database import TeamRepository

router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.post("", response_model=TeamOut)
async def register_team(team: TeamCreate):
    # Check for duplicate name
    if state.get_team_by_name(team.name):
        raise HTTPException(status_code=400, detail="Team name already taken")

    if len(team.members) < 1 or len(team.members) > 4:
        raise HTTPException(status_code=400, detail="Teams must have 1-4 members")

    if len(team.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters long")

    # Basic endpoint URL validation
    url = team.endpoint_url.strip()
    if not url.startswith(("http://", "https://")) and url != "DUMMY":
        raise HTTPException(status_code=400, detail="Endpoint URL must start with http:// or https:// (or be 'DUMMY' for testing)")

    # Convert members to list of dicts for storage
    members_data = [{"name": m.name, "roll": m.roll} for m in team.members]
    new_team = state.add_team(team.name, team.password, members_data, url)
    await manager.broadcast("team_registered", new_team)
    return new_team


@router.get("", response_model=list[TeamOut])
async def list_teams():
    return state.get_all_teams()


@router.get("/{team_id}", response_model=TeamOut)
async def get_team(team_id: str):
    team = state.get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.post("/login")
async def login_team(login_data: TeamLogin):
    """Authenticate team with name and password — returns team data."""
    team = state.authenticate_team(login_data.name, login_data.password)
    if not team:
        raise HTTPException(status_code=401, detail="Invalid team name or password")
    return team


@router.put("/{team_id}/endpoint", response_model=TeamOut)
async def update_team_endpoint(team_id: str, data: TeamEndpointUpdate):
    """Update a team's endpoint URL."""
    team = state.get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    url = data.endpoint_url.strip()
    if not url.startswith(("http://", "https://")) and url != "DUMMY":
        raise HTTPException(status_code=400, detail="Endpoint URL must start with http:// or https:// (or be 'DUMMY' for testing)")

    updated_team = TeamRepository.update_team_endpoint(team_id, url)
    await manager.broadcast("team_updated", updated_team)
    return updated_team


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

