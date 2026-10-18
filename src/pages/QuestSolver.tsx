import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProgression } from '../context/ProgressionContext';
import { useAuth } from '../context/AuthContext';
import { pythonChallenges, getChallengeById } from '../data/challenges';
import CodeEditor from '../components/editor/CodeEditor';
import type { QuestDifficulty } from '../types';
import './QuestSolver.css';

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

interface RunResponse {
  success: boolean;
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  results: TestCaseResult[];
  stdout?: string;
  error?: string | null;
  durationMs?: number;
  isSubmission?: boolean;
  xpReward?: number;
  isDuplicate?: boolean;
  leveledUp?: boolean;
  rankChanged?: boolean;
  player?: {
    level?: number;
    rank?: string;
  };
}

function getRankColor(difficulty: QuestDifficulty): string {
  const map: Record<QuestDifficulty, string> = {
    E: 'var(--rank-e)',
    D: 'var(--rank-d)',
    C: 'var(--rank-c)',
    B: 'var(--rank-b)',
    A: 'var(--rank-a)',
    S: 'var(--rank-s)',
  };
  return map[difficulty] || 'var(--text-muted)';
}

// Level-up sound effect (Japanese-style announcement)
const playLevelUpSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a dramatic level-up fanfare
    const playTone = (freq: number, startTime: number, duration: number, type: OscillatorType = 'sine') => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = audioContext.currentTime;
    
    // Rising arpeggio fanfare (Japanese RPG style)
    playTone(523.25, now, 0.15, 'square');      // C5
    playTone(659.25, now + 0.1, 0.15, 'square'); // E5
    playTone(783.99, now + 0.2, 0.15, 'square'); // G5
    playTone(1046.50, now + 0.3, 0.3, 'square'); // C6 (climax)
    
    // Victory chord
    playTone(523.25, now + 0.5, 0.4, 'triangle'); // C5
    playTone(659.25, now + 0.5, 0.4, 'triangle'); // E5
    playTone(783.99, now + 0.5, 0.4, 'triangle'); // G5
  } catch (e) {
    console.warn('Could not play level-up sound:', e);
  }
};

export default function QuestSolver() {
  const { questId } = useParams<{ questId: string }>();
  const { quests, isQuestClaimed, applyServerAward, refreshProgress, player } = useProgression();
  const { token, isAuthenticated, openAuthModal } = useAuth();
  const hasPlayedLevelUpSound = useRef(false);

  // Find matching challenge
  const challenge = useMemo(() => {
    return getChallengeById(questId || '') || pythonChallenges[0];
  }, [questId]);

  // Draft code persistent storage key
  const storageKey = `shadow_code_draft_${challenge.id}`;

  // User's code state initialized from localStorage draft or starterCode
  const [code, setCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return saved;
    } catch (e) {
      console.warn('Could not read draft from localStorage', e);
    }
    return challenge.starterCode;
  });

  // Auto-save draft on change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, code);
    } catch (e) {
      console.warn('Could not save draft to localStorage', e);
    }
  }, [code, storageKey]);

  // If user switches quest, load matching draft or starter code
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`shadow_code_draft_${challenge.id}`);
      if (saved !== null) {
        setCode(saved);
        return;
      }
    } catch (e) {
      console.warn(e);
    }
    setCode(challenge.starterCode);
  }, [challenge]);

  // Runner service health status
  const [runnerStatus, setRunnerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [isRunning, setIsRunning] = useState(false);
  const [evalResult, setEvalResult] = useState<RunResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'tests' | 'console'>('tests');
  const [revealedHints, setRevealedHints] = useState<number[]>([]);

  // Check runner health
  const checkRunnerHealth = useCallback(async () => {
    setRunnerStatus('checking');
    try {
      // Try direct Vite proxy or direct port
      const res = await fetch('/api/health', { method: 'GET' });
      if (res.ok) {
        setRunnerStatus('online');
        return;
      }
    } catch {
      // Fallback check direct localhost:3001
      try {
        const directRes = await fetch('http://localhost:3001/api/health');
        if (directRes.ok) {
          setRunnerStatus('online');
          return;
        }
      } catch {
        // Runner offline
      }
    }
    setRunnerStatus('offline');
  }, []);

  useEffect(() => {
    checkRunnerHealth();
  }, [checkRunnerHealth]);

  // Check if quest is already completed / claimed
  const alreadyClaimed = isQuestClaimed(challenge.questId);
  const currentQuest = quests.find((q) => q.id === challenge.questId);
  const isCompleted = currentQuest?.status === 'completed';

  // Check prerequisites
  const unmetPrereqs = useMemo(() => {
    if (!challenge.prerequisiteIds || challenge.prerequisiteIds.length === 0) return [];
    return challenge.prerequisiteIds
      .map((pid) => {
        const prereqChal = pythonChallenges.find((c) => c.id === pid);
        const prereqQuest = quests.find((q) => q.id === prereqChal?.questId);
        return {
          id: pid,
          title: prereqChal?.title || pid,
          isCompleted: prereqQuest?.status === 'completed',
        };
      })
      .filter((p) => !p.isCompleted);
  }, [challenge, quests]);

  // Reset code action
  const handleReset = () => {
    if (window.confirm('Reset code to the original starter template? Your current draft will be overwritten.')) {
      setCode(challenge.starterCode);
      localStorage.removeItem(storageKey);
      setEvalResult(null);
    }
  };

  const authHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  // Run Code (Sample tests only)
  const handleRunCode = async () => {
    if (runnerStatus === 'offline') {
      await checkRunnerHealth();
      if (runnerStatus === 'offline') return;
    }

    setIsRunning(true);
    setEvalResult(null);

    try {
      const endpoint = '/api/run';
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ challengeId: challenge.id, code }),
        });
      } catch {
        res = await fetch('http://localhost:3001/api/run', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ challengeId: challenge.id, code }),
        });
      }

      const data = await res.json();
      setEvalResult(data);
      if (data.stdout && (!data.results || data.results.length === 0)) {
        setActiveTab('console');
      } else {
        setActiveTab('tests');
      }
    } catch (err: any) {
      setEvalResult({
        success: false,
        allPassed: false,
        passedCount: 0,
        totalCount: 0,
        results: [],
        error: `Could not connect to code execution runner: ${err.message}`,
      });
      setRunnerStatus('offline');
    } finally {
      setIsRunning(false);
    }
  };

  // Submit Solution (Sample + Hidden tests -> Progression reward)
  const handleSubmitSolution = async () => {
    if (!isAuthenticated) {
      openAuthModal();
      setEvalResult({
        success: false,
        allPassed: false,
        passedCount: 0,
        totalCount: 0,
        results: [],
        error: 'Sign in to submit challenges. XP is only stored for authenticated hunters.',
      });
      return;
    }

    if (runnerStatus === 'offline') {
      await checkRunnerHealth();
      if (runnerStatus === 'offline') return;
    }

    setIsRunning(true);
    setEvalResult(null);

    try {
      const endpoint = '/api/submit';
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ challengeId: challenge.id, code }),
        });
      } catch {
        res = await fetch('http://localhost:3001/api/submit', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ challengeId: challenge.id, code }),
        });
      }

      const data = await res.json();
      if (res.status === 401) {
        openAuthModal();
        setEvalResult({
          success: false,
          allPassed: false,
          passedCount: 0,
          totalCount: 0,
          results: [],
          error: data.error || 'Authentication required to submit solutions.',
        });
        return;
      }

      setEvalResult(data);
      setActiveTab('tests');

      if (data.allPassed) {
        // Play level-up sound if user leveled up
        if (data.leveledUp && !hasPlayedLevelUpSound.current) {
          playLevelUpSound();
          hasPlayedLevelUpSound.current = true;
          // Reset after a delay so subsequent level-ups can also play sound
          setTimeout(() => {
            hasPlayedLevelUpSound.current = false;
          }, 3000);
        }
        
        applyServerAward(challenge.questId, data);
        await refreshProgress();
      } else {
        hasPlayedLevelUpSound.current = false;
      }
    } catch (err: any) {
      setEvalResult({
        success: false,
        allPassed: false,
        passedCount: 0,
        totalCount: 0,
        results: [],
        error: `Could not connect to code execution runner: ${err.message}`,
      });
      setRunnerStatus('offline');
    } finally {
      setIsRunning(false);
    }
  };

  const toggleHint = (index: number) => {
    setRevealedHints((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  return (
    <div className="quest-solver-page">
      {/* Top Bar Navigation & Metadata */}
      <div className="solver-top-bar">
        <Link to="/quests" className="solver-nav-back">
          ← Back to Quests
        </Link>

        <div className="solver-quest-meta-chips">
          <span
            className="solver-rank-chip"
            style={{
              background: `${getRankColor(challenge.difficulty)}22`,
              color: getRankColor(challenge.difficulty),
              border: `1px solid ${getRankColor(challenge.difficulty)}44`,
            }}
          >
            Rank {challenge.difficulty}
          </span>
          <span className="solver-topic-chip">{challenge.category.replace(/-/g, ' ')}</span>
          <span className="solver-xp-chip">+{challenge.xpReward} XP</span>
        </div>

        <div
          className={`solver-runner-status ${
            runnerStatus === 'online' ? 'online' : runnerStatus === 'offline' ? 'offline' : ''
          }`}
          title={
            runnerStatus === 'online'
              ? 'Isolated Python Runner is active and connected'
              : 'Execution Runner is offline'
          }
        >
          <span>{runnerStatus === 'online' ? '🟢' : runnerStatus === 'offline' ? '🔴' : '🟡'}</span>
          <span>
            {runnerStatus === 'online'
              ? 'Runner Ready'
              : runnerStatus === 'offline'
              ? 'Runner Offline'
              : 'Checking...'}
          </span>
        </div>
      </div>

      {/* Main Split Pane */}
      <div className="solver-split-container">
        {/* Left Pane: Challenge Info */}
        <div className="solver-desc-pane">
          <div>
            <h1 className="solver-title">{challenge.title}</h1>
          </div>

          {/* Prerequisite warning if unmet */}
          {unmetPrereqs.length > 0 && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                fontSize: '0.8rem',
                color: 'var(--color-warning)',
              }}
            >
              ⚠️ <strong>Prerequisites recommended:</strong> You have not completed{' '}
              {unmetPrereqs.map((p) => `"${p.title}"`).join(', ')}. You can still attempt this quest!
            </div>
          )}

          {/* Story intro */}
          {challenge.storyIntro && (
            <div className="solver-story-intro">"{challenge.storyIntro}"</div>
          )}

          {/* Problem description */}
          <div>
            <div className="solver-section-heading">📜 Problem Statement</div>
            <div className="solver-body-text">{challenge.description}</div>
          </div>

          {/* Learning Objectives */}
          <div>
            <div className="solver-section-heading">🎯 Learning Objectives</div>
            <div className="solver-objectives-list">
              {challenge.learningObjectives.map((obj, i) => (
                <div key={i} className="solver-objective-item">
                  <span style={{ color: 'var(--accent-cyan)' }}>✓</span>
                  <span>{obj}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Examples */}
          <div>
            <div className="solver-section-heading">💡 Examples</div>
            <div className="solver-examples-list">
              {challenge.sampleTests.map((test, i) => (
                <div key={i} className="solver-example-card">
                  <div className="solver-example-title">Example {i + 1}</div>
                  <div className="solver-example-row">
                    <span className="solver-example-label">Input:</span>
                    <span className="solver-example-val">{test.inputDescription}</span>
                  </div>
                  <div className="solver-example-row">
                    <span className="solver-example-label">Output:</span>
                    <span className="solver-example-val exp">{JSON.stringify(test.expected)}</span>
                  </div>
                  {test.explanation && (
                    <div className="solver-example-expl">Explanation: {test.explanation}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Constraints */}
          <div>
            <div className="solver-section-heading">⚙️ Constraints</div>
            <div className="solver-constraints-list">
              {challenge.constraints.map((c, i) => (
                <div key={i}>• {c}</div>
              ))}
            </div>
          </div>

          {/* Hints */}
          {challenge.hints && challenge.hints.length > 0 && (
            <div>
              <div className="solver-section-heading">🗝️ Hints</div>
              <div className="solver-hints-block">
                {challenge.hints.map((hint, i) => (
                  <div key={i}>
                    <button
                      type="button"
                      className="solver-hint-btn"
                      onClick={() => toggleHint(i)}
                    >
                      <span>Hint {i + 1}</span>
                      <span>{revealedHints.includes(i) ? '▲ Hide' : '▼ Show'}</span>
                    </button>
                    {revealedHints.includes(i) && (
                      <div className="solver-hint-content">{hint}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Pane: Code Editor & Execution Results */}
        <div className="solver-editor-pane">
          {/* Runner Offline Warning Banner */}
          {runnerStatus === 'offline' && (
            <div className="solver-runner-banner">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="solver-runner-banner-icon">⚠️</span>
                <div>
                  <strong>Isolated Execution Runner Offline</strong>
                  <div>
                    Genuine evaluation requires the backend runner. Run{' '}
                    <code>npm run runner</code> in a terminal.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="solver-runner-retry-btn"
                onClick={checkRunnerHealth}
              >
                Retry Connection
              </button>
            </div>
          )}

          {/* Code Editor */}
          <CodeEditor
            value={code}
            onChange={setCode}
            onRun={handleRunCode}
            onReset={handleReset}
            disabled={isRunning}
          />

          {/* Action Bar */}
          <div className="solver-action-bar">
            <div className="solver-action-left">
              <span>Press</span>
              <kbd
                style={{
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--border-default)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                }}
              >
                Ctrl + Enter
              </kbd>
              <span>to run code</span>
            </div>

            <div className="solver-action-right">
              <button
                type="button"
                className="solver-run-btn"
                onClick={handleRunCode}
                disabled={isRunning || runnerStatus === 'offline'}
                title="Run against sample test cases (does not award XP)"
              >
                {isRunning ? '⏳ Running...' : '▶ Run Code'}
              </button>

              <button
                type="button"
                className="solver-submit-btn"
                onClick={handleSubmitSolution}
                disabled={isRunning || runnerStatus === 'offline'}
                title="Run against sample + server-side hidden test cases to earn XP"
              >
                {isRunning ? '⏳ Evaluating...' : '⚔️ Submit Solution'}
              </button>
            </div>
          </div>

          {/* Results Panel */}
          <div className="solver-results-card">
            <div className="solver-results-tabs">
              <button
                type="button"
                className={`solver-tab-btn ${activeTab === 'tests' ? 'active' : ''}`}
                onClick={() => setActiveTab('tests')}
              >
                Test Results{' '}
                {evalResult && evalResult.results && evalResult.results.length > 0 && (
                  <span
                    style={{
                      marginLeft: '6px',
                      fontSize: '0.72rem',
                      color: evalResult.allPassed ? 'var(--color-success)' : 'var(--color-danger)',
                    }}
                  >
                    ({evalResult.passedCount}/{evalResult.totalCount})
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`solver-tab-btn ${activeTab === 'console' ? 'active' : ''}`}
                onClick={() => setActiveTab('console')}
              >
                Console Output
              </button>
            </div>

            <div className="solver-results-body">
              {evalResult === null && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '16px 0' }}>
                  Click <strong>Run Code</strong> to test sample cases, or{' '}
                  <strong>Submit Solution</strong> to evaluate all hidden tests and claim XP.
                </div>
              )}

              {/* Submission Outcome Banners */}
              {evalResult && evalResult.isSubmission && (
                <>
                  {evalResult.allPassed ? (
                    <div className={`solver-feedback-banner success ${evalResult.leveledUp ? 'level-up' : ''}`}>
                      <div className="solver-feedback-icon">
                        {evalResult.leveledUp ? '⚡' : '🎉'}
                      </div>
                      <div className="solver-feedback-text">
                        <span className="solver-feedback-title">
                          {evalResult.leveledUp
                            ? `LEVEL UP! Hunter Level ${evalResult.player?.level || player.level}!`
                            : 'CHALLENGE CONQUERED! All Test Cases Passed!'}
                        </span>
                        <span className="solver-feedback-desc">
                          {evalResult.isDuplicate
                            ? 'All sample and hidden tests verified! (XP was already awarded previously).'
                            : evalResult.leveledUp
                            ? `レベルアップ！Victory! Gained +${evalResult.xpReward ?? challenge.xpReward} XP and advanced to Level ${evalResult.player?.level || player.level}! ${evalResult.rankChanged ? `Rank promoted to ${evalResult.player?.rank || player.rank}!` : ''}`
                            : `Victory! Gained +${evalResult.xpReward ?? challenge.xpReward} XP and unlocked subsequent hunter quests!`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="solver-feedback-banner failed">
                      <div className="solver-feedback-icon">⚔️</div>
                      <div className="solver-feedback-text">
                        <span className="solver-feedback-title">
                          Submission Incomplete ({evalResult.passedCount}/{evalResult.totalCount}{' '}
                          passed)
                        </span>
                        <span className="solver-feedback-desc">
                          Some test cases failed or encountered runtime errors. Check the details
                          below and adjust your logic.
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Sample Run Outcome Banner */}
              {evalResult && !evalResult.isSubmission && (
                <div
                  className={`solver-feedback-banner ${
                    evalResult.allPassed ? 'info' : 'failed'
                  }`}
                >
                  <div className="solver-feedback-icon">
                    {evalResult.allPassed ? '✓' : '⚠️'}
                  </div>
                  <div className="solver-feedback-text">
                    <span className="solver-feedback-title">
                      Sample Run:{' '}
                      {evalResult.allPassed
                        ? 'All sample tests passed!'
                        : `${evalResult.passedCount}/${evalResult.totalCount} sample tests passed`}
                    </span>
                    <span className="solver-feedback-desc">
                      {evalResult.allPassed
                        ? 'Sample tests look good! Click "Submit Solution" to test against hidden server test cases.'
                        : 'Review failed sample cases below.'}
                    </span>
                  </div>
                </div>
              )}

              {/* Active Tab View */}
              {activeTab === 'tests' && evalResult && (
                <div className="solver-test-list">
                  {evalResult.results.map((r) => (
                    <div
                      key={r.index}
                      className={`solver-test-item ${r.passed ? 'passed' : 'failed'}`}
                    >
                      <div className="solver-test-header">
                        <span>
                          {r.isHidden ? '🔒' : '📋'} {r.description}
                        </span>
                        <span className={`solver-test-status ${r.passed ? 'passed' : 'failed'}`}>
                          {r.passed ? 'PASSED' : 'FAILED'}
                        </span>
                      </div>

                      <div className="solver-test-io-grid">
                        <div className="solver-test-io-box">
                          <span className="solver-test-io-label">Expected Output:</span>
                          <span>{JSON.stringify(r.expected)}</span>
                        </div>
                        <div
                          className={`solver-test-io-box actual ${
                            !r.passed ? 'err' : ''
                          }`}
                        >
                          <span className="solver-test-io-label">Actual Return:</span>
                          <span>
                            {r.error ? r.error : JSON.stringify(r.actual)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'console' && evalResult && (
                <div>
                  <div className="solver-console-output">
                    {evalResult.stdout ? (
                      <div>{evalResult.stdout}</div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>
                        No print output captured from stdout.
                      </div>
                    )}
                    {evalResult.error && (
                      <div className="solver-console-error">
                        {evalResult.error}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quest completion badge if already completed */}
              {isCompleted && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    color: 'var(--color-success)',
                    marginTop: '8px',
                  }}
                >
                  <span>✓</span>
                  <span>
                    Quest status: <strong>Completed</strong>{' '}
                    {alreadyClaimed && '(Reward Claimed)'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
