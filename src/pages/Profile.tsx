import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useProgression } from '../context/ProgressionContext';
import { useAuth } from '../context/AuthContext';
import { achievements as defaultAchievements } from '../data/mockData';
import type { Achievement, Rank, AchievementsResponse } from '../types';
import './Profile.css';

const statBarColors: Record<string, string> = {
  strength: 'var(--color-danger)',
  intelligence: 'var(--accent-primary)',
  agility: 'var(--color-success)',
  vitality: 'var(--color-warning)',
  perception: 'var(--accent-cyan)',
  endurance: 'var(--accent-secondary)',
};

function getRankColor(rank: Rank): string {
  const map: Record<string, string> = {
    'E-Rank': 'var(--rank-e)',
    'D-Rank': 'var(--rank-d)',
    'C-Rank': 'var(--rank-c)',
    'B-Rank': 'var(--rank-b)',
    'A-Rank': 'var(--rank-a)',
    'S-Rank': 'var(--rank-s)',
    'National Level': 'var(--rank-national)',
    'Monarch': 'var(--rank-monarch)',
  };
  return map[rank] || 'var(--rank-d)';
}

function getRarityColor(rarity: Achievement['rarity']): string {
  switch (rarity) {
    case 'common': return 'var(--rarity-common)';
    case 'rare': return 'var(--rarity-rare)';
    case 'epic': return 'var(--rarity-epic)';
    case 'legendary': return 'var(--rarity-legendary)';
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function Profile() {
  const { player } = useProgression();
  const { token, isAuthenticated } = useAuth();
  const [achievementsList, setAchievementsList] = useState<Achievement[]>(defaultAchievements);
  const [unlockedCount, setUnlockedCount] = useState<number>(
    defaultAchievements.filter((a) => a.isUnlocked).length
  );
  const [totalTitles, setTotalTitles] = useState<number>(1);
  const xpPercent = Math.min(100, Math.round((player.xp / player.xpToNextLevel) * 100));

  useEffect(() => {
    if (!token || !isAuthenticated) return;

    let isMounted = true;
    async function loadAchievements() {
      try {
        const res = await fetch('/api/achievements', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: AchievementsResponse = await res.json();
          if (isMounted) {
            if (data.achievements && data.achievements.length > 0) {
              setAchievementsList(data.achievements);
              setUnlockedCount(data.stats?.unlockedCount || data.achievements.filter((a) => a.isUnlocked).length);
            }
            if (data.titles) {
              setTotalTitles(data.titles.length);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load profile achievements:', err);
      }
    }

    void loadAchievements();
    return () => {
      isMounted = false;
    };
  }, [token, isAuthenticated]);

  return (
    <div className="profile-page">
      {/* Hero Card */}
      <section className="profile-hero animate-fadeInUp">
        <div className="profile-hero-content">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">⚔️</div>
            <span className="profile-level-badge">Lv.{player.level}</span>
          </div>

          <div className="profile-info">
            <h1 className="profile-name">{player.name}</h1>
            <div className="profile-title-rank">
              <Link
                to="/achievements"
                className="profile-title"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                title="Manage titles in Hunter Collection"
              >
                <span>⚡ {player.title}</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>✎</span>
              </Link>
              <span
                className="profile-rank-badge"
                style={{
                  background: `${getRankColor(player.rank)}22`,
                  color: getRankColor(player.rank),
                  border: `1px solid ${getRankColor(player.rank)}44`,
                }}
              >
                {player.rank}
              </span>
              {player.guild ? (
                <Link
                  to={`/guilds/${player.guild.id}`}
                  className="profile-rank-badge"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'rgba(168, 85, 247, 0.15)',
                    color: 'var(--accent-secondary, #c084fc)',
                    border: '1px solid rgba(168, 85, 247, 0.35)',
                  }}
                  title={`Guild: ${player.guild.name} (${player.guild.role})`}
                >
                  <span>{player.guild.emblem || '🛡️'}</span>
                  <span>[{player.guild.name}]</span>
                  <span style={{ fontSize: '0.72rem', opacity: 0.8, textTransform: 'capitalize' }}>
                    ({player.guild.role})
                  </span>
                </Link>
              ) : (
                <Link
                  to="/guilds"
                  className="profile-rank-badge"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  title="Discover or join a guild"
                >
                  <span>🛡️</span>
                  <span>Find Guild</span>
                </Link>
              )}
            </div>
            <div className="profile-joined">
              Joined {formatDate(player.joinedDate)}
            </div>
          </div>

          <div className="profile-stats-row">
            <div className="profile-stat-item">
              <div className="profile-stat-number">{player.questsCompleted}</div>
              <div className="profile-stat-label">Quests</div>
            </div>
            <div className="profile-stat-item">
              <div className="profile-stat-number">{player.skillsUnlocked}</div>
              <div className="profile-stat-label">Skills</div>
            </div>
            <div className="profile-stat-item">
              <div className="profile-stat-number">{player.streak}</div>
              <div className="profile-stat-label">Streak</div>
            </div>
            <div className="profile-stat-item">
              <div className="profile-stat-number">{Math.round(xpPercent)}%</div>
              <div className="profile-stat-label">To Next Lv</div>
            </div>
          </div>
        </div>
      </section>

      {/* Two-column grid */}
      <div className="profile-grid">
        {/* Combat Stats */}
        <div className="panel animate-fadeInUp">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Combat Stats</h3>
              <span className="panel-subtitle">Hunter attribute scores</span>
            </div>
          </div>
          <div className="panel-body">
            <div className="combat-stats">
              {Object.entries(player.stats).map(([key, value]) => (
                <div key={key} className="combat-stat-row">
                  <span className="combat-stat-label">{key}</span>
                  <div className="combat-stat-bar-bg">
                    <div
                      className="combat-stat-bar-fill"
                      style={{
                        width: `${value}%`,
                        background: statBarColors[key] || 'var(--accent-primary)',
                      }}
                    />
                  </div>
                  <span className="combat-stat-num">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Achievements */}
        <div className="panel animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="panel-title">Hunter Collection</h3>
              <span className="panel-subtitle">
                {unlockedCount}/{achievementsList.length} unlocked • {totalTitles} titles
              </span>
            </div>
            <Link
              to="/achievements"
              style={{
                fontSize: '0.8rem',
                color: 'var(--accent-cyan)',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              View All & Titles →
            </Link>
          </div>
          <div className="panel-body">
            <div className="achievements-grid stagger-children">
              {achievementsList.slice(0, 6).map((ach) => (
                <div
                  key={ach.id}
                  className={`achievement-card ${ach.isUnlocked ? 'unlocked' : 'locked'}`}
                >
                  <div
                    className="achievement-icon"
                    style={{
                      background: `${getRarityColor(ach.rarity)}15`,
                      border: `1px solid ${getRarityColor(ach.rarity)}30`,
                    }}
                  >
                    {ach.isUnlocked ? ach.icon : '🔒'}
                  </div>
                  <div className="achievement-info">
                    <div className="achievement-name">{ach.name}</div>
                    <div className="achievement-desc">{ach.description}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <div
                        className="achievement-rarity"
                        style={{ color: getRarityColor(ach.rarity) }}
                      >
                        {ach.rarity}
                      </div>
                      {ach.titleReward && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-warning)', fontWeight: 600 }}>
                          🏷️ {ach.titleReward}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
