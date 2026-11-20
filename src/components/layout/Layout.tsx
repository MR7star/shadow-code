import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Award, Castle, Flame, Medal, Menu, Network, ScrollText, Shield, Sparkles, Swords, Trophy, UserRound, X, Zap, type LucideIcon } from 'lucide-react';
import { useProgression } from '../../context/ProgressionContext';
import { useAuth } from '../../context/AuthContext';
import './Layout.css';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  section: string;
  badge?: number;
}

const baseNavItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: Swords, section: 'main' },
  { path: '/quests', label: 'Quest Board', icon: ScrollText, section: 'main' },
  { path: '/dungeons', label: 'Dungeons', icon: Castle, section: 'main' },
  { path: '/guilds', label: 'Guilds', icon: Shield, section: 'main' },
  { path: '/seasons', label: 'Seasons', icon: Sparkles, section: 'main' },
  { path: '/arena', label: 'Ranked Arena', icon: Swords, section: 'main' },
  { path: '/tournaments', label: 'Tournaments', icon: Trophy, section: 'main' },
  { path: '/skills', label: 'Skill Tree', icon: Network, section: 'main' },
  { path: '/promotion', label: 'Promotion Trials', icon: Medal, section: 'main' },
  { path: '/achievements', label: 'Achievements', icon: Award, section: 'player' },
  { path: '/profile', label: 'Profile', icon: UserRound, section: 'player' },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy, section: 'player' },
];

const pageTitles: Record<string, string> = {
  '/': 'Hunter Dashboard',
  '/quests': 'Quest Board',
  '/dungeons': 'Programming Dungeons',
  '/guilds': 'Guilds & Hunter Alliances',
  '/seasons': 'Seasonal Events',
  '/arena': 'Ranked Coding Arena',
  '/tournaments': 'Coding Tournaments',
  '/skills': 'Skill Tree',
  '/promotion': 'Rank Promotion Trials',
  '/achievements': 'Hunter Achievements & Titles',
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
  const pageTitle = pageTitles[location.pathname] || (
    location.pathname.startsWith('/arena') ? 'Ranked Coding Arena' :
    location.pathname.startsWith('/tournaments') ? 'Coding Tournaments' :
    'Shadow Code'
  );

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
      <aside id="primary-sidebar" className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon"><Zap size={21} strokeWidth={1.8} style={{ color: 'var(--accent-cyan)' }} aria-hidden="true" /></div>
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
              <span className="nav-link-icon"><item.icon size={18} strokeWidth={1.8} aria-hidden="true" /></span>
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
              <span className="nav-link-icon"><item.icon size={18} strokeWidth={1.8} aria-hidden="true" /></span>
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
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={sidebarOpen}
            aria-controls="primary-sidebar"
          >
            <Menu size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <span className="topbar-title">{pageTitle}</span>
        </div>

        <div className="topbar-right">
          <div className="topbar-stat">
            <span className="topbar-stat-icon"><Flame size={16} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="topbar-stat-value">{player.streak}</span>
            <span>day streak</span>
          </div>

          <div className="topbar-stat">
            <span className="topbar-stat-icon"><Zap size={16} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="topbar-stat-value">Lv.{player.level}</span>
          </div>

          <div className="topbar-xp-mini">
            <div className="topbar-xp-bar">
              <div className="topbar-xp-fill" style={{ width: `${xpPercent}%` }} />
            </div>
            <span className="topbar-xp-text">
              <Zap size={13} strokeWidth={1.8} aria-hidden="true" />{' '}
              {player.xp}/{player.xpToNextLevel}
            </span>
          </div>

          {isAuthenticated ? (
            <button type="button" className="topbar-auth-btn" onClick={() => void logout()}>
              <UserRound size={15} strokeWidth={1.8} aria-hidden="true" />
              Sign Out
            </button>
          ) : (
            <button type="button" className="topbar-auth-btn primary" onClick={openAuthModal}>
              <UserRound size={15} strokeWidth={1.8} aria-hidden="true" />
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
              <div className="level-up-toast-icon"><Zap size={20} strokeWidth={1.8} style={{ color: 'var(--accent-cyan)' }} aria-hidden="true" /></div>
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
                <X size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        
        <Outlet />
      </main>
    </div>
  );
}
