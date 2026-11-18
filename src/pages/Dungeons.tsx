import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleDot, Crown, DoorOpen, LockKeyhole, RotateCcw, ShieldAlert, Skull, Swords } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProgression } from '../context/ProgressionContext';
import { getChallengeById } from '../data/challenges';
import { Button, DifficultyBadge, EmptyState, ErrorState, LoadingState, Panel, ProgressBar, RankBadge, StatCard, StatusBadge } from '../components/ui';
import type { Dungeon, DungeonChallenge } from '../types';
import './Dungeons.css';

function statusLabel(dungeon: Dungeon): string {
  if (!dungeon.isAccessible) return 'Locked';
  if (dungeon.status === 'in-progress') return 'In Progress';
  return dungeon.status === 'completed' ? 'Cleared' : 'Available';
}

function Status({ dungeon }: { dungeon: Dungeon }) {
  const status = dungeon.status === 'completed' ? 'completed' : dungeon.isAccessible ? 'active' : 'pending';
  return <StatusBadge status={status}>{statusLabel(dungeon)}</StatusBadge>;
}

function dungeonStageStatus(challenge: DungeonChallenge, dungeonAccessible: boolean) {
  if (challenge.status === 'completed') return 'completed';
  return dungeonAccessible && challenge.status === 'available' ? 'active' : 'pending';
}

function getPrerequisiteTitle(id: string): string {
  return getChallengeById(id)?.title || id;
}

interface DungeonCardProps {
  dungeon: Dungeon;
  selected: boolean;
  onSelect: (id: string) => void;
}

function DungeonCard({ dungeon, selected, onSelect }: DungeonCardProps) {
  const ordered = [...dungeon.challenges].sort((a, b) => a.order - b.order);
  const stateClass = !dungeon.isAccessible ? 'locked' : dungeon.status;
  return (
    <Panel as="article" variant="interactive" className={`expedition-card expedition-card--${stateClass}${selected ? ' is-selected' : ''}`}>
      <div className={`expedition-card__stripe expedition-card__stripe--${dungeon.difficulty}`} />
      <div className="expedition-card__topline">
        <span className="expedition-card__gate"><DoorOpen size={15} aria-hidden="true" /> GATE // {dungeon.id.slice(-3)}</span>
        <Status dungeon={dungeon} />
      </div>
      <div className="expedition-card__heading">
        <div>
          <h2>{dungeon.name}</h2>
          <p>{dungeon.description}</p>
        </div>
        <DifficultyBadge difficulty={dungeon.difficulty} />
      </div>
      <div className="expedition-card__facts">
        <span><ShieldAlert size={15} aria-hidden="true" /> Entry rank <RankBadge rank={dungeon.requiredRank} /></span>
        <span><CircleDot size={15} aria-hidden="true" /> {dungeon.totalRequired} required stages</span>
      </div>
      {!dungeon.isAccessible && dungeon.lockReason && (
        <div className="expedition-card__lock"><LockKeyhole size={15} aria-hidden="true" /><span>{dungeon.lockReason}</span></div>
      )}
      {dungeon.isAccessible && dungeon.status !== 'available' && (
        <div className="expedition-card__progress">
          <div><span>Expedition progress</span><strong>{dungeon.completedRequired}/{dungeon.totalRequired}</strong></div>
          <ProgressBar value={dungeon.completedRequired} max={dungeon.totalRequired} variant={dungeon.status === 'completed' ? 'success' : 'purple'} label={`${dungeon.name} progress`} />
        </div>
      )}
      <div className="expedition-card__route" aria-label={`${ordered.length} stages, final encounter ${ordered.find((item) => item.isBoss)?.stageTitle ?? 'not designated'}`}>
        {ordered.map((stage, index) => <span className={`expedition-card__node expedition-card__node--${stage.status}${stage.isBoss ? ' is-boss' : ''}`} key={stage.id} title={`${stage.stageTitle}${stage.isBoss ? ' · Boss encounter' : ''}`}>
          {stage.status === 'completed' ? <Check size={13} aria-hidden="true" /> : stage.isBoss ? <Skull size={13} aria-hidden="true" /> : index + 1}
        </span>)}
      </div>
      <div className="expedition-card__reward"><span>Clear reward</span><strong>+{dungeon.xpReward.toLocaleString()} XP</strong><span className="expedition-card__title-reward">{dungeon.bonusTitle}</span></div>
      <Button className="expedition-card__action" variant={selected ? 'secondary' : 'primary'} icon={<ArrowRight size={16} aria-hidden="true" />} onClick={() => onSelect(dungeon.id)}>
        {!dungeon.isAccessible ? 'View requirements' : dungeon.status === 'completed' ? 'Review expedition' : dungeon.status === 'in-progress' ? 'Continue expedition' : 'View expedition'}
      </Button>
    </Panel>
  );
}

interface DungeonDetailProps {
  dungeon: Dungeon;
  onBack: () => void;
  onEnterChallenge: (dungeonId: string, challengeId: string) => void;
}

function DungeonDetail({ dungeon, onBack, onEnterChallenge }: DungeonDetailProps) {
  const ordered = [...dungeon.challenges].sort((a, b) => a.order - b.order);
  const boss = ordered.find((stage) => stage.isBoss);
  const isComplete = dungeon.status === 'completed';
  return (
    <main className="dungeon-detail expedition-page" aria-label={`${dungeon.name} expedition dossier`}>
      <Button variant="ghost" className="expedition-back" onClick={onBack} icon={<ArrowLeft size={16} aria-hidden="true" />}>All gates</Button>
      <Panel variant="elevated" className={`dossier-hero${boss && boss.status !== 'completed' ? ' dossier-hero--danger' : ''}`}>
        <div className="dossier-hero__eyebrow"><span>EXPEDITION DOSSIER</span><Status dungeon={dungeon} /></div>
        <div className="dossier-hero__title-row"><div><h1>{dungeon.name}</h1><p>{dungeon.lore}</p></div><DifficultyBadge difficulty={dungeon.difficulty} /></div>
        <div className="dossier-hero__facts">
          <div><span>Entry rank</span><RankBadge rank={dungeon.requiredRank} /></div>
          <div><span>Stages</span><strong>{dungeon.totalRequired} required</strong></div>
          <div><span>Clear reward</span><strong className="is-gold">+{dungeon.xpReward.toLocaleString()} XP</strong></div>
          <div><span>Title reward</span><strong className="is-gold">{dungeon.bonusTitle}</strong></div>
        </div>
        {dungeon.isAccessible && dungeon.status !== 'available' && <div className="dossier-hero__progress">
          <div><span>Stage completion</span><strong>{dungeon.completedRequired} of {dungeon.totalRequired}</strong></div>
          <ProgressBar value={dungeon.completedRequired} max={dungeon.totalRequired} variant={isComplete ? 'success' : 'cyan'} label={`${dungeon.name} stage completion`} />
        </div>}
        {isComplete && <div className="expedition-victory" role="status"><Crown size={22} aria-hidden="true" /><div><strong>Gate cleared</strong><span>Completion rewards were processed automatically by the server.</span></div></div>}
      </Panel>

      <div className="dossier-grid">
        <Panel className="dossier-requirements">
          <div className="section-heading"><span className="section-heading__index">01</span><div><h2>Entry requirements</h2><p>Access is checked by the dungeon service.</p></div></div>
          <div className="requirement-row"><ShieldAlert size={17} aria-hidden="true" /><span>Hunter rank</span><RankBadge rank={dungeon.requiredRank} /></div>
          {dungeon.requiredChallenges.length > 0 ? <div className="prerequisite-list">
            <span className="requirement-list-title">Mastered prerequisite challenges</span>
            {dungeon.requiredChallenges.map((id) => <div className="requirement-row" key={id}><Check size={16} aria-hidden="true" /><span>{getPrerequisiteTitle(id)}</span></div>)}
          </div> : <div className="requirement-row"><Check size={16} aria-hidden="true" /><span>No challenge prerequisites</span></div>}
          {!dungeon.isAccessible && dungeon.lockReason && <div className="dossier-lock-message"><LockKeyhole size={16} aria-hidden="true" />{dungeon.lockReason}</div>}
          <p className="dossier-entry-note">Selecting a gate opens its dossier. Progress is recorded when a challenge is successfully submitted.</p>
        </Panel>

        <Panel className="dossier-encounters">
          <div className="section-heading"><span className="section-heading__index">02</span><div><h2>Encounter sequence</h2><p>Clear required stages in order to advance.</p></div></div>
          <div className="stage-sequence" role="list" aria-label={`${dungeon.name} stages`}>
            {ordered.map((stage, index) => {
              const open = dungeon.isAccessible && stage.status !== 'locked';
              const meta = getChallengeById(stage.id);
              return <div className={`stage-entry${stage.isBoss ? ' stage-entry--boss' : ''}${stage.status === 'completed' ? ' stage-entry--completed' : ''}${stage.status === 'locked' || !dungeon.isAccessible ? ' stage-entry--locked' : ''}`} role="listitem" key={stage.id}>
                <div className="stage-entry__rail"><span className="stage-entry__node">{stage.status === 'completed' ? <Check size={16} aria-hidden="true" /> : stage.isBoss ? <Skull size={16} aria-hidden="true" /> : String(stage.order).padStart(2, '0')}</span>{index < ordered.length - 1 && <span className="stage-entry__connector" />}</div>
                <div className="stage-entry__body">
                  <div className="stage-entry__top"><span>{stage.isBoss ? 'BOSS ENCOUNTER' : `STAGE ${String(stage.order).padStart(2, '0')}`}</span><StatusBadge status={dungeonStageStatus(stage, dungeon.isAccessible)}>{stage.status === 'completed' ? 'Completed' : !dungeon.isAccessible || stage.status === 'locked' ? 'Locked' : 'Available'}</StatusBadge></div>
                  <h3>{stage.stageTitle}</h3><p className="stage-entry__lore">{stage.stageLore}</p>
                  <p className="stage-entry__challenge">Challenge <strong>{stage.title}</strong>{meta?.conceptId && <span> · {meta.conceptId}</span>}</p>
                  <div className="stage-entry__detail-row"><span>{stage.isRequired ? 'Required' : 'Optional'}</span>{stage.attempts > 0 && <span>{stage.attempts} attempt{stage.attempts === 1 ? '' : 's'}</span>}</div>
                  {stage.bestTotalCount > 0 && <div className="stage-entry__best"><span>Best evaluation · {stage.bestPassedCount}/{stage.bestTotalCount} tests</span><ProgressBar value={stage.bestPassedCount} max={stage.bestTotalCount} variant={stage.status === 'completed' ? 'success' : 'cyan'} label={`${stage.stageTitle} best test result`} /></div>}
                  <Button variant={stage.isBoss ? 'danger' : stage.status === 'completed' ? 'secondary' : 'primary'} size="sm" disabled={!open} className="stage-entry__action" onClick={() => open && onEnterChallenge(dungeon.id, stage.id)} icon={stage.isBoss ? <Swords size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}>
                    {!dungeon.isAccessible ? 'Dungeon locked' : stage.status === 'locked' ? 'Stage locked' : stage.status === 'completed' ? 'Review stage' : stage.isBoss ? 'Enter boss encounter' : stage.attempts > 0 ? 'Retry challenge' : 'Enter challenge'}
                  </Button>
                </div>
              </div>;
            })}
          </div>
          {boss && <div className="boss-brief"><Skull size={18} aria-hidden="true" /><span>Final encounter</span><strong>{boss.stageTitle}</strong><span>{boss.attempts > 0 ? `${boss.attempts} recorded attempt${boss.attempts === 1 ? '' : 's'}` : 'No attempts recorded'}</span></div>}
        </Panel>
      </div>
    </main>
  );
}

export default function Dungeons() {
  const { token, isLoading: authLoading } = useAuth();
  const { player } = useProgression();
  const navigate = useNavigate();
  const [dungeons, setDungeons] = useState<Dungeon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDungeonId, setSelectedDungeonId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const fetchDungeons = useCallback(async () => {
    if (authLoading) return;
    const id = ++requestSequence.current;
    if (!token) { setLoading(false); setDungeons([]); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dungeons', { headers: { Authorization: `Bearer ${token}` } });
      const payload: unknown = await res.json();
      if (!res.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string' ? payload.error : `Unable to load dungeon gates (${res.status}).`;
        throw new Error(message);
      }
      const result = payload as { dungeons?: Dungeon[] };
      if (id === requestSequence.current) setDungeons(Array.isArray(result.dungeons) ? result.dungeons : []);
    } catch (cause) {
      if (id === requestSequence.current) setError(cause instanceof Error ? cause.message : 'Unable to load dungeon gates.');
    } finally {
      if (id === requestSequence.current) setLoading(false);
    }
  }, [authLoading, token]);

  useEffect(() => { void fetchDungeons(); }, [fetchDungeons]);

  const selectedDungeon = useMemo(() => dungeons.find((dungeon) => dungeon.id === selectedDungeonId) ?? null, [dungeons, selectedDungeonId]);
  const availableCount = dungeons.filter((dungeon) => dungeon.isAccessible && dungeon.status !== 'completed').length;
  const completedCount = dungeons.filter((dungeon) => dungeon.status === 'completed').length;
  const enterChallenge = useCallback((dungeonId: string, challengeId: string) => navigate(`/dungeon/${dungeonId}/challenge/${challengeId}`), [navigate]);

  if (authLoading || loading) return <main className="dungeons-state-page"><LoadingState label="Scanning dungeon gates" lines={3} /></main>;
  if (!token) return <main className="dungeons-state-page"><EmptyState icon={<LockKeyhole size={24} />} title="Hunter access required" description="Sign in to view dungeon availability and your expedition progress." /></main>;
  if (error) return <main className="dungeons-state-page"><ErrorState message={error} onRetry={() => void fetchDungeons()} retryLabel="Retry dungeon scan" /></main>;
  if (dungeons.length === 0) return <main className="dungeons-state-page"><EmptyState icon={<DoorOpen size={24} />} title="No gates detected" description="The dungeon service returned no available gate records." /></main>;

  if (selectedDungeon) return <DungeonDetail dungeon={selectedDungeon} onBack={() => { setSelectedDungeonId(null); void fetchDungeons(); }} onEnterChallenge={enterChallenge} />;

  return <main className="dungeons-page" aria-label="Dungeon gate command">
    <header className="gate-command">
      <div className="gate-command__copy"><span className="gate-command__eyebrow"><span className="gate-command__pulse" /> HUNTER ASSOCIATION // FIELD INTELLIGENCE</span><h1>DUNGEON <em>GATE</em></h1><p>Unstable territory detected. Review the entry conditions before deploying.</p></div>
      <div className="gate-command__identity"><span>REGISTERED HUNTER</span><RankBadge rank={player.rank} /><strong>Rank clearance</strong></div>
      <div className="gate-command__stats">
        <StatCard label="Known gates" value={dungeons.length} icon={<DoorOpen size={17} />} description="Records returned by the dungeon service" />
        <StatCard label="Accessible" value={availableCount} icon={<CircleDot size={17} />} description="Available or in progress" />
        <StatCard label="Cleared" value={completedCount} icon={<Check size={17} />} description="Completion recorded" />
      </div>
    </header>
    <section className="gate-selection" aria-labelledby="gate-selection-title">
      <div className="gate-section-heading"><div><span>DEPLOYMENT BOARD</span><h2 id="gate-selection-title">Known dungeon gates</h2></div><span className="gate-section-heading__note">Select a gate to inspect its dossier</span></div>
      <div className="dungeons-grid">{dungeons.map((dungeon) => <DungeonCard key={dungeon.id} dungeon={dungeon} selected={false} onSelect={setSelectedDungeonId} />)}</div>
    </section>
    <footer className="gate-command__footer"><RotateCcw size={14} aria-hidden="true" /><span>Gate status and progression are supplied by the dungeon service.</span></footer>
  </main>;
}
