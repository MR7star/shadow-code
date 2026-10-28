import { useState, useEffect, useCallback, useMemo } from 'react';
import { useProgression } from '../context/ProgressionContext';
import CodeEditor from '../components/editor/CodeEditor';
import type { PromotionTrialEligibility } from '../types';
import './PromotionTrials.css';

const RANK_ORDER: string[] = [
  'E-Rank',
  'D-Rank',
  'C-Rank',
  'B-Rank',
  'A-Rank',
  'S-Rank',
  'National Level',
  'Monarch',
];

function getRankColor(rank: string): string {
  const map: Record<string, string> = {
    'E-Rank': 'var(--rank-e)',
    'D-Rank': 'var(--rank-d)',
    'C-Rank': 'var(--rank-c)',
    'B-Rank': 'var(--rank-b)',
    'A-Rank': 'var(--rank-a)',
    'S-Rank': 'var(--rank-s)',
    'National Level': 'var(--rank-national)',
    Monarch: 'var(--rank-monarch)',
  };
  return map[rank] || 'var(--rank-d)';
}

export default function PromotionTrials() {
  const { player, promotionTrials, refreshPromotions, attemptPromotion } = useProgression();

  const [selectedTrialId, setSelectedTrialId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [showSuccess, setShowSuccess] = useState<{ trial: PromotionTrialEligibility; newRank: string } | null>(null);
  const [attemptResult, setAttemptResult] = useState<any>(null);

  useEffect(() => {
    void refreshPromotions();
  }, [refreshPromotions]);

  const currentRankIndex = RANK_ORDER.indexOf(player.rank);
  const nextRank = currentRankIndex >= 0 ? RANK_ORDER[currentRankIndex + 1] : null;
  const selectedTrial = useMemo(() => promotionTrials.find((t) => t.id === selectedTrialId), [promotionTrials, selectedTrialId]);

  const handleAttempt = useCallback(
    (trial: PromotionTrialEligibility) => {
      if (!code.trim()) return;
      setIsRunning(true);
      setAttemptResult(null);

      void attemptPromotion(trial.id, code).then((result) => {
        setAttemptResult(result);
        setIsRunning(false);
        if (result.success && result.newRank) {
          setShowSuccess({ trial, newRank: result.newRank });
        }
      });
    },
    [code, attemptPromotion]
  );

  const handleReset = () => {
    setCode('');
    setAttemptResult(null);
  };

  const handleTryAgain = () => {
    setShowSuccess(null);
    setAttemptResult(null);
    void refreshPromotions();
  };

  return (
    <div className="promotion-trials-page">
      <header className="promotion-header">
        <h1 className="promotion-title">Rank Promotion Trials</h1>
        <p className="promotion-subtitle">
          Prove your mastery to advance to the next hunter rank.
        </p>
      </header>

      {/* Current Rank + Progress */}
      <div className="promotion-rank-card stagger-children">
        <div className="promotion-rank-info">
          <div className="promotion-rank-badge" style={{ color: getRankColor(player.rank), border: `1px solid ${getRankColor(player.rank)}44` }}>
            {player.rank}
          </div>
          <div className="promotion-rank-title">{player.title}</div>
          <div className="promotion-rank-hunter">
            Hunter Level {player.level} • {player.xp.toLocaleString()} / {player.xpToNextLevel.toLocaleString()} XP
          </div>
        </div>
        <div className="promotion-rank-progress">
          <div className="promotion-rank-progress-label">
            <span>To Next Rank</span>
            <span>{nextRank || 'MAX RANK'}</span>
          </div>
          <div className="promotion-rank-progress-bar">
            <div
              className="promotion-rank-progress-fill"
              style={{
                width: `${Math.min(100, (player.xp / player.xpToNextLevel) * 100)}%`,
                background: getRankColor(nextRank || player.rank),
              }}
            />
          </div>
        </div>
      </div>

      {/* Trials List */}
      <section className="promotion-trials-section">
        <div className="promotion-section-header">
          <h2>Promotion Trials</h2>
          <p>Complete the trial for your current rank to advance.</p>
        </div>

        <div className="promotion-trial-cards">
          {promotionTrials.map((trial) => {
            const isCurrent = trial.fromRank === player.rank;
            const isLocked = trial.status === 'locked';
            const isCompleted = trial.status === 'completed';
            const available = isCurrent && trial.eligible && !isCompleted;

            return (
              <div
                key={trial.id}
                className={`promotion-trial-card ${isLocked ? 'locked' : available ? 'available' : 'completed'}`}
                onClick={() => {
                  if (available) setSelectedTrialId(trial.id);
                }}
                role="button"
                tabIndex={available ? 0 : -1}
                aria-label={`${trial.title} — ${isLocked ? 'locked' : isCompleted ? 'completed' : 'available'}`}
              >
                <div className="promotion-trial-header">
                  <div className="promotion-trial-rank-chip">
                    {trial.fromRank} → {trial.toRank}
                  </div>
                  <div className="promotion-trial-status-badge">
                    {isLocked ? '🔒 Locked' : isCompleted ? '✅ Completed' : available ? '⚔️ Available' : 'Coming Soon'}
                  </div>
                </div>
                <h3 className="promotion-trial-title">{trial.title}</h3>
                <p className="promotion-trial-desc">{trial.description}</p>

                <div className="promotion-trial-requirements">
                  <div className="promotion-req">
                    <span>Level Requirement:</span>
                    <span className={trial.levelMet ? 'promotion-req-met' : 'promotion-req-unmet'}>
                      {trial.levelMet ? '✓' : '✗'} Level {trial.requiredLevel}
                    </span>
                  </div>
                  <div className="promotion-req">
                    <span>Mastered Challenges:</span>
                    <span className={trial.challengesMet ? 'promotion-req-met' : 'promotion-req-unmet'}>
                      {trial.challengesMet ? '✓' : '✗'}
                    </span>
                  </div>
                  <div className="promotion-req">
                    <span>Concept Mastery:</span>
                    <span className={trial.conceptsMet ? 'promotion-req-met' : 'promotion-req-unmet'}>
                      {trial.conceptsMet ? '✓' : '✗'}
                    </span>
                  </div>
                </div>

                {trial.lockReason && (
                  <div className="promotion-trial-lock-reason">
                    {trial.lockReason}
                  </div>
                )}

                <div className="promotion-trial-footer">
                  {trial.attempts > 0 && (
                    <span className="promotion-trial-attempts">
                      Attempts: {trial.attempts}
                    </span>
                  )}
                  {available && (
                    <button
                      type="button"
                      className="promotion-trial-btn"
                      onClick={() => setSelectedTrialId(trial.id)}
                    >
                      Attempt Trial
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Trial Detail / Attempt Panel */}
      {selectedTrial && (
        <div className="promotion-trial-detail">
          <button
            type="button"
            className="promotion-detail-close"
            onClick={() => {
              setSelectedTrialId(null);
              setAttemptResult(null);
            }}
            aria-label="Close trial detail"
          >
            ✕
          </button>

          <div className="promotion-detail-header">
            <h2>{selectedTrial.title}</h2>
            <span className="promotion-detail-rank">
              {selectedTrial.fromRank} → {selectedTrial.toRank}
            </span>
          </div>

          <p className="promotion-detail-desc">{selectedTrial.description}</p>

          <div className="promotion-detail-requirements">
            <h3>Trial Requirements</h3>
            <div className="promotion-req-checklist">
              <div className={`promotion-req-item ${selectedTrial.levelMet ? 'met' : 'unmet'}`}>
                <span className="promotion-req-icon">{selectedTrial.levelMet ? '✓' : '○'}</span>
                <span>Hunter Level {selectedTrial.requiredLevel} (current: {selectedTrial.currentLevel})</span>
              </div>
              <div className={`promotion-req-item ${selectedTrial.challengesMet ? 'met' : 'unmet'}`}>
                <span className="promotion-req-icon">{selectedTrial.challengesMet ? '✓' : '○'}</span>
                <span>
                  Mastered: {selectedTrial.requiredMasteredChallenges.join(', ')}
                </span>
              </div>
              <div className={`promotion-req-item ${selectedTrial.conceptsMet ? 'met' : 'unmet'}`}>
                <span className="promotion-req-icon">{selectedTrial.conceptsMet ? '✓' : '○'}</span>
                <span>
                  Concept Mastery: {Object.entries(selectedTrial.requiredConceptMastery).map(([c, l]) => `${c} Lv.${l}`).join(', ')}
                </span>
              </div>
            </div>
          </div>

          {/* Challenge Section */}
          <div className="promotion-challenge-section">
            <h3>Trial Challenge</h3>
            <div className="promotion-challenge-info">
              <span className="promotion-challenge-title">{selectedTrial.trialChallengeId}</span>
              <span className="promotion-challenge-desc">
                Complete the {selectedTrial.trialChallengeId} challenge with all test cases passing.
              </span>
            </div>
          </div>

          {/* Code Editor */}
          <div className="promotion-editor-pane">
            <CodeEditor
              value={code}
              onChange={setCode}
              disabled={isRunning}
            />
            <div className="promotion-action-bar">
              <button
                type="button"
                className="promotion-btn-reset"
                onClick={handleReset}
                disabled={isRunning}
              >
                ↺ Reset
              </button>
              <button
                type="button"
                className={`promotion-btn-attempt ${isRunning ? 'running' : ''} ${!selectedTrial.eligible ? 'disabled' : ''}`}
                onClick={() => handleAttempt(selectedTrial)}
                disabled={isRunning || !selectedTrial.eligible}
              >
                {isRunning ? '⏳ Evaluating...' : '⚔️ Attempt Promotion'}
              </button>
              {attemptResult && !attemptResult.success && (
                <div className="promotion-attempt-error">
                  <span>⚡ {attemptResult.error}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success Screen */}
      {showSuccess && (
        <div className="promotion-success-overlay">
          <div className="promotion-success-card">
            <div className="promotion-success-icon">🏆</div>
            <h2 className="promotion-success-title">PROMOTION GRANTED</h2>
            <div className="promotion-rank-change">
              <span className="promotion-rank-old">{showSuccess.trial.fromRank}</span>
              <span className="promotion-rank-arrow">→</span>
              <span className="promotion-rank-new">{showSuccess.newRank}</span>
            </div>
            <p className="promotion-success-desc">
              You have proven your mastery and earned the rank of <strong>{showSuccess.newRank}</strong>.
            </p>
            <div className="promotion-success-stats">
              <div className="promotion-stat">
                <span className="promotion-stat-label">XP Preserved</span>
                <span className="promotion-stat-value">{player.xp.toLocaleString()}</span>
              </div>
              <div className="promotion-stat">
                <span className="promotion-stat-label">Level Preserved</span>
                <span className="promotion-stat-value">{player.level}</span>
              </div>
              <div className="promotion-stat">
                <span className="promotion-stat-label">Trial Attempts</span>
                <span className="promotion-stat-value">{attemptResult?.attempts || 1}</span>
              </div>
            </div>
            <button
              type="button"
              className="promotion-btn-continue"
              onClick={handleTryAgain}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
