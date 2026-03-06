import { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import Bracket from '../components/Bracket';
import Timer from '../components/Timer';
import Leaderboard from '../components/Leaderboard';
import './ParticipantView.css';

const SUB_ROUND_CATEGORIES = {
    1: 'Complex Puzzle',
    2: 'Math',
    3: 'General Knowledge',
};

export default function ParticipantView() {
    const { subscribe } = useWebSocket();
    const [currentBracketRound, setCurrentBracketRound] = useState(0);
    const [currentSubRound, setCurrentSubRound] = useState(0);
    const [champion, setChampion] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [battleStatus, setBattleStatus] = useState(null);

    useEffect(() => {
        const fetchState = async () => {
            try {
                const res = await fetch('/api/admin/state');
                const data = await res.json();
                setCurrentBracketRound(data.current_bracket_round || 0);
                setCurrentSubRound(data.current_sub_round || 0);
                setChampion(data.champion || null);
            } catch (e) {
                console.error(e);
            }
        };
        fetchState();

        const unsubs = [
            subscribe('sub_round_start', (data) => {
                setCurrentBracketRound(data.bracket_round);
                setBattleStatus('running');
                setStatusMessage(`⚔️ ${data.category} — ${data.total_matches} matches running...`);
            }),
            subscribe('match_scored', (data) => {
                setStatusMessage(`⚡ ${data.team1_name} (${data.team1_sub_score}) vs ${data.team2_name} (${data.team2_sub_score})`);
            }),
            subscribe('sub_round_complete', (data) => {
                setBattleStatus(null);
                setStatusMessage(`✅ Sub-round ${data.sub_round} complete! (${data.sub_rounds_completed.length}/3)`);
            }),
            subscribe('bracket_round_complete', (data) => {
                setBattleStatus(null);
                setStatusMessage(`🏁 Bracket round ${data.bracket_round} complete!`);
            }),
            subscribe('bracket_update', (data) => {
                setCurrentBracketRound(data.current_bracket_round || 0);
                if (data.auto_advanced) {
                    setStatusMessage(`🚀 Advanced to bracket round ${data.current_bracket_round}`);
                }
            }),
            subscribe('sub_round_prompt_set', (data) => {
                setCurrentSubRound(data.sub_round);
                setStatusMessage(`📝 ${data.category} question posted!`);
            }),
            subscribe('champion', (data) => {
                setChampion(data.team_name);
                setBattleStatus(null);
                setStatusMessage(`🏆 CHAMPION: ${data.team_name}!`);
            }),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [subscribe]);

    return (
        <div className="page-container participant-page">
            <h1 className="page-title">
                LLM Battle Royale
                {currentBracketRound > 0 && (
                    <span style={{ fontSize: '1rem', color: 'var(--accent-purple)', marginLeft: '1rem' }}>
                        Bracket Round {currentBracketRound}
                        {currentSubRound > 0 && ` · SR${currentSubRound}: ${SUB_ROUND_CATEGORIES[currentSubRound]}`}
                    </span>
                )}
            </h1>
            <p className="page-subtitle">64 teams. 1v1 bracket. 3 sub-rounds per match. One champion.</p>

            {statusMessage && (
                <div className={`participant-status ${battleStatus ? 'active' : 'done'}`}>
                    {statusMessage}
                    {battleStatus && <span className="status-dot"></span>}
                </div>
            )}

            {champion && (
                <div className="card card-glow animate-in" style={{ textAlign: 'center', padding: '2rem', marginBottom: '2rem' }}>
                    <div style={{ fontSize: '4rem' }}>🏆</div>
                    <h2 style={{ fontSize: '2rem', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {typeof champion === 'string' ? champion : 'Champion Crowned!'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)' }}>The LLM Battle Royale is over!</p>
                </div>
            )}

            <div className="top-section">
                <div>
                    <Timer />
                </div>
                <div>
                    <div className="card" style={{ height: '100%' }}>
                        <h3 className="section-title" style={{ fontSize: '1.1rem' }}>Leaderboard</h3>
                        <Leaderboard />
                    </div>
                </div>
            </div>

            <div className="bracket-section">
                <div className="card">
                    <h3 className="section-title" style={{ fontSize: '1.1rem' }}>Tournament Bracket</h3>
                    <Bracket />
                </div>
            </div>
        </div>
    );
}
