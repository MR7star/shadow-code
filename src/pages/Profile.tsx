import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Activity, ArrowRight, Award, Brain, CalendarDays, Clock3, Dumbbell, Eye, Flame, Heart, Home, LockKeyhole, Shield, Trophy, Zap, X } from 'lucide-react';
import { useProgression } from '../context/ProgressionContext';
import { useAuth } from '../context/AuthContext';
import { achievements as defaultAchievements } from '../data/mockData';
import type { Achievement, ActivityEntry, Rank, AchievementsResponse, UserTitle } from '../types';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import { AppIcon } from '../components/ui/AppIcon';
import './Profile.css';

const statBarColors: Record<string, string> = {
  strength: 'var(--color-danger)',
  intelligence: 'var(--accent-primary)',
  agility: 'var(--color-success)',
  vitality: 'var(--color-warning)',
  perception: 'var(--accent-cyan)',
  endurance: 'var(--accent-secondary)',
};

const attributeIcons = {
  strength: Dumbbell,
  intelligence: Brain,
  agility: Zap,
  vitality: Heart,
  perception: Eye,
  endurance: Shield,
} as const;

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

function BadgePopover({ achievement, anchor, close, keepOpen, scheduleClose }: {
  achievement: Achievement;
  anchor: HTMLElement;
  close: () => void;
  keepOpen: () => void;
  scheduleClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const updatePosition = useCallback(() => {
    const popup = popupRef.current;
    if (!popup || !anchor.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    const margin = 12;
    const gap = 10;
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - bounds.height - gap;
    const top = belowTop + bounds.height <= window.innerHeight - margin
      ? belowTop
      : Math.max(margin, aboveTop);
    const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - bounds.width / 2, window.innerWidth - bounds.width - margin));
    setPosition({ position: 'fixed', top, left, visibility: 'visible' });
  }, [anchor]);
  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const observer = typeof ResizeObserver !== 'undefined' && popupRef.current
      ? new ResizeObserver(updatePosition) : null;
    if (observer && popupRef.current) observer.observe(popupRef.current);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      observer?.disconnect();
    };
  }, [updatePosition]);
  return createPortal(
    <div ref={popupRef} className="collection-badge-popover collection-badge-popover-portal" role="dialog" aria-modal="false" aria-labelledby="profile-badge-popover-title" style={position}
      onPointerEnter={keepOpen} onPointerLeave={scheduleClose}>
      <strong id="profile-badge-popover-title">{achievement.name}</strong>
      <p>{achievement.description}</p>
      <span className="collection-detail-rarity" style={{ color: `var(--rarity-${achievement.rarity})` }}>{achievement.rarity}</span>
      <span className={`collection-detail-status${achievement.isUnlocked ? ' unlocked' : ''}`}>{achievement.isUnlocked ? 'Unlocked' : 'Locked'}</span>
      {achievement.isUnlocked && achievement.unlockedAt && Number.isFinite(Date.parse(achievement.unlockedAt)) && <p className="collection-detail-date">Unlocked {formatDate(achievement.unlockedAt)}</p>}
      {!achievement.isUnlocked && achievement.remainingRequirement && <p className="collection-detail-requirement">Requirement: {achievement.remainingRequirement}</p>}
      {achievement.titleReward && <p className="collection-detail-reward">Title reward: {achievement.titleReward}</p>}
      <button type="button" className="collection-popover-close" aria-label="Close badge details" onClick={close}><X size={15} strokeWidth={1.8} aria-hidden="true" /></button>
    </div>, document.body,
  );
}

export default function Profile() {
  const { player, recentActivity, skillStates } = useProgression();
  const { token, isAuthenticated } = useAuth();
  const [achievementsList, setAchievementsList] = useState<Achievement[]>(defaultAchievements);
  const [earnedTitles, setEarnedTitles] = useState<UserTitle[]>([]);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [collectionStatus, setCollectionStatus] = useState<'loading' | 'success' | 'error'>(isAuthenticated ? 'loading' : 'success');
  const [collectionError, setCollectionError] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [selectedAchievementId, setSelectedAchievementId] = useState<string | null>(null);
  const [hoveredAchievementId, setHoveredAchievementId] = useState<string | null>(null);
  const [dismissedAchievementId, setDismissedAchievementId] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const openBadgeId = selectedAchievementId ?? hoveredAchievementId;
  const openAchievement = achievementsList.find((achievement) => achievement.id === openBadgeId) ?? null;
  const keepPopoverOpen = () => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); };
  const dismissPopover = () => { setSelectedAchievementId(null); setHoveredAchievementId(null); setPopoverAnchor(null); };
  const schedulePopoverClose = () => {
    keepPopoverOpen();
    closeTimer.current = window.setTimeout(() => { setHoveredAchievementId(null); setPopoverAnchor(null); }, 180);
  };
  const requestVersion = useRef(0);
  const unlockedCount = achievementsList.filter((achievement) => achievement.isUnlocked).length;
  const completionPercent = achievementsList.length ? Math.round((unlockedCount / achievementsList.length) * 100) : 0;
  const visibleAchievements = achievementsList.filter((achievement) => collectionFilter === 'all'
    || (collectionFilter === 'unlocked' ? achievement.isUnlocked : !achievement.isUnlocked));
  const xpPercent = Math.min(100, Math.round((player.xp / player.xpToNextLevel) * 100));
  const masteredSkills = skillStates.filter((skill) => skill.state === 'mastered').length;
  const progressionMilestones = useMemo(() => recentActivity
    .filter((event) => ['level-up', 'skill', 'streak'].includes(event.type) && Number.isFinite(Date.parse(event.timestamp)))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 3), [recentActivity]);
  const profileActivity = useMemo(() => {
    const activityItems = recentActivity
      .filter((activity) => Number.isFinite(Date.parse(activity.timestamp)))
      .map((activity: ActivityEntry) => ({
        id: activity.id,
        icon: activity.icon,
        title: activity.type === 'level-up' ? 'Level up' : activity.type === 'quest' ? 'Quest activity' : activity.type === 'achievement' ? 'Achievement unlocked' : activity.type === 'skill' ? 'Skill progression' : 'Streak activity',
        description: activity.message,
        category: activity.type,
        date: activity.timestamp,
      }));
    if (activityItems.length > 0) {
      return activityItems.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 4);
    }
    if (collectionStatus !== 'success') return [];
    return achievementsList
      .filter((achievement) => achievement.isUnlocked && achievement.unlockedAt && Number.isFinite(Date.parse(achievement.unlockedAt)))
      .sort((a, b) => Date.parse(b.unlockedAt!) - Date.parse(a.unlockedAt!))
      .slice(0, 4)
      .map((achievement) => ({
        id: `achievement-${achievement.id}`,
        icon: achievement.icon,
        title: 'Achievement unlocked',
        description: achievement.name,
        category: achievement.rarity,
        rarity: achievement.rarity,
        date: achievement.unlockedAt!,
      }));
  }, [recentActivity, achievementsList, collectionStatus]);

  const [activeSection, setActiveSection] = useState('profile-overview');
  useEffect(() => {
    const sections = ['profile-overview', 'profile-attributes', 'profile-trophies', 'profile-activity']
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (!('IntersectionObserver' in window) || sections.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, 0.15, 0.4, 0.7] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const loadAchievements = useCallback(async () => {
    if (!isAuthenticated) return;
    if (!token) {
      setCollectionError('Sign in to load your Hunter Collection.');
      setCollectionStatus('error');
      return;
    }
    const version = ++requestVersion.current;
    setCollectionStatus('loading');
    setCollectionError('');
    try {
      const res = await fetch('/api/achievements', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Could not load achievements (${res.status}).`);
      const data: AchievementsResponse = await res.json();
      if (!Array.isArray(data.achievements) || !Array.isArray(data.titles)) {
        throw new Error('The collection response was invalid. Please try again.');
      }
      if (version !== requestVersion.current) return;
      setAchievementsList(data.achievements);
      setEarnedTitles(data.titles);
      setCollectionStatus('success');
    } catch (error) {
      if (version !== requestVersion.current) return;
      setCollectionError(error instanceof Error ? error.message : 'Could not load achievements. Please try again.');
      setCollectionStatus('error');
    }
  }, [token, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      requestVersion.current += 1;
      setAchievementsList(defaultAchievements);
      setEarnedTitles([]);
      setCollectionStatus('success');
      return;
    }
    void loadAchievements();
    return () => { requestVersion.current += 1; };
  }, [isAuthenticated, loadAchievements]);

  useEffect(() => {
    if (!selectedAchievementId && !hoveredAchievementId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissPopover();
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverAnchor?.contains(target) || document.querySelector('.collection-badge-popover-portal')?.contains(target)) return;
      dismissPopover();
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerdown', closeOutside);
    return () => { window.removeEventListener('keydown', closeOnEscape); window.removeEventListener('pointerdown', closeOutside); };
  }, [selectedAchievementId, hoveredAchievementId, popoverAnchor]);

  useEffect(() => {
    if (openBadgeId && (!openAchievement || !visibleAchievements.some((item) => item.id === openBadgeId) || !popoverAnchor?.isConnected)) dismissPopover();
  }, [openBadgeId, openAchievement, visibleAchievements, popoverAnchor]);

  useEffect(() => setAvatarFailed(false), [player.avatar]);

  return (
    <div className="profile-page">
      {/* Hunter Status Hero */}
      <section id="profile-overview" className="hunter-status-hero animate-fadeInUp" aria-labelledby="profile-name">
        <div className="hunter-status-top">
          <div className="hunter-identity">
            <div className="profile-avatar-wrap">
              {player.avatar && !avatarFailed ? (
                <img className="profile-avatar profile-avatar-image" src={player.avatar} alt="" onError={() => setAvatarFailed(true)} />
              ) : (
                <div className="profile-avatar profile-rank-emblem" aria-hidden="true" style={{ '--rank-color': getRankColor(player.rank) } as CSSProperties}>
                  <Shield size={42} strokeWidth={1.6} />
                </div>
              )}
            </div>

            <div className="profile-info">
              <span className="hunter-status-kicker">HUNTER IDENTITY</span>
              <h1 id="profile-name" className="profile-name">{player.name}</h1>
              <div className="profile-title-rank">
                <Link to="/achievements" className="profile-title" title="Manage titles in Hunter Collection">
                  <Zap size={15} aria-hidden="true" /> {player.title}
                </Link>
                {player.guild ? (
                  <Link to={`/guilds/${player.guild.id}`} className="profile-guild-action" title={`Guild: ${player.guild.name} (${player.guild.role})`}>
                    <AppIcon glyph={player.guild.emblem} fallback="shield" size={14} />
                    <span>{player.guild.name}</span>
                  </Link>
                ) : (
                  <Link to="/guilds" className="profile-guild-action find-guild-action"><Shield size={14} aria-hidden="true" /> Find Guild</Link>
                )}
              </div>
              <div className="profile-joined"><CalendarDays size={14} aria-hidden="true" /> Joined {formatDate(player.joinedDate)}</div>
            </div>
          </div>

          <div className="profile-rank-crest" style={{ '--rank-color': getRankColor(player.rank) } as CSSProperties} aria-label={`Current rank: ${player.rank}`}>
            <span className="profile-rank-crest-shield"><Shield size={56} strokeWidth={1.2} aria-hidden="true" /></span>
            <strong>{player.rank}</strong>
          </div>

          <div className="profile-level-progress">
            <div className="profile-level-heading"><span>Hunter Level</span><strong>Lv. {player.level}</strong></div>
            <div className="profile-xp-labels"><span>XP Progress</span><strong>{player.xp.toLocaleString()} / {player.xpToNextLevel.toLocaleString()} XP</strong></div>
            <div className="profile-xp-track" role="progressbar" aria-label="XP progress to next level" aria-valuemin={0} aria-valuemax={player.xpToNextLevel} aria-valuenow={Math.min(player.xp, player.xpToNextLevel)}><span style={{ width: `${xpPercent}%` }} /></div>
            <div className="profile-xp-next">{xpPercent}% to Level {player.level + 1}</div>
          </div>
        </div>

        <div className="profile-stats-row" aria-label="Hunter progression summary">
          <div className="profile-stat-item"><span className="profile-stat-icon"><Activity size={19} aria-hidden="true" /></span><span className="profile-stat-number">{player.questsCompleted}</span><span className="profile-stat-label">Quests completed</span></div>
          <div className="profile-stat-item"><span className="profile-stat-icon"><Award size={19} aria-hidden="true" /></span><span className="profile-stat-number">{masteredSkills}</span><span className="profile-stat-label">Skills mastered</span></div>
          <div className="profile-stat-item"><span className="profile-stat-icon"><Flame size={19} aria-hidden="true" /></span><span className="profile-stat-number">{player.streak} days</span><span className="profile-stat-label">Current streak</span></div>
          <div className="profile-stat-item"><span className="profile-stat-icon"><Zap size={19} aria-hidden="true" /></span><span className="profile-stat-number">{xpPercent}%</span><span className="profile-stat-label">To next level</span></div>
        </div>
      </section>

      <nav className="profile-section-nav" aria-label="Profile sections">
        {([
          ['profile-overview', 'Overview', Home],
          ['profile-attributes', 'Attributes', Activity],
          ['profile-trophies', 'Trophies', Trophy],
          ['profile-activity', 'Activity', Clock3],
        ] as const).map(([id, label, Icon]) => (
          <a key={id} href={`#${id}`} className={activeSection === id ? 'active' : undefined}
            aria-current={activeSection === id ? 'location' : undefined}
            onClick={(event) => {
              event.preventDefault();
              setActiveSection(id);
              window.history.replaceState(null, '', `#${id}`);
              document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            }}><Icon size={17} aria-hidden="true" /><span>{label}</span></a>
        ))}
      </nav>

      {/* Two-column grid */}
      <div className="profile-grid">
        {/* Combat Stats */}
        <section id="profile-attributes" className="panel animate-fadeInUp" aria-labelledby="combat-stats-title">
          <div className="panel-header">
            <div>
              <h3 id="combat-stats-title" className="panel-title">Combat Attributes</h3>
              <span className="panel-subtitle">Hunter attribute scores</span>
            </div>
          </div>
          <div className="panel-body">
            <div className="combat-stats">
              {Object.entries(player.stats).map(([key, value]) => (
                <article key={key} className="combat-stat-card" style={{ '--stat-color': statBarColors[key] || 'var(--accent-primary)' } as CSSProperties}>
                  <div className="combat-stat-card-heading">
                    <span className="combat-stat-identity"><span className="combat-stat-icon" aria-hidden="true">{(() => { const Icon = attributeIcons[key as keyof typeof attributeIcons]; return Icon ? <Icon size={16} /> : null; })()}</span><span className="combat-stat-label">{key}</span></span>
                    <strong className="combat-stat-num">{value}</strong>
                  </div>
                  <div className="combat-stat-bar-bg" role="progressbar" aria-label={`${key} attribute`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
                    <div className="combat-stat-bar-fill" style={{ width: `${value}%` }} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Hunter Collection */}
        <section id="profile-trophies" className="panel hunter-collection-panel animate-fadeInUp" style={{ animationDelay: '0.1s' }} aria-labelledby="hunter-collection-title">
          <div className="panel-header hunter-collection-header">
            <div>
              <h3 id="hunter-collection-title" className="panel-title">Trophy Room</h3>
              <span className="panel-subtitle">
                {collectionStatus === 'success'
                  ? `${unlockedCount}/${achievementsList.length} unlocked · ${completionPercent}% complete${isAuthenticated ? ` · ${earnedTitles.length} titles` : ''}`
                  : 'Server-verified achievement badges'}
              </span>
            </div>
            <Link to="/achievements" className="collection-view-all">View All &amp; Titles <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="panel-body hunter-collection-body">
            {collectionStatus === 'success' && (
              <div className="collection-summary-progress">
                <div className="collection-progress-labels">
                  <span>Collection completion</span>
                  <strong>{completionPercent}%</strong>
                </div>
                <div
                  className="collection-progress-track"
                  role="progressbar"
                  aria-label="Hunter Collection completion"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={completionPercent}
                >
                  <span style={{ width: `${completionPercent}%` }} />
                </div>
              </div>
            )}

            {collectionStatus === 'success' && (
              <div className="collection-filters" role="group" aria-label="Filter achievement badges">
                {(['all', 'unlocked', 'locked'] as const).map((filter) => {
                  const count = filter === 'all' ? achievementsList.length
                    : achievementsList.filter((achievement) => achievement.isUnlocked === (filter === 'unlocked')).length;
                  return (
                    <button
                      key={filter}
                      type="button"
                      className={`collection-filter${collectionFilter === filter ? ' active' : ''}`}
                      aria-pressed={collectionFilter === filter}
                      onClick={() => { setCollectionFilter(filter); setSelectedAchievementId(null); setDismissedAchievementId(null); }}
                    >
                      {filter === 'all' ? 'All' : filter === 'unlocked' ? 'Unlocked' : 'Locked'} <span>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {collectionStatus === 'loading' ? (
              <div className="collection-state"><LoadingState label="Loading hunter badges" lines={2} /></div>
            ) : collectionStatus === 'error' ? (
              <div className="collection-state"><ErrorState message={collectionError} onRetry={() => void loadAchievements()} retryLabel="Retry collection" /></div>
            ) : achievementsList.length === 0 ? (
              <div className="collection-state"><EmptyState title="No achievements yet" description="There are no achievement badges available right now." /></div>
            ) : visibleAchievements.length === 0 ? (
              <div className="collection-state"><EmptyState title={`No ${collectionFilter} badges`} description="Try another collection filter to see your badges." /></div>
            ) : (
              <div className="collection-badge-grid">
                {visibleAchievements.map((achievement) => {
                  const unlocked = achievement.isUnlocked;
                  const selected = selectedAchievementId === achievement.id;
                  const rarityColor = getRarityColor(achievement.rarity);
                  const detailId = `profile-achievement-detail-${achievement.id}`;
                  return (
                    <div
                      key={achievement.id}
                      className={`collection-badge-wrap${selected ? ' selected' : ''}${dismissedAchievementId === achievement.id ? ' dismissed' : ''}`}
                      onMouseEnter={(event) => { keepPopoverOpen(); setPopoverAnchor(event.currentTarget.querySelector('button')); setHoveredAchievementId(achievement.id); }}
                      onMouseLeave={() => { if (!selectedAchievementId) schedulePopoverClose(); }}
                    >
                      <button
                        type="button"
                        className={`collection-badge${unlocked ? ' unlocked' : ' locked'}${selected ? ' selected' : ''}`}
                        style={{ '--badge-rarity': rarityColor } as CSSProperties}
                        aria-label={`${achievement.name}. ${achievement.rarity} rarity. ${unlocked ? 'Unlocked' : 'Locked'}. ${achievement.description}`}
                        aria-describedby={openBadgeId === achievement.id ? detailId : undefined}
                        aria-controls={openBadgeId === achievement.id ? detailId : undefined}
                        aria-expanded={openBadgeId === achievement.id}
                        onFocus={(event) => { keepPopoverOpen(); setPopoverAnchor(event.currentTarget); setHoveredAchievementId(achievement.id); }}
                        onClick={() => {
                          keepPopoverOpen();
                          setPopoverAnchor(selected ? null : document.getElementById(`profile-achievement-${achievement.id}`));
                          setHoveredAchievementId(null);
                          setSelectedAchievementId((current) => current === achievement.id ? null : achievement.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            dismissPopover();
                          }
                        }}
                        id={`profile-achievement-${achievement.id}`}
                        onBlur={() => { if (!selectedAchievementId) schedulePopoverClose(); }}
                      >
                        <span className="collection-badge-emblem">
                          <span className="collection-badge-icon"><AppIcon id={achievement.id} glyph={achievement.icon} fallback="award" size={25} /></span>
                          {!unlocked && <span className="collection-badge-lock" aria-hidden="true"><LockKeyhole size={15} /></span>}
                        </span>
                        <span className="collection-badge-name">{achievement.name}</span>
                        <span className="collection-badge-rarity">{achievement.rarity}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {openAchievement && popoverAnchor?.isConnected && createPortal(<BadgePopover achievement={openAchievement} anchor={popoverAnchor} close={dismissPopover} keepOpen={keepPopoverOpen} scheduleClose={schedulePopoverClose} />, document.body)}

      {progressionMilestones.length > 0 && (
        <section className="panel profile-milestones-panel" aria-labelledby="progression-milestones-title">
          <div className="panel-header"><div><h2 id="progression-milestones-title" className="panel-title">Progression Milestones</h2><span className="panel-subtitle">Recorded advances from your progression history</span></div></div>
          <div className="panel-body"><ol className="profile-milestone-list">
            {progressionMilestones.map((milestone) => (
              <li key={milestone.id} className={`profile-milestone-item milestone-${milestone.type}`}>
                <span className="profile-milestone-icon" aria-hidden="true">{milestone.type === 'level-up' ? <Zap size={17} /> : milestone.type === 'skill' ? <Award size={17} /> : <Flame size={17} />}</span>
                <div className="profile-milestone-copy"><strong>{milestone.message}</strong><time dateTime={milestone.timestamp}>{formatDate(milestone.timestamp)}</time></div>
              </li>
            ))}
          </ol></div>
        </section>
      )}

      <section id="profile-activity" className="panel profile-activity-panel" aria-labelledby="recent-activity-title">
        <div className="panel-header">
          <div className="profile-section-heading">
            <div className="profile-section-title-wrap">
              <Activity size={18} aria-hidden="true" />
              <div>
                <h2 id="recent-activity-title">Recent Activity</h2>
                <p>Your latest recorded progression</p>
              </div>
            </div>
          </div>
        </div>
        <div className="panel-body">
          {profileActivity.length ? (
            <ol className="profile-activity-list">
              {profileActivity.map((item) => (
                <li key={item.id} className="profile-activity-item" style={{ '--activity-color': 'rarity' in item ? getRarityColor(item.rarity) : 'var(--scds-cyan-light)' } as CSSProperties}>
                  <span className="profile-activity-icon"><AppIcon glyph={item.icon} fallback={item.category === 'achievement' ? 'trophy' : item.category === 'level-up' ? 'arrowUp' : item.category === 'streak' ? 'flame' : item.category === 'skill' ? 'award' : 'checkCircle'} size={18} /></span>
                  <div className="profile-activity-copy">
                    <div className="profile-activity-title-row">
                      <strong>{item.title}</strong>
                      <span className={`profile-activity-category${'rarity' in item ? ' rarity' : ''}`}>{item.category}</span>
                    </div>
                    <p>{item.description}</p>
                  </div>
                  <time className="profile-activity-date" dateTime={item.date}>
                    <CalendarDays size={14} aria-hidden="true" />
                    <span>{formatDate(item.date)}</span>
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No recent activity" description="Recorded quest, skill, level, streak, or achievement events will appear here." />
          )}
        </div>
      </section>
    </div>
  );
}
