import { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import './Timer.css';

export default function Timer() {
    const { subscribe } = useWebSocket();
    const [remaining, setRemaining] = useState(null);
    const [total, setTotal] = useState(300);
    const [active, setActive] = useState(false);

    useEffect(() => {
        const unsub1 = subscribe('timer_start', (data) => {
            setTotal(data.timer_seconds);
            setRemaining(data.timer_seconds);
            setActive(true);
        });
        const unsub2 = subscribe('timer_tick', (data) => {
            setRemaining(data.remaining);
        });
        const unsub3 = subscribe('timer_end', () => {
            setActive(false);
        });
        return () => { unsub1(); unsub2(); unsub3(); };
    }, [subscribe]);

    const minutes = Math.floor((remaining ?? 0) / 60);
    const seconds = (remaining ?? 0) % 60;
    const pct = total > 0 ? ((remaining ?? 0) / total) * 100 : 0;

    let timerClass = '';
    if (remaining === null || !active) timerClass = 'ended';
    else if (remaining <= 30) timerClass = 'critical';
    else if (remaining <= 60) timerClass = 'warning';

    return (
        <div className="timer-container card">
            <div className="timer-label">
                {active ? `Round Timer` : remaining === null ? 'Waiting for round' : 'Time\'s up!'}
            </div>
            <div className={`timer-display ${timerClass}`}>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
            <div className="timer-bar-wrapper">
                <div className={`timer-bar ${timerClass}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
