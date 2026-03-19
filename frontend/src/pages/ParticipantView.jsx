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
    const [transitionMessage, setTransitionMessage] = useState('');
    const [showTransition, setShowTransition] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState('');

    useEffect(() => {
        const fetchState = async () => {
            try {
                const res = await fetch('/api/state');
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
                if (data.sub_round < 3) {
                    setTransitionMessage(`Sub-Round ${data.sub_round} Complete! Preparing Next Round...`);
                    setShowTransition(true);
                    setTimeout(() => setShowTransition(false), 5000);
                }
            }),
            subscribe('bracket_round_complete', (data) => {
                setBattleStatus(null);
                setStatusMessage(`🏁 Bracket round ${data.bracket_round} complete!`);
            }),
            subscribe('bracket_update', (data) => {
                setCurrentBracketRound(data.current_bracket_round || 0);
                if (data.auto_advanced) {
                    setStatusMessage(`🚀 Advanced to bracket round ${data.current_bracket_round}`);
                    setTransitionMessage(`Bracket Round Complete! Proceeding to Round ${data.current_bracket_round}...`);
                    setShowTransition(true);
                    setTimeout(() => setShowTransition(false), 7000);
                }
            }),
            subscribe('sub_round_prompt_set', (data) => {
                setCurrentSubRound(data.sub_round);
                setCurrentPrompt(data.prompt);
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

            {currentPrompt && !champion && (
                <div className="card animate-in" style={{ marginBottom: '2rem', border: '2px solid var(--accent-purple)', background: 'rgba(157, 0, 255, 0.05)', padding: '2rem', boxShadow: '0 0 30px rgba(157, 0, 255, 0.15)' }}>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--accent-purple)', marginTop: 0, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Current Challenge
                    </h3>
                    <div style={{ fontSize: '1.5rem', lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                        {currentPrompt}
                    </div>
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

            {showTransition && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(10, 10, 15, 0.95)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <div style={{
                        width: '60px', height: '60px', borderRadius: '50%',
                        border: '4px solid rgba(0, 255, 255, 0.2)',
                        borderTopColor: 'var(--accent-cyan)',
                        animation: 'spin 1s linear infinite',
                        marginBottom: '2rem'
                    }} />
                    <h2 style={{ color: 'var(--accent-cyan)', fontSize: '2.5rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '2px', textAlign: 'center' }}>
                        {transitionMessage}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', animation: 'pulse 2s infinite' }}>
                        Get ready for the next challenge!
                    </p>
                    <style dangerouslySetInnerHTML={{__html: `
                        @keyframes spin { to { transform: rotate(360deg); } }
                        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
                    `}} />
                </div>
            )}
        </div>
    );
}
