import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WebSocketProvider } from './contexts/WebSocketContext';
import Navbar from './components/Navbar';
import ParticipantView from './pages/ParticipantView';
import Registration from './pages/Registration';
import Submission from './pages/Submission';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <WebSocketProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<ParticipantView />} />
          <Route path="/register" element={<Registration />} />
          <Route path="/submit" element={<Submission />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </WebSocketProvider>
    </BrowserRouter>
  );
}
