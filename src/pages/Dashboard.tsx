import { useProgression } from '../context/ProgressionContext';
import type { QuestDifficulty, Rank } from '../types';
import './Dashboard.css';

const statBarColors: Record<string, string> = {
  strength: 'var(--color-danger)',
  intelligence: 'var(--accent-primary)',
  agility: 'var(--color-success)',
  vitality: 'var(--color-warning)',
  perception: 'var(--accent-cyan)',
  endurance: 'var(--accent-secondary)',
};

function getRankColor(rank: Rank | QuestDifficulty): string {
  const map: Record<string, string> = {
    E: 'var(--rank-e)', D: 'var(--rank-d)', C: 'var(--rank-c)',
    B: 'var(--rank-b)', A: 'var(--rank-a)', S: 'var(--rank-s)',
    'E-Rank': 'var(--rank-e)', 'D-Rank': 'var(--rank-d)', 'C-Rank': 'var(--rank-c)',
    'B-Rank': 'var(--rank-b)', 'A-Rank': 'var(--rank-a)', 'S-Rank': 'var(--rank-s)',
    'National Level': 'var(--rank-national)', 'Monarch': 'var(--rank-monarch)',
  };
  return map[rank] || 'var(--accent-primary)';
}

function getStatusIcon(status: string): string {
  if (status === 'completed') return '✓';
  if (status === 'in-progress') return '◐';
  return '○';
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Dashboard() {
  const { player, quests, recentActivity } = useProgression();
  const dailyQuests = quests.filter((q) => q.isDaily);
  const xpPercent = Math.min(100, Math.round((player.xp / player.xpToNextLevel) * 100));

  const statCards = [
    {
      icon: '⚔️',
      value: player.questsCompleted,
      label: 'Quests Completed',
      color: 'var(--accent-primary)',
      bg: 'var(--accent-primary-subtle)',
    },
    {
      icon: '🌟',
      value: `${player.skillsUnlocked}/${player.totalSkills}`,
      label: 'Skills Unlocked',
      color: 'var(--accent-cyan)',
      bg: 'rgba(34, 211, 238, 0.1)',
    },
    {
      icon: '🔥',
      value: `${player.streak} days`,
      label: 'Current Streak',
      color: 'var(--color-warning)',
      bg: 'var(--color-warning-glow)',
    },
    {
      icon: '🏆',
      value: player.rank,
      label: 'Current Rank',
      color: getRankColor(player.rank),
      bg: 'rgba(96, 165, 250, 0.1)',
    },
  ];

  return (
    <div className="dashboard">
      {/* Hero Banner */}
      <section className="hero-banner animate-fadeInUp">
        <div className="hero-content">
          <div className="hero-avatar">⚔️</div>
          <div className="hero-info">
            <div className="hero-greeting">Welcome back, Hunter</div>
            <h2 className="hero-name">{player.name}</h2>
            <div className="hero-title-line">
              <span className="hero-title">{player.title}</span>
              <span
                className="hero-rank-badge"
                style={{
                  background: `${getRankColor(player.rank)}22`,
                  color: getRankColor(player.rank),
                  border: `1px solid ${getRankColor(player.rank)}44`,
                }}
              >
                {player.rank}
              </span>
              <span className="hero-title" style={{ color: 'var(--text-accent)' }}>
                Level {player.level}
              </span>
            </div>

            <div className="hero-xp">
              <div className="hero-xp-header">
                <span className="hero-xp-label">Experience Points</span>
                <span className="hero-xp-value">
                  {player.xp.toLocaleString()} / {player.xpToNextLevel.toLocaleString()} XP
                </span>
              </div>
              <div className="hero-xp-bar">
                <div className="hero-xp-fill" style={{ width: `${xpPercent}%` }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="stats-grid stagger-children">
        {statCards.map((stat, i) => (
          <div
            key={i}
            className="stat-card"
            style={{ '--stat-color': stat.color } as React.CSSProperties}
          >
            <div className="stat-icon" style={{ background: stat.bg, color: stat.color }}>
              {stat.icon}
            </div>
            <div className="stat-details">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Two-Column: Daily Quests + Activity Feed */}
      <section className="dashboard-columns">
        {/* Daily Quests */}
        <div className="panel animate-fadeInUp">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Daily Quests</h3>
              <span className="panel-subtitle">Reset in 14h 23m</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {dailyQuests.filter((q) => q.status === 'completed').length}/{dailyQuests.length} completed
            </span>
          </div>
          <div className="panel-body stagger-children">
            {dailyQuests.map((quest) => (
              <div key={quest.id} className="daily-quest">
                <div className={`daily-quest-status ${quest.status}`}>
                  {getStatusIcon(quest.status)}
                </div>
                <div className="daily-quest-info">
                  <div className="daily-quest-name">{quest.title}</div>
                  <div className="daily-quest-desc">{quest.description}</div>
                </div>
                <div className="daily-quest-reward">+{quest.xpReward} XP</div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="panel animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Recent Activity</h3>
              <span className="panel-subtitle">Your journey so far</span>
            </div>
          </div>
          <div className="panel-body">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="activity-item">
                <div className="activity-icon">{activity.icon}</div>
                <div className="activity-text">
                  <div className="activity-message">{activity.message}</div>
                  <div className="activity-time">{formatTimeAgo(activity.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Player Stats */}
      <section className="panel animate-fadeInUp" style={{ animationDelay: '0.15s' }}>
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Hunter Stats</h3>
            <span className="panel-subtitle">Your combat attributes</span>
          </div>
        </div>
        <div className="panel-body">
          <div className="stats-panel-content">
            {Object.entries(player.stats).map(([key, value]) => (
              <div key={key} className="player-stat-bar">
                <div className="player-stat-header">
                  <span className="player-stat-name">{key}</span>
                  <span className="player-stat-value">{value}/100</span>
                </div>
                <div className="player-stat-track">
                  <div
                    className="player-stat-fill"
                    style={{
                      width: `${value}%`,
                      background: statBarColors[key] || 'var(--accent-primary)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
