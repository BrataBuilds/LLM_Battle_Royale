import sqlite3
import hashlib
import uuid
import json
from typing import Optional, Dict, List
from contextlib import contextmanager
from datetime import datetime

DATABASE_PATH = "battle_royale.db"

def init_database():
    """Initialize the SQLite database with required tables."""
    with sqlite3.connect(DATABASE_PATH) as conn:
        cursor = conn.cursor()

        # Teams table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                members TEXT NOT NULL,  -- JSON array of member names
                endpoint_url TEXT NOT NULL,
                eliminated BOOLEAN DEFAULT FALSE,
                total_score REAL DEFAULT 0,
                seed INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Matches table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                id TEXT PRIMARY KEY,
                round_number INTEGER NOT NULL,
                match_index INTEGER NOT NULL,
                team1_id TEXT,
                team2_id TEXT,
                team1_name TEXT,
                team2_name TEXT,
                team1_total REAL DEFAULT 0,
                team2_total REAL DEFAULT 0,
                winner_id TEXT,
                completed BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team1_id) REFERENCES teams (id),
                FOREIGN KEY (team2_id) REFERENCES teams (id),
                FOREIGN KEY (winner_id) REFERENCES teams (id)
            )
        """)

        # Submissions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS submissions (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                team_name TEXT NOT NULL,
                match_id TEXT NOT NULL,
                sub_round INTEGER NOT NULL,
                sub_round_category TEXT NOT NULL,
                prompt_sent TEXT,
                response_text TEXT,
                timestamp DATETIME,
                score REAL,
                reasoning TEXT,
                fetch_error TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team_id) REFERENCES teams (id),
                FOREIGN KEY (match_id) REFERENCES matches (id)
            )
        """)

        conn.commit()

def hash_password(password: str) -> str:
    """Hash a password using SHA-256."""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return hash_password(password) == password_hash

@contextmanager
def get_db_connection():
    """Get a database connection context manager."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row  # Enable column access by name
    try:
        yield conn
    finally:
        conn.close()


def normalize_members(members_data):
    """Normalize members data to new format with name and roll.

    Handles backward compatibility with old format (list of strings).
    """
    normalized = []
    for m in members_data:
        if isinstance(m, str):
            # Old format: just a name string
            normalized.append({"name": m, "roll": ""})
        elif isinstance(m, dict):
            # New format: dict with name and roll
            normalized.append({"name": m.get("name", ""), "roll": m.get("roll", "")})
        else:
            normalized.append({"name": str(m), "roll": ""})
    return normalized

class TeamRepository:
    """Repository for team-related database operations."""

    @staticmethod
    def create_team(name: str, password: str, members: List[str], endpoint_url: str) -> Dict:
        """Create a new team in the database."""
        team_id = str(uuid.uuid4())[:8]
        password_hash = hash_password(password)
        members_json = json.dumps(members)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO teams (id, name, password_hash, members, endpoint_url)
                VALUES (?, ?, ?, ?, ?)
            """, (team_id, name, password_hash, members_json, endpoint_url))
            conn.commit()

            return {
                "id": team_id,
                "name": name,
                "members": members,
                "endpoint_url": endpoint_url,
                "eliminated": False,
                "total_score": 0,
                "seed": None,
            }

    @staticmethod
    def get_team_by_name(name: str) -> Optional[Dict]:
        """Get a team by name."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM teams WHERE name = ?", (name,))
            row = cursor.fetchone()

            if row:
                return {
                    "id": row["id"],
                    "name": row["name"],
                    "members": normalize_members(json.loads(row["members"])),
                    "endpoint_url": row["endpoint_url"],
                    "eliminated": bool(row["eliminated"]),
                    "total_score": row["total_score"],
                    "seed": row["seed"],
                }
            return None

    @staticmethod
    def get_team_by_id(team_id: str) -> Optional[Dict]:
        """Get a team by ID."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM teams WHERE id = ?", (team_id,))
            row = cursor.fetchone()

            if row:
                return {
                    "id": row["id"],
                    "name": row["name"],
                    "members": normalize_members(json.loads(row["members"])),
                    "endpoint_url": row["endpoint_url"],
                    "eliminated": bool(row["eliminated"]),
                    "total_score": row["total_score"],
                    "seed": row["seed"],
                }
            return None

    @staticmethod
    def authenticate_team(name: str, password: str) -> Optional[Dict]:
        """Authenticate a team with name and password."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM teams WHERE name = ?", (name,))
            row = cursor.fetchone()

            if row and verify_password(password, row["password_hash"]):
                return {
                    "id": row["id"],
                    "name": row["name"],
                    "members": normalize_members(json.loads(row["members"])),
                    "endpoint_url": row["endpoint_url"],
                    "eliminated": bool(row["eliminated"]),
                    "total_score": row["total_score"],
                    "seed": row["seed"],
                }
            return None

    @staticmethod
    def get_all_teams() -> List[Dict]:
        """Get all teams."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM teams ORDER BY total_score DESC")
            rows = cursor.fetchall()

            return [{
                "id": row["id"],
                "name": row["name"],
                "members": normalize_members(json.loads(row["members"])),
                "endpoint_url": row["endpoint_url"],
                "eliminated": bool(row["eliminated"]),
                "total_score": row["total_score"],
                "seed": row["seed"],
            } for row in rows]

    @staticmethod
    def get_active_teams() -> List[Dict]:
        """Get all non-eliminated teams."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM teams WHERE eliminated = FALSE ORDER BY total_score DESC")
            rows = cursor.fetchall()

            return [{
                "id": row["id"],
                "name": row["name"],
                "members": normalize_members(json.loads(row["members"])),
                "endpoint_url": row["endpoint_url"],
                "eliminated": bool(row["eliminated"]),
                "total_score": row["total_score"],
                "seed": row["seed"],
            } for row in rows]

    @staticmethod
    def update_team_score(team_id: str, total_score: float):
        """Update a team's total score."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE teams SET total_score = ? WHERE id = ?", (total_score, team_id))
            conn.commit()

    @staticmethod
    def eliminate_team(team_id: str):
        """Mark a team as eliminated."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE teams SET eliminated = TRUE WHERE id = ?", (team_id,))
            conn.commit()

    @staticmethod
    def set_team_seed(team_id: str, seed: int):
        """Set a team's seed."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE teams SET seed = ? WHERE id = ?", (seed, team_id))
            conn.commit()

    @staticmethod
    def update_team_endpoint(team_id: str, endpoint_url: str) -> Optional[Dict]:
        """Update a team's endpoint URL."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE teams SET endpoint_url = ? WHERE id = ?", (endpoint_url, team_id))
            conn.commit()
        return TeamRepository.get_team_by_id(team_id)

# Initialize database when module is imported
init_database()