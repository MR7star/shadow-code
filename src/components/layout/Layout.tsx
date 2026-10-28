import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useProgression } from '../../context/ProgressionContext';
import { useAuth } from '../../context/AuthContext';
import './Layout.css';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  section: string;
  badge?: number;
}

const baseNavItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '⚔️', section: 'main' },
  { path: '/quests', label: 'Quest Board', icon: '📜', section: 'main' },
  { path: '/dungeons', label: 'Dungeons', icon: '🏰', section: 'main' },
  { path: '/skills', label: 'Skill Tree', icon: '🌟', section: 'main' },
  { path: '/promotion', label: 'Promotion Trials', icon: '🏆', section: 'main' },
  { path: '/profile', label: 'Profile', icon: '👤', section: 'player' },
  { path: '/leaderboard', label: 'Leaderboard', icon: '🏆', section: 'player' },
];

const pageTitles: Record<string, string> = {
  '/': 'Hunter Dashboard',
  '/quests': 'Quest Board',
  '/dungeons': 'Programming Dungeons',
  '/skills': 'Skill Tree',
  '/promotion': 'Rank Promotion Trials',
  '/profile': 'Player Profile',
  '/leaderboard': 'Leaderboard',
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLevelUpToast, setShowLevelUpToast] = useState(false);
  const location = useLocation();
  const { player, quests, isSyncing, lastLevelUp } = useProgression();
  const { user, isAuthenticated, isLoading, openAuthModal, logout } = useAuth();
  const xpPercent = Math.min(100, Math.round((player.xp / player.xpToNextLevel) * 100));
  const pageTitle = pageTitles[location.pathname] || 'Shadow Code';

  // Show level-up toast when lastLevelUp changes
  useEffect(() => {
    if (lastLevelUp && Date.now() - lastLevelUp.timestamp < 5000) {
      setShowLevelUpToast(true);
      const timer = setTimeout(() => {
        setShowLevelUpToast(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastLevelUp]);

  const availableOrActiveCount = quests.filter((q) => !q.isDaily && (q.status === 'available' || q.status === 'in-progress')).length;

  const navItems = baseNavItems.map((item) => {
    if (item.path === '/quests') {
      return { ...item, badge: availableOrActiveCount };
    }
    return item;
  });

  const mainNavItems = navItems.filter((n) => n.section === 'main');
  const playerNavItems = navItems.filter((n) => n.section === 'player');

  return (
    <div className="layout">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">⚡</div>
            <div className="sidebar-logo-text">
              <h1>Shadow Code</h1>
              <span>Level Up Your Code</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main</div>
          {mainNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-link-icon">{item.icon}</span>
              {item.label}
              {item.badge && <span className="nav-link-badge">{item.badge}</span>}
            </NavLink>
          ))}

          <div className="nav-section-label">Player</div>
          {playerNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-link-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-player">
          <NavLink
            to="/profile"
            className="sidebar-player-card"
            onClick={() => setSidebarOpen(false)}
            style={{ textDecoration: 'none' }}
          >
            <div className="sidebar-player-avatar">
              {(isAuthenticated ? user?.username || player.name : player.name).charAt(0)}
            </div>
            <div className="sidebar-player-info">
              <div className="sidebar-player-name">
                {isAuthenticated ? user?.username || player.name : player.name}
              </div>
              <div className="sidebar-player-rank">
                {isAuthenticated
                  ? `${player.rank} • Lv. ${player.level}`
                  : 'Preview hunter — sign in to save'}
              </div>
            </div>
          </NavLink>
          {isAuthenticated ? (
            <button type="button" className="sidebar-auth-btn" onClick={() => void logout()}>
              Sign Out
            </button>
          ) : (
            <button type="button" className="sidebar-auth-btn primary" onClick={openAuthModal}>
              Sign In / Register
            </button>
          )}
        </div>
      </aside>

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-left">
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <span className="topbar-title">{pageTitle}</span>
        </div>

        <div className="topbar-right">
          <div className="topbar-stat">
            <span className="topbar-stat-icon">🔥</span>
            <span className="topbar-stat-value">{player.streak}</span>
            <span>day streak</span>
          </div>

          <div className="topbar-stat">
            <span className="topbar-stat-icon">⭐</span>
            <span className="topbar-stat-value">Lv.{player.level}</span>
          </div>

          <div className="topbar-xp-mini">
            <div className="topbar-xp-bar">
              <div className="topbar-xp-fill" style={{ width: `${xpPercent}%` }} />
            </div>
            <span className="topbar-xp-text">
              {player.xp}/{player.xpToNextLevel}
            </span>
          </div>

          {isAuthenticated ? (
            <button type="button" className="topbar-auth-btn" onClick={() => void logout()}>
              Sign Out
            </button>
          ) : (
            <button type="button" className="topbar-auth-btn primary" onClick={openAuthModal}>
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="content">
        {(isLoading || isSyncing) && (
          <div className="session-loading-banner" role="status">
            {isLoading ? 'Restoring hunter session…' : 'Syncing progression…'}
          </div>
        )}
        
        {/* Level-Up Toast Notification */}
        {showLevelUpToast && lastLevelUp && (
          <div className="level-up-toast" role="alert" aria-live="polite">
            <div className="level-up-toast-content">
              <div className="level-up-toast-icon">⚡</div>
              <div className="level-up-toast-text">
                <div className="level-up-toast-title">レベルアップ！LEVEL UP!</div>
                <div className="level-up-toast-message">
                  Hunter Level {lastLevelUp.level} • {lastLevelUp.rank}
                </div>
              </div>
              <button
                type="button"
                className="level-up-toast-close"
                onClick={() => setShowLevelUpToast(false)}
                aria-label="Close notification"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        
        <Outlet />
      </main>
    </div>
  );
}
