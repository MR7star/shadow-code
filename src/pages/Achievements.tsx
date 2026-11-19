import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProgression } from '../context/ProgressionContext';
import {
  Award, Brain, Castle, Check, Clock3, Code2, Crown, DoorOpen, Flame, Gift,
  KeyRound, LockKeyhole, Medal, Orbit, ScrollText, Shield, Skull, Sparkles,
  Star, Sword, Swords, Tags, Trophy, WandSparkles, Zap,
  type LucideIcon,
} from 'lucide-react';
import type {
  Achievement,
  AchievementCategory,
  AchievementStats,
  AchievementRarity,
  UserTitle,
  AchievementsResponse,
} from '../types';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import './Achievements.css';

const CATEGORIES: { id: AchievementCategory; name: string; icon: LucideIcon }[] = [
  { id: 'all', name: 'All Achievements', icon: Sparkles },
  { id: 'programming', name: 'Programming', icon: Code2 },
  { id: 'progression', name: 'Progression', icon: Zap },
  { id: 'exploration', name: 'Exploration', icon: Castle },
  { id: 'consistency', name: 'Consistency', icon: Flame },
  { id: 'mastery', name: 'Mastery', icon: Star },
];

const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  ach_first_spell: WandSparkles,
  ach_code_weaver: ScrollText,
  ach_tenacious_coder: Zap,
  ach_concept_master: Brain,
  ach_omni_caster: Orbit,
  ach_level_5: Sparkles,
  ach_level_10: Shield,
  ach_rank_d: Sword,
  ach_rank_c: Swords,
  ach_gate_explorer: DoorOpen,
  ach_first_boss: Skull,
  ach_awakening_gate: Castle,
  ach_dungeon_master: Crown,
  ach_streak_3: Flame,
  ach_streak_7: Zap,
  ach_daily_bounty: Gift,
  ach_first_skill: Sparkles,
  ach_skill_collector: KeyRound,
  ach_promotion_trial: Trophy,
  ach_grandmaster: Crown,
  ach_tourn_contender: Swords,
  ach_tourn_champion: Trophy,
};

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
  const [titles, setTitles] = useState<UserTitle[]>([]);
  const [apiStats, setApiStats] = useState<AchievementStats | null>(null);
  const [equippedTitle, setEquippedTitle] = useState<string>('Novice Hunter');
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'in-progress' | 'locked'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [requestState, setRequestState] = useState<'loading' | 'success' | 'error'>('loading');
  const [requestError, setRequestError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const [equippingTitle, setEquippingTitle] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const achievementStats = useMemo(() => {
    const total = achievements.length;
    const unlocked = achievements.filter((achievement) => achievement.isUnlocked).length;
    const locked = total - unlocked;
    const completionPercent = total === 0 ? 0 : Math.round((unlocked / total) * 100);
    const categories = CATEGORIES.filter(({ id }) => id !== 'all').map(({ id }) => {
      const records = achievements.filter((achievement) => achievement.category === id);
      const categoryUnlocked = records.filter((achievement) => achievement.isUnlocked).length;
      return { id, total: records.length, unlocked: categoryUnlocked };
    });
    return { total, unlocked, locked, completionPercent, categories };
  }, [achievements]);

  // Fetch achievements & titles from server
  const fetchAchievements = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!token) {
      setLoading(false);
      setRequestState('error');
      setRequestError('Sign in to load achievements.');
      return;
    }

    try {
      setLoading(true);
      setRequestState('loading');
      setRequestError(null);
      const res = await fetch('/api/achievements', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Could not load achievements (${res.status}).`);
      }

      const data: AchievementsResponse = await res.json();
      if (!Array.isArray(data.achievements)) {
        throw new Error('The achievement response was invalid. Please try again.');
      }
      if (version !== requestVersion.current) return;
      setAchievements(data.achievements);
      setApiStats(data.stats ?? null);
      if (data.titles) setTitles(data.titles);
      if (data.equippedTitle) setEquippedTitle(data.equippedTitle);
      setRequestState('success');
    } catch (err) {
      if (version !== requestVersion.current) return;
      setRequestState('error');
      setRequestError(err instanceof Error ? err.message : 'Could not load achievements. Please try again.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchAchievements();
    } else {
      if (!token) {
        setLoading(false);
        setRequestState('error');
        setRequestError('Sign in to load achievements.');
      }
    }
    return () => { requestVersion.current += 1; };
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
            <div className="level-up-toast-icon"><Zap aria-hidden="true" /></div>
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
              <div className="achievements-hero-icon"><Medal aria-hidden="true" /></div>
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
                  {requestState === 'success' ? `${achievementStats.unlocked} / ${achievementStats.total}` : '—'}
                </div>
                <div className="achievements-hero-stat-label">Achievements</div>
              </div>
              <div className="achievements-hero-stat-card">
                <div className="achievements-hero-stat-value" style={{ color: 'var(--accent-primary)' }}>
                  {requestState === 'success' ? `+${apiStats?.totalXpEarned ?? '—'}` : '—'}
                </div>
                <div className="achievements-hero-stat-label">Total XP Earned</div>
              </div>
              <div className="achievements-hero-stat-card">
                <div className="achievements-hero-stat-value" style={{ color: 'var(--color-warning)' }}>
                  {requestState === 'success' ? titles.length : '—'}
                </div>
                <div className="achievements-hero-stat-label">Titles Unlocked</div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="achievements-overall-progress">
            <div className="achievements-progress-header">
              <span className="achievements-progress-label">Total Mastery Progress</span>
              <span className="achievements-progress-pct">{requestState === 'success' ? `${achievementStats.completionPercent}% Complete` : '—'}</span>
            </div>
            <div className="achievements-progress-track">
              <div
                className="achievements-progress-fill"
                style={{ width: `${requestState === 'success' ? achievementStats.completionPercent : 0}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Hunter Titles Section */}
      <section className="titles-section animate-fadeInUp">
        <div className="titles-header">
          <div className="titles-title-wrap">
            <Tags size={22} aria-hidden="true" />
            <h2 className="titles-title">Hunter Titles</h2>
            <span className="titles-badge-count">{requestState === 'success' ? titles.length : '—'} Owned</span>
          </div>

          <div className="equipped-title-banner">
            <span className="equipped-title-label">Equipped Title:</span>
            <span className="equipped-title-badge">
              <Zap size={16} aria-hidden="true" /> {equippedTitle}
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

        {requestState !== 'success' ? null : titles.length === 0 ? (
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
                      <Check size={14} aria-hidden="true" /> Equipped
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
            const catSummary = achievementStats.categories.find((category) => category.id === cat.id);
            const countLabel =
              requestState !== 'success'
                ? '—'
                : cat.id === 'all'
                ? `${achievementStats.unlocked}/${achievementStats.total}`
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
                <cat.icon size={18} strokeWidth={1.8} aria-hidden="true" />
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
            All ({requestState === 'success' ? achievementStats.total : '—'})
          </button>
          <button
            type="button"
            className={`status-filter-btn ${statusFilter === 'unlocked' ? 'active' : ''}`}
            onClick={() => setStatusFilter('unlocked')}
          >
            <Check size={14} aria-hidden="true" /> Unlocked ({requestState === 'success' ? achievementStats.unlocked : '—'})
          </button>
          <button
            type="button"
            className={`status-filter-btn ${statusFilter === 'in-progress' ? 'active' : ''}`}
            onClick={() => setStatusFilter('in-progress')}
          >
            <Clock3 size={14} aria-hidden="true" /> In Progress ({requestState === 'success' ? achievements.filter((a) => !a.isUnlocked && (a.progress || 0) > 0).length : '—'})
          </button>
          <button
            type="button"
            className={`status-filter-btn ${statusFilter === 'locked' ? 'active' : ''}`}
            onClick={() => setStatusFilter('locked')}
          >
            <LockKeyhole size={14} aria-hidden="true" /> Locked ({requestState === 'success' ? achievementStats.locked : '—'})
          </button>
        </div>
      </section>

      {/* Achievements Grid */}
      <section className="achievements-grid stagger-children">
        {loading || requestState === 'loading' ? (
          <LoadingState label="Loading hunter achievements" lines={3} />
        ) : requestState === 'error' ? (
          <ErrorState message={requestError || 'Could not load achievements.'} onRetry={() => void fetchAchievements()} retryLabel="Retry" />
        ) : achievements.length === 0 ? (
          <EmptyState title="No achievements yet" description="There are no achievements available right now." />
        ) : filteredAchievements.length === 0 ? (
          <EmptyState title="No matching achievements" description="No achievements match the selected category and status filters." />
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
                    {isUnlocked ? (() => { const Icon = ACHIEVEMENT_ICONS[ach.id] ?? Award; return <Icon size={23} strokeWidth={1.8} aria-hidden="true" />; })() : <LockKeyhole size={21} strokeWidth={1.8} aria-hidden="true" />}
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
                      <Star size={13} aria-hidden="true" /> +{ach.xpReward} XP
                    </span>
                  )}
                  {ach.titleReward && (
                    <span className="reward-tag title">
                      <Tags size={13} aria-hidden="true" /> Title: "{ach.titleReward}"
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

