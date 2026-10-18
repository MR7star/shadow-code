import { useProgression } from '../context/ProgressionContext';
import { achievements } from '../data/mockData';
import type { Achievement, Rank } from '../types';
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
  const xpPercent = Math.min(100, Math.round((player.xp / player.xpToNextLevel) * 100));

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
              <span className="profile-title">{player.title}</span>
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
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Achievements</h3>
              <span className="panel-subtitle">
                {achievements.filter((a) => a.isUnlocked).length}/{achievements.length} unlocked
              </span>
            </div>
          </div>
          <div className="panel-body">
            <div className="achievements-grid stagger-children">
              {achievements.map((ach) => (
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
                    <div
                      className="achievement-rarity"
                      style={{ color: getRarityColor(ach.rarity) }}
                    >
                      {ach.rarity}
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
