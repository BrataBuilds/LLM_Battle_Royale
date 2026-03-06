import { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import './Bracket.css';

const ROUND_NAMES = {
    1: 'Round of 64',
    2: 'Round of 32',
    3: 'Sweet 16',
    4: 'Quarter-Finals',
    5: 'Semi-Finals',
    6: 'Final',
};

export default function Bracket() {
    const { subscribe } = useWebSocket();
    const [matches, setMatches] = useState([]);
    const [currentBracketRound, setCurrentBracketRound] = useState(0);
    const [champion, setChampion] = useState(null);

    const fetchBracket = async () => {
        try {
            const res = await fetch('/api/bracket');
            const data = await res.json();
            setMatches(data.matches || []);
            setCurrentBracketRound(data.current_bracket_round || 0);
            setChampion(data.champion || null);
        } catch (e) {
            console.error('Failed to fetch bracket:', e);
        }
    };

    useEffect(() => {
        fetchBracket();
        const unsubs = [
            subscribe('bracket_update', () => fetchBracket()),
            subscribe('match_scored', () => fetchBracket()),
            subscribe('bracket_round_complete', () => fetchBracket()),
            subscribe('champion', (data) => setChampion(data.team_id)),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [subscribe]);

    // Group matches by round
    const rounds = {};
    matches.forEach((m) => {
        if (!rounds[m.round_number]) rounds[m.round_number] = [];
        rounds[m.round_number].push(m);
    });

    const sortedRoundNums = Object.keys(rounds).map(Number).sort((a, b) => a - b);

    if (sortedRoundNums.length === 0) {
        return <div className="no-bracket-msg">Bracket not generated yet. Waiting for admin to seed teams and generate the bracket.</div>;
    }

    return (
        <div className="bracket-wrapper">
            <div className="bracket">
                {sortedRoundNums.map((roundNum) => (
                    <div className="bracket-round" key={roundNum}>
                        <div className={`round-header ${roundNum === currentBracketRound ? 'active-round' : ''}`}>
                            {ROUND_NAMES[roundNum] || `Round ${roundNum}`}
                        </div>
                        {rounds[roundNum]
                            .sort((a, b) => a.match_index - b.match_index)
                            .map((match) => (
                                <BracketMatchCard key={match.id} match={match} isActive={roundNum === currentBracketRound} />
                            ))}
                    </div>
                ))}
                {champion && (
                    <div className="bracket-champion">
                        <div className="champion-trophy">🏆</div>
                        <div className="champion-name">
                            {matches.find(m => m.winner_id === champion)?.winner_name || 'Champion'}
                        </div>
                        <div className="champion-label">Champion</div>
                    </div>
                )}
            </div>
        </div>
    );
}

function BracketMatchCard({ match, isActive }) {
    const hasResult = match.winner_id !== null;
    const isBye = !(match.team1_id && match.team2_id);

    return (
        <div className={`bracket-match-card ${isActive ? 'active-match' : ''} ${hasResult ? 'completed' : ''} ${isBye ? 'bye' : ''}`}>
            <TeamRow
                name={match.team1_name}
                seed={match.team1_seed}
                score={match.team1_total}
                isWinner={match.winner_id === match.team1_id}
                isLoser={hasResult && match.winner_id !== match.team1_id}
            />
            <TeamRow
                name={match.team2_name}
                seed={match.team2_seed}
                score={match.team2_total}
                isWinner={match.winner_id === match.team2_id}
                isLoser={hasResult && match.winner_id !== match.team2_id}
            />
        </div>
    );
}

function TeamRow({ name, seed, score, isWinner, isLoser }) {
    return (
        <div className={`bracket-team ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''}`}>
            <span className={`bracket-team-name ${!name ? 'tbd' : ''}`}>
                {seed ? `#${seed} ` : ''}{name || 'BYE'}
            </span>
            {score != null && score > 0 && (
                <span className={`bracket-team-score ${isWinner ? 'high' : 'low'}`}>
                    {score}
                </span>
            )}
        </div>
    );
}
