import { useProgression } from '../context/ProgressionContext';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
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

function getMissionTypeIcon(type: string): string {
  switch (type) {
    case 'main_challenge': return '⚔️';
    case 'practice_challenge': return '🎯';
    case 'concept_mastery': return '📚';
    default: return '📋';
  }
}

function getChestIcon(status: string): string {
  switch (status) {
    case 'locked': return '🔒';
    case 'available': return '🎁';
    case 'claimed': return '✅';
    default: return '🔒';
  }
}

function getMissionTypeLabel(type: string): string {
  switch (type) {
    case 'main_challenge': return 'Main Challenge';
    case 'practice_challenge': return 'Practice Challenge';
    case 'concept_mastery': return 'Concept Mastery';
    default: return 'Mission';
  }
}

function formatTimeToReset(): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  const diff = tomorrow.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
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
  const { 
    player, 
    recentActivity, 
    dailyQuestData, 
    refreshDailyQuests,
    claimDailyChest 
  } = useProgression();
  const { isAuthenticated } = useAuth();
  const [timeToReset, setTimeToReset] = useState(formatTimeToReset());
  const [claimingChest, setClaimingChest] = useState(false);

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

  // Sync daily quest data from backend on mount and when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      void refreshDailyQuests();
    }
  }, [isAuthenticated, refreshDailyQuests]);

  // Update time to reset every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeToReset(formatTimeToReset());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleClaimChest = async () => {
    if (!dailyQuestData || dailyQuestData.chest.status !== 'available' || claimingChest) return;
    
    setClaimingChest(true);
    const result = await claimDailyChest();
    if (result.success) {
      // Success - state will be updated via context
    }
    setClaimingChest(false);
  };

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

      {/* Daily Quests Section */}
      <section className="panel animate-fadeInUp">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Daily Quests</h3>
            <span className="panel-subtitle">
              {dailyQuestData ? (
                <>
                  <span className="streak-badge">🔥 {dailyQuestData.streak.current_streak} day streak</span>
                  <span className="reset-timer">Resets in {timeToReset}</span>
                </>
              ) : (
                'Loading...'
              )}
            </span>
          </div>
          {dailyQuestData && (
            <div className="chest-container" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div 
                className={`reward-chest ${dailyQuestData.chest.status}`}
                onClick={handleClaimChest}
                style={{ 
                  cursor: dailyQuestData.chest.status === 'available' && !claimingChest ? 'pointer' : 'default',
                  opacity: claimingChest ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                }}
                title={
                  dailyQuestData.chest.status === 'locked' 
                    ? 'Complete all daily missions to unlock'
                    : dailyQuestData.chest.status === 'available' 
                      ? `Claim ${dailyQuestData.chest.total_xp_reward} XP`
                      : 'Already claimed'
                }
              >
                <span className="chest-icon" style={{ fontSize: '1.5rem' }}>
                  {getChestIcon(dailyQuestData.chest.status)}
                </span>
                <span className="chest-xp">+{dailyQuestData.chest.total_xp_reward} XP</span>
              </div>
              {claimingChest && <span className="claiming-spinner">⏳</span>}
            </div>
          )}
        </div>
        <div className="panel-body stagger-children">
          {dailyQuestData && dailyQuestData.quests.length > 0 ? (
            dailyQuestData.quests.map((quest) => (
              <div key={quest.id} className={`daily-quest ${quest.status}`}>
                <div className="daily-quest-icon" style={{ background: `var(--${getMissionTypeColor(quest.mission_type)}-subtle)` }}>
                  {getMissionTypeIcon(quest.mission_type)}
                </div>
                <div className="daily-quest-info">
                  <div className="daily-quest-header">
                    <span className="daily-quest-type">{getMissionTypeLabel(quest.mission_type)}</span>
                    <span className="daily-quest-name">{quest.title}</span>
                  </div>
                  <div className="daily-quest-desc">{quest.description}</div>
                  <div className="daily-quest-progress">
                    <div className="daily-quest-progress-bar">
                      <div 
                        className="daily-quest-progress-fill" 
                        style={{ width: `${Math.min(100, Math.round((quest.progress / quest.target_progress) * 100))}%` }}
                      />
                    </div>
                    <span className="daily-quest-progress-text">
                      {quest.progress}/{quest.target_progress}
                    </span>
                  </div>
                </div>
                <div className="daily-quest-reward">
                  <span className="daily-quest-xp">+{quest.xp_reward} XP</span>
                  <span className={`daily-quest-status-icon ${quest.status}`}>
                    {quest.status === 'completed' ? '✓' : quest.status === 'claimed' ? '✅' : '○'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="daily-quests-empty">
              <div className="empty-icon">📜</div>
              <p className="empty-text">
                {isAuthenticated 
                  ? 'No daily quests available. Check back tomorrow!' 
                  : 'Sign in to view your daily quests and earn rewards.'}
              </p>
              {isAuthenticated && dailyQuestData && (
                <button 
                  className="refresh-daily-btn" 
                  onClick={() => void refreshDailyQuests()}
                  disabled={!isAuthenticated}
                >
                  🔄 Refresh
                </button>
              )}
            </div>
          )}
        </div>

        {/* Streak Info */}
        {dailyQuestData && (
          <div className="streak-info">
            <div className="streak-stat">
              <span className="streak-label">Current Streak</span>
              <span className="streak-value">🔥 {dailyQuestData.streak.current_streak} days</span>
            </div>
            <div className="streak-stat">
              <span className="streak-label">Longest Streak</span>
              <span className="streak-value">🏆 {dailyQuestData.streak.longest_streak} days</span>
            </div>
            {dailyQuestData.streak.last_activity_date && (
              <div className="streak-stat">
                <span className="streak-label">Last Activity</span>
                <span className="streak-value">{dailyQuestData.streak.last_activity_date}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Two-Column: Activity Feed + Additional Info */}
      <section className="dashboard-columns">
        {/* Activity Feed */}
        <div className="panel animate-fadeInUp">
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
            {recentActivity.length === 0 && (
              <div className="activity-empty">
                <span>📭</span>
                <p>No recent activity. Complete a quest to start your journey!</p>
              </div>
            )}
          </div>
        </div>

        {/* Player Stats */}
        <div className="panel animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
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
        </div>
      </section>
    </div>
  );
}

function getMissionTypeColor(type: string): string {
  switch (type) {
    case 'main_challenge': return 'accent-primary';
    case 'practice_challenge': return 'accent-secondary';
    case 'concept_mastery': return 'accent-cyan';
    default: return 'accent-primary';
  }
}
