from fastapi import APIRouter
from backend.models import state

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


@router.get("/match/{match_id}")
async def get_match_submissions(match_id: str):
    """Get all submissions for a given match, grouped by sub-round."""
    subs = state.get_all_submissions_for_match(match_id)
    return subs


@router.get("/match/{match_id}/sub-round/{sub_round}")
async def get_match_sub_round_submissions(match_id: str, sub_round: int):
    """Get submissions for a specific sub-round of a match."""
    return state.get_submissions_for_match_sub_round(match_id, sub_round)
