from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid
import time
import math


# ── Pydantic request/response models ────────────────────────────────

class TeamCreate(BaseModel):
    name: str
    members: list[str] = Field(..., min_length=1, max_length=4)
    endpoint_url: str  # Team's /generate endpoint URL


class TeamOut(BaseModel):
    id: str
    name: str
    members: list[str]
    endpoint_url: str
    eliminated: bool = False
    total_score: float = 0
    seed: Optional[int] = None


class ScoreOverride(BaseModel):
    submission_id: str
    new_score: float
    reasoning: Optional[str] = None


class SubRoundConfig(BaseModel):
    prompt: str
    timer_seconds: int = 120


# ── Sub-round categories (same for every match) ────────────────────
SUB_ROUND_CATEGORIES = {
    1: "Complex Puzzle",
    2: "Math",
    3: "General Knowledge",
}


# ── In-memory application state ─────────────────────────────────────

class AppState:
    def __init__(self):
        self.teams: dict[str, dict] = {}
        self.matches: dict[str, dict] = {}
        self.submissions: dict[str, dict] = {}
        self.bracket_rounds: dict[int, dict] = {}  # bracket round metadata
        self.current_bracket_round: int = 0
        self.current_sub_round: int = 0
        self.champion: Optional[str] = None
        self.started: bool = False
        self.seeded: bool = False
        self.bracket_generated: bool = False
        self.total_bracket_rounds: int = 0

    def add_team(self, name: str, members: list[str], endpoint_url: str) -> dict:
        team_id = str(uuid.uuid4())[:8]
        team = {
            "id": team_id,
            "name": name,
            "members": members,
            "endpoint_url": endpoint_url,
            "eliminated": False,
            "total_score": 0,
            "seed": None,
        }
        self.teams[team_id] = team
        return team

    def get_team_by_name(self, name: str) -> Optional[dict]:
        for t in self.teams.values():
            if t["name"].lower() == name.lower():
                return t
        return None

    def get_active_teams(self) -> list[dict]:
        return [t for t in self.teams.values() if not t["eliminated"]]

    def get_matches_for_round(self, round_number: int) -> list[dict]:
        """Return all matches for a given bracket round, sorted by match_index."""
        return sorted(
            [m for m in self.matches.values() if m["round_number"] == round_number],
            key=lambda m: m["match_index"],
        )

    def get_match_by_id(self, match_id: str) -> Optional[dict]:
        return self.matches.get(match_id)

    def add_submission(self, team_id: str, match_id: str, sub_round: int, prompt_sent: str) -> dict:
        """Add a submission for a team in a specific match + sub-round."""
        sub_id = str(uuid.uuid4())[:8]
        submission = {
            "id": sub_id,
            "team_id": team_id,
            "team_name": self.teams[team_id]["name"],
            "match_id": match_id,
            "sub_round": sub_round,
            "sub_round_category": SUB_ROUND_CATEGORIES[sub_round],
            "prompt_sent": prompt_sent,
            "response_text": None,
            "timestamp": None,
            "score": None,
            "reasoning": None,
            "fetch_error": None,
        }
        self.submissions[sub_id] = submission
        return submission

    def get_submissions_for_match_sub_round(self, match_id: str, sub_round: int) -> list[dict]:
        return [
            s for s in self.submissions.values()
            if s["match_id"] == match_id and s["sub_round"] == sub_round
        ]

    def get_submission_for_team_match_sub_round(self, team_id: str, match_id: str, sub_round: int) -> Optional[dict]:
        for s in self.submissions.values():
            if s["team_id"] == team_id and s["match_id"] == match_id and s["sub_round"] == sub_round:
                return s
        return None

    def get_all_submissions_for_match(self, match_id: str) -> list[dict]:
        return sorted(
            [s for s in self.submissions.values() if s["match_id"] == match_id],
            key=lambda s: (s["sub_round"], s["team_name"]),
        )

    def get_match_total_scores(self, match_id: str) -> dict:
        """Calculate total scores across all 3 sub-rounds for each team in a match."""
        match = self.matches.get(match_id)
        if not match:
            return {}
        team1_total = 0
        team2_total = 0
        for s in self.submissions.values():
            if s["match_id"] == match_id and s["score"] is not None:
                if s["team_id"] == match.get("team1_id"):
                    team1_total += s["score"]
                elif s["team_id"] == match.get("team2_id"):
                    team2_total += s["score"]
        return {
            "team1_total": team1_total,
            "team2_total": team2_total,
        }

    def get_standings(self) -> list[dict]:
        """Return all teams sorted by total score, active first."""
        teams = list(self.teams.values())
        teams.sort(key=lambda t: (not t["eliminated"], t["total_score"]), reverse=True)
        return teams

    def to_dict(self) -> dict:
        return {
            "teams": list(self.teams.values()),
            "submissions": list(self.submissions.values()),
            "matches": list(self.matches.values()),
            "bracket_rounds": self.bracket_rounds,
            "current_bracket_round": self.current_bracket_round,
            "current_sub_round": self.current_sub_round,
            "total_bracket_rounds": self.total_bracket_rounds,
            "started": self.started,
            "seeded": self.seeded,
            "bracket_generated": self.bracket_generated,
            "champion": self.champion,
        }


# Singleton state
state = AppState()
