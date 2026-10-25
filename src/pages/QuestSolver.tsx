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
  errorType?: 'syntax' | 'runtime' | 'timeout' | 'incorrect_output' | null;
  durationMs?: number;
  isSubmission?: boolean;
  isPractice?: boolean;
  xpReward?: number;
  isDuplicate?: boolean;
  leveledUp?: boolean;
  rankChanged?: boolean;
  player?: {
    level?: number;
    rank?: string;
  };
  masteryMessage?: string;
}

interface LessonContent {
  conceptExplanation: string;
  codeExample: string;
  workedExample: {
    input: string;
    steps: string[];
    output: any;
  };
  commonMistakes: string[];
  progressiveHints: string[];
}

interface ChallengeWithLesson {
  id: string;
  questId: string;
  title: string;
  difficulty: QuestDifficulty;
  category: string;
  xpReward: number;
  estimatedMinutes: number;
  description: string;
  storyIntro: string;
  prerequisiteIds: string[];
  learningObjectives: string[];
  constraints: string[];
  hints: string[];
  functionName: string;
  starterCode: string;
  sampleTests: any[];
  lesson?: LessonContent;
  practiceChallengeId?: string;
  isPractice?: boolean;
  conceptId?: string;
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

const playLevelUpSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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
    playTone(523.25, now, 0.15, 'square');
    playTone(659.25, now + 0.1, 0.15, 'square');
    playTone(783.99, now + 0.2, 0.15, 'square');
    playTone(1046.50, now + 0.3, 0.3, 'square');
    playTone(523.25, now + 0.5, 0.4, 'triangle');
    playTone(659.25, now + 0.5, 0.4, 'triangle');
    playTone(783.99, now + 0.5, 0.4, 'triangle');
  } catch (e) {
    console.warn('Could not play level-up sound:', e);
  }
};

export default function QuestSolver() {
  const { questId } = useParams<{ questId: string }>();
  const { quests, isQuestClaimed, applyServerAward, refreshProgress, player, conceptMastery } = useProgression();
  const { token, isAuthenticated, openAuthModal } = useAuth();
  const hasPlayedLevelUpSound = useRef(false);

  const challenge = useMemo(() => {
    return getChallengeById(questId || '') as ChallengeWithLesson | undefined || pythonChallenges[0] as ChallengeWithLesson;
  }, [questId]);

  const storageKey = `shadow_code_draft_${challenge.id}`;

  const [code, setCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return saved;
    } catch (e) {
      console.warn('Could not read draft from localStorage', e);
    }
    return challenge.starterCode;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, code);
    } catch (e) {
      console.warn('Could not save draft to localStorage', e);
    }
  }, [code, storageKey]);

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

  const [runnerStatus, setRunnerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [isRunning, setIsRunning] = useState(false);
  const [evalResult, setEvalResult] = useState<RunResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'tests' | 'console'>('tests');
  // Separate state for progressive hints (lesson panel) vs legacy quick hints
  const [revealedProgressiveHints, setRevealedProgressiveHints] = useState<number[]>([]);
  const [revealedQuickHints, setRevealedQuickHints] = useState<number[]>([]);
  const [learningMode, setLearningMode] = useState(false);
  const [lessonSection, setLessonSection] = useState<'concept' | 'example' | 'worked' | 'mistakes' | 'hints'>('concept');
  const [showPracticeChallenge, setShowPracticeChallenge] = useState(false);

  const checkRunnerHealth = useCallback(async () => {
    setRunnerStatus('checking');
    try {
      const res = await fetch('/api/health', { method: 'GET' });
      if (res.ok) {
        setRunnerStatus('online');
        return;
      }
    } catch {
      try {
        const directRes = await fetch('http://localhost:3001/api/health');
        if (directRes.ok) {
          setRunnerStatus('online');
          return;
        }
      } catch {
      }
    }
    setRunnerStatus('offline');
  }, []);

  useEffect(() => {
    checkRunnerHealth();
  }, [checkRunnerHealth]);

  const alreadyClaimed = isQuestClaimed(challenge.questId);
  const currentQuest = quests.find((q) => q.id === challenge.questId);
  const isCompleted = currentQuest?.status === 'completed';

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

  const conceptMasteryLevel = useMemo(() => {
    if (!challenge.conceptId) return 0;
    const mastery = conceptMastery.find((cm: any) => cm.concept_id === challenge.conceptId);
    return mastery?.mastery_level || 0;
  }, [conceptMastery, challenge.conceptId]);

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
        errorType: 'runtime',
      });
      setRunnerStatus('offline');
    } finally {
      setIsRunning(false);
    }
  };

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
        errorType: 'runtime',
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
      
      if (res.status === 403 && data.code === 'PREREQUISITES_NOT_MET') {
        setEvalResult({
          success: false,
          allPassed: false,
          passedCount: 0,
          totalCount: 0,
          results: [],
          error: data.error,
          errorType: 'runtime',
        });
        return;
      }

      if (res.status === 401) {
        openAuthModal();
        setEvalResult({
          success: false,
          allPassed: false,
          passedCount: 0,
          totalCount: 0,
          results: [],
          error: data.error || 'Authentication required to submit solutions.',
          errorType: 'runtime',
        });
        return;
      }

      setEvalResult(data);
      setActiveTab('tests');

      if (data.allPassed) {
        if (data.leveledUp && !hasPlayedLevelUpSound.current) {
          playLevelUpSound();
          hasPlayedLevelUpSound.current = true;
          setTimeout(() => {
            hasPlayedLevelUpSound.current = false;
          }, 3000);
        }
        
        applyServerAward(challenge.questId, data);
        await refreshProgress();
        
        if (data.isPractice) {
          setShowPracticeChallenge(false);
        } else if (challenge.practiceChallengeId) {
          setShowPracticeChallenge(true);
        }
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
        errorType: 'runtime',
      });
      setRunnerStatus('offline');
    } finally {
      setIsRunning(false);
    }
  };

  const handlePracticeChallenge = () => {
    if (challenge.practiceChallengeId) {
      const practiceChallenge = getChallengeById(challenge.practiceChallengeId) as ChallengeWithLesson | undefined;
      if (practiceChallenge) {
        window.location.href = `/quest/${practiceChallenge.questId}?challenge=${practiceChallenge.id}`;
      }
    }
  };

  const toggleProgressiveHint = (index: number) => {
    setRevealedProgressiveHints((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const toggleQuickHint = (index: number) => {
    setRevealedQuickHints((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  // First failing test (for richer inline feedback)
  const firstFailedTest = evalResult?.results?.find((r) => !r.passed && !r.isHidden);

  const getErrorIcon = (type?: string | null) => {
    switch (type) {
      case 'syntax': return '📝';
      case 'runtime': return '⚡';
      case 'timeout': return '⏱️';
      case 'incorrect_output': return '🎯';
      default: return '⚔️';
    }
  };

  const getErrorLabel = (type?: string | null) => {
    switch (type) {
      case 'syntax': return 'Syntax Error';
      case 'runtime': return 'Runtime Error';
      case 'timeout': return 'Time Limit Exceeded';
      case 'incorrect_output': return 'Incorrect Output';
      default: return 'Error';
    }
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
          {challenge.conceptId && (
            <span className="solver-concept-chip" style={{ background: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)' }}>
              Concept: {challenge.conceptId}
              {conceptMasteryLevel > 0 && (
                <span style={{ marginLeft: '6px', opacity: 0.8 }}>
                  Mastery Lv.{conceptMasteryLevel}/5
                </span>
              )}
            </span>
          )}
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
        {/* Left Pane: Challenge Info + Learning Mode */}
        <div className="solver-desc-pane">
          <div>
            <h1 className="solver-title">{challenge.title}</h1>
          </div>

          {/* Prerequisite warning if unmet */}
          {unmetPrereqs.length > 0 && !challenge.isPractice && (
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
              🔒 <strong>Prerequisites Required:</strong> Complete{" "}
              {unmetPrereqs.map((p) => `"${p.title}"`).join(', ')} before attempting this challenge.
            </div>
          )}

          {/* Story intro */}
          {challenge.storyIntro && (
            <div className="solver-story-intro">"{challenge.storyIntro}"</div>
          )}

          {/* Learning Mode Toggle */}
          {challenge.lesson && (
            <div className="solver-learning-toggle">
              <button
                type="button"
                className={`solver-learning-btn ${learningMode ? 'active' : ''}`}
                onClick={() => setLearningMode(!learningMode)}
                style={{ width: '100%' }}
              >
                <span>{learningMode ? '📖 Hide Lesson' : '📖 Show Lesson'}</span>
                <span>{learningMode ? '▲' : '▼'}</span>
              </button>
            </div>
          )}

          {/* Learning Mode Panel */}
          {learningMode && challenge.lesson && (
            <div className="solver-lesson-panel">
              <div className="solver-lesson-tabs">
                <button
                  type="button"
                  className={`solver-lesson-tab ${lessonSection === 'concept' ? 'active' : ''}`}
                  onClick={() => setLessonSection('concept')}
                >
                  🧠 Concept
                </button>
                <button
                  type="button"
                  className={`solver-lesson-tab ${lessonSection === 'example' ? 'active' : ''}`}
                  onClick={() => setLessonSection('example')}
                >
                  💻 Example
                </button>
                <button
                  type="button"
                  className={`solver-lesson-tab ${lessonSection === 'worked' ? 'active' : ''}`}
                  onClick={() => setLessonSection('worked')}
                >
                  📝 Worked Example
                </button>
                <button
                  type="button"
                  className={`solver-lesson-tab ${lessonSection === 'mistakes' ? 'active' : ''}`}
                  onClick={() => setLessonSection('mistakes')}
                >
                  ⚠️ Common Mistakes
                </button>
                <button
                  type="button"
                  className={`solver-lesson-tab ${lessonSection === 'hints' ? 'active' : ''}`}
                  onClick={() => setLessonSection('hints')}
                >
                  🗝️ Progressive Hints
                </button>
              </div>

              <div className="solver-lesson-content">
                {lessonSection === 'concept' && (
                  <div className="solver-lesson-section">
                    <h4>Concept Explanation</h4>
                    <p>{challenge.lesson.conceptExplanation}</p>
                  </div>
                )}

                {lessonSection === 'example' && (
                  <div className="solver-lesson-section">
                    <h4>Code Example</h4>
                    <pre className="solver-code-example"><code>{challenge.lesson.codeExample}</code></pre>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                      Study this example to understand the pattern, then apply it to the challenge.
                    </p>
                  </div>
                )}

                {lessonSection === 'worked' && (
                  <div className="solver-lesson-section">
                    <h4>Worked Example</h4>
                    <div className="solver-worked-example">
                      <div className="solver-worked-input">
                        <strong>Input:</strong> {challenge.lesson.workedExample.input}
                      </div>
                      <div className="solver-worked-steps">
                        <strong>Steps:</strong>
                        <ol>
                          {challenge.lesson.workedExample.steps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      </div>
                      <div className="solver-worked-output">
                        <strong>Output:</strong> <code>{JSON.stringify(challenge.lesson.workedExample.output)}</code>
                      </div>
                    </div>
                  </div>
                )}

                {lessonSection === 'mistakes' && (
                  <div className="solver-lesson-section">
                    <h4>Common Mistakes to Avoid</h4>
                    <ul className="solver-mistakes-list">
                      {challenge.lesson.commonMistakes.map((mistake, i) => (
                        <li key={i}>
                          <span className="solver-mistake-icon">⚠️</span>
                          <span>{mistake}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {lessonSection === 'hints' && (
                  <div className="solver-lesson-section">
                    <h4>Progressive Hints</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      Reveal hints one at a time. Each hint gives more guidance without spoiling the solution.
                    </p>
                    <div className="solver-progressive-hints">
                      {challenge.lesson.progressiveHints.map((hint, i) => (
                        <div key={i} className="solver-hint-card">
                          <button
                            type="button"
                            className={`solver-hint-reveal-btn ${revealedProgressiveHints.includes(i) ? 'revealed' : ''}`}
                            onClick={() => toggleProgressiveHint(i)}
                          >
                            <span>Hint {i + 1}</span>
                            <span>{revealedProgressiveHints.includes(i) ? '▲ Hide' : '▼ Show'}</span>
                          </button>
                          {revealedProgressiveHints.includes(i) && (
                            <div className="solver-hint-content-revealed">{hint}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
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

          {/* Quick Hints — only show when lesson panel is closed and challenge has hints not in lesson */}
          {challenge.hints && challenge.hints.length > 0 && !learningMode && (
            <div>
              <div className="solver-section-heading">🗝️ Quick Hints</div>
              <div className="solver-hints-block">
                {challenge.hints.map((hint, i) => (
                  <div key={i}>
                    <button
                      type="button"
                      className="solver-hint-btn"
                      onClick={() => toggleQuickHint(i)}
                    >
                      <span>Hint {i + 1}</span>
                      <span>{revealedQuickHints.includes(i) ? '▲ Hide' : '▼ Show'}</span>
                    </button>
                    {revealedQuickHints.includes(i) && (
                      <div className="solver-hint-content">{hint}</div>
                    )}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                📖 Open the Lesson panel above for step-by-step explanation and progressive hints.
              </p>
            </div>
          )}

          {/* Concept Mastery Progress */}
          {challenge.conceptId && conceptMasteryLevel > 0 && (
            <div className="solver-mastery-progress">
              <div className="solver-mastery-header">
                <span>📊 Concept Mastery: {challenge.conceptId}</span>
                <span>Level {conceptMasteryLevel} / 5</span>
              </div>
              <div className="solver-mastery-bar">
                <div
                  className="solver-mastery-fill"
                  style={{ width: `${(conceptMasteryLevel / 5) * 100}%` }}
                />
              </div>
              <div className="solver-mastery-stats">
                <span>Practice sessions: {conceptMastery.find((cm: any) => cm.concept_id === challenge.conceptId)?.practice_count || 0}</span>
                <span>Last practiced: {conceptMastery.find((cm: any) => cm.concept_id === challenge.conceptId)?.last_practiced_at ? new Date(conceptMastery.find((cm: any) => cm.concept_id === challenge.conceptId)?.last_practiced_at as string).toLocaleDateString() : 'Never'}</span>
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

          {/* Practice Challenge Banner */}
          {showPracticeChallenge && challenge.practiceChallengeId && (
            <div className="solver-practice-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.5rem' }}>🎯</span>
                <div style={{ flex: 1 }}>
                  <strong>Challenge Conquered!</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Ready to prove mastery? Try the follow-up practice challenge to deepen your understanding.
                  </div>
                </div>
                <button
                  type="button"
                  className="solver-practice-btn"
                  onClick={handlePracticeChallenge}
                >
                  🎯 Practice Challenge
                </button>
              </div>
            </div>
          )}

          {/* Mastery Message from Practice Completion */}
          {evalResult?.masteryMessage && (
            <div className="solver-mastery-message">
              <span>✨</span>
              <span>{evalResult.masteryMessage}</span>
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
                disabled={isRunning || runnerStatus === 'offline' || unmetPrereqs.length > 0}
                title={unmetPrereqs.length > 0 ? 'Complete prerequisites first' : 'Run against sample + server-side hidden test cases to earn XP'}
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

              {/* Error Banner for Failed Submissions/Runs */}
              {evalResult && !evalResult.allPassed && evalResult.error && (
                <div className={`solver-error-banner ${evalResult.errorType || 'error'}`}>
                  <div className="solver-error-icon">
                    {getErrorIcon(evalResult.errorType)}
                  </div>
                  <div className="solver-error-content">
                    <span className="solver-error-title">
                      {getErrorLabel(evalResult.errorType)}
                    </span>
                    <span className="solver-error-desc">{evalResult.error}</span>
                    {evalResult.errorType === 'incorrect_output' && firstFailedTest && !firstFailedTest.isHidden && (
                      <div className="solver-error-hint">
                        💡 First failed: <code style={{ fontSize: '0.78rem' }}>{firstFailedTest.description}</code>
                        {' — '}your function returned <code style={{ color: 'var(--color-danger)', fontSize: '0.78rem' }}>{JSON.stringify(firstFailedTest.actual)}</code>,
                        {' '}but the expected value is{' '}
                        <code style={{ color: 'var(--color-success)', fontSize: '0.78rem' }}>{JSON.stringify(firstFailedTest.expected)}</code>.
                        {' '}Check the test case list below for details.
                      </div>
                    )}
                    {evalResult.errorType === 'incorrect_output' && (!firstFailedTest || firstFailedTest.isHidden) && (
                      <div className="solver-error-hint">
                        💡 Your logic is close — a hidden test case failed. Review edge cases like empty inputs, boundaries, and type handling.
                      </div>
                    )}
                    {evalResult.errorType === 'timeout' && (
                      <div className="solver-error-hint">
                        💡 Your code exceeded the {3}s time limit. Check for infinite loops or replace naive recursion with an iterative approach.
                      </div>
                    )}
                    {evalResult.errorType === 'syntax' && (
                      <div className="solver-error-hint">
                        💡 Python syntax error — check for missing colons after <code>if</code>/<code>for</code>/<code>def</code>, incorrect indentation (use 4 spaces), or unclosed parentheses.
                      </div>
                    )}
                    {evalResult.errorType === 'runtime' && !evalResult.error?.includes('Authentication') && !evalResult.error?.includes('Prerequisites') && (
                      <div className="solver-error-hint">
                        💡 A runtime exception was raised during execution. Check that you handle all edge cases (e.g., empty lists, None values, division by zero).
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Submission Outcome Banners */}
              {evalResult && evalResult.isSubmission && evalResult.allPassed && (
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
                        : `Victory! Gained +${evalResult.xpReward ?? challenge.xpReward} XP!${
                            challenge.conceptId ? ` Concept mastery for "${challenge.conceptId}" increased.` : ''
                          }${challenge.practiceChallengeId && !evalResult.isDuplicate ? ' Try the Practice Challenge to deepen your understanding.' : ''}`}
                    </span>
                  </div>
                </div>
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