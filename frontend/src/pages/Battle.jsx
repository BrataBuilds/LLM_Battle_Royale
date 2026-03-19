import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import Timer from '../components/Timer';

const SUB_ROUND_CATEGORIES = {
    1: 'Complex Puzzle',
    2: 'Math',
    3: 'General Knowledge',
};

export default function Battle() {
    const { subscribe } = useWebSocket();
    const location = useLocation();
    const navigate = useNavigate();
    const [team] = useState(location.state?.team || null);
    const [appData, setAppData] = useState(null);
    const [matchUpdates, setMatchUpdates] = useState({});
    const [transitionMessage, setTransitionMessage] = useState('');
    const [showTransition, setShowTransition] = useState(false);

    useEffect(() => {
        if (!team) {
            navigate('/submit');
            return;
        }

        const fetchTeamData = async () => {
            try {
                const stateRes = await fetch('/api/state');
                setAppData(await stateRes.json());
            } catch (e) { console.error(e); }
        };
        fetchTeamData();

        const unsubs = [
            subscribe('match_scored', fetchTeamData),
            subscribe('bracket_round_complete', fetchTeamData),
            subscribe('bracket_update', (data) => {
                const d = data.data || data;
                fetchTeamData();
                if (d.auto_advanced) {
                    setTransitionMessage(`Bracket Round Complete! Proceeding to Round ${d.current_bracket_round}...`);
                    setShowTransition(true);
                    setTimeout(() => setShowTransition(false), 7000);
                }
            }),
            subscribe('match_result', fetchTeamData),
            subscribe('match_update', (data) => {
                const d = data.data || data;
                if (d.team1_id === team.id || d.team2_id === team.id) {
                    setMatchUpdates(prev => ({
                        ...prev,
                        [`${d.match_id}_${d.sub_round}`]: d,
                    }));
                    if (d.sub_round < 3) {
                        setTransitionMessage(`Sub-Round ${d.sub_round} Complete! Preparing Next Round...`);
                        setShowTransition(true);
                        setTimeout(() => setShowTransition(false), 5000);
                    }
                }
            }),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [subscribe, team, navigate]);

    useEffect(() => {
        if (!appData || !team) return;
        const matches = (appData.matches || []).filter(m => m.team1_id === team.id || m.team2_id === team.id);
        const am = matches.find(m => !m.completed);
        if (!am) return;

        const history = {};
        const matchSubs = (appData.submissions || []).filter(s => s.match_id === am.id);
        
        [1, 2, 3].forEach(sr => {
            const srSubs = matchSubs.filter(s => s.sub_round === sr);
            if (srSubs.length > 0) {
                const sub1 = srSubs.find(s => s.team_id === am.team1_id);
                const sub2 = srSubs.find(s => s.team_id === am.team2_id);
                
                history[`${am.id}_${sr}`] = {
                    match_id: am.id,
                    sub_round: sr,
                    sub_round_label: SUB_ROUND_CATEGORIES[sr],
                    prompt: sub1?.prompt || sub2?.prompt || '',
                    team1_id: am.team1_id,
                    team2_id: am.team2_id,
                    team1_name: am.team1_name,
                    team2_name: am.team2_name,
                    team1_response: sub1?.response_text,
                    team2_response: sub2?.response_text,
                    team1_score: sub1?.score,
                    team2_score: sub2?.score,
                    team1_total: am.team1_total,
                    team2_total: am.team2_total,
                    reasoning: sub1?.reasoning || sub2?.reasoning || '',
                };
            }
        });
        
        setMatchUpdates(prev => ({ ...history, ...prev }));
    }, [appData, team]);

    if (!team) return null;

    const matches = (appData?.matches || []).filter(m => m.team1_id === team.id || m.team2_id === team.id);
    const activeMatch = matches.find(m => !m.completed);
    
    // If no active match is found, maybe they won/lost or it hasn't started
    if (appData && !activeMatch) {
        return (
            <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
                <h2 style={{ color: 'var(--text-muted)' }}>No Active Battle</h2>
                <p style={{ marginBottom: '2rem' }}>You are not currently in an active match.</p>
                <button className="btn btn-secondary" onClick={() => navigate('/submit', { state: { team, fromBattle: true } })}>
                    ⬅ Back to Dashboard
                </button>
            </div>
        );
    }

    const liveUpdates = activeMatch
        ? [1, 2, 3].map(sr => matchUpdates[`${activeMatch.id}_${sr}`]).filter(Boolean)
        : [];

    const personalize = (update) => {
        const isTeam1 = update.team1_id === team.id;
        return {
            yourResponse: isTeam1 ? update.team1_response : update.team2_response,
            opponentResponse: isTeam1 ? update.team2_response : update.team1_response,
            yourScore: isTeam1 ? update.team1_score : update.team2_score,
            opponentScore: isTeam1 ? update.team2_score : update.team1_score,
            yourTotal: isTeam1 ? update.team1_total : update.team2_total,
            opponentTotal: isTeam1 ? update.team2_total : update.team1_total,
            opponentName: isTeam1 ? update.team2_name : update.team1_name,
        };
    };

    return (
        <div className="page-container" style={{ maxWidth: '1200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/submit', { state: { team, fromBattle: true } })}>
                    ⬅ Dashboard
                </button>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TEAM</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>{team.name}</div>
                </div>
            </div>

            <Timer />

            {activeMatch && (
                <div className="card animate-in" style={{ marginTop: '2rem', padding: '2rem', border: '1px solid var(--accent-cyan)', background: 'rgba(0,255,255,0.03)', boxShadow: '0 0 30px rgba(0,255,136,0.1)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h1 style={{ fontSize: '2.5rem', color: 'var(--accent-cyan)', margin: 0, textTransform: 'uppercase', letterSpacing: '2px' }}>
                            ⚔️ LIVE BATTLE
                        </h1>
                        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                            vs <strong style={{ color: 'var(--accent-red)' }}>{activeMatch.team1_id === team.id ? activeMatch.team2_name : activeMatch.team1_name}</strong>
                        </p>
                        <span className="badge badge-cyan" style={{ fontSize: '1rem' }}>R{activeMatch.round_number} M{activeMatch.match_index + 1}</span>
                    </div>

                    {liveUpdates.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Waiting for the first sub-round to start...
                        </div>
                    )}

                    {liveUpdates.map((update, idx) => {
                        const p = personalize(update);
                        return (
                            <div key={idx} style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: idx < liveUpdates.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent-purple)' }}>
                                        SR{update.sub_round}: {update.sub_round_label}
                                    </span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.5rem', background: 'var(--bg-card)', padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                        <span style={{ color: 'var(--accent-green)' }}>{p.yourScore}</span>
                                        <span style={{ color: 'var(--text-muted)', margin: '0 0.5rem' }}>-</span>
                                        <span style={{ color: 'var(--accent-red)' }}>{p.opponentScore}</span>
                                    </span>
                                </div>

                                <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: '4px solid var(--accent-purple)' }}>
                                    📝 <strong>Prompt:</strong> {update.prompt}
                                </div>

                                {update.reasoning && (
                                    <div style={{ fontSize: '0.9rem', color: 'var(--accent-cyan)', marginBottom: '1.5rem', padding: '0.8rem 1rem', background: 'rgba(0, 255, 255, 0.05)', borderRadius: '6px', borderLeft: '3px solid var(--accent-cyan)' }}>
                                        ⚖️ <strong>Judge Reasoning:</strong> {update.reasoning}
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    {/* Your Response */}
                                    <div style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid rgba(0,255,136,0.2)', backgroundColor: 'rgba(0,255,136,0.1)', fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-green)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                            🛡️ Your Response
                                        </div>
                                        <div style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, flex: 1, whiteSpace: 'pre-wrap' }}>
                                            {p.yourResponse || '(no response)'}
                                        </div>
                                    </div>

                                    {/* Opponent Response */}
                                    <div style={{ background: 'rgba(255,68,68,0.05)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid rgba(255,68,68,0.2)', backgroundColor: 'rgba(255,68,68,0.1)', fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                            🗡️ Opponent Response
                                        </div>
                                        <div style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, flex: 1, whiteSpace: 'pre-wrap' }}>
                                            {p.opponentResponse || '(no response)'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Running total */}
                    {liveUpdates.length > 0 && (() => {
                        const lastUpdate = liveUpdates[liveUpdates.length - 1];
                        const p = personalize(lastUpdate);
                        return (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1.5rem', borderTop: '2px dashed rgba(0,255,136,0.3)' }}>
                                <span style={{ fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Current Total</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: '2.5rem' }}>
                                    <span style={{ color: 'var(--accent-green)' }}>{p.yourTotal}</span>
                                    <span style={{ color: 'var(--text-muted)', margin: '0 1rem', fontSize: '1.5rem' }}>-</span>
                                    <span style={{ color: 'var(--accent-red)' }}>{p.opponentTotal}</span>
                                </span>
                            </div>
                        );
                    })()}
                </div>
            )}

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
