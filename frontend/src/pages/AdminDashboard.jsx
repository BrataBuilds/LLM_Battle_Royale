import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import Timer from '../components/Timer';
import Leaderboard from '../components/Leaderboard';
import './AdminDashboard.css';

const SUB_ROUND_CATEGORIES = {
    1: 'Complex Puzzle',
    2: 'Math',
    3: 'General Knowledge',
};

export default function AdminDashboard() {
    const { subscribe } = useWebSocket();
    const [appState, setAppState] = useState(null);
    const [prompt, setPrompt] = useState('');
    const [timerSeconds, setTimerSeconds] = useState(120);
    const [loading, setLoading] = useState({});
    const [selectedBracketRound, setSelectedBracketRound] = useState(1);
    const [selectedSubRound, setSelectedSubRound] = useState(1);
    const [battleStatus, setBattleStatus] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');

    const fetchState = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/state');
            const data = await res.json();
            setAppState(data);
            if (data.current_bracket_round > 0) {
                setSelectedBracketRound(data.current_bracket_round);
            }
            if (data.current_sub_round > 0) {
                setSelectedSubRound(data.current_sub_round);
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        fetchState();
        const unsubs = [
            subscribe('*', () => fetchState()),
            subscribe('sub_round_start', (data) => {
                setBattleStatus('running');
                setStatusMessage(`📡 Running ${data.category} across ${data.total_matches} matches...`);
            }),
            subscribe('match_fetched', (data) => {
                setStatusMessage(`📡 Fetched: ${data.team1_name} vs ${data.team2_name}`);
            }),
            subscribe('match_scored', (data) => {
                setStatusMessage(`⚡ ${data.team1_name} (${data.team1_sub_score}) vs ${data.team2_name} (${data.team2_sub_score})`);
            }),
            subscribe('sub_round_complete', (data) => {
                setBattleStatus(null);
                setStatusMessage(`✅ Sub-round ${data.sub_round} complete! (${data.sub_rounds_completed.length}/3 done)`);
            }),
            subscribe('bracket_round_complete', (data) => {
                setBattleStatus(null);
                setStatusMessage(`🏁 Bracket round ${data.bracket_round} complete! Winners advanced.`);
            }),
            subscribe('bracket_update', (data) => {
                if (data.auto_advanced) {
                    setStatusMessage(`🚀 Auto-advanced to bracket round ${data.current_bracket_round}`);
                    setSelectedBracketRound(data.current_bracket_round);
                    setSelectedSubRound(1);
                    setPrompt('');
                }
            }),
            subscribe('champion', (data) => {
                setBattleStatus(null);
                setStatusMessage(`🏆 CHAMPION: ${data.team_name}!`);
            }),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [subscribe, fetchState]);

    const apiCall = async (url, method = 'POST', body = null) => {
        setLoading((prev) => ({ ...prev, [url]: true }));
        try {
            const res = await fetch(url, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : null,
            });
            const data = await res.json();
            if (!res.ok) alert(data.detail || 'Error');
            await fetchState();
            return data;
        } catch (e) {
            alert(e.message);
        } finally {
            setLoading((prev) => ({ ...prev, [url]: false }));
        }
    };

    if (!appState) return <div className="page-container"><p>Loading...</p></div>;

    const teams = appState.teams || [];
    const matches = appState.matches || [];
    const br = selectedBracketRound;
    const sr = selectedSubRound;
    const bracketRoundData = appState.bracket_rounds?.[br];
    const totalBracketRounds = appState.total_bracket_rounds || 0;
    const roundMatches = matches
        .filter((m) => m.round_number === br)
        .sort((a, b) => a.match_index - b.match_index);
    const activeTeams = teams.filter((t) => !t.eliminated);

    const subRoundsCompleted = bracketRoundData?.sub_rounds_completed || [];
    const runUrl = `/api/admin/bracket-round/${br}/sub-round/${sr}/run`;
    const promptUrl = `/api/admin/bracket-round/${br}/sub-round/${sr}/prompt`;

    return (
        <div className="page-container admin-page">
            <h1 className="page-title">Admin Dashboard</h1>
            <p className="page-subtitle">
                🎮 {teams.length} Teams · {totalBracketRounds > 0 ? `${totalBracketRounds} Bracket Rounds` : 'Not started'}
                {appState.champion && ' · 🏆 Champion crowned!'}
            </p>

            {/* Status Banner */}
            {statusMessage && (
                <div className={`battle-status-banner ${battleStatus ? 'active' : 'done'}`}>
                    <span className="status-text">{statusMessage}</span>
                    {battleStatus && <span className="status-spinner"></span>}
                </div>
            )}

            {/* Stats Row */}
            <div className="stats-row">
                <div className="card stat-card">
                    <div className="stat-value">{teams.length}</div>
                    <div className="stat-label">Teams</div>
                </div>
                <div className="card stat-card">
                    <div className="stat-value">{activeTeams.length}</div>
                    <div className="stat-label">Still In</div>
                </div>
                <div className="card stat-card">
                    <div className="stat-value">{roundMatches.length}</div>
                    <div className="stat-label">Matches (R{br})</div>
                </div>
                <div className="card stat-card">
                    <div className="stat-value">{subRoundsCompleted.length}/3</div>
                    <div className="stat-label">Sub-Rounds Done</div>
                </div>
            </div>

            <div className="admin-grid">
                {/* Setup Card */}
                <div className="card">
                    <div className="admin-section-header">
                        <h3>⚡ Setup</h3>
                    </div>
                    <div className="admin-controls">
                        <button
                            className="btn btn-secondary"
                            onClick={() => apiCall('/api/admin/seed', 'POST', { mode: 'random' })}
                            disabled={loading['/api/admin/seed'] || teams.length === 0}
                        >
                            {loading['/api/admin/seed'] ? '...' : '🎲 Seed Teams'}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => apiCall('/api/admin/generate-bracket')}
                            disabled={loading['/api/admin/generate-bracket'] || !appState.seeded}
                        >
                            {loading['/api/admin/generate-bracket'] ? '...' : '📊 Generate Bracket'}
                        </button>
                    </div>
                    <div className="setup-status">
                        {appState.seeded ? '✅ Seeded' : '⏳ Not seeded'}
                        {' · '}
                        {appState.bracket_generated ? `✅ Bracket ready (${totalBracketRounds} rounds)` : '⏳ No bracket'}
                    </div>
                </div>

                {/* Bracket Round Selector + Sub-Round */}
                <div className="card">
                    <div className="admin-section-header">
                        <h3>📋 Round & Sub-Round</h3>
                    </div>
                    {/* Bracket round selector */}
                    <div className="bracket-round-selector">
                        {Array.from({ length: totalBracketRounds }, (_, i) => i + 1).map((r) => {
                            const brData = appState.bracket_rounds?.[r];
                            return (
                                <button
                                    key={r}
                                    className={`bracket-round-btn ${br === r ? 'active' : ''} ${brData?.completed ? 'completed' : ''}`}
                                    onClick={() => { setSelectedBracketRound(r); setSelectedSubRound(1); }}
                                >
                                    R{r}
                                    {brData?.completed && <span className="mini-check">✓</span>}
                                    {brData?.active && !brData?.completed && <span className="mini-live">●</span>}
                                </button>
                            );
                        })}
                    </div>
                    {/* Sub-round tabs */}
                    <div className="sub-round-tabs">
                        {[1, 2, 3].map((s) => (
                            <button
                                key={s}
                                className={`sub-round-tab ${sr === s ? 'active' : ''} ${subRoundsCompleted.includes(s) ? 'completed' : ''}`}
                                onClick={() => setSelectedSubRound(s)}
                            >
                                <span className="sr-number">SR{s}</span>
                                <span className="sr-category">{SUB_ROUND_CATEGORIES[s]}</span>
                                {subRoundsCompleted.includes(s) && <span className="sr-check">✅</span>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sub-Round Config + Run */}
                <div className="card">
                    <div className="admin-section-header">
                        <h3>🧪 SR{sr}: {SUB_ROUND_CATEGORIES[sr]}</h3>
                        <span className={`badge ${subRoundsCompleted.includes(sr) ? 'badge-green' : 'badge-cyan'}`}>
                            {subRoundsCompleted.includes(sr) ? 'DONE' : 'PENDING'}
                        </span>
                    </div>
                    <div className="prompt-editor">
                        <textarea
                            className="input"
                            placeholder={`Enter the ${SUB_ROUND_CATEGORIES[sr]} question...`}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={3}
                        />
                        <div className="timer-controls">
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 0 }}>Timer (s):</label>
                            <input
                                className="input timer-input"
                                type="number"
                                value={timerSeconds}
                                onChange={(e) => setTimerSeconds(Number(e.target.value))}
                                min={10}
                                max={3600}
                            />
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => apiCall(promptUrl, 'POST', { prompt, timer_seconds: timerSeconds })}
                                disabled={!prompt.trim() || !appState.bracket_generated}
                            >
                                Set Question
                            </button>
                        </div>
                    </div>
                </div>

                {/* Battle Controls */}
                <div className="card">
                    <div className="admin-section-header">
                        <h3>⚔️ Battle Controls</h3>
                    </div>
                    <Timer />
                    <div className="battle-controls" style={{ marginTop: '1rem' }}>
                        <button
                            className="btn btn-success btn-sm"
                            onClick={() => apiCall('/api/admin/timer/start', 'POST', { timer_seconds: timerSeconds })}
                            disabled={!appState.bracket_generated}
                        >
                            ▶ Start Timer
                        </button>
                        <button
                            className="btn btn-danger btn-sm"
                            onClick={() => apiCall('/api/admin/timer/stop')}
                        >
                            ⏹ Stop
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setBattleStatus('running');
                                apiCall(runUrl);
                            }}
                            disabled={loading[runUrl] || battleStatus === 'running' || subRoundsCompleted.includes(sr)}
                        >
                            {battleStatus === 'running' ? '⚔️ Running...' : `⚔️ Run SR${sr}: ${SUB_ROUND_CATEGORIES[sr]}`}
                        </button>
                    </div>
                    <p className="flow-hint">
                        Set question → Run (fetches + judges ALL matches concurrently) → After 3 sub-rounds, winners auto-advance
                    </p>
                    {subRoundsCompleted.length >= 3 && !bracketRoundData?.completed && (
                        <button
                            className="btn btn-success"
                            style={{ marginTop: '0.75rem', width: '100%' }}
                            onClick={() => apiCall(`/api/admin/bracket-round/${br}/complete`)}
                        >
                            🏁 Complete Round & Advance Winners
                        </button>
                    )}
                </div>

                {/* Champion + Reset */}
                {appState.champion && (
                    <div className="card admin-full">
                        <div className="champion-card">
                            <span className="champion-trophy">🏆</span>
                            <div className="champion-name">
                                {teams.find((t) => t.id === appState.champion)?.name || 'Champion!'}
                            </div>
                            <div className="champion-score">
                                Total Score: {teams.find((t) => t.id === appState.champion)?.total_score || 0}
                            </div>
                        </div>
                    </div>
                )}

                {/* Match Results Table */}
                <div className="card admin-full">
                    <div className="admin-section-header">
                        <h3>📊 Bracket Round {br} — Matches ({roundMatches.length})</h3>
                        <button
                            className="btn btn-danger btn-sm"
                            onClick={() => { if (window.confirm('Reset all data?')) apiCall('/api/admin/reset'); }}
                        >
                            ♻️ Reset
                        </button>
                    </div>
                    {roundMatches.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)' }}>No matches yet. Generate the bracket first.</p>
                    ) : (
                        <div className="match-grid">
                            {roundMatches.map((match) => (
                                <MatchCard key={match.id} match={match} submissions={appState.submissions || []} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Leaderboard */}
                <div className="card admin-full">
                    <div className="admin-section-header">
                        <h3>🏅 Standings</h3>
                    </div>
                    <Leaderboard />
                </div>
            </div>
        </div>
    );
}

function MatchCard({ match, submissions }) {
    const isBye = !(match.team1_id && match.team2_id);
    const matchSubs = submissions.filter((s) => s.match_id === match.id);

    // Get sub-round scores
    const getSubScore = (teamId, subRound) => {
        const sub = matchSubs.find((s) => s.team_id === teamId && s.sub_round === subRound);
        return sub?.score;
    };

    return (
        <div className={`match-card ${match.completed ? 'completed' : ''} ${isBye ? 'bye' : ''}`}>
            <div className="match-header">
                <span className="match-index">M{match.match_index + 1}</span>
                {match.completed && match.winner_name && (
                    <span className="match-winner-tag">👑 {match.winner_name}</span>
                )}
                {isBye && <span className="badge badge-purple">BYE</span>}
            </div>

            <div className="match-teams">
                {/* Team 1 */}
                <div className={`match-team ${match.winner_id === match.team1_id ? 'winner' : ''}`}>
                    <div className="match-team-name">
                        {match.team1_seed && <span className="seed-tag">#{match.team1_seed}</span>}
                        {match.team1_name || '—'}
                    </div>
                    <div className="match-sub-scores">
                        {[1, 2, 3].map((sr) => {
                            const score = getSubScore(match.team1_id, sr);
                            return (
                                <span key={sr} className={`sub-score ${score != null ? 'scored' : ''}`} title={SUB_ROUND_CATEGORIES[sr]}>
                                    {score != null ? score : '·'}
                                </span>
                            );
                        })}
                    </div>
                    <div className="match-team-total">{match.team1_total || 0}</div>
                </div>

                <div className="vs-divider">VS</div>

                {/* Team 2 */}
                <div className={`match-team ${match.winner_id === match.team2_id ? 'winner' : ''}`}>
                    <div className="match-team-name">
                        {match.team2_seed && <span className="seed-tag">#{match.team2_seed}</span>}
                        {match.team2_name || '—'}
                    </div>
                    <div className="match-sub-scores">
                        {[1, 2, 3].map((sr) => {
                            const score = getSubScore(match.team2_id, sr);
                            return (
                                <span key={sr} className={`sub-score ${score != null ? 'scored' : ''}`} title={SUB_ROUND_CATEGORIES[sr]}>
                                    {score != null ? score : '·'}
                                </span>
                            );
                        })}
                    </div>
                    <div className="match-team-total">{match.team2_total || 0}</div>
                </div>
            </div>
        </div>
    );
}
