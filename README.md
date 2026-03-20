# ⚔️ InferenceX — LLM Battle Royale

A live, real-time **64-team tournament bracket** where LLMs fight head-to-head across 3 rounds of challenges. Teams deploy their own LLM endpoints, and an AI judge (Gemini) scores every response. Winners advance. Losers are eliminated. One champion remains.

---

## 🎮 How It Works

```
64 teams  →  32 matches (R1)  →  16 matches (R2)  →  ...  →  Final (R6)  →  🏆 Champion

Each 1v1 match has 3 sub-rounds:
  1️⃣  Complex Puzzle      — both LLMs get the same question
  2️⃣  Math                — scored 0-100 by Gemini
  3️⃣  General Knowledge   — highest combined total wins the match
```

- **Teams register** with a name, members, and a deployed LLM endpoint URL
- **Admin seeds** teams and generates the bracket (byes auto-advance if < 64 teams)
- **Each bracket round**, the admin sets a question for each sub-round category
- **All matches run concurrently** — both teams in every match get the same prompt, their endpoints are called, and Gemini judges both responses
- After 3 sub-rounds, the **higher total score wins** and the loser is eliminated
- Winners **auto-advance** to the next bracket round

---

## 🧱 Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | **FastAPI** (Python 3.13+)          |
| Frontend  | **React** + **Vite**                |
| AI Judge  | **Google Gemini** (gemini-2.5-flash)|
| Realtime  | **WebSockets** (live bracket, scores, timer) |
| HTTP Client | **httpx** (async endpoint calls)  |

---

## 📦 Setup

### Prerequisites

- Python 3.13+
- Node.js 18+
- A [Google Gemini API key](https://aistudio.google.com/apikey)

### 1. Clone & Install Backend

```bash
git clone <repo-url>
cd LLM_battle_Royale

# Create .env file
echo GEMINI_API_KEY=your_key_here > .env

# Install Python deps (using uv)
uv sync
# OR with pip:
pip install -e .
```

### 2. Install Frontend

```bash
cd frontend
npm install
```

### 3. Run

```bash
# Terminal 1 — Backend
python -m uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 🖥️ Pages

| Route       | Page             | Description |
|-------------|------------------|-------------|
| `/`         | **Live View**    | Tournament bracket, timer, leaderboard — for spectators & participants |
| `/register` | **Registration** | Teams register with name, members (1-4), and LLM endpoint URL |
| `/submit`   | **Team Status**  | Login to see your match history, sub-round scores, and endpoint health |
| `/admin`    | **Admin Dashboard** | Full tournament control: seed, bracket, prompts, run matches, view results |

---

## 🔧 Admin Flow

1. **Register teams** — Teams provide their LLM endpoint URL (must accept `POST {"prompt": "..."}` and return `{"response": "..."}`)
2. **Seed teams** — Random or manual seed ordering
3. **Generate bracket** — Creates round 1 matchups (1 vs 64, 2 vs 63, etc.)
4. **For each bracket round:**
   - Select sub-round (Complex Puzzle / Math / General Knowledge)
   - Set the question prompt
   - Click **Run** — fetches responses from all teams' endpoints + judges with Gemini (all matches run in parallel)
   - Repeat for all 3 sub-rounds
5. After 3 sub-rounds → winners auto-advance → next bracket round starts
6. **Champion** crowned after the final match 🏆

---

## 📡 LLM Endpoint Contract

Teams must deploy an HTTP endpoint that accepts:

```http
POST /generate
Content-Type: application/json

{"prompt": "What is the square root of 144?"}
```

And returns:

```json
{"response": "The square root of 144 is 12."}
```

> The endpoint URL is what teams provide during registration. It can be hosted anywhere (Modal, Hugging Face, cloud VM, ngrok, etc.).

---

## 🗂️ Project Structure

```
LLM_battle_Royale/
├── main.py                  # FastAPI app, CORS, WebSocket, routes
├── backend/
│   ├── models.py            # Data models, AppState (in-memory)
│   ├── bracket.py           # Seeding, bracket generation, advancement
│   ├── gemini_judge.py      # Gemini API judging logic
│   ├── ws_manager.py        # WebSocket connection manager
│   └── routes/
│       ├── admin.py         # Admin API (seed, bracket, run, score)
│       ├── teams.py         # Team registration & lookup
│       └── submissions.py   # Submission queries by match
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Router setup
│   │   ├── index.css        # Global styles, design tokens
│   │   ├── contexts/
│   │   │   └── WebSocketContext.jsx
│   │   ├── components/
│   │   │   ├── Bracket.jsx  # Tournament bracket visualization
│   │   │   ├── Timer.jsx    # Countdown timer
│   │   │   ├── Leaderboard.jsx
│   │   │   └── Navbar.jsx
│   │   └── pages/
│   │       ├── ParticipantView.jsx   # Live spectator page
│   │       ├── Registration.jsx      # Team registration
│   │       ├── Submission.jsx        # Team status / match history
│   │       └── AdminDashboard.jsx    # Tournament control panel
│   └── vite.config.js       # Dev proxy to backend
├── pyproject.toml
└── .env                     # GEMINI_API_KEY
```

---

## 🗄️ Database Structure (PostgreSQL)

The application uses **PostgreSQL** with the `psycopg2` driver. Configure the connection using environment variables.

### Environment Variables

| Variable            | Default         | Description                     |
|---------------------|----------------|---------------------------------|
| `POSTGRES_HOST`     | `localhost`    | PostgreSQL server hostname      |
| `POSTGRES_PORT`     | `5432`         | PostgreSQL server port          |
| `POSTGRES_USER`     | `postgres`     | PostgreSQL username             |
| `POSTGRES_PASSWORD` | (empty)        | PostgreSQL password             |
| `POSTGRES_DATABASE` | `battle_royale`| Database name                   |

### Tables

#### `teams`
Stores registered teams and their configuration.

| Column         | Type             | Constraints                     | Description                              |
|----------------|------------------|---------------------------------|------------------------------------------|
| `id`           | VARCHAR(8)       | PRIMARY KEY                     | Unique team identifier (UUID prefix)     |
| `name`         | VARCHAR(255)     | UNIQUE, NOT NULL                | Team display name                        |
| `password_hash`| VARCHAR(64)      | NOT NULL                        | SHA-256 hashed password                  |
| `members`      | JSONB            | NOT NULL                        | Array of `{name, roll}` objects          |
| `endpoint_url` | TEXT             | NOT NULL                        | Team's LLM API endpoint URL              |
| `eliminated`   | BOOLEAN          | DEFAULT FALSE                   | Whether team is eliminated               |
| `total_score`  | DOUBLE PRECISION | DEFAULT 0                       | Cumulative score across all matches      |
| `seed`         | INTEGER          | NULL                            | Tournament seeding position              |
| `is_admin`     | BOOLEAN          | DEFAULT FALSE                   | Whether team has admin privileges        |
| `created_at`   | TIMESTAMP        | DEFAULT CURRENT_TIMESTAMP       | Registration timestamp                   |

**Members JSONB Format:**
```json
[
  {"name": "Alice", "roll": "2024001"},
  {"name": "Bob", "roll": "2024002"}
]
```

#### `matches`
Stores tournament bracket matches.

| Column         | Type             | Constraints                     | Description                              |
|----------------|------------------|---------------------------------|------------------------------------------|
| `id`           | VARCHAR(36)      | PRIMARY KEY                     | Unique match identifier (UUID)           |
| `round_number` | INTEGER          | NOT NULL                        | Tournament round (1, 2, 3, etc.)         |
| `match_index`  | INTEGER          | NOT NULL                        | Match position within the round          |
| `team1_id`     | VARCHAR(8)       | FK → teams(id), ON DELETE SET NULL | First team's ID                      |
| `team2_id`     | VARCHAR(8)       | FK → teams(id), ON DELETE SET NULL | Second team's ID                     |
| `team1_name`   | VARCHAR(255)     | NULL                            | First team's name (denormalized)         |
| `team2_name`   | VARCHAR(255)     | NULL                            | Second team's name (denormalized)        |
| `team1_total`  | DOUBLE PRECISION | DEFAULT 0                       | First team's total score in match        |
| `team2_total`  | DOUBLE PRECISION | DEFAULT 0                       | Second team's total score in match       |
| `winner_id`    | VARCHAR(8)       | FK → teams(id), ON DELETE SET NULL | Winning team's ID                    |
| `completed`    | BOOLEAN          | DEFAULT FALSE                   | Whether match is finished                |
| `created_at`   | TIMESTAMP        | DEFAULT CURRENT_TIMESTAMP       | Match creation timestamp                 |

#### `submissions`
Stores individual sub-round submissions and scores.

| Column              | Type             | Constraints                     | Description                              |
|---------------------|------------------|---------------------------------|------------------------------------------|
| `id`                | VARCHAR(36)      | PRIMARY KEY                     | Unique submission identifier (UUID)      |
| `team_id`           | VARCHAR(8)       | FK → teams(id), ON DELETE CASCADE, NOT NULL | Submitting team's ID         |
| `team_name`         | VARCHAR(255)     | NOT NULL                        | Team name (denormalized)                 |
| `match_id`          | VARCHAR(36)      | FK → matches(id), ON DELETE CASCADE, NOT NULL | Associated match ID         |
| `sub_round`         | INTEGER          | NOT NULL                        | Sub-round number (1, 2, or 3)            |
| `sub_round_category`| VARCHAR(50)      | NOT NULL                        | Category: "Complex Puzzle", "Math", etc. |
| `prompt_sent`       | TEXT             | NULL                            | The prompt sent to the team's endpoint   |
| `response_text`     | TEXT             | NULL                            | The LLM's response                       |
| `timestamp`         | TIMESTAMP        | NULL                            | When the response was received           |
| `score`             | DOUBLE PRECISION | NULL                            | Gemini judge's score (0-100)             |
| `reasoning`         | TEXT             | NULL                            | Gemini's scoring rationale               |
| `fetch_error`       | TEXT             | NULL                            | Error message if endpoint call failed    |
| `created_at`        | TIMESTAMP        | DEFAULT CURRENT_TIMESTAMP       | Record creation timestamp                |

### Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    teams     │       │   matches    │       │ submissions  │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │◄──┬───│ team1_id(FK) │   ┌───│ team_id (FK) │
│ name         │   │   │ team2_id(FK) │◄──┼───│ match_id(FK) │
│ password_hash│   │   │ winner_id(FK)│   │   │ sub_round    │
│ members      │   │   │ round_number │   │   │ score        │
│ endpoint_url │   │   │ match_index  │   │   │ response_text│
│ eliminated   │   │   │ team1_total  │   │   │ ...          │
│ total_score  │   └───│ team2_total  │───┘   └──────────────┘
│ seed         │       │ completed    │
│ is_admin     │       └──────────────┘
│ created_at   │
└──────────────┘
```

---

## 📜 License

MIT
