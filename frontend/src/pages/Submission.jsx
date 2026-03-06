import { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import Timer from '../components/Timer';
import './Submission.css';

const SUB_ROUND_CATEGORIES = {
    1: 'Complex Puzzle',
    2: 'Math',
    3: 'General Knowledge',
};

export default function Submission() {
    const { subscribe } = useWebSocket();
    const [team, setTeam] = useState(null);
    const [teamNameInput, setTeamNameInput] = useState('');
    const [loginError, setLoginError] = useState('');
    const [appData, setAppData] = useState(null);
    const [endpointStatus, setEndpointStatus] = useState(null);
    const [testingEndpoint, setTestingEndpoint] = useState(false);

    const fetchTeamData = async () => {
        if (!team) return;
        try {
            const teamRes = await fetch(`/api/teams/${team.id}`);
            if (teamRes.ok) setTeam(await teamRes.json());
            const stateRes = await fetch('/api/admin/state');
            setAppData(await stateRes.json());
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        const unsubs = [
            subscribe('match_scored', () => fetchTeamData()),
            subscribe('bracket_round_complete', () => fetchTeamData()),
            subscribe('bracket_update', () => fetchTeamData()),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [subscribe, team]);

    useEffect(() => { if (team) fetchTeamData(); }, [team?.id]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        try {
            const res = await fetch('/api/teams/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: teamNameInput.trim() }),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.detail || 'Login failed');
            }
            setTeam(await res.json());
        } catch (e) { setLoginError(e.message); }
    };

    const testEndpoint = async () => {
        if (!team) return;
        setTestingEndpoint(true);
        try {
            const res = await fetch('/api/admin/test-endpoint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: team.endpoint_url }),
            });
            setEndpointStatus(await res.json());
        } catch (e) { setEndpointStatus({ status: 'error', error: e.message }); }
        finally { setTestingEndpoint(false); }
    };

    if (!team) {
        return (
            <div className="page-container submission-page">
                <h1 className="page-title">Team Status</h1>
                <p className="page-subtitle">Log in to view your team's match progress</p>
                <div className="card login-card animate-in">
                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label>Team Name</label>
                            <input className="input" type="text" placeholder="Enter your team name" value={teamNameInput} onChange={(e) => setTeamNameInput(e.target.value)} required />
                        </div>
                        {loginError && <p style={{ color: 'var(--accent-red)', marginBottom: '1rem', fontSize: '0.9rem' }}>{loginError}</p>}
                        <button className="btn btn-primary" type="submit">Log In</button>
                    </form>
                </div>
            </div>
        );
    }

    const matches = (appData?.matches || []).filter(m => m.team1_id === team.id || m.team2_id === team.id);
    const submissions = (appData?.submissions || []).filter(s => s.team_id === team.id);

    return (
        <div className="page-container submission-page">
            <h1 className="page-title">Team Status</h1>
            <p className="page-subtitle">
                <strong style={{ color: 'var(--accent-cyan)' }}>{team.name}</strong>
                {team.seed && <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Seed #{team.seed}</span>}
                {team.eliminated && <span className="badge badge-red" style={{ marginLeft: '0.75rem' }}>ELIMINATED</span>}
            </p>

            <Timer />

            {/* Endpoint */}
            <div className="card team-info-card animate-in" style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ color: 'var(--accent-cyan)', fontSize: '1rem', fontWeight: 700 }}>📡 Endpoint</h3>
                    <button className="btn btn-secondary btn-sm" onClick={testEndpoint} disabled={testingEndpoint}>
                        {testingEndpoint ? '🔄 Testing...' : '🧪 Test'}
                    </button>
                </div>
                <div className="endpoint-url">{team.endpoint_url}</div>
                {endpointStatus && (
                    <div className={`endpoint-result ${endpointStatus.status === 'ok' ? 'success' : 'error'}`}>
                        {endpointStatus.status === 'ok' ? '✅ Responding!' : `❌ ${endpointStatus.error}`}
                    </div>
                )}
                <div className="team-meta">
                    <span>Members: {team.members.join(', ')}</span>
                    <span>Total Score: <strong style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>{team.total_score || 0}</strong></span>
                </div>
            </div>

            {/* Match History */}
            <div style={{ marginTop: '2rem' }}>
                <h2 className="section-title">Your Matches</h2>
                <div className="rounds-grid">
                    {matches.map((match) => {
                        const isTeam1 = match.team1_id === team.id;
                        const opponentName = isTeam1 ? match.team2_name : match.team1_name;
                        const myTotal = isTeam1 ? match.team1_total : match.team2_total;
                        const theirTotal = isTeam1 ? match.team2_total : match.team1_total;
                        const won = match.winner_id === team.id;
                        const lost = match.completed && match.winner_id !== team.id;
                        const matchSubs = submissions.filter(s => s.match_id === match.id);

                        return (
                            <div key={match.id} className={`card round-result-card ${match.completed ? (won ? 'won' : 'lost') : ''}`}>
                                <div className="round-result-header">
                                    <span className="round-number">R{match.round_number} M{match.match_index + 1}</span>
                                    <span className="round-category">vs {opponentName || 'BYE'}</span>
                                    {won && <span className="badge badge-green">WON</span>}
                                    {lost && <span className="badge badge-red">LOST</span>}
                                    {!match.completed && <span className="badge badge-cyan">IN PROGRESS</span>}
                                </div>
                                <div className="round-result-body">
                                    {[1, 2, 3].map((sr) => {
                                        const sub = matchSubs.find(s => s.sub_round === sr);
                                        return (
                                            <div key={sr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{SUB_ROUND_CATEGORIES[sr]}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: sub?.score != null ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                                                    {sub?.score != null ? sub.score : '·'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', fontWeight: 800 }}>
                                        <span style={{ fontSize: '0.8rem' }}>Total</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: 'var(--accent-green)' }}>{myTotal} - {theirTotal}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {matches.length === 0 && (
                        <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>No matches yet. Bracket not generated.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
