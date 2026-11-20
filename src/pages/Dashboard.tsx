import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgression } from '../context/ProgressionContext';
import { useAuth } from '../context/AuthContext';
import type { AchievementsResponse, ActivityEntry, PlayerStats, Rank } from '../types';
import { AppIcon, type AppIconName } from '../components/ui/AppIcon';
import './Dashboard.css';

type IconName = AppIconName;

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <AppIcon name={name} size={size} />;
}

const statConfig: { key: keyof PlayerStats; label: string; icon: IconName; color: string }[] = [
  { key: 'strength', label: 'Strength', icon: 'swords', color: 'var(--dash-red)' },
  { key: 'intelligence', label: 'Intelligence', icon: 'brain', color: 'var(--dash-violet)' },
  { key: 'agility', label: 'Agility', icon: 'zap', color: 'var(--dash-cyan)' },
  { key: 'vitality', label: 'Vitality', icon: 'flame', color: 'var(--dash-gold)' },
  { key: 'perception', label: 'Perception', icon: 'crosshair', color: 'var(--dash-blue)' },
  { key: 'endurance', label: 'Endurance', icon: 'shield', color: 'var(--dash-green)' },
];

function rankColor(rank: Rank): string {
  const colors: Record<Rank, string> = {
    'E-Rank': '#8e9aaa', 'D-Rank': '#61a8e8', 'C-Rank': '#4fc69b', 'B-Rank': '#e3b75b',
    'A-Rank': '#f18a54', 'S-Rank': '#e36a7f', 'National Level': '#bb91ff', Monarch: '#f1c76d',
  };
  return colors[rank];
}

function missionIcon(type: string): IconName {
  if (type === 'main_challenge') return 'code';
  if (type === 'practice_challenge') return 'target';
  if (type === 'concept_mastery') return 'book';
  return 'activity';
}

function missionLabel(type: string): string {
  if (type === 'main_challenge') return 'Main challenge';
  if (type === 'practice_challenge') return 'Practice';
  if (type === 'concept_mastery') return 'Concept mastery';
  return 'Daily mission';
}

function formatTimeToReset(): string {
  const now = new Date();
  const nextUtcDay = new Date(now);
  nextUtcDay.setUTCHours(24, 0, 0, 0);
  const minutes = Math.max(0, Math.floor((nextUtcDay.getTime() - now.getTime()) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatTimeAgo(timestamp: string): string | null {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time) || time > Date.now()) return null;
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function activityIcon(type: ActivityEntry['type']): IconName {
  if (type === 'level-up') return 'zap';
  if (type === 'achievement') return 'award';
  if (type === 'skill') return 'book';
  if (type === 'streak') return 'flame';
  return 'check';
}

export default function Dashboard() {
  const { player, recentActivity, dailyQuestData, dailyQuestRequest, refreshDailyQuests, claimDailyChest, isSyncing } = useProgression();
  const { isAuthenticated, isLoading: authLoading, token } = useAuth();
  const [timeToReset, setTimeToReset] = useState(formatTimeToReset());
  const [claimingChest, setClaimingChest] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [achievementSummary, setAchievementSummary] = useState<{ unlocked: number; total: number; titles: number } | null>(null);

  const xpPercent = player.xpToNextLevel > 0
    ? Math.min(100, Math.max(0, Math.round((player.xp / player.xpToNextLevel) * 100)))
    : 0;
  const rankTint = rankColor(player.rank);
  const initials = player.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'H';
  const attributes = useMemo(() => statConfig.map((stat) => ({ ...stat, value: player.stats[stat.key] })), [player.stats]);
  const activityItems = recentActivity
    .map((activity) => ({ activity, relativeTime: formatTimeAgo(activity.timestamp) }))
    .filter((item): item is { activity: ActivityEntry; relativeTime: string } => item.relativeTime !== null)
    .slice(0, 6);
  const visibleDailyData = dailyQuestRequest.status === 'success' || dailyQuestRequest.status === 'empty'
    ? dailyQuestRequest.data
    : null;
  const completedMissions = visibleDailyData?.quests.filter((quest) => quest.status !== 'available').length ?? 0;
  const missionCount = visibleDailyData?.quests.length ?? 0;

  useEffect(() => {
    if (!token || !isAuthenticated) {
      setAchievementSummary(null);
      return;
    }
    let active = true;
    async function loadAchievements() {
      try {
        const response = await fetch('/api/achievements', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const data: AchievementsResponse = await response.json();
        if (active) {
          setAchievementSummary({
            unlocked: data.stats.unlockedCount,
            total: data.stats.total,
            titles: data.titles.length,
          });
        }
      } catch (error) {
        console.warn('Dashboard achievements summary load failed:', error);
      }
    }
    void loadAchievements();
    return () => { active = false; };
  }, [token, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    void refreshDailyQuests();
  }, [authLoading, isAuthenticated, token, refreshDailyQuests]);

  useEffect(() => {
    const interval = window.setInterval(() => setTimeToReset(formatTimeToReset()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!claimMessage) return;
    const timeout = window.setTimeout(() => setClaimMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [claimMessage]);

  const handleClaimChest = async () => {
    if (!dailyQuestData || dailyQuestData.chest.status !== 'available' || claimingChest) return;
    setClaimingChest(true);
    const result = await claimDailyChest();
    setClaimMessage(result.success ? `Reward claimed · +${result.xpAwarded.toLocaleString()} XP` : result.reason || 'The reward could not be claimed. Try again.');
    setClaimingChest(false);
  };

  return (
    <div className="dashboard">
      <header className="dash-heading">
        <div>
          <div className="dash-eyebrow"><span className="dash-eyebrow-line" /> HUNTER NETWORK <span className="dash-eyebrow-separator">/</span> PERSONAL STATUS</div>
          <h1>Command Center</h1>
          <p>Your progression, missions, and standing at a glance.</p>
        </div>
        <div className="dash-heading-actions">
          <div className="dash-streak-chip"><Icon name="flame" size={16} /><span><strong>{player.streak}</strong> day streak</span></div>
          <Link className="dash-action dash-action-secondary" to="/arena"><Icon name="swords" size={16} /> Ranked Arena</Link>
          <Link className="dash-action dash-action-primary" to="/quests"><Icon name="code" size={16} /> Quest Board</Link>
        </div>
      </header>

      <section className="hunter-hero" aria-label="Hunter profile">
        <div className="hero-grid-mark" aria-hidden="true" />
        <div className="hero-orbit hero-orbit-one" aria-hidden="true" />
        <div className="hero-orbit hero-orbit-two" aria-hidden="true" />
        <div className="hunter-identity">
          <div className="hunter-avatar" aria-label={`${player.name} avatar`}>
            {player.avatar ? <img src={player.avatar} alt="" /> : <span>{initials}</span>}
            <span className="hunter-avatar-presence" />
          </div>
          <div className="hunter-copy">
            <div className="hero-kicker"><span className="hero-kicker-dot" /> HUNTER PROFILE <span className="hero-kicker-rule" /></div>
            <h2>{player.name}</h2>
            <div className="hunter-tags">
              <span className="hunter-rank" style={{ '--rank-tint': rankTint } as React.CSSProperties}>{player.rank}</span>
              {player.title && <Link to="/achievements" className="hunter-title"><Icon name="award" size={13} /> {player.title}</Link>}
              <span className="hunter-level">LEVEL <strong>{player.level}</strong></span>
            </div>
          </div>
        </div>

        <div className="hero-progression">
          <div className="hero-progression-top">
            <div><span className="hero-progression-label">Experience progress</span><span className="hero-progression-sub">Toward level {player.level + 1}</span></div>
            <span className="hero-xp-count">{player.xp.toLocaleString()} <i>/</i> {player.xpToNextLevel.toLocaleString()} <small>XP</small></span>
          </div>
          <div className="hero-xp-track" role="progressbar" aria-label="Experience toward next level" aria-valuemin={0} aria-valuemax={player.xpToNextLevel} aria-valuenow={player.xp}>
            <span className="hero-xp-progress" style={{ width: `${xpPercent}%` }} />
          </div>
          <div className="hero-progression-bottom"><span>{xpPercent}% complete</span><span>{Math.max(0, player.xpToNextLevel - player.xp).toLocaleString()} XP to next level</span></div>
        </div>

        <div className="hero-side">
          <span className="hero-side-label">CURRENT GUILD</span>
          {player.guild ? (
            <Link className="hero-guild" to={`/guilds/${player.guild.id}`}>
              <span className="hero-guild-icon">{player.guild.emblem || <Icon name="shield" size={19} />}</span>
              <span><strong>{player.guild.name}</strong><small>{player.guild.role} · {player.guild.rank}</small></span>
              <Icon name="arrowRight" size={16} />
            </Link>
          ) : (
            <Link className="hero-guild hero-guild-empty" to="/guilds">
              <span className="hero-guild-icon"><Icon name="users" size={18} /></span>
              <span><strong>Find an alliance</strong><small>Join a Hunter guild</small></span>
              <Icon name="arrowRight" size={16} />
            </Link>
          )}
          <div className="hero-sync-note"><span className={isSyncing ? 'sync-dot syncing' : 'sync-dot'} /> {isAuthenticated ? isSyncing ? 'Syncing hunter record' : 'Hunter record synced' : 'Preview profile'}</div>
        </div>
      </section>

      <section className="status-strip" aria-label="Hunter statistics">
        <div className="status-strip-heading"><span className="status-strip-marker" /> STATUS</div>
        <div className="status-metric"><span className="status-metric-icon violet"><Icon name="check" /></span><span><strong>{player.questsCompleted.toLocaleString()}</strong><small>Quests cleared</small></span></div>
        <div className="status-metric"><span className="status-metric-icon cyan"><Icon name="zap" /></span><span><strong>{player.skillsUnlocked}<i>/{player.totalSkills}</i></strong><small>Skills unlocked</small></span></div>
        <div className="status-metric"><span className="status-metric-icon gold"><Icon name="flame" /></span><span><strong>{player.streak}<i> days</i></strong><small>Current streak</small></span></div>
        <Link className="status-metric status-metric-link" to="/achievements"><span className="status-metric-icon purple"><Icon name="award" /></span><span><strong>{achievementSummary ? `${achievementSummary.unlocked}/${achievementSummary.total}` : '—'}</strong><small>Achievements</small></span><Icon name="arrowRight" size={15} /></Link>
        <div className="status-rank"><span>HUNTER RANK</span><strong style={{ color: rankTint }}>{player.rank}</strong></div>
      </section>

      <section className="mission-section" aria-labelledby="mission-heading">
        <div className="section-heading">
          <div className="section-heading-copy"><div className="section-overline">TODAY'S DIRECTIVES</div><h2 id="mission-heading">Daily missions</h2><p>Complete the set to unlock your supply cache.</p></div>
          <div className="mission-heading-meta">
            <div className="mission-reset"><Icon name="clock" size={15} /><span>Resets in <strong>{timeToReset}</strong> <small>UTC</small></span></div>
            <div className="mission-tally">{dailyQuestRequest.status === 'loading' || authLoading ? 'Loading missions' : dailyQuestRequest.status === 'error' ? 'Missions unavailable' : dailyQuestRequest.status === 'unauthenticated' ? 'Sign in required' : missionCount ? `${completedMissions} / ${missionCount} complete` : 'No missions today'}</div>
          </div>
        </div>
        <div className="mission-board">
          <div className="mission-list">
            {dailyQuestRequest.status === 'loading' || authLoading ? (
              <div className="mission-skeleton" role="status" aria-label="Loading daily missions"><span /><span /><span /></div>
            ) : dailyQuestRequest.status === 'success' ? dailyQuestRequest.data.quests.map((quest) => {
              const progress = quest.target_progress > 0 ? Math.min(100, Math.max(0, Math.round((quest.progress / quest.target_progress) * 100))) : 0;
              const completed = quest.status !== 'available';
              return (
                <article className={`mission-row ${quest.status}`} key={quest.id}>
                  <span className={`mission-type-icon ${quest.mission_type}`}><Icon name={missionIcon(quest.mission_type)} size={19} /></span>
                  <div className="mission-main">
                    <div className="mission-meta"><span>{missionLabel(quest.mission_type)}</span><span className={`mission-state ${quest.status}`}>{quest.status === 'claimed' ? 'Claimed' : quest.status === 'completed' ? 'Complete' : 'In progress'}</span></div>
                    <h3>{quest.title}</h3>
                    <p>{quest.description}</p>
                    <div className="mission-progress-line"><div className="mission-progress-track"><span style={{ width: `${progress}%` }} /></div><span>{quest.progress} <i>/</i> {quest.target_progress}</span></div>
                  </div>
                  <div className="mission-reward"><span>REWARD</span><strong>+{quest.xp_reward.toLocaleString()} <small>XP</small></strong>{completed && <Icon name="check" size={16} />}</div>
                </article>
              );
            }) : dailyQuestRequest.status === 'empty' ? (
              <div className="mission-empty"><span className="mission-empty-icon"><Icon name="check" size={22} /></span><div><strong>No missions available today</strong><p>There are no daily objectives for this hunter right now.</p></div></div>
            ) : dailyQuestRequest.status === 'error' ? (
              <div className="mission-empty mission-error" role="alert"><span className="mission-empty-icon"><Icon name="activity" size={22} /></span><div><strong>Daily missions couldn’t load</strong><p>{dailyQuestRequest.message}</p></div><button type="button" className="text-action" onClick={() => void refreshDailyQuests()}>Retry</button></div>
            ) : dailyQuestRequest.status === 'unauthenticated' ? (
              <div className="mission-empty"><span className="mission-empty-icon"><Icon name="lock" size={22} /></span><div><strong>Sign in to receive daily missions</strong><p>Daily objectives and rewards are tied to your hunter account.</p></div></div>
            ) : (
              <div className="mission-empty">
                <span className="mission-empty-icon"><Icon name="activity" size={22} /></span><div><strong>Daily missions are unavailable</strong><p>Try refreshing the mission board.</p></div><button type="button" className="text-action" onClick={() => void refreshDailyQuests()}>Retry</button>
              </div>
            )}
          </div>
          <aside className={`supply-cache ${visibleDailyData?.chest.status ?? dailyQuestRequest.status}`}>
            <div className="cache-topline"><span>DAILY CACHE</span><span className="cache-state"><i /> {visibleDailyData?.chest.status ?? (dailyQuestRequest.status === 'loading' || authLoading ? 'Loading' : dailyQuestRequest.status === 'unauthenticated' ? 'Sign in' : dailyQuestRequest.status === 'error' ? 'Unavailable' : 'Unavailable')}</span></div>
            <div className="cache-emblem"><Icon name={visibleDailyData?.chest.status === 'available' ? 'gift' : visibleDailyData?.chest.status === 'claimed' ? 'check' : 'lock'} size={27} /></div>
            <strong className="cache-reward">{visibleDailyData ? `+${visibleDailyData.chest.total_xp_reward.toLocaleString()}` : '—'} <small>XP</small></strong>
            <p>{visibleDailyData?.chest.status === 'available' ? 'Your reward is ready to claim.' : visibleDailyData?.chest.status === 'claimed' ? 'Today’s supply has been collected.' : dailyQuestRequest.status === 'error' ? 'Retry the mission request to check cache eligibility.' : 'Clear every mission to unlock the reward.'}</p>
            <button type="button" className="cache-claim" disabled={visibleDailyData?.chest.status !== 'available' || claimingChest} onClick={() => void handleClaimChest()}>
              {claimingChest ? 'Claiming…' : visibleDailyData?.chest.status === 'claimed' ? 'Collected' : 'Claim reward'}
              {!claimingChest && <Icon name={visibleDailyData?.chest.status === 'claimed' ? 'check' : 'arrowRight'} size={16} />}
            </button>
            {claimMessage && <span className="cache-feedback" role="status">{claimMessage}</span>}
            {visibleDailyData && <span className="cache-streak"><Icon name="flame" size={14} /> Longest streak <strong>{visibleDailyData.streak.longest_streak} days</strong></span>}
          </aside>
        </div>
      </section>

      <section className="dashboard-lower-grid">
        <div className="dash-panel activity-panel">
          <div className="dash-panel-heading"><div><div className="section-overline">FIELD LOG</div><h2>Recent activity</h2></div><span className="panel-live-tag"><i /> {isAuthenticated ? 'THIS SESSION' : 'PREVIEW'}</span></div>
          {activityItems.length ? (
            <ol className="activity-timeline">
              {activityItems.map(({ activity, relativeTime }) => (
                <li className={`timeline-item ${activity.type}`} key={activity.id}>
                  <span className="timeline-icon"><Icon name={activityIcon(activity.type)} size={16} /></span>
                  <span className="timeline-connector" />
                  <div className="timeline-copy"><strong>{activity.message}</strong><span><Icon name="clock" size={12} /> {relativeTime}</span></div>
                  <span className="timeline-status"><Icon name="check" size={14} /></span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="activity-empty"><span className="activity-empty-icon"><Icon name="activity" size={23} /></span><strong>No session activity yet</strong><p>{isAuthenticated ? 'Completed challenges and level-ups from this session will appear here.' : 'Complete a preview quest to begin your field log.'}</p><Link to="/quests" className="text-action">Browse quests <Icon name="arrowRight" size={14} /></Link></div>
          )}
        </div>

        <div className="dash-panel attributes-panel">
          <div className="dash-panel-heading"><div><div className="section-overline">HUNTER PROFILE</div><h2>Attributes</h2></div><span className="attribute-scale">0 — 100</span></div>
          <div className="attribute-list">
            {attributes.map((attribute) => (
              <div className="attribute-row" key={attribute.key} style={{ '--attribute-color': attribute.color } as React.CSSProperties}>
                <div className="attribute-label"><span><Icon name={attribute.icon} size={15} />{attribute.label}</span><strong>{attribute.value}</strong></div>
                <div className="attribute-track" role="progressbar" aria-label={attribute.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={attribute.value}><span style={{ width: `${Math.min(100, Math.max(0, attribute.value))}%` }} /></div>
              </div>
            ))}
          </div>
          <Link className="attributes-footer" to="/profile">View hunter profile <Icon name="arrowRight" size={15} /></Link>
        </div>
      </section>

      <nav className="dash-quick-nav" aria-label="More hunter actions">
        <Link to="/dungeons"><Icon name="shield" size={16} /><span>Enter a dungeon</span><Icon name="arrowRight" size={14} /></Link>
        <Link to="/guilds"><Icon name="users" size={16} /><span>Hunter guilds</span><Icon name="arrowRight" size={14} /></Link>
        <Link to="/achievements"><Icon name="award" size={16} /><span>Achievement archive</span><Icon name="arrowRight" size={14} /></Link>
      </nav>
    </div>
  );
}
