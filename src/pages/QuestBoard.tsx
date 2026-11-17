import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownWideNarrow, ArrowRight, Check, Clock3, Code2, Filter, Search, Shield, Sparkles, Target, X } from 'lucide-react';
import { useProgression, type DailyQuestRequestState } from '../context/ProgressionContext';
import { useAuth } from '../context/AuthContext';
import type { DailyQuest, Quest, QuestDifficulty, QuestStatus } from '../types';
import { Button, DifficultyBadge, EmptyState, ErrorState, LoadingState, Panel, ProgressBar, StatusBadge, Toast } from '../components/ui';
import './QuestBoard.css';

type MissionTab = 'all' | 'main' | 'daily' | 'completed';
type QuestSort = 'default' | 'reward' | 'difficulty' | 'time';
type ToastState = { title: string; message: string };

const tabs: { id: MissionTab; label: string }[] = [
  { id: 'all', label: 'All missions' },
  { id: 'main', label: 'Main quests' },
  { id: 'daily', label: 'Daily quests' },
  { id: 'completed', label: 'Completed' },
];
const difficultyOrder: Record<QuestDifficulty, number> = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };

function titleCase(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(status: QuestStatus): string {
  return status === 'in-progress' ? 'In progress' : titleCase(status);
}

function statusVariant(status: QuestStatus): 'active' | 'completed' | 'pending' | 'failed' {
  if (status === 'available') return 'active';
  if (status === 'completed') return 'completed';
  if (status === 'in-progress') return 'pending';
  return 'failed';
}

function DailyMissionContent({ state, missions, onRetry, onSignIn, errorMessage }: { state: DailyQuestRequestState['status']; missions: DailyQuest[]; onRetry: () => void; onSignIn: () => void; errorMessage?: string }) {
  if (state === 'loading') return <Panel className="qb-daily-state"><LoadingState label="Loading daily missions" lines={3} /></Panel>;
  if (state === 'error') return <Panel className="qb-daily-state"><ErrorState message={errorMessage || 'Daily missions could not be loaded. Retry to check the server for today’s missions.'} onRetry={onRetry} retryLabel="Retry missions" /></Panel>;
  if (state === 'unauthenticated') return <Panel className="qb-daily-state"><EmptyState icon={<Shield size={22} />} title="Sign in to view daily missions" description="Daily missions are issued by the server for your account." action={<Button onClick={onSignIn}>Sign in</Button>} /></Panel>;
  if (state === 'empty' || missions.length === 0) return <Panel className="qb-daily-state"><EmptyState icon={<Sparkles size={22} />} title="No daily missions available" description="There are no daily missions assigned right now." /></Panel>;
  return <div className="qb-daily-grid">{missions.map((mission) => {
    const label = mission.status === 'claimed' ? 'Claimed' : mission.status === 'completed' ? 'Completed' : 'Available';
    const variant = mission.status === 'available' ? 'active' : 'completed';
    return <Panel key={mission.id} className="qb-daily-card"><div className="qb-daily-top"><span>{titleCase(mission.mission_type.replaceAll('_', '-'))}</span><StatusBadge status={variant}>{label}</StatusBadge></div><h3>{mission.title}</h3><p>{mission.description}</p><div className="qb-daily-progress"><div><span>Mission progress</span><strong>{mission.progress} / {mission.target_progress}</strong></div><ProgressBar value={mission.progress} max={mission.target_progress} variant={mission.status === 'available' ? 'cyan' : 'success'} label={`${mission.title} progress`} /></div><footer><span><Sparkles size={15} /> +{mission.xp_reward} XP</span><small>{mission.status === 'available' ? 'Progress is tracked automatically' : label}</small></footer></Panel>;
  })}</div>;
}

export default function QuestBoard() {
  const navigate = useNavigate();
  const { quests, player, startQuest, completeQuest, isQuestClaimed, isSyncing, dailyQuestRequest, refreshDailyQuests } = useProgression();
  const { isAuthenticated, isLoading: authLoading, token, openAuthModal } = useAuth();
  const [activeTab, setActiveTab] = useState<MissionTab>('all');
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<QuestDifficulty | 'all'>('all');
  const [status, setStatus] = useState<QuestStatus | 'all'>('all');
  const [sort, setSort] = useState<QuestSort>('default');
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!selectedQuestId) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>('.qb-detail');
    const focusable = () => dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
    (focusable()?.[0] ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedQuestId(null);
      }
      if (event.key === 'Tab') {
        const items = focusable();
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [selectedQuestId]);

  const mainQuests = useMemo(() => quests.filter((quest) => !quest.isDaily), [quests]);
  useEffect(() => {
    if (!authLoading && isAuthenticated && token && dailyQuestRequest.status === 'unauthenticated') {
      void refreshDailyQuests();
    }
  }, [authLoading, isAuthenticated, token, dailyQuestRequest.status, refreshDailyQuests]);
  const dailyMissions: DailyQuest[] = dailyQuestRequest.status === 'success' || dailyQuestRequest.status === 'empty' ? dailyQuestRequest.data.quests : [];
  const dailyCount = dailyMissions.length;
  const counts: Record<MissionTab, number> = {
    all: mainQuests.length + dailyCount,
    main: mainQuests.length,
    daily: dailyQuestRequest.status === 'success' || dailyQuestRequest.status === 'empty' ? dailyQuestRequest.data.quests.length : 0,
    completed: mainQuests.filter((quest) => quest.status === 'completed').length + dailyMissions.filter((mission) => mission.status !== 'available').length,
  };
  const visibleQuests = useMemo(() => {
    const filtered = mainQuests.filter((quest) => {
      if (activeTab === 'daily') return false;
      if (activeTab === 'completed' && quest.status !== 'completed') return false;
      if (status !== 'all' && quest.status !== status) return false;
      if (difficulty !== 'all' && quest.difficulty !== difficulty) return false;
      const query = search.trim().toLocaleLowerCase();
      if (query && !`${quest.title} ${quest.description}`.toLocaleLowerCase().includes(query)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === 'reward') return b.xpReward - a.xpReward;
      if (sort === 'difficulty') return difficultyOrder[b.difficulty] - difficultyOrder[a.difficulty];
      if (sort === 'time') return a.estimatedMinutes - b.estimatedMinutes;
      return 0;
    });
  }, [mainQuests, activeTab, status, difficulty, search, sort]);
  const selectedQuest = selectedQuestId ? quests.find((quest) => quest.id === selectedQuestId) ?? null : null;
  const activeCount = mainQuests.filter((quest) => quest.status === 'in-progress').length;
  const completedCount = mainQuests.filter((quest) => quest.status === 'completed').length + dailyMissions.filter((mission) => mission.status !== 'available').length;

  const handleStart = (quest: Quest) => {
    if (!startQuest(quest.id)) return;
    setToast({ title: 'Quest accepted', message: `${quest.title} is now in progress.` });
  };

  const handleComplete = (quest: Quest) => {
    if (isAuthenticated) {
      setToast({ title: 'Complete in the Python IDE', message: 'Rewards are confirmed after a passing server-side submission.' });
      navigate(`/quest/${quest.id}`);
      return;
    }
    const result = completeQuest(quest.id);
    if (result.success) {
      setToast({ title: result.leveledUp ? `Level up — Level ${result.newLevel}` : 'Quest completed', message: result.xpGained ? `You earned ${result.xpGained} XP.` : 'This quest was already rewarded.' });
    } else {
      setToast({ title: 'Quest could not be completed', message: result.message });
    }
  };

  const clearFilters = () => {
    setSearch(''); setDifficulty('all'); setStatus('all'); setSort('default');
  };

  return (
    <main className="quest-board">
      <header className="qb-hero">
        <div className="qb-hero-copy">
          <div className="qb-eyebrow"><span /> Hunter mission registry <span className="qb-hero-code">SC / 03</span></div>
          <h1>QUEST <span>BOARD</span></h1>
          <p>Select a mission, study its objectives, then prove your mastery in the Python IDE.</p>
        </div>
        <div className="qb-rank-mark" aria-label={`${player.rank}, level ${player.level}`}>
          <div className="qb-rank-icon"><Shield size={25} strokeWidth={1.6} /><Sparkles className="qb-rank-spark" size={12} /></div>
          <div><span>HUNTER RANK</span><strong>{player.rank}</strong><small>LEVEL {player.level}</small></div>
        </div>
        <div className="qb-hero-stats" aria-label="Mission totals">
          <div><Target size={15} /><strong>{activeCount}</strong><span>ACTIVE</span></div>
          <div><Check size={15} /><strong>{completedCount}</strong><span>COMPLETED</span></div>
          <div><Sparkles size={15} /><strong>{dailyCount}</strong><span>DAILY</span></div>
        </div>
      </header>

      <section className="qb-board" aria-label="Quest missions">
        <div className="qb-section-heading">
          <div><span className="qb-kicker">FIELD OPERATIONS</span><h2>Mission registry</h2></div>
          <span className="qb-result-count">{visibleQuests.length} / {quests.length} missions</span>
        </div>

        <nav className="qb-tabs" aria-label="Mission categories">
          {tabs.map((tab) => <button key={tab.id} type="button" className={`qb-tab ${activeTab === tab.id ? 'is-active' : ''}`} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
            {tab.label}<span>{counts[tab.id]}</span>
          </button>)}
        </nav>

        <Panel className="qb-filters">
          <label className="qb-search"><Search size={17} aria-hidden="true" /><span className="qb-sr-only">Search missions</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mission title or objective..." /><button type="button" aria-label="Clear search" onClick={() => setSearch('')} hidden={!search}><X size={15} /></button></label>
          <div className="qb-filter-fields">
            <label><span><Filter size={13} /> Difficulty</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuestDifficulty | 'all')}><option value="all">All ranks</option>{(['E', 'D', 'C', 'B', 'A', 'S'] as const).map((rank) => <option key={rank} value={rank}>{rank}-Rank</option>)}</select></label>
            <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as QuestStatus | 'all')}><option value="all">All statuses</option><option value="available">Available</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="locked">Locked</option></select></label>
            <label><span><ArrowDownWideNarrow size={13} /> Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as QuestSort)}><option value="default">Recommended order</option><option value="reward">XP reward</option><option value="difficulty">Difficulty</option><option value="time">Estimated time</option></select></label>
            {(search || difficulty !== 'all' || status !== 'all' || sort !== 'default') && <Button variant="ghost" size="sm" onClick={clearFilters}>Reset</Button>}
          </div>
        </Panel>

        {activeTab === 'daily' ? <DailyMissionContent state={dailyQuestRequest.status} missions={dailyMissions} onRetry={() => void refreshDailyQuests()} onSignIn={openAuthModal} errorMessage={dailyQuestRequest.status === 'error' ? dailyQuestRequest.message : undefined} /> : mainQuests.length === 0 && isSyncing ? <Panel><LoadingState label="Loading mission registry" lines={4} /></Panel> : visibleQuests.length === 0 ? <Panel className="qb-empty"><EmptyState icon={<Search size={22} />} title={mainQuests.length === 0 ? 'No missions available' : 'No missions found'} description={mainQuests.length === 0 ? 'There are no missions in the registry right now.' : 'Try a different search or clear your filters.'} action={mainQuests.length > 0 ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined} /></Panel> : (
          <div className="qb-grid">
            {visibleQuests.map((quest) => <Panel key={quest.id} variant="interactive" className={`qb-card qb-card-${quest.status}`} onClick={() => setSelectedQuestId(quest.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedQuestId(quest.id); } }}>
              <div className="qb-card-top"><DifficultyBadge difficulty={quest.difficulty} /><span className="qb-topic">{titleCase(quest.category)}</span><StatusBadge status={statusVariant(quest.status)}>{statusLabel(quest.status)}</StatusBadge></div>
              <h3>{quest.title}</h3><p className="qb-card-desc">{quest.description}</p>
              {quest.prerequisiteIds.length > 0 && <div className={`qb-prerequisite ${quest.status === 'locked' ? 'is-locked' : ''}`}><Shield size={13} />{quest.status === 'locked' ? `${quest.prerequisiteIds.length} prerequisite${quest.prerequisiteIds.length === 1 ? '' : 's'} required` : 'Prerequisites cleared'}</div>}
              <div className="qb-card-objectives"><span>OBJECTIVES</span>{quest.objectives.slice(0, 2).map((objective) => <div key={objective}><i />{objective}</div>)}{quest.objectives.length > 2 && <small>+{quest.objectives.length - 2} more</small>}</div>
              <footer><div className="qb-reward"><Sparkles size={15} /><strong>+{quest.xpReward} XP</strong><span><Clock3 size={12} /> {quest.estimatedMinutes} min</span></div><span className="qb-open" aria-hidden="true"><ArrowRight size={16} /></span></footer>
            </Panel>)}
          </div>
        )}
        {activeTab === 'all' && <section className="qb-daily-section"><div><span className="qb-kicker">SERVER-ISSUED</span><h2>Daily missions</h2></div><DailyMissionContent state={dailyQuestRequest.status} missions={dailyMissions} onRetry={() => void refreshDailyQuests()} onSignIn={openAuthModal} errorMessage={dailyQuestRequest.status === 'error' ? dailyQuestRequest.message : undefined} /></section>}
        {activeTab === 'completed' && <section className="qb-daily-section"><div><span className="qb-kicker">SERVER-ISSUED</span><h2>Completed daily missions</h2></div><DailyMissionContent state={dailyQuestRequest.status === 'success' || dailyQuestRequest.status === 'empty' ? (dailyMissions.some((mission) => mission.status !== 'available') ? 'success' : 'empty') : dailyQuestRequest.status} missions={dailyMissions.filter((mission) => mission.status !== 'available')} onRetry={() => void refreshDailyQuests()} onSignIn={openAuthModal} errorMessage={dailyQuestRequest.status === 'error' ? dailyQuestRequest.message : undefined} /></section>}
      </section>

      {selectedQuest && <div className="qb-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedQuestId(null); }}>
        <section className="qb-detail" role="dialog" aria-modal="true" aria-labelledby="qb-detail-title" tabIndex={-1}>
          <header><div><span className="qb-kicker">MISSION DOSSIER / {selectedQuest.id}</span><button type="button" className="qb-close" onClick={() => setSelectedQuestId(null)} aria-label="Close mission details"><X size={18} /></button></div><div className="qb-card-top"><DifficultyBadge difficulty={selectedQuest.difficulty} /><span className="qb-topic">{titleCase(selectedQuest.category)}</span><StatusBadge status={statusVariant(selectedQuest.status)}>{statusLabel(selectedQuest.status)}</StatusBadge></div><h2 id="qb-detail-title">{selectedQuest.title}</h2></header>
          <div className="qb-detail-content"><p className="qb-detail-description">{selectedQuest.description}</p>
            <div className="qb-detail-stats"><div><span>REWARD</span><strong>{selectedQuest.xpReward} XP</strong></div><div><span>EST. TIME</span><strong>{selectedQuest.estimatedMinutes} min</strong></div><div><span>OBJECTIVES</span><strong>{selectedQuest.objectives.length}</strong></div></div>
            <section><h3>Objectives</h3><ul className="qb-objective-list">{selectedQuest.objectives.map((objective) => <li key={objective}><Code2 size={15} />{objective}</li>)}</ul></section>
            <section><h3>Prerequisites</h3>{selectedQuest.prerequisiteIds.length ? <ul className="qb-prereq-list">{selectedQuest.prerequisiteIds.map((id) => { const prerequisite = quests.find((quest) => quest.id === id); const done = prerequisite?.status === 'completed'; return <li key={id}><span>{prerequisite?.title ?? id}</span><StatusBadge status={done ? 'completed' : 'failed'}>{done ? 'Completed' : 'Incomplete'}</StatusBadge></li>; })}</ul> : <p className="qb-no-prereq">No prerequisites — this mission is open to all hunters.</p>}</section>
            <p className="qb-server-note"><Shield size={15} /> XP rewards for signed-in hunters are confirmed after a passing server-side solution.</p>
          </div>
          <footer className="qb-detail-actions"><Button variant="ghost" onClick={() => setSelectedQuestId(null)}>Close</Button>{selectedQuest.status === 'locked' ? <Button disabled icon={<Shield size={15} />}>Prerequisites required</Button> : selectedQuest.status === 'completed' ? <><Button variant="secondary" onClick={() => navigate(`/quest/${selectedQuest.id}`)} icon={<Code2 size={15} />}>Open solution</Button><StatusBadge status="completed">{isQuestClaimed(selectedQuest.id) ? 'Rewards claimed' : 'Completed'}</StatusBadge></> : <><Button variant="secondary" onClick={() => handleStart(selectedQuest)} disabled={selectedQuest.status === 'in-progress'}>{selectedQuest.status === 'in-progress' ? 'In progress' : 'Accept mission'}</Button>{selectedQuest.status === 'in-progress' && <Button onClick={() => handleComplete(selectedQuest)} icon={<Code2 size={15} />}>{isAuthenticated ? 'Submit in IDE' : 'Preview complete'}</Button>}<Button variant="ghost" onClick={() => navigate(`/quest/${selectedQuest.id}`)} icon={<Code2 size={15} />}>Open Python IDE <ArrowRight size={15} /></Button>{selectedQuest.status === 'available' && !isAuthenticated && <button className="qb-auth-link" type="button" onClick={openAuthModal}>Sign in to save rewards</button>}</>}</footer>
        </section>
      </div>}
      {toast && <div className="qb-toast-wrap"><Toast variant="info" title={toast.title} message={toast.message} onClose={() => setToast(null)} /></div>}
    </main>
  );
}
