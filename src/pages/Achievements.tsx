import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProgression } from '../context/ProgressionContext';
import type {
  Achievement,
  AchievementCategory,
  AchievementCategorySummary,
  AchievementRarity,
  AchievementStats,
  UserTitle,
  AchievementsResponse,
} from '../types';
import './Achievements.css';

const CATEGORIES: { id: AchievementCategory; name: string; icon: string }[] = [
  { id: 'all', name: 'All Achievements', icon: '✨' },
  { id: 'programming', name: 'Programming', icon: '💻' },
  { id: 'progression', name: 'Progression', icon: '⚡' },
  { id: 'exploration', name: 'Exploration', icon: '🏰' },
  { id: 'consistency', name: 'Consistency', icon: '🔥' },
  { id: 'mastery', name: 'Mastery', icon: '🌟' },
];

function getRarityColor(rarity?: AchievementRarity): string {
  switch (rarity) {
    case 'common': return 'var(--rarity-common)';
    case 'rare': return 'var(--rarity-rare)';
    case 'epic': return 'var(--rarity-epic)';
    case 'legendary': return 'var(--rarity-legendary)';
    default: return 'var(--rarity-common)';
  }
}

export default function Achievements() {
  const { token, isAuthenticated } = useAuth();
  const { refreshProgress } = useProgression();

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [categories, setCategories] = useState<AchievementCategorySummary[]>([]);
  const [stats, setStats] = useState<AchievementStats>({
    total: 20,
    unlockedCount: 0,
    completionPercent: 0,
    totalXpEarned: 0,
    titlesUnlockedCount: 1,
  });
  const [titles, setTitles] = useState<UserTitle[]>([]);
  const [equippedTitle, setEquippedTitle] = useState<string>('Novice Hunter');
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'in-progress' | 'locked'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [equippingTitle, setEquippingTitle] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Fetch achievements & titles from server
  const fetchAchievements = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/achievements', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data: AchievementsResponse = await res.json();
        setAchievements(data.achievements || []);
        setCategories(data.categories || []);
        if (data.stats) setStats(data.stats);
        if (data.titles) setTitles(data.titles);
        if (data.equippedTitle) setEquippedTitle(data.equippedTitle);
      }
    } catch (err) {
      console.warn('Failed to load achievements from backend:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchAchievements();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, fetchAchievements]);

  // Handle title equipping
  const handleEquipTitle = async (title: string) => {
    if (!token || equippingTitle) return;

    try {
      setEquippingTitle(title);
      const res = await fetch('/api/titles/equip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEquippedTitle(title);
        setTitles((prev) =>
          prev.map((t) => ({
            ...t,
            isEquipped: t.title === title,
          }))
        );
        setFeedbackMessage(`Equipped title: "${title}"`);
        void refreshProgress();
      } else {
        setFeedbackMessage(data.error || 'Failed to equip title');
      }
    } catch {
      setFeedbackMessage('Failed to equip title');
    } finally {
      setEquippingTitle(null);
      setTimeout(() => setFeedbackMessage(null), 3500);
    }
  };

  // Handle title unequipping
  const handleUnequipTitle = async () => {
    if (!token || equippingTitle) return;

    try {
      setEquippingTitle('unequip');
      const res = await fetch('/api/titles/unequip', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEquippedTitle('Novice Hunter');
        setTitles((prev) =>
          prev.map((t) => ({
            ...t,
            isEquipped: t.title === 'Novice Hunter',
          }))
        );
        setFeedbackMessage('Title unequipped (reset to Novice Hunter)');
        void refreshProgress();
      }
    } catch {
      setFeedbackMessage('Failed to unequip title');
    } finally {
      setEquippingTitle(null);
      setTimeout(() => setFeedbackMessage(null), 3500);
    }
  };

  // Handle explicit claim
  const handleClaimAchievement = async (achievementId: string) => {
    if (!token) return;

    try {
      const res = await fetch(`/api/achievements/${achievementId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedbackMessage(`Reward claimed! +${data.xpAwarded} XP`);
        void fetchAchievements();
        void refreshProgress();
      } else {
        setFeedbackMessage(data.error || 'Could not claim reward');
      }
    } catch {
      setFeedbackMessage('Failed to claim reward');
    } finally {
      setTimeout(() => setFeedbackMessage(null), 3500);
    }
  };

  // Filter achievements
  const filteredAchievements = achievements.filter((ach) => {
    // Category match
    if (selectedCategory !== 'all' && ach.category !== selectedCategory) {
      return false;
    }
    // Status match
    if (statusFilter === 'unlocked' && !ach.isUnlocked) return false;
    if (statusFilter === 'locked' && (ach.isUnlocked || (ach.progress || 0) > 0)) return false;
    if (statusFilter === 'in-progress' && (ach.isUnlocked || (ach.progress || 0) === 0)) return false;
    return true;
  });

  return (
    <div className="achievements-page">
      {/* Toast feedback */}
      {feedbackMessage && (
        <div className="level-up-toast animate-fadeInUp" role="status" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 100 }}>
          <div className="level-up-toast-content">
            <div className="level-up-toast-icon">⚡</div>
            <div className="level-up-toast-text">
              <div className="level-up-toast-title">Hunter Collection</div>
              <div className="level-up-toast-message">{feedbackMessage}</div>
            </div>
          </div>
        </div>
      )}

      {/* Hero Overview */}
      <section className="achievements-hero animate-fadeInUp">
        <div className="achievements-hero-content">
          <div className="achievements-hero-top">
            <div className="achievements-hero-title-wrap">
              <div className="achievements-hero-icon">🎖️</div>
              <div>
                <h1 className="achievements-hero-title">Hunter Collection</h1>
                <div className="achievements-hero-subtitle">
                  Server-verified achievements, badges, and unlockable titles
                </div>
              </div>
            </div>

            <div className="achievements-hero-stats">
              <div className="achievements-hero-stat-card">
                <div className="achievements-hero-stat-value">
                  {stats.unlockedCount} / {stats.total}
                </div>
                <div className="achievements-hero-stat-label">Achievements</div>
              </div>
              <div className="achievements-hero-stat-card">
                <div className="achievements-hero-stat-value" style={{ color: 'var(--accent-primary)' }}>
                  +{stats.totalXpEarned}
                </div>
                <div className="achievements-hero-stat-label">Total XP Earned</div>
              </div>
              <div className="achievements-hero-stat-card">
                <div className="achievements-hero-stat-value" style={{ color: 'var(--color-warning)' }}>
                  {titles.length || stats.titlesUnlockedCount}
                </div>
                <div className="achievements-hero-stat-label">Titles Unlocked</div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="achievements-overall-progress">
            <div className="achievements-progress-header">
              <span className="achievements-progress-label">Total Mastery Progress</span>
              <span className="achievements-progress-pct">{stats.completionPercent}% Complete</span>
            </div>
            <div className="achievements-progress-track">
              <div
                className="achievements-progress-fill"
                style={{ width: `${stats.completionPercent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Hunter Titles Section */}
      <section className="titles-section animate-fadeInUp">
        <div className="titles-header">
          <div className="titles-title-wrap">
            <span style={{ fontSize: '1.4rem' }}>🏷️</span>
            <h2 className="titles-title">Hunter Titles</h2>
            <span className="titles-badge-count">{titles.length} Owned</span>
          </div>

          <div className="equipped-title-banner">
            <span className="equipped-title-label">Equipped Title:</span>
            <span className="equipped-title-badge">
              ⚡ {equippedTitle}
            </span>
            {equippedTitle !== 'Novice Hunter' && (
              <button
                type="button"
                className="title-equip-btn"
                onClick={handleUnequipTitle}
                disabled={equippingTitle !== null}
                style={{ marginLeft: '6px' }}
              >
                Reset Title
              </button>
            )}
          </div>
        </div>

        {titles.length === 0 ? (
          <div className="achievements-empty">
            No titles unlocked yet. Complete quests and achievements to earn titles!
          </div>
        ) : (
          <div className="titles-grid stagger-children">
            {titles.map((t) => {
              const isEquipped = t.title === equippedTitle;
              return (
                <div
                  key={t.id}
                  className={`title-card ${isEquipped ? 'is-equipped' : ''}`}
                >
                  <div className="title-card-info">
                    <div className="title-card-name">{t.title}</div>
                    <div className="title-card-source">
                      <span>Source:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{t.source}</span>
                    </div>
                  </div>

                  {isEquipped ? (
                    <button type="button" className="title-equip-btn active" disabled>
                      ✓ Equipped
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="title-equip-btn"
                      onClick={() => handleEquipTitle(t.title)}
                      disabled={equippingTitle !== null}
                    >
                      {equippingTitle === t.title ? 'Equipping…' : 'Equip'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="achievements-filters animate-fadeInUp">
        <div className="category-tabs">
          {CATEGORIES.map((cat) => {
            const catSummary = categories.find((c) => c.id === cat.id);
            const countLabel =
              cat.id === 'all'
                ? `${stats.unlockedCount}/${stats.total}`
                : catSummary
                ? `${catSummary.unlocked}/${catSummary.total}`
                : '';

            return (
              <button
                key={cat.id}
                type="button"
                className={`category-tab-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
                {countLabel && <span className="category-tab-badge">{countLabel}</span>}
              </button>
            );
          })}
        </div>

        <div className="status-filters">
          <button
            type="button"
            className={`status-filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({achievements.length})
          </button>
          <button
            type="button"
            className={`status-filter-btn ${statusFilter === 'unlocked' ? 'active' : ''}`}
            onClick={() => setStatusFilter('unlocked')}
          >
            ✓ Unlocked ({achievements.filter((a) => a.isUnlocked).length})
          </button>
          <button
            type="button"
            className={`status-filter-btn ${statusFilter === 'in-progress' ? 'active' : ''}`}
            onClick={() => setStatusFilter('in-progress')}
          >
            ⏳ In Progress ({achievements.filter((a) => !a.isUnlocked && (a.progress || 0) > 0).length})
          </button>
          <button
            type="button"
            className={`status-filter-btn ${statusFilter === 'locked' ? 'active' : ''}`}
            onClick={() => setStatusFilter('locked')}
          >
            🔒 Locked ({achievements.filter((a) => !a.isUnlocked && (a.progress || 0) === 0).length})
          </button>
        </div>
      </section>

      {/* Achievements Grid */}
      <section className="achievements-grid stagger-children">
        {loading ? (
          <div className="achievements-empty">Loading hunter achievements…</div>
        ) : filteredAchievements.length === 0 ? (
          <div className="achievements-empty">No achievements match your filters.</div>
        ) : (
          filteredAchievements.map((ach) => {
            const rarity = ach.rarity || 'common';
            const rarityColor = getRarityColor(rarity);
            const isUnlocked = !!ach.isUnlocked;
            const progress = ach.progress || 0;
            const target = ach.target || 1;
            const pct = isUnlocked ? 100 : ach.progressPercent || Math.min(100, Math.round((progress / target) * 100));

            return (
              <div
                key={ach.id}
                className={`achievement-card rarity-${rarity} ${
                  isUnlocked ? 'is-unlocked' : progress > 0 ? 'is-in-progress' : 'is-locked'
                }`}
              >
                <div className="achievement-header">
                  <div
                    className="achievement-icon-wrap"
                    style={{
                      background: `${rarityColor}15`,
                      borderColor: `${rarityColor}35`,
                    }}
                  >
                    {isUnlocked ? ach.icon : '🔒'}
                  </div>

                  <div className="achievement-title-area">
                    <div className="achievement-name">{ach.name}</div>
                    <div className="achievement-badges-row">
                      <span
                        className="achievement-rarity-badge"
                        style={{
                          background: `${rarityColor}22`,
                          color: rarityColor,
                          border: `1px solid ${rarityColor}44`,
                        }}
                      >
                        {rarity}
                      </span>
                      {ach.category && (
                        <span className="achievement-category-badge">
                          • {ach.category}
                        </span>
                      )}
                    </div>
                  </div>

                  <span
                    className={`achievement-status-badge ${
                      isUnlocked ? 'unlocked' : progress > 0 ? 'in-progress' : 'locked'
                    }`}
                  >
                    {isUnlocked ? 'Unlocked' : progress > 0 ? `${pct}%` : 'Locked'}
                  </span>
                </div>

                <div className="achievement-desc">{ach.description}</div>

                {/* Progress bar */}
                <div className="achievement-card-progress">
                  <div className="achievement-card-progress-labels">
                    <span>{ach.remainingRequirement || (isUnlocked ? 'Completed' : 'Locked')}</span>
                    <span>
                      {progress} / {target}
                    </span>
                  </div>
                  <div className="achievement-card-track">
                    <div
                      className="achievement-card-fill"
                      style={{
                        width: `${pct}%`,
                        background: isUnlocked
                          ? 'var(--color-success)'
                          : 'linear-gradient(90deg, var(--accent-primary), var(--accent-cyan))',
                      }}
                    />
                  </div>
                </div>

                {/* Rewards preview */}
                <div className="achievement-rewards">
                  {(ach.xpReward || 0) > 0 && (
                    <span className="reward-tag xp">
                      ⭐ +{ach.xpReward} XP
                    </span>
                  )}
                  {ach.titleReward && (
                    <span className="reward-tag title">
                      🏷️ Title: "{ach.titleReward}"
                    </span>
                  )}

                  {!isUnlocked && progress >= target && (
                    <button
                      type="button"
                      className="achievement-claim-btn"
                      onClick={() => handleClaimAchievement(ach.id)}
                    >
                      Claim Reward
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

