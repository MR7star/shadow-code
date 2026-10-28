import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Dungeon, DungeonChallenge } from '../types';
import './Dungeons.css';

const API = 'http://localhost:3001';

// ─── Helpers ─────────────────────────────────────────────────────────────

function difficultyLabel(d: string) {
  const map: Record<string, string> = { E: 'E-Rank', D: 'D-Rank', C: 'C-Rank', B: 'B-Rank', A: 'A-Rank', S: 'S-Rank' };
  return map[d] || d;
}

function stageIcon(dc: DungeonChallenge): string {
  if (dc.isBoss) {
    if (dc.status === 'completed') return '💀';
    if (dc.status === 'available') return '👹';
    return '🔒';
  }
  if (dc.status === 'completed') return '✓';
  if (dc.status === 'available') return String(dc.order);
  return '🔒';
}

function stageIconClass(dc: DungeonChallenge): string {
  if (dc.isBoss) {
    if (dc.status === 'completed') return 'boss-completed';
    if (dc.status === 'available') return 'boss-available';
    return 'boss-locked';
  }
  return dc.status;
}

function stageActionLabel(dc: DungeonChallenge): string {
  if (dc.status === 'locked') return 'Locked';
  if (dc.status === 'completed') return dc.isBoss ? 'Defeated ✓' : 'Completed ✓';
  if (dc.isBoss) return dc.attempts > 0 ? `Retry Boss` : 'Fight Boss';
  return dc.attempts > 0 ? 'Retry' : 'Enter';
}

function stageActionClass(dc: DungeonChallenge): string {
  if (dc.status === 'locked') return 'locked';
  if (dc.status === 'completed') return 'done';
  if (dc.isBoss) return dc.attempts > 0 ? 'fight' : 'fight';
  return dc.attempts > 0 ? 'retry' : 'enter';
}

// ─── DungeonCard (grid view) ─────────────────────────────────────────────

interface DungeonCardProps {
  dungeon: Dungeon;
  onEnter: (dungeonId: string) => void;
}

function DungeonCard({ dungeon, onEnter }: DungeonCardProps) {
  const isLocked = !dungeon.isAccessible;
  const sorted = [...dungeon.challenges].sort((a, b) => a.order - b.order);

  return (
    <div
      id={`dungeon-card-${dungeon.id}`}
      className={`dungeon-card dungeon-card--${dungeon.status}${isLocked ? ' dungeon-card--locked' : ''}`}
      onClick={() => !isLocked && onEnter(dungeon.id)}
      role="button"
      tabIndex={isLocked ? -1 : 0}
      aria-label={`${dungeon.name} dungeon — ${dungeon.status}`}
      onKeyDown={(e) => { if (!isLocked && (e.key === 'Enter' || e.key === ' ')) onEnter(dungeon.id); }}
    >
      {/* Difficulty colour stripe */}
      <div className={`dungeon-card__banner dungeon-card__banner--${dungeon.difficulty}`} />

      <div className="dungeon-card__body">
        <div className="dungeon-card__header">
          <h3 className="dungeon-card__title">{dungeon.name}</h3>
          <div className="dungeon-card__badges">
            <span className={`badge badge--difficulty-${dungeon.difficulty}`}>{difficultyLabel(dungeon.difficulty)}</span>
            <span className={`badge badge--status-${dungeon.status}`}>
              {dungeon.status === 'in-progress' ? 'In Progress' : dungeon.status.charAt(0).toUpperCase() + dungeon.status.slice(1)}
            </span>
          </div>
        </div>

        <p className="dungeon-card__description">{dungeon.description}</p>

        {isLocked && dungeon.lockReason && (
          <div className="dungeon-card__lock">
            <span className="dungeon-card__lock-icon">🔒</span>
            {dungeon.lockReason}
          </div>
        )}

        {!isLocked && dungeon.status !== 'available' && (
          <div className="dungeon-card__progress">
            <div className="dungeon-card__progress-label">
              <span>Progress</span>
              <span>{dungeon.completedRequired}/{dungeon.totalRequired} stages</span>
            </div>
            <div className="dungeon-card__progress-bar">
              <div
                className={`dungeon-card__progress-fill${dungeon.status === 'completed' ? ' dungeon-card__progress-fill--completed' : ''}`}
                style={{ width: `${dungeon.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Mini stage map */}
        <div className="dungeon-card__stages" aria-label="Dungeon stages">
          {sorted.map((dc, i) => (
            <span key={dc.id} style={{ display: 'contents' }}>
              {i > 0 && (
                <div className={`stage-connector${dc.status === 'completed' ? ' stage-connector--completed' : ''}`} />
              )}
              <div
                className={`stage-node stage-node--${dc.status}${dc.isBoss ? ' stage-node--boss' : ''}`}
                title={dc.stageTitle}
              >
                {stageIcon(dc)}
              </div>
            </span>
          ))}
        </div>

        <div className="dungeon-card__footer">
          <span className="dungeon-card__xp">⚡ <span>{dungeon.xpReward.toLocaleString()}</span> XP Reward</span>
          <button
            id={`dungeon-enter-${dungeon.id}`}
            className={`dungeon-card__enter-btn dungeon-card__enter-btn--${isLocked ? 'locked' : dungeon.status}`}
            onClick={(e) => { e.stopPropagation(); !isLocked && onEnter(dungeon.id); }}
            disabled={isLocked}
            aria-label={isLocked ? 'Dungeon locked' : `Enter ${dungeon.name}`}
          >
            {isLocked ? '🔒 Locked' : dungeon.status === 'completed' ? '↩ Revisit' : dungeon.status === 'in-progress' ? '▶ Continue' : '▶ Enter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DungeonDetail (map view) ─────────────────────────────────────────────

interface DungeonDetailProps {
  dungeon: Dungeon;
  onBack: () => void;
  onEnterChallenge: (dungeonId: string, challengeId: string) => void;
}

function DungeonDetail({ dungeon, onBack, onEnterChallenge }: DungeonDetailProps) {
  const sorted = [...dungeon.challenges].sort((a, b) => a.order - b.order);
  const bossChallenge = dungeon.challenges.find((c) => c.isBoss);
  const bossAttempts = bossChallenge?.attempts || 0;
  const bossHealthPct = bossChallenge?.status === 'completed' ? 0 : Math.max(10, 100 - bossAttempts * 15);

  return (
    <div className="dungeon-detail">
      <button
        id="dungeon-back-btn"
        className="dungeon-detail__back"
        onClick={onBack}
        aria-label="Back to dungeon list"
      >
        ← Back to Dungeons
      </button>

      {/* Hero section */}
      <div className="dungeon-detail__hero">
        <div className="dungeon-detail__hero-top">
          <div>
            <h1 className="dungeon-detail__name">{dungeon.name}</h1>
            <p className="dungeon-detail__rank-req">
              Requires: <strong>{dungeon.requiredRank}</strong>
            </p>
          </div>
          <span className={`badge badge--difficulty-${dungeon.difficulty}`}>{difficultyLabel(dungeon.difficulty)}</span>
        </div>

        <p className="dungeon-detail__lore">{dungeon.lore}</p>

        <div className="dungeon-detail__stats">
          <div className="dungeon-detail__stat">
            <span className="dungeon-detail__stat-label">XP Reward</span>
            <span className="dungeon-detail__stat-value dungeon-detail__stat-value--xp">⚡ {dungeon.xpReward.toLocaleString()}</span>
          </div>
          <div className="dungeon-detail__stat">
            <span className="dungeon-detail__stat-label">Stages</span>
            <span className="dungeon-detail__stat-value">{dungeon.totalRequired}</span>
          </div>
          <div className="dungeon-detail__stat">
            <span className="dungeon-detail__stat-label">Status</span>
            <span className={`dungeon-detail__stat-value dungeon-detail__stat-value--${dungeon.status === 'completed' ? 'complete' : 'progress'}`}>
              {dungeon.status === 'completed' ? '✓ Cleared' : dungeon.status === 'in-progress' ? 'In Progress' : dungeon.status.charAt(0).toUpperCase() + dungeon.status.slice(1)}
            </span>
          </div>
          {dungeon.bonusTitle && dungeon.status === 'completed' && (
            <div className="dungeon-detail__stat">
              <span className="dungeon-detail__stat-label">Title Earned</span>
              <span className="dungeon-detail__stat-value" style={{ color: '#f59e0b' }}>🏆 {dungeon.bonusTitle}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {dungeon.status !== 'available' && (
        <div className="dungeon-detail__progress">
          <div className="dungeon-detail__progress-header">
            <span className="dungeon-detail__progress-title">Dungeon Progress</span>
            <span className="dungeon-detail__progress-pct">{dungeon.progressPercent}%</span>
          </div>
          <div className="dungeon-detail__progress-bar">
            <div
              className={`dungeon-detail__progress-fill${dungeon.status === 'completed' ? ' dungeon-detail__progress-fill--complete' : ''}`}
              style={{ width: `${dungeon.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Boss health bar (only when boss is available or attempted) */}
      {bossChallenge && (bossChallenge.status === 'available' || bossAttempts > 0) && (
        <div className="boss-health" aria-label="Boss health bar">
          <div className="boss-health__header">
            <span className="boss-health__name">👹 {bossChallenge.stageTitle}</span>
            <span className="boss-health__pct">{bossChallenge.status === 'completed' ? 'DEFEATED' : `${bossHealthPct}% HP`}</span>
          </div>
          <div className="boss-health__bar">
            <div
              className="boss-health__fill"
              style={{ width: `${bossChallenge.status === 'completed' ? 0 : bossHealthPct}%` }}
            />
          </div>
          {bossAttempts > 0 && (
            <p className="boss-health__attempts">
              {bossChallenge.status === 'completed'
                ? `Defeated after ${bossAttempts} attempt${bossAttempts > 1 ? 's' : ''}`
                : `Failed attempts: ${bossAttempts} — each failed attempt damages the boss`}
            </p>
          )}
        </div>
      )}

      {/* Victory screen if dungeon completed */}
      {dungeon.status === 'completed' && (
        <div className="dungeon-victory" role="region" aria-label="Dungeon cleared">
          <div className="dungeon-victory__icon">🏆</div>
          <h2 className="dungeon-victory__title">Dungeon Cleared!</h2>
          <p className="dungeon-victory__subtitle">{dungeon.name} has been conquered.</p>
          <div className="dungeon-victory__rewards">
            <div className="dungeon-victory__reward">
              <div className="dungeon-victory__reward-label">Bonus XP</div>
              <div className="dungeon-victory__reward-value">+{dungeon.xpReward.toLocaleString()}</div>
            </div>
            {dungeon.bonusTitle && (
              <div className="dungeon-victory__reward">
                <div className="dungeon-victory__reward-label">Title</div>
                <div className="dungeon-victory__reward-value" style={{ fontSize: '1rem' }}>🏆 {dungeon.bonusTitle}</div>
              </div>
            )}
          </div>
          <div className="dungeon-victory__actions">
            <button
              id="dungeon-victory-back"
              className="dungeon-victory__btn dungeon-victory__btn--secondary"
              onClick={onBack}
            >
              ← All Dungeons
            </button>
          </div>
        </div>
      )}

      {/* Stage map */}
      <div className="dungeon-map" role="list" aria-label="Dungeon stages">
        <h2 className="dungeon-map__title">Encounter Sequence</h2>
        {sorted.map((dc, i) => {
          return (
            <span key={dc.id} style={{ display: 'contents' }}>
              {i > 0 && (
                <div
                  className={`dungeon-map__connector${sorted[i - 1].status === 'completed' ? ' dungeon-map__connector--done' : ''}`}
                />
              )}
              <div
                id={`dungeon-stage-${dungeon.id}-${dc.id}`}
                className={`dungeon-stage dungeon-stage--${dc.status}${dc.isBoss ? ' dungeon-stage--boss' : ''}`}
                role="listitem"
                onClick={() => {
                  if (dc.status !== 'locked') onEnterChallenge(dungeon.id, dc.id);
                }}
                tabIndex={dc.status !== 'locked' ? 0 : -1}
                onKeyDown={(e) => {
                  if (dc.status !== 'locked' && (e.key === 'Enter' || e.key === ' ')) onEnterChallenge(dungeon.id, dc.id);
                }}
                aria-label={`${dc.stageTitle} — ${dc.status}`}
              >
                <div className={`dungeon-stage__icon dungeon-stage__icon--${stageIconClass(dc)}`}>
                  {stageIcon(dc)}
                </div>
                <div className="dungeon-stage__info">
                  <div className="dungeon-stage__order">
                    {dc.isBoss ? '⚠ Boss Encounter' : `Stage ${dc.order}`}
                  </div>
                  <h3 className="dungeon-stage__title">{dc.stageTitle}</h3>
                  <p className="dungeon-stage__lore">{dc.stageLore}</p>
                </div>
                <div className="dungeon-stage__meta">
                  {dc.attempts > 0 && (
                    <span className="dungeon-stage__attempts">
                      {dc.status === 'completed'
                        ? `Cleared in ${dc.attempts} attempt${dc.attempts > 1 ? 's' : ''}`
                        : `${dc.attempts} failed attempt${dc.attempts > 1 ? 's' : ''}`}
                    </span>
                  )}
                  <button
                    id={`stage-action-${dungeon.id}-${dc.id}`}
                    className={`dungeon-stage__action dungeon-stage__action--${stageActionClass(dc)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dc.status !== 'locked') onEnterChallenge(dungeon.id, dc.id);
                    }}
                    disabled={dc.status === 'locked'}
                    aria-label={`${stageActionLabel(dc)} — ${dc.stageTitle}`}
                  >
                    {stageActionLabel(dc)}
                  </button>
                </div>
              </div>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Dungeons Page ───────────────────────────────────────────────────

export default function Dungeons() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [dungeons, setDungeons] = useState<Dungeon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDungeonId, setSelectedDungeonId] = useState<string | null>(null);

  const fetchDungeons = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/dungeons`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setDungeons(data.dungeons || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load dungeons.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchDungeons(); }, [fetchDungeons]);

  const handleEnterDungeon = useCallback((dungeonId: string) => {
    setSelectedDungeonId(dungeonId);
  }, []);

  const handleEnterChallenge = useCallback(
    (dungeonId: string, challengeId: string) => {
      navigate(`/dungeon/${dungeonId}/challenge/${challengeId}`);
    },
    [navigate]
  );

  const handleBack = useCallback(() => {
    setSelectedDungeonId(null);
    fetchDungeons();
  }, [fetchDungeons]);

  if (!token) {
    return (
      <div className="dungeons-error">
        <p>🔒 Sign in to access dungeons.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dungeons-loading" role="status" aria-label="Loading dungeons">
        <div className="dungeons-loading__spinner" />
        <span>Scanning dungeon gates…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dungeons-error" role="alert">
        <p>⚠ {error}</p>
        <button onClick={fetchDungeons}>Retry</button>
      </div>
    );
  }

  // Detail view
  if (selectedDungeonId) {
    const dungeon = dungeons.find((d) => d.id === selectedDungeonId);
    if (!dungeon) return null;
    return (
      <DungeonDetail
        dungeon={dungeon}
        onBack={handleBack}
        onEnterChallenge={handleEnterChallenge}
      />
    );
  }

  // Grid view
  return (
    <main className="dungeons-page" aria-label="Dungeons">
      <div className="dungeons-header">
        <h1>🏰 Programming Dungeons</h1>
        <p>Conquer sequences of challenges and defeat Boss encounters to earn bonus XP and legendary titles.</p>
      </div>
      <div className="dungeons-grid" role="list" aria-label="Dungeon list">
        {dungeons.map((dungeon) => (
          <DungeonCard
            key={dungeon.id}
            dungeon={dungeon}
            onEnter={handleEnterDungeon}
          />
        ))}
      </div>
    </main>
  );
}
