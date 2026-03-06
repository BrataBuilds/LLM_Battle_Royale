import { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import './Leaderboard.css';

export default function Leaderboard() {
    const { subscribe } = useWebSocket();
    const [teams, setTeams] = useState([]);

    const fetchStandings = async () => {
        try {
            const res = await fetch('/api/standings');
            const data = await res.json();
            setTeams(data);
        } catch (e) {
            console.error('Failed to fetch standings:', e);
        }
    };

    useEffect(() => {
        fetchStandings();
        const unsub1 = subscribe('score_update', () => fetchStandings());
        const unsub2 = subscribe('bracket_round_complete', () => fetchStandings());
        const unsub3 = subscribe('team_registered', () => fetchStandings());
        const unsub4 = subscribe('match_scored', () => fetchStandings());
        return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
    }, [subscribe]);

    if (teams.length === 0) {
        return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No teams registered yet.</div>;
    }

    return (
        <div className="leaderboard">
            <div className="leaderboard-header">
                <span>#</span>
                <span>Team</span>
                <span>Score</span>
                <span>Status</span>
            </div>
            {teams.map((team, i) => (
                <div key={team.id} className={`leaderboard-row ${team.eliminated ? 'eliminated' : ''}`}>
                    <span className={`leaderboard-rank ${i < 3 ? 'top-3' : ''}`}>
                        {i + 1}
                    </span>
                    <span className="leaderboard-name">{team.name}</span>
                    <span className="leaderboard-score">
                        {team.total_score > 0 ? team.total_score : '—'}
                    </span>
                    <span className="leaderboard-status">
                        {team.eliminated ? (
                            <span className="badge badge-red">Eliminated</span>
                        ) : (
                            <span className="badge badge-green">Active</span>
                        )}
                    </span>
                </div>
            ))}
        </div>
    );
}
