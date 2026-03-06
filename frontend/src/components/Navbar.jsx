import { NavLink } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import './Navbar.css';

export default function Navbar() {
    const { isConnected } = useWebSocket();

    return (
        <nav className="navbar">
            <NavLink to="/" className="navbar-brand">
                <span className="navbar-logo">inferenceX</span>
                <span className="navbar-tag">Battle Royale</span>
            </NavLink>

            <div className="navbar-links">
                <NavLink to="/" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`} end>
                    Live
                </NavLink>
                <NavLink to="/register" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
                    Register
                </NavLink>
                <NavLink to="/submit" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
                    Team Status
                </NavLink>
                <NavLink to="/admin" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
                    Admin
                </NavLink>
                <div className={`ws-indicator ${isConnected ? 'connected' : 'disconnected'}`}
                    title={isConnected ? 'Connected' : 'Reconnecting...'} />
            </div>
        </nav>
    );
}
