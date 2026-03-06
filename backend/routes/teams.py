from fastapi import APIRouter, HTTPException
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
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Endpoint URL must start with http:// or https://")

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
