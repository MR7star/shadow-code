/**
 * DungeonSolver.tsx
 *
 * Reuses the existing CodeEditor component and evaluation pipeline.
 * Dungeon-specific differences vs QuestSolver:
 *  - Routes: /dungeon/:dungeonId/challenge/:challengeId
 *  - API calls: /api/dungeons/:dungeonId/challenge/:challengeId/run|submit
 *  - Access validated server-side (prerequisites, unlock order, rank)
 *  - Shows boss attempt status and dungeon completion reward panel
 *  - Victory triggers dungeon-level XP award (server-side, exactly-once)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProgression } from '../context/ProgressionContext';
import { getChallengeById } from '../data/challenges';
import CodeEditor from '../components/editor/CodeEditor';
import { AppIcon } from '../components/ui/AppIcon';
import { Button, Modal, Toast } from '../components/ui';
import type { Dungeon, DungeonChallenge, DungeonSubmitResult } from '../types';
import type { QuestDifficulty } from '../types';
import './QuestSolver.css';   // Reuse existing editor styles
import './Dungeons.css';      // Dungeon-specific styles

const API = '';

// ─── Helpers ─────────────────────────────────────────────────────────────

function getRankColor(difficulty: string): string {
  const map: Record<string, string> = {
    E: 'var(--rank-e, #94a3b8)',
    D: 'var(--rank-d, #34d399)',
    C: 'var(--rank-c, #60a5fa)',
    B: 'var(--rank-b, #a78bfa)',
    A: 'var(--rank-a, #f97316)',
    S: 'var(--rank-s, #f59e0b)',
  };
  return map[difficulty] || 'var(--text-muted)';
}

interface TestCaseResult {
  index: number;
  description: string;
  expected: any;
  actual: any;
  passed: boolean;
  error?: string | null;
  isHidden?: boolean;
  executionTimeMs?: number;
}

// ─── Boss Victory Overlay ─────────────────────────────────────────────────

interface BossVictoryProps {
  dungeon: Dungeon;
  dungeonXpAwarded: number;
  onContinue: () => void;
  onBackToDungeon: () => void;
}

function BossVictoryOverlay({ dungeon, dungeonXpAwarded, onContinue, onBackToDungeon }: BossVictoryProps) {
  return (
    <Modal open title="Dungeon cleared" onClose={onContinue} className="dungeon-victory-modal">
      <div className="dungeon-victory">
        <div className="dungeon-victory__icon"><AppIcon name="crown" size={26} /></div>
        <h2 className="dungeon-victory__title">Dungeon Cleared!</h2>
        <p className="dungeon-victory__subtitle">{dungeon.name} has been conquered.</p>
        <div className="dungeon-victory__rewards">
          {dungeonXpAwarded > 0 && (
            <div className="dungeon-victory__reward">
              <div className="dungeon-victory__reward-label">Bonus XP Earned</div>
              <div className="dungeon-victory__reward-value">+{dungeonXpAwarded.toLocaleString()}</div>
            </div>
          )}
          {dungeon.bonusTitle && (
            <div className="dungeon-victory__reward">
              <div className="dungeon-victory__reward-label">Title</div>
              <div className="dungeon-victory__reward-value" style={{ fontSize: '0.95rem' }}>
                <AppIcon name="trophy" size={15} /> {dungeon.bonusTitle}
              </div>
            </div>
          )}
        </div>
        <div className="dungeon-victory__actions">
          <Button id="boss-victory-back-dungeons" onClick={onBackToDungeon}>
            <AppIcon name="arrowLeft" size={15} /> All Dungeons
          </Button>
          <Button id="boss-victory-continue" variant="secondary" onClick={onContinue}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function DungeonSolver() {
  const { dungeonId, challengeId } = useParams<{ dungeonId: string; challengeId: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated, isLoading: authLoading, openAuthModal } = useAuth();
  const { applyServerAward, refreshProgress } = useProgression();

  // Load challenge metadata from existing frontend data
  const challengeMeta = useMemo(() => getChallengeById(challengeId || ''), [challengeId]);

  // Dungeon state from server
  const [dungeon, setDungeon] = useState<Dungeon | null>(null);
  const [dungeonChallenge, setDungeonChallenge] = useState<DungeonChallenge | null>(null);
  const [dungeonLoading, setDungeonLoading] = useState(true);
  const [dungeonError, setDungeonError] = useState<string | null>(null);

  // Editor state
  const storageKey = `shadow_dungeon_draft_${dungeonId}_${challengeId}`;
  const [code, setCode] = useState<string>(() => {
    try { const s = localStorage.getItem(storageKey); if (s) return s; } catch {}
    return challengeMeta?.starterCode || `def ${challengeId?.replace(/-/g, '_')}():\n    pass\n`;
  });
  const [loadedDraftKey, setLoadedDraftKey] = useState(storageKey);

  // Evaluation state
  const [isRunning, setIsRunning] = useState(false);
  const [evalResult, setEvalResult] = useState<DungeonSubmitResult | null>(null);
  const [activeTab, setActiveTab] = useState<'tests' | 'console'>('tests');
  const [revealedHints, setRevealedHints] = useState<number[]>([]);
  const [runnerStatus, setRunnerStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  // Victory overlay
  const [showVictory, setShowVictory] = useState(false);
  const [completionToast, setCompletionToast] = useState(false);
  const hasPlayedVictory = useRef(false);

  // ── Fetch dungeon ────────────────────────────────────────────────────────

  const fetchDungeon = useCallback(async (signal?: AbortSignal) => {
    if (authLoading) return;
    if (!token) {
      setDungeon(null);
      setDungeonChallenge(null);
      setDungeonError(null);
      setDungeonLoading(false);
      return;
    }
    if (!dungeonId) {
      setDungeonError('Dungeon not found.');
      setDungeonLoading(false);
      return;
    }
    setDungeonLoading(true);
    setDungeonError(null);
    try {
      const res = await fetch(`${API}/api/dungeons/${dungeonId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      const d: Dungeon = data.dungeon;
      if (signal?.aborted) return;
      setDungeon(d);
      const dc = d.challenges.find((c) => c.id === challengeId) || null;
      setDungeonChallenge(dc);
      if (dc && dc.status === 'locked') {
        setDungeonError('This challenge is locked. Complete the previous stage first.');
      }
    } catch (err: any) {
      if (signal?.aborted) return;
      setDungeonError(err.message || 'Failed to load dungeon.');
    } finally {
      if (!signal?.aborted) setDungeonLoading(false);
    }
  }, [authLoading, token, dungeonId, challengeId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchDungeon(controller.signal);
    return () => controller.abort();
  }, [fetchDungeon]);

  // ── Save draft ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (loadedDraftKey !== storageKey) return;
    try { localStorage.setItem(storageKey, code); } catch {}
  }, [code, storageKey, loadedDraftKey]);

  useEffect(() => {
    if (loadedDraftKey === storageKey) return;
    let restoredCode = challengeMeta?.starterCode || `def ${challengeId?.replace(/-/g, '_')}():\n    pass\n`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) restoredCode = saved;
    } catch {}
    setCode(restoredCode);
    setEvalResult(null);
    setActiveTab('tests');
    setRevealedHints([]);
    setLoadedDraftKey(storageKey);
  }, [storageKey, loadedDraftKey, challengeMeta, challengeId]);

  // ── Runner health ────────────────────────────────────────────────────────

  const checkRunnerHealth = useCallback(async (): Promise<boolean> => {
    setRunnerStatus('checking');
    try {
      const res = await fetch(`${API}/api/health`);
      if (res.ok) { setRunnerStatus('online'); return true; }
    } catch {}
    setRunnerStatus('offline');
    return false;
  }, []);

  useEffect(() => { checkRunnerHealth(); }, [checkRunnerHealth]);

  // ── Run code (sample tests only) ─────────────────────────────────────────

  const handleRunCode = useCallback(async () => {
    if (!isAuthenticated) { openAuthModal(); return; }
    if (runnerStatus === 'offline' && !(await checkRunnerHealth())) return;

    setIsRunning(true);
    setEvalResult(null);
    try {
      const res = await fetch(`${API}/api/dungeons/${dungeonId}/challenge/${challengeId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEvalResult({ success: false, allPassed: false, passedCount: 0, totalCount: 0, results: [], isSubmission: false, xpReward: 0, error: data.error || `Server error ${res.status}` });
      } else {
        setEvalResult(data);
        setActiveTab(data.stdout && !data.results?.length ? 'console' : 'tests');
      }
    } catch (err: any) {
      setEvalResult({ success: false, allPassed: false, passedCount: 0, totalCount: 0, results: [], isSubmission: false, xpReward: 0, error: `Connection failed: ${err.message}` });
      setRunnerStatus('offline');
    } finally {
      setIsRunning(false);
    }
  }, [isAuthenticated, openAuthModal, runnerStatus, checkRunnerHealth, token, dungeonId, challengeId, code]);

  // ── Submit solution (hidden tests + XP) ──────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!isAuthenticated) { openAuthModal(); return; }
    if (runnerStatus === 'offline' && !(await checkRunnerHealth())) return;

    setIsRunning(true);
    setEvalResult(null);
    try {
      const res = await fetch(`${API}/api/dungeons/${dungeonId}/challenge/${challengeId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data: DungeonSubmitResult = await res.json();
      if (!res.ok) {
        setEvalResult({ success: false, allPassed: false, passedCount: 0, totalCount: 0, results: [], isSubmission: true, xpReward: 0, error: (data as any).error || `Server error ${res.status}` });
      } else {
        setEvalResult(data);
        setActiveTab('tests');

        // Update dungeon/progression state
        if (data.dungeon) setDungeon(data.dungeon);
        if (data.player) {
          applyServerAward(dungeonId || '', {
            xpReward: data.xpReward || 0,
            isDuplicate: data.isDuplicate,
            leveledUp: false,
            player: data.player,
          });
          refreshProgress();
        }

        // Show dungeon victory screen for boss defeat that completes dungeon
        if (data.allPassed && data.dungeonComplete && !hasPlayedVictory.current) {
          hasPlayedVictory.current = true;
          setCompletionToast(true);
          setTimeout(() => setShowVictory(true), 800);
        }
      }
    } catch (err: any) {
      setEvalResult({ success: false, allPassed: false, passedCount: 0, totalCount: 0, results: [], isSubmission: true, xpReward: 0, error: `Connection failed: ${err.message}` });
      setRunnerStatus('offline');
    } finally {
      setIsRunning(false);
    }
  }, [isAuthenticated, openAuthModal, runnerStatus, checkRunnerHealth, token, dungeonId, challengeId, code, applyServerAward, refreshProgress]);

  // ── Reset draft ───────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    if (window.confirm('Reset code to starter template?')) {
      const starter = challengeMeta?.starterCode || `def solve():\n    pass\n`;
      setCode(starter);
      try { localStorage.removeItem(storageKey); } catch {}
      setEvalResult(null);
    }
  }, [challengeMeta, storageKey]);

  // ─────────────────────────────────────────────────────────────────────────

  const isBoss = dungeonChallenge?.isBoss || false;
  const bossAttempts = dungeonChallenge?.attempts || 0;

  if (authLoading || dungeonLoading) {
    return (
      <div className="dungeons-loading" role="status" aria-label="Loading dungeon challenge">
        <div className="dungeons-loading__spinner" />
        <span>Entering the dungeon…</span>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="dungeons-error" role="status">
        <p>Sign in to access this dungeon challenge.</p>
        <button onClick={openAuthModal}>Sign in</button>
        <button onClick={() => navigate('/dungeons')}><AppIcon name="arrowLeft" size={15} /> Back to Dungeons</button>
      </div>
    );
  }

  if (dungeonError) {
    return (
      <div className="dungeons-error" role="alert">
        <p><AppIcon name="alertTriangle" size={15} /> {dungeonError}</p>
        <button onClick={() => navigate(`/dungeons`)}><AppIcon name="arrowLeft" size={15} /> Back to Dungeons</button>
      </div>
    );
  }

  if (!dungeon || !dungeonChallenge || !challengeMeta) {
    return (
      <div className="dungeons-error">
        <p>Challenge not found.</p>
        <button onClick={() => navigate('/dungeons')}><AppIcon name="arrowLeft" size={15} /> Back to Dungeons</button>
      </div>
    );
  }

  const difficulty = challengeMeta.difficulty as QuestDifficulty;

  return (
    <div className="quest-solver" aria-label={`Dungeon challenge: ${dungeonChallenge.stageTitle}`}>
      {/* Victory overlay for boss + dungeon completion */}
      {completionToast && !showVictory && <div className="dungeon-toast"><Toast variant="success" title="Dungeon completion recorded" message={evalResult?.dungeonXpAwarded ? `${evalResult.dungeonXpAwarded.toLocaleString()} bonus XP awarded by the server.` : 'Completion rewards were processed by the server.'} onClose={() => setCompletionToast(false)} /></div>}
      {showVictory && dungeon && (
        <BossVictoryOverlay
          dungeon={dungeon}
          dungeonXpAwarded={evalResult?.dungeonXpAwarded || 0}
        onContinue={() => { setShowVictory(false); setCompletionToast(false); }}
          onBackToDungeon={() => navigate('/dungeons')}
        />
      )}

      {/* Breadcrumb / back link */}
      <div className="qs-header" style={{ paddingBottom: '0.5rem' }}>
        <button
          id="dungeon-solver-back"
          onClick={() => navigate('/dungeons')}
          style={{
            background: 'none', border: 'none', color: '#a78bfa',
            cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
            padding: 0, display: 'flex', alignItems: 'center', gap: '0.3rem',
          }}
        >
          <AppIcon name="arrowLeft" size={15} /> {dungeon.name}
        </button>
      </div>

      <div className="qs-layout">
        {/* ── Left panel: problem description ─────────────────────────────── */}
        <div className="qs-left">
          {/* Stage header */}
          <div className="qs-meta" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span
                style={{
                  background: isBoss ? 'rgba(239,68,68,0.15)' : 'rgba(167,139,250,0.12)',
                  border: `1px solid ${isBoss ? 'rgba(239,68,68,0.4)' : 'rgba(167,139,250,0.4)'}`,
                  color: isBoss ? '#fca5a5' : '#a78bfa',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '0.4rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                }}
              >
                {isBoss ? <><AppIcon name="alertTriangle" size={14} /> BOSS ENCOUNTER</> : `STAGE ${dungeonChallenge.order}`}
              </span>
              <span
                className="qs-difficulty"
                style={{ color: getRankColor(difficulty) }}
              >
                {difficulty}-Rank
              </span>
            </div>
            <h1 className="qs-title" style={{ color: isBoss ? '#fca5a5' : undefined }}>
              {dungeonChallenge.stageTitle}
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic', marginTop: '0.25rem' }}>
              {dungeonChallenge.stageLore}
            </p>
          </div>

          {/* Encounter status uses recorded attempts; no boss health mechanic exists. */}
          {isBoss && (
            <div className="boss-health">
              <div className="boss-health__header">
                <span className="boss-health__name">Encounter · {dungeonChallenge.stageTitle}</span>
                <span className="boss-health__pct">
                  {dungeonChallenge.status === 'completed' ? 'CLEARED' : 'BOSS STAGE'}
                </span>
              </div>
              <p className="boss-health__attempts">{bossAttempts > 0 ? `${bossAttempts} recorded attempt${bossAttempts !== 1 ? 's' : ''}. ` : 'No attempts recorded. '}Submit a solution to evaluate this encounter.</p>
            </div>
          )}

          {/* Challenge description (from existing challenge data) */}
          <div className="qs-description">
            <h2 className="qs-section-title">Objective</h2>
            <p className="qs-desc-text">{challengeMeta.description}</p>
          </div>

          {/* Learning objectives */}
          {challengeMeta.learningObjectives?.length > 0 && (
            <div className="qs-section">
              <h2 className="qs-section-title">Learning Objectives</h2>
              <ul className="qs-objectives">
                {challengeMeta.learningObjectives.map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Constraints */}
          {challengeMeta.constraints?.length > 0 && (
            <div className="qs-section">
              <h2 className="qs-section-title">Constraints</h2>
              <ul className="qs-constraints">
                {challengeMeta.constraints.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Sample tests */}
          <div className="qs-section">
            <h2 className="qs-section-title">Sample Cases</h2>
            <div className="qs-test-cases">
              {challengeMeta.sampleTests.map((tc, i) => (
                <div key={i} className="qs-test-case">
                  <div className="qs-test-case-header">Example {i + 1}</div>
                  <div className="qs-test-case-row">
                    <span className="qs-tc-label">Input:</span>
                    <code className="qs-tc-value">{tc.inputDescription}</code>
                  </div>
                  <div className="qs-test-case-row">
                    <span className="qs-tc-label">Expected:</span>
                    <code className="qs-tc-value">{JSON.stringify(tc.expected)}</code>
                  </div>
                  {tc.explanation && (
                    <div className="qs-test-case-row">
                      <span className="qs-tc-label">Hint:</span>
                      <span className="qs-tc-hint">{tc.explanation}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Progressive hints */}
          {challengeMeta.hints?.length > 0 && (
            <div className="qs-section">
              <h2 className="qs-section-title">Hints</h2>
              {challengeMeta.hints.map((hint, i) => (
                <div key={i} style={{ marginBottom: '0.5rem' }}>
                  {revealedHints.includes(i) ? (
                    <div
                      style={{
                        background: 'rgba(167,139,250,0.08)',
                        border: '1px solid rgba(167,139,250,0.2)',
                        borderRadius: '0.5rem',
                        padding: '0.6rem 0.85rem',
                        fontSize: '0.85rem',
                        color: '#c4b5fd',
                      }}
                    >
                      <AppIcon name="lightbulb" size={14} /> {hint}
                    </div>
                  ) : (
                    <button
                      id={`hint-reveal-${dungeonId}-${challengeId}-${i}`}
                      onClick={() => setRevealedHints((p) => [...p, i])}
                      style={{
                        background: 'rgba(167,139,250,0.06)',
                        border: '1px solid rgba(167,139,250,0.18)',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 0.85rem',
                        fontSize: '0.8rem',
                        color: '#a78bfa',
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'left',
                      }}
                    >
                      <AppIcon name="search" size={14} /> Reveal Hint {i + 1}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isBoss && <div className="qs-section dungeon-reward-note">
            <strong>Dungeon completion reward</strong>
            <span>+{dungeon.xpReward.toLocaleString()} XP and the title {dungeon.bonusTitle}, awarded automatically when all required stages are complete.</span>
          </div>}
        </div>

        {/* ── Right panel: code editor + results ───────────────────────────── */}
        <div className="qs-right">
          {/* Runner status */}
          {runnerStatus !== 'online' && (
            <div
              className={`qs-runner-status qs-runner-status--${runnerStatus}`}
              role="status"
            >
              {runnerStatus === 'checking' ? <><AppIcon name="refresh" size={14} /> Connecting to Python runner…</> : <><AppIcon name="alertTriangle" size={14} /> Python runner offline — start it with `node server/runner.mjs`</>}
            </div>
          )}

          {/* Editor */}
          <div className="qs-editor-wrapper">
            <div className="qs-editor-header">
              <span className="qs-editor-title">Python</span>
              <div className="qs-editor-actions">
                <button
                  id="dungeon-reset-code"
                  className="qs-btn qs-btn--ghost"
                  onClick={handleReset}
                  disabled={isRunning}
                  aria-label="Reset code to starter template"
                >
                  <AppIcon name="reset" size={14} /> Reset
                </button>
              </div>
            </div>
            <CodeEditor
              value={code}
              onChange={setCode}
              onRun={handleRunCode}
              onReset={handleReset}
              disabled={isRunning}
            />
          </div>

          {/* Run / Submit buttons */}
          <div className="qs-actions">
            <button
              id="dungeon-run-code"
              className="qs-btn qs-btn--secondary"
              onClick={handleRunCode}
              disabled={isRunning || runnerStatus === 'offline'}
              aria-label="Run code against sample tests"
            >
              {isRunning ? <><AppIcon name="refresh" size={14} /> Running…</> : <><AppIcon name="play" size={14} /> Run Code</>}
            </button>
            <button
              id="dungeon-submit-code"
              className={`qs-btn qs-btn--primary${isBoss ? ' qs-btn--boss' : ''}`}
              onClick={handleSubmit}
              disabled={isRunning || runnerStatus === 'offline'}
              aria-label={isBoss ? 'Submit to fight boss' : 'Submit solution'}
              style={isBoss ? {
                background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                boxShadow: '0 0 20px rgba(239,68,68,0.25)',
              } : undefined}
            >
              {isRunning
                ? <><AppIcon name="refresh" size={14} /> {isBoss ? 'Fighting Boss…' : 'Submitting…'}</>
                : isBoss ? <><AppIcon name="swords" size={14} /> Fight Boss</> : <><AppIcon name="arrowUp" size={14} /> Submit Solution</>}
            </button>
          </div>

          {/* Stage-completed banner */}
          {dungeonChallenge.status === 'completed' && !evalResult?.allPassed && (
            <div
              style={{
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: '0.75rem',
                padding: '0.75rem 1rem',
                marginTop: '0.75rem',
                fontSize: '0.875rem',
                color: '#22c55e',
              }}
            >
              <AppIcon name="checkCircle" size={15} /> You already completed this stage!
            </div>
          )}

          {/* Results panel */}
          {evalResult && (
            <div className="qs-results">
              {/* Tabs */}
              <div className="qs-tabs">
                <button
                  id="dungeon-tab-tests"
                  className={`qs-tab${activeTab === 'tests' ? ' qs-tab--active' : ''}`}
                  onClick={() => setActiveTab('tests')}
                >
                  Test Results {evalResult.results?.length > 0 && `(${evalResult.passedCount}/${evalResult.totalCount})`}
                </button>
                {evalResult.stdout && (
                  <button
                    id="dungeon-tab-console"
                    className={`qs-tab${activeTab === 'console' ? ' qs-tab--active' : ''}`}
                    onClick={() => setActiveTab('console')}
                  >
                    Console
                  </button>
                )}
              </div>

              {/* Error banner */}
              {evalResult.error && !evalResult.allPassed && (
                <div className={`qs-error-banner qs-error-banner--${evalResult.errorType || 'runtime'}`}>
                  {evalResult.error}
                </div>
              )}

              {/* Success banner */}
              {evalResult.allPassed && (
                <div className="qs-success-banner">
                  {evalResult.isSubmission ? (
                    <>
                      {isBoss ? <><AppIcon name="skull" size={16} /> Boss Defeated! </> : <><AppIcon name="checkCircle" size={16} /> Stage Complete! </>}
                      {evalResult.xpReward > 0 && !evalResult.isDuplicate && (
                        <span>+{evalResult.xpReward} XP awarded.</span>
                      )}
                      {evalResult.isDuplicate && <span>Already completed — no duplicate XP.</span>}
                    </>
                  ) : (
                    'All sample tests passed! Submit to run hidden tests.'
                  )}
                </div>
              )}

              {/* Test cases */}
              {activeTab === 'tests' && (
                <div className="qs-test-results">
                  {evalResult.results?.map((r: TestCaseResult) => (
                    <div key={r.index} className={`qs-test-result qs-test-result--${r.passed ? 'pass' : 'fail'}`}>
                      <div className="qs-tr-header">
                        <span className={`qs-tr-badge qs-tr-badge--${r.passed ? 'pass' : 'fail'}`}>
                          <AppIcon name={r.passed ? 'checkCircle' : 'circleX'} size={14} />
                        </span>
                        <span className="qs-tr-desc">{r.description}</span>
                        {r.executionTimeMs !== undefined && (
                          <span className="qs-tr-time">{r.executionTimeMs}ms</span>
                        )}
                      </div>
                      {!r.passed && !r.isHidden && (
                        <div className="qs-tr-detail">
                          <div><span className="qs-tr-label">Expected:</span> <code>{JSON.stringify(r.expected)}</code></div>
                          <div><span className="qs-tr-label">Got:</span> <code>{JSON.stringify(r.actual)}</code></div>
                          {r.error && <div className="qs-tr-error">{r.error}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Console output */}
              {activeTab === 'console' && (
                <pre className="qs-console">
                  {evalResult.stdout || '(no output)'}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
