import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProgressionProvider } from './context/ProgressionContext';
import AuthModal from './components/auth/AuthModal';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import QuestBoard from './pages/QuestBoard';
import SkillTree from './pages/SkillTree';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import QuestSolver from './pages/QuestSolver';

function App() {
  return (
    <AuthProvider>
      <ProgressionProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/quests" element={<QuestBoard />} />
              <Route path="/quest/:questId" element={<QuestSolver />} />
              <Route path="/challenge/:questId" element={<QuestSolver />} />
              <Route path="/skills" element={<SkillTree />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
            </Route>
          </Routes>
          <AuthModal />
        </BrowserRouter>
      </ProgressionProvider>
    </AuthProvider>
  );
}

export default App;
