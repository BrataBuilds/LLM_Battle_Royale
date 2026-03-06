import asyncio
import time
import httpx
from fastapi import APIRouter, HTTPException
from backend.models import state, ScoreOverride, SubRoundConfig, SUB_ROUND_CATEGORIES
from backend.gemini_judge import judge_submission
from backend.ws_manager import manager
from backend.bracket import seed_teams, generate_bracket, advance_winners, determine_match_winner

router = APIRouter(prefix="/api/admin", tags=["admin"])

_timer_task: asyncio.Task | None = None


@router.get("/state")
async def get_full_state():
    """Full state dump for admin."""
    return state.to_dict()


# ── Seeding & Bracket ────────────────────────────────────────────────

@router.post("/seed")
async def seed(data: dict = None):
    """Seed teams randomly or manually."""
    if len(state.teams) == 0:
        raise HTTPException(status_code=400, detail="No teams registered")
    mode = data.get("mode", "random") if data else "random"
    order = data.get("order") if data else None
    teams = seed_teams(mode=mode, order=order)
    await manager.broadcast("seeding_update", {"teams": teams, "seeded": True})
    return {"message": f"Seeded {len(teams)} teams", "teams": teams}


@router.post("/generate-bracket")
async def gen_bracket():
    """Generate tournament bracket from seeded teams."""
    if not state.seeded:
        raise HTTPException(status_code=400, detail="Teams must be seeded first")
    matches = generate_bracket()
    await manager.broadcast("bracket_update", {
        "matches": matches,
        "current_bracket_round": state.current_bracket_round,
        "total_bracket_rounds": state.total_bracket_rounds,
    })
    return {"message": f"Generated bracket with {len(matches)} matches in round 1", "matches": matches}


# ── Sub-Round Management ─────────────────────────────────────────────

@router.post("/bracket-round/{round_num}/sub-round/{sub_round}/prompt")
async def set_sub_round_prompt(round_num: int, sub_round: int, config: SubRoundConfig):
    """Set a question for a sub-round — applies to ALL matches in this bracket round."""
    if round_num not in state.bracket_rounds:
        raise HTTPException(status_code=400, detail=f"Bracket round {round_num} doesn't exist")
    if sub_round not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="Sub-round must be 1, 2, or 3")

    br = state.bracket_rounds[round_num]
    br["sub_round_prompts"][sub_round] = config.prompt

    # Also store on each match dict for convenience
    for match in state.get_matches_for_round(round_num):
        match["sub_round_prompts"][sub_round] = config.prompt

    state.current_bracket_round = round_num
    state.current_sub_round = sub_round
    state.started = True

    await manager.broadcast("sub_round_prompt_set", {
        "bracket_round": round_num,
        "sub_round": sub_round,
        "category": SUB_ROUND_CATEGORIES[sub_round],
        "prompt": config.prompt,
        "timer_seconds": config.timer_seconds,
    })
    return {"message": f"Prompt set for R{round_num} sub-round {sub_round}: {SUB_ROUND_CATEGORIES[sub_round]}"}


@router.post("/bracket-round/{round_num}/sub-round/{sub_round}/run")
async def run_sub_round(round_num: int, sub_round: int):
    """
    For ALL matches in bracket round: fetch responses from both teams' endpoints,
    then judge with Gemini. All matches run concurrently.
    """
    if round_num not in state.bracket_rounds:
        raise HTTPException(status_code=400, detail=f"Bracket round {round_num} doesn't exist")
    if sub_round not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="Sub-round must be 1, 2, or 3")

    br = state.bracket_rounds[round_num]
    prompt = br["sub_round_prompts"].get(sub_round)
    if not prompt:
        raise HTTPException(status_code=400, detail="No prompt set for this sub-round")

    matches = state.get_matches_for_round(round_num)
    # Filter to matches that actually have 2 teams (skip byes)
    active_matches = [m for m in matches if m["team1_id"] and m["team2_id"] and not m.get("winner_id")]

    await manager.broadcast("sub_round_start", {
        "bracket_round": round_num,
        "sub_round": sub_round,
        "category": SUB_ROUND_CATEGORIES[sub_round],
        "total_matches": len(active_matches),
    })

    category = SUB_ROUND_CATEGORIES[sub_round]

    async def process_match(match: dict):
        """Fetch + judge both teams in this match for the given sub-round."""
        team1 = state.teams.get(match["team1_id"])
        team2 = state.teams.get(match["team2_id"])
        if not team1 or not team2:
            return

        # Create submission records
        for team in [team1, team2]:
            existing = state.get_submission_for_team_match_sub_round(team["id"], match["id"], sub_round)
            if not existing:
                state.add_submission(team["id"], match["id"], sub_round, prompt)

        # Fetch from both endpoints concurrently
        async def fetch_one(team: dict):
            sub = state.get_submission_for_team_match_sub_round(team["id"], match["id"], sub_round)
            if not sub:
                return
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        team["endpoint_url"],
                        json={"prompt": prompt},
                        headers={"Content-Type": "application/json"},
                    )
                    response.raise_for_status()
                    data = response.json()
                    if isinstance(data, str):
                        response_text = data
                    elif isinstance(data, dict):
                        response_text = data.get("response") or data.get("text") or data.get("output") or data.get("generated_text") or str(data)
                    else:
                        response_text = str(data)
                    sub["response_text"] = response_text
                    sub["timestamp"] = __import__("datetime").datetime.now().isoformat()
            except Exception as e:
                sub["fetch_error"] = str(e)[:200]
                sub["timestamp"] = __import__("datetime").datetime.now().isoformat()

        await asyncio.gather(fetch_one(team1), fetch_one(team2))

        await manager.broadcast("match_fetched", {
            "match_id": match["id"],
            "bracket_round": round_num,
            "sub_round": sub_round,
            "team1_name": team1["name"],
            "team2_name": team2["name"],
        })

        # Judge both responses with Gemini
        async def judge_one(team: dict):
            sub = state.get_submission_for_team_match_sub_round(team["id"], match["id"], sub_round)
            if not sub:
                return
            if not sub["response_text"]:
                sub["score"] = 0
                sub["reasoning"] = "No response received from endpoint"
                return

            result = await judge_submission(prompt, sub["response_text"], sub["team_name"], category)
            sub["score"] = result["score"] if result["score"] is not None else 0
            sub["reasoning"] = result["reasoning"]

            # Update team's cumulative total score
            team_obj = state.teams.get(sub["team_id"])
            if team_obj:
                total = sum(
                    s["score"] for s in state.submissions.values()
                    if s["team_id"] == sub["team_id"] and s["score"] is not None
                )
                team_obj["total_score"] = total

        await asyncio.gather(judge_one(team1), judge_one(team2))

        # Update match sub-round totals
        scores = state.get_match_total_scores(match["id"])
        match["team1_total"] = scores["team1_total"]
        match["team2_total"] = scores["team2_total"]

        # Get individual sub-round scores for broadcast
        t1_sub = state.get_submission_for_team_match_sub_round(team1["id"], match["id"], sub_round)
        t2_sub = state.get_submission_for_team_match_sub_round(team2["id"], match["id"], sub_round)

        await manager.broadcast("match_scored", {
            "match_id": match["id"],
            "bracket_round": round_num,
            "sub_round": sub_round,
            "team1_name": team1["name"],
            "team2_name": team2["name"],
            "team1_sub_score": t1_sub["score"] if t1_sub else 0,
            "team2_sub_score": t2_sub["score"] if t2_sub else 0,
            "team1_total": match["team1_total"],
            "team2_total": match["team2_total"],
        })

    # Run ALL matches concurrently
    await asyncio.gather(*[process_match(m) for m in active_matches])

    # Mark sub-round as complete
    if sub_round not in br["sub_rounds_completed"]:
        br["sub_rounds_completed"].append(sub_round)
    for match in active_matches:
        if sub_round not in match["sub_rounds_completed"]:
            match["sub_rounds_completed"].append(sub_round)

    await manager.broadcast("sub_round_complete", {
        "bracket_round": round_num,
        "sub_round": sub_round,
        "sub_rounds_completed": br["sub_rounds_completed"],
    })

    # If all 3 sub-rounds done, auto-determine winners and advance
    if len(br["sub_rounds_completed"]) >= 3:
        asyncio.create_task(_complete_bracket_round(round_num))

    return {
        "message": f"Sub-round {sub_round} ({SUB_ROUND_CATEGORIES[sub_round]}) completed for {len(active_matches)} matches",
        "sub_rounds_completed": br["sub_rounds_completed"],
    }


async def _complete_bracket_round(round_num: int):
    """After all 3 sub-rounds: determine winners, eliminate losers, advance to next bracket round."""
    matches = state.get_matches_for_round(round_num)

    # Determine winners for each match
    results = []
    for match in matches:
        if not match.get("winner_id"):
            determine_match_winner(match["id"])
        results.append({
            "match_id": match["id"],
            "team1_name": match["team1_name"],
            "team2_name": match["team2_name"],
            "team1_total": match["team1_total"],
            "team2_total": match["team2_total"],
            "winner_name": match["winner_name"],
        })

    await manager.broadcast("bracket_round_complete", {
        "bracket_round": round_num,
        "results": results,
    })

    # Advance winners to next round
    new_matches = advance_winners(round_num)

    if state.champion:
        champ = state.teams.get(state.champion)
        if champ:
            await manager.broadcast("champion", {
                "team_id": champ["id"],
                "team_name": champ["name"],
                "total_score": champ["total_score"],
            })
    elif new_matches:
        await manager.broadcast("bracket_update", {
            "matches": new_matches,
            "current_bracket_round": state.current_bracket_round,
            "total_bracket_rounds": state.total_bracket_rounds,
            "auto_advanced": True,
        })


# ── Manual completion trigger ────────────────────────────────────────

@router.post("/bracket-round/{round_num}/complete")
async def complete_bracket_round(round_num: int):
    """Manually trigger bracket round completion (if auto didn't fire)."""
    if round_num not in state.bracket_rounds:
        raise HTTPException(status_code=400, detail=f"Bracket round {round_num} doesn't exist")
    await _complete_bracket_round(round_num)
    return {
        "message": f"Bracket round {round_num} completed",
        "champion": state.champion,
        "next_round": state.current_bracket_round,
    }


# ── Timer ────────────────────────────────────────────────────────────

@router.post("/timer/start")
async def start_timer(data: dict = None):
    global _timer_task
    seconds = data.get("timer_seconds", 120) if data else 120
    cr = state.current_bracket_round
    sr = state.current_sub_round

    await manager.broadcast("timer_start", {
        "bracket_round": cr,
        "sub_round": sr,
        "timer_seconds": seconds,
        "timer_start": time.time(),
    })

    async def _countdown():
        remaining = seconds
        while remaining > 0:
            await asyncio.sleep(1)
            remaining -= 1
            await manager.broadcast("timer_tick", {
                "bracket_round": cr,
                "sub_round": sr,
                "remaining": remaining,
            })
        await manager.broadcast("timer_end", {"bracket_round": cr, "sub_round": sr})

    if _timer_task and not _timer_task.done():
        _timer_task.cancel()
    _timer_task = asyncio.create_task(_countdown())
    return {"message": "Timer started"}


@router.post("/timer/stop")
async def stop_timer():
    global _timer_task
    if _timer_task and not _timer_task.done():
        _timer_task.cancel()
        _timer_task = None
    await manager.broadcast("timer_end", {
        "bracket_round": state.current_bracket_round,
        "sub_round": state.current_sub_round,
    })
    return {"message": "Timer stopped"}


# ── Score Override ───────────────────────────────────────────────────

@router.post("/score/override")
async def override_score(override: ScoreOverride):
    sub = state.submissions.get(override.submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    old_score = sub["score"] or 0
    sub["score"] = override.new_score
    if override.reasoning:
        sub["reasoning"] = override.reasoning

    team = state.teams.get(sub["team_id"])
    if team:
        team["total_score"] = team["total_score"] - old_score + override.new_score

    # Update match totals
    match = state.matches.get(sub["match_id"])
    if match:
        scores = state.get_match_total_scores(match["id"])
        match["team1_total"] = scores["team1_total"]
        match["team2_total"] = scores["team2_total"]

    await manager.broadcast("score_update", {"submission": sub})
    return {"message": "Score overridden", "submission": sub}


# ── Test Endpoint ────────────────────────────────────────────────────

@router.post("/test-endpoint")
async def test_endpoint(data: dict):
    url = data.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="URL required")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                url,
                json={"prompt": "Hello! This is a test. Please respond with a short greeting."},
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            return {"status": "ok", "response": response.json(), "status_code": response.status_code}
    except Exception as e:
        return {"status": "error", "error": str(e)[:300]}


# ── Reset ────────────────────────────────────────────────────────────

@router.post("/reset")
async def reset():
    state.__init__()
    await manager.broadcast("reset", {})
    return {"message": "State reset"}
