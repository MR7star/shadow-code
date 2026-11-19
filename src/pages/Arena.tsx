import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Clock3,
  Flag,
  FlaskConical,
  Laptop,
  LockKeyhole,
  Medal,
  Play,
  Rocket,
  Settings2,
  Shield,
  Swords,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CodeEditor from '../components/editor/CodeEditor';
import { pythonChallenges } from '../data/challenges';
import {
  fetchArenaProfile,
  fetchMatchHistory,
  fetchRatingHistory,
  fetchArenaLeaderboard,
  fetchQueueStatus,
  joinQueue,
  leaveQueue,
  fetchMatchDetails,
  cancelArenaMatch,
  runArenaSampleTests,
  submitArenaSolution,
  forfeitArenaMatch,
  fetchArenaMatchResult,
  getDivision,
  getDivisionInfo,
  getDivisionProgress,
  getNextDivision,
  DIVISIONS,
  type ArenaProfile,
  type MatchHistoryEntry,
  type MatchHistoryResponse,
  type RatingHistoryEntry,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type QueueStatusResponse,
  type ArenaMatchDetails,
  type ArenaRunResult,
  type ArenaSubmitResult,
} from '../services/arenaApi';
import './Arena.css';

// ─── Utility helpers ──────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function ratingChangeStr(change: number): string {
  if (change > 0) return `+${change}`;
  return String(change);
}

// ─── Sub-section type ─────────────────────────────────────────────

type ArenaSection = 'overview' | 'find-match' | 'history' | 'leaderboard';

const SECTIONS: { key: ArenaSection; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '📊' },
  { key: 'find-match', label: 'Find Match', icon: '⚔️' },
  { key: 'history', label: 'Match History', icon: '📜' },
  { key: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
];

// ─── Matchmaking Flow State Types ──────────────────────────────────

export type MatchmakingFlowState =
  | { status: 'idle' }
  | { status: 'queued'; queuedAt: string; elapsedSeconds: number }
  | { status: 'matched'; matchId: string; opponentName?: string; matchDetails: ArenaMatchDetails | null }
  | { status: 'ready'; match: ArenaMatchDetails }
  | { status: 'error'; message: string; canRetry: boolean };

// ═══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function Arena() {
  const { token, isAuthenticated, openAuthModal, user } = useAuth();
  const { matchId: urlMatchId } = useParams<{ matchId?: string }>();
  const navigate = useNavigate();

  const [section, setSection] = useState<ArenaSection>(urlMatchId ? 'find-match' : 'overview');
  const [profile, setProfile] = useState<ArenaProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Matchmaking state
  const [mmState, setMmState] = useState<MatchmakingFlowState>({ status: 'idle' });
  const [loadingMatchUrl, setLoadingMatchUrl] = useState(false);

  // ─── Load profile ────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    if (!token) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }
    setLoadingProfile(true);
    const res = await fetchArenaProfile(token);
    if (res.ok && res.data) setProfile(res.data);
    else setError(res.error);
    setLoadingProfile(false);
  }, [token]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // ─── Check direct URL matchId or existing queue state ────────────
  useEffect(() => {
    if (!token || !isAuthenticated) return;

    let mounted = true;

    async function checkInitialMatchState() {
      // 1. If URL has matchId, load that match directly
      if (urlMatchId) {
        setLoadingMatchUrl(true);
        const res = await fetchMatchDetails(token!, urlMatchId);
        if (!mounted) return;
        setLoadingMatchUrl(false);

        if (res.ok && res.data) {
          setMmState({ status: 'ready', match: res.data });
          setSection('find-match');
        } else {
          const message = res.error || 'Match details could not be loaded.';
          setError(message);
          setMmState({ status: 'matched', matchId: urlMatchId, matchDetails: null });
        }
        return;
      }

      // 2. Otherwise check current queue & active match status
      const statusRes = await fetchQueueStatus(token!);
      if (!mounted) return;

      if (statusRes.ok && statusRes.data) {
        const qStatus = statusRes.data;
        if (qStatus.hasActiveMatch && qStatus.matchId) {
          // Reconnect to active match
          const matchRes = await fetchMatchDetails(token!, qStatus.matchId);
          if (!mounted) return;
          if (matchRes.ok && matchRes.data) {
            setMmState({ status: 'ready', match: matchRes.data });
          } else {
            setMmState({ status: 'matched', matchId: qStatus.matchId, matchDetails: null });
          }
        } else if (qStatus.inQueue && qStatus.queuedAt) {
          // Restore queued state
          const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(qStatus.queuedAt)) / 1000));
          setMmState({
            status: 'queued',
            queuedAt: qStatus.queuedAt,
            elapsedSeconds: elapsed,
          });
        } else {
          setMmState({ status: 'idle' });
        }
      } else {
        setMmState({
          status: 'error',
          message: statusRes.error || 'Could not restore your matchmaking status.',
          canRetry: true,
        });
      }
    }

    void checkInitialMatchState();

    return () => {
      mounted = false;
    };
  }, [token, isAuthenticated, urlMatchId]);

  // ─── Render Authentication Prompt ────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="arena-page">
        <ArenaHero />
        <div className="arena-auth-prompt">
          <div className="arena-auth-prompt-icon">🔒</div>
          <h3>Authentication Required</h3>
          <p>Sign in to access the Ranked Coding Arena, search for matches, and compete against other hunters.</p>
          <button type="button" className="arena-btn arena-btn-primary" onClick={openAuthModal}>
            Sign In to Enter Arena
          </button>
        </div>
      </div>
    );
  }

  // ─── Render Loading Direct Match ─────────────────────────────────
  if (loadingMatchUrl) {
    return (
      <div className="arena-page">
        <ArenaHero profile={profile} loading={loadingProfile} />
        <div className="arena-loading">
          <div className="arena-spinner" />
          <span>Entering Match Arena…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="arena-page">
      <ArenaHero profile={profile} loading={loadingProfile} />

      {error && (
        <div className="arena-alert arena-alert-error" role="alert">
          {error}
          <button type="button" className="arena-alert-dismiss" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Arena Sub-Navigation */}
      <nav className="arena-nav" aria-label="Arena sections">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`arena-nav-item ${section === s.key ? 'active' : ''}`}
            onClick={() => {
              if (urlMatchId) {
                navigate('/arena');
              }
              setSection(s.key);
            }}
            aria-current={section === s.key ? 'page' : undefined}
          >
            <span className="arena-nav-icon">{s.icon}</span>
            {s.label}
            {s.key === 'find-match' && mmState.status === 'queued' && (
              <span className="arena-nav-badge-queued">IN QUEUE</span>
            )}
            {s.key === 'find-match' && (mmState.status === 'matched' || mmState.status === 'ready') && (
              <span className="arena-nav-badge-matched">MATCH</span>
            )}
          </button>
        ))}
      </nav>

      {/* Section Content */}
      <div className="arena-section-content">
        {section === 'overview' && (
          <OverviewSection
            profile={profile}
            loading={loadingProfile}
            token={token}
            mmState={mmState}
            onFindMatchClick={() => setSection('find-match')}
          />
        )}
        {section === 'find-match' && (
          <FindMatchSection
            profile={profile}
            token={token}
            username={user?.username || 'Hunter'}
            mmState={mmState}
            setMmState={setMmState}
            onProfileUpdate={loadProfile}
          />
        )}
        {section === 'history' && (
          <HistorySection token={token} />
        )}
        {section === 'leaderboard' && (
          <LeaderboardSection token={token} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ARENA HERO HEADER
// ═══════════════════════════════════════════════════════════════════

function ArenaHero({ profile, loading }: { profile?: ArenaProfile | null; loading?: boolean }) {
  const divInfo = profile ? getDivisionInfo(profile.division) : null;

  return (
    <header className="arena-hero">
      <div className="arena-hero-text">
        <span className="arena-kicker">Competitive League</span>
        <h1>Ranked Coding Arena</h1>
        <p>
          Test your problem-solving under pressure in 1v1 duels. Climb divisions from Bronze to
          Monarch and etch your hunter rank in Shadow Code history.
        </p>
      </div>
      {!loading && profile && divInfo && (
        <div className="arena-hero-badge" style={{ borderColor: divInfo.color }}>
          <span className="arena-hero-badge-icon">{divInfo.icon}</span>
          <div className="arena-hero-badge-info">
            <span className="arena-hero-badge-division" style={{ color: divInfo.color }}>
              {profile.division}
            </span>
            <span className="arena-hero-badge-rating">{profile.rating} SR</span>
          </div>
        </div>
      )}
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  OVERVIEW SECTION
// ═══════════════════════════════════════════════════════════════════

function OverviewSection({
  profile,
  loading,
  token,
  mmState,
  onFindMatchClick,
}: {
  profile: ArenaProfile | null;
  loading: boolean;
  token: string | null;
  mmState: MatchmakingFlowState;
  onFindMatchClick: () => void;
}) {
  const [recentMatches, setRecentMatches] = useState<MatchHistoryEntry[]>([]);
  const [ratingHistory, setRatingHistory] = useState<RatingHistoryEntry[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(true);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    async function load() {
      const [histRes, ratingRes] = await Promise.all([
        fetchMatchHistory(token!, 1, 5),
        fetchRatingHistory(token!, 20),
      ]);
      if (!mounted) return;
      if (histRes.ok && histRes.data) setRecentMatches(histRes.data.matches);
      if (ratingRes.ok && ratingRes.data) setRatingHistory(ratingRes.data.entries);
      setLoadingExtra(false);
    }
    void load();
    return () => { mounted = false; };
  }, [token]);

  if (loading) {
    return (
      <div className="arena-loading">
        <div className="arena-spinner" />
        <span>Loading arena profile…</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="arena-empty-state">
        <span className="arena-empty-icon">⚔️</span>
        <h3>Arena Profile Unavailable</h3>
        <p>Could not load your arena profile. Please try again later.</p>
      </div>
    );
  }

  const divInfo = getDivisionInfo(profile.division);
  const nextDiv = getNextDivision(profile.division);
  const progress = getDivisionProgress(profile.rating, profile.division);

  return (
    <div className="arena-overview">
      {/* Quick Action Banner if active queue / match */}
      {mmState.status === 'queued' && (
        <div className="arena-active-status-bar queued">
          <div className="arena-active-pulse" />
          <span>You are searching for a ranked match ({formatElapsed(mmState.elapsedSeconds)} elapsed)</span>
          <button type="button" className="arena-btn arena-btn-small" onClick={onFindMatchClick}>View Queue →</button>
        </div>
      )}
      {mmState.status === 'ready' && (
        <div className="arena-active-status-bar ready">
          <span className="arena-status-icon">⚔️</span>
          <span>Match in progress: #{mmState.match.id.slice(0, 12)}</span>
          <button type="button" className="arena-btn arena-btn-small arena-btn-primary" onClick={onFindMatchClick}>Return to Match →</button>
        </div>
      )}

      {/* Player Card */}
      <div className="arena-player-card">
        <div className="arena-player-card-header">
          <div className="arena-division-emblem" style={{ borderColor: divInfo.color, boxShadow: `0 0 24px ${divInfo.color}33` }}>
            <span className="arena-division-emblem-icon">{divInfo.icon}</span>
          </div>
          <div className="arena-player-card-info">
            <span className="arena-kicker">Current Division</span>
            <h2 style={{ color: divInfo.color }}>{profile.division}</h2>
            <span className="arena-rating-display">
              <span className="arena-rating-number">{profile.rating}</span>
              <span className="arena-rating-label">SR</span>
              {profile.peakRating > profile.rating && (
                <span className="arena-peak-rating">Peak: {profile.peakRating}</span>
              )}
            </span>
          </div>
          <div className="arena-player-card-action">
            <button
              type="button"
              className="arena-btn arena-btn-primary"
              onClick={onFindMatchClick}
            >
              {mmState.status === 'queued' ? 'View Queue' : mmState.status === 'ready' ? 'Enter Match' : '⚔️ Find Match'}
            </button>
          </div>
        </div>

        {/* Division Progress */}
        <div className="arena-division-progress">
          <div className="arena-division-progress-labels">
            <span style={{ color: divInfo.color }}>{divInfo.icon} {divInfo.name}</span>
            {nextDiv ? (
              <span style={{ color: nextDiv.color }}>{nextDiv.icon} {nextDiv.name} ({nextDiv.minRating} SR)</span>
            ) : (
              <span style={{ color: divInfo.color }}>Maximum Rank</span>
            )}
          </div>
          <div className="arena-division-progress-track">
            <div
              className="arena-division-progress-fill"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${divInfo.color}, ${nextDiv?.color || divInfo.color})` }}
            />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="arena-stats-grid">
        <StatCard label="Matches" value={profile.matchesPlayed} icon="⚔️" />
        <StatCard label="Wins" value={profile.wins} icon="✓" accent="var(--color-success)" />
        <StatCard label="Losses" value={profile.losses} icon="✗" accent="var(--color-danger)" />
        <StatCard label="Draws" value={profile.draws} icon="=" accent="var(--text-muted)" />
        <StatCard label="Win Rate" value={`${profile.winRate}%`} icon="📈" accent="var(--accent-cyan)" />
        <StatCard label="Streak" value={profile.streak >= 0 ? `${profile.streak}W` : `${Math.abs(profile.streak)}L`} icon="🔥" accent="var(--color-warning)" />
      </div>

      {/* Recent Matches */}
      <div className="arena-panel">
        <div className="arena-panel-header">
          <h3>Recent Matches</h3>
          <span className="arena-panel-subtitle">Last 5 completed matches</span>
        </div>
        <div className="arena-panel-body">
          {loadingExtra ? (
            <div className="arena-loading-inline"><div className="arena-spinner-sm" /> Loading…</div>
          ) : recentMatches.length === 0 ? (
            <div className="arena-empty-inline">
              <span>📭</span>
              <p>No matches yet. Enter the Arena to begin your competitive journey!</p>
            </div>
          ) : (
            <div className="arena-match-list">
              {recentMatches.map((m) => (
                <MatchRow key={m.id} match={m} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rating Chart */}
      <div className="arena-panel">
        <div className="arena-panel-header">
          <h3>Rating Progression</h3>
          <span className="arena-panel-subtitle">Recent rating changes</span>
        </div>
        <div className="arena-panel-body">
          {loadingExtra ? (
            <div className="arena-loading-inline"><div className="arena-spinner-sm" /> Loading…</div>
          ) : ratingHistory.length === 0 ? (
            <div className="arena-empty-inline">
              <span>📊</span>
              <p>No rating history yet. Complete your first match to see your progression.</p>
            </div>
          ) : (
            <RatingChart entries={ratingHistory} />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ARENA LIVE CODING MATCH WORKSPACE (PHASE 3)
// ═══════════════════════════════════════════════════════════════════

interface ArenaMatchWorkspaceProps {
  initialMatch: ArenaMatchDetails;
  token: string;
  onExitMatch: () => void;
  onProfileUpdate: () => void;
  onCancelMatch?: (matchId: string) => Promise<void>;
}

function ArenaMatchWorkspace({
  initialMatch,
  token,
  onExitMatch,
  onProfileUpdate,
  onCancelMatch,
}: ArenaMatchWorkspaceProps) {
  const navigate = useNavigate();
  const [match, setMatch] = useState<ArenaMatchDetails>(initialMatch);
  const [localSecondsRemaining, setLocalSecondsRemaining] = useState<number>(() =>
    Math.max(0, initialMatch.remainingSeconds)
  );

  // Challenge lookup
  const challengeInfo = useMemo(() => {
    return pythonChallenges.find((c) => c.id === match.challenge.id) || null;
  }, [match.challenge.id]);

  // Starter template
  const defaultStarterCode = useMemo(() => {
    if (challengeInfo?.starterCode) return challengeInfo.starterCode;
    return `def ${match.challenge.functionName}(*args):\n    """\n    Solve: ${match.challenge.title}\n    """\n    pass\n`;
  }, [challengeInfo, match.challenge.functionName, match.challenge.title]);

  // Code persistence with match-specific localStorage key
  const storageKey = `arena_match_${match.id}_code`;
  const [code, setCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null && saved.trim().length > 0) return saved;
    } catch {}
    return defaultStarterCode;
  });

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    try {
      localStorage.setItem(storageKey, newCode);
    } catch {}
  };

  const handleResetCode = () => {
    if (window.confirm('Reset code to starter template? Unsaved changes will be discarded.')) {
      setCode(defaultStarterCode);
      try {
        localStorage.setItem(storageKey, defaultStarterCode);
      } catch {}
    }
  };

  // Combatant identification
  const you = match.player1.isYou ? match.player1 : match.player2;
  const opponent = match.player1.isYou ? match.player2 : match.player1;
  const yourDivInfo = getDivisionInfo(getDivision(you.ratingBefore));
  const oppDivInfo = getDivisionInfo(getDivision(opponent.ratingBefore));

  // Opponent status derived strictly from server data
  const oppStatusDisplay = useMemo(() => {
    const status = opponent.status;
    switch (status) {
      case 'ready':
        return { label: 'In Arena', badgeClass: 'status-ready' };
      case 'submitting':
        return { label: 'Submitting Code…', badgeClass: 'status-submitting' };
      case 'submitted':
        return { label: 'Solution Submitted', badgeClass: 'status-submitted' };
      case 'completed':
        return { label: 'Completed (All Passed)', badgeClass: 'status-completed' };
      case 'forfeited':
        return { label: 'Forfeited Duel', badgeClass: 'status-forfeited' };
      case 'timed_out':
        return { label: 'Timed Out', badgeClass: 'status-timed-out' };
      default:
        return { label: 'In Duel', badgeClass: 'status-ready' };
    }
  }, [opponent.status]);

  // Attempts tracking
  const [attemptsCount, setAttemptsCount] = useState<number>(you.attemptsCount);
  useEffect(() => {
    setAttemptsCount(you.attemptsCount);
  }, [you.attemptsCount]);

  // Test execution & submission states
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [sampleRunResult, setSampleRunResult] = useState<ArenaRunResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<ArenaSubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Tab controls
  const [leftTab, setLeftTab] = useState<'problem' | 'samples' | 'requirements'>('problem');
  const [activeDrawerTab, setActiveDrawerTab] = useState<'sample-tests' | 'submission' | 'console'>('sample-tests');

  // Forfeit state
  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false);
  const [isForfeiting, setIsForfeiting] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Match result modal state
  const [matchResult, setMatchResult] = useState<ArenaMatchDetails | null>(null);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  useEffect(() => {
    if (!showForfeitConfirm && !showCancelConfirm) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstButton = document.querySelector<HTMLButtonElement>('.arena-modal-card button');
    firstButton?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isForfeiting && !isCancelling) {
        setShowForfeitConfirm(false);
        setShowCancelConfirm(false);
      }
      if (event.key === 'Tab') {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.arena-modal-card button:not(:disabled)'));
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [showForfeitConfirm, showCancelConfirm, isForfeiting, isCancelling]);

  // Lock status
  const isPlayerCompleted = you.status === 'completed' || submitResult?.allPassed;
  const isOutOfAttempts = attemptsCount >= 5;
  const isConcluded =
    ['completed', 'expired', 'cancelled', 'abandoned'].includes(match.status) ||
    match.winnerId !== null ||
    localSecondsRemaining <= 0;
  const isEditorLocked = isConcluded || isPlayerCompleted || isOutOfAttempts || isSubmitting;
  const attemptsRemaining = Math.max(0, 5 - attemptsCount);

  // Result loader
  const loadMatchResult = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchArenaMatchResult(token, match.id);
      if (res.ok && res.data) {
        setMatchResult(res.data);
        setShowResultOverlay(true);
        onProfileUpdate();
      }
    } catch {}
  }, [token, match.id, onProfileUpdate]);

  // Authoritative match synchronization
  const fetchMatchSync = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchMatchDetails(token, match.id);
      if (res.ok && res.data) {
        setMatch(res.data);
        setLocalSecondsRemaining(res.data.remainingSeconds);
        if (
          ['completed', 'expired', 'cancelled', 'abandoned'].includes(res.data.status) ||
          res.data.winnerId !== null
        ) {
          void loadMatchResult();
        }
      }
    } catch {}
  }, [token, match.id, loadMatchResult]);

  // 1-second countdown interval
  useEffect(() => {
    if (!['ready', 'in_progress'].includes(match.status)) return;
    const interval = window.setInterval(() => {
      setLocalSecondsRemaining((prev) => {
        if (prev <= 1) {
          void fetchMatchSync();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [match.status, fetchMatchSync]);

  // Periodic resynchronization (every 3.5s)
  useEffect(() => {
    if (!['ready', 'in_progress'].includes(match.status)) return;
    const pollTimer = window.setInterval(() => {
      void fetchMatchSync();
    }, 3500);
    return () => clearInterval(pollTimer);
  }, [fetchMatchSync, match.status]);

  // Auto-fetch results if already terminal on mount
  useEffect(() => {
    if (
      ['completed', 'expired', 'cancelled', 'abandoned'].includes(match.status) ||
      match.winnerId !== null
    ) {
      void loadMatchResult();
    }
  }, [match.status, match.winnerId, loadMatchResult]);

  // Timer formatting
  const minutes = Math.floor(localSecondsRemaining / 60);
  const seconds = localSecondsRemaining % 60;
  const timerStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isUrgent = localSecondsRemaining <= 60 && localSecondsRemaining > 0;
  const isExpired = localSecondsRemaining <= 0;

  // Run Sample Tests
  const handleRunSampleTests = async () => {
    if (isRunningTests || isSubmitting || !token) return;
    setIsRunningTests(true);
    setActiveDrawerTab('sample-tests');

    try {
      const res = await runArenaSampleTests(token, match.id, code);
      if (res.ok && res.data) {
        setSampleRunResult(res.data);
      } else {
        setSampleRunResult({
          success: false,
          allPassed: false,
          passedCount: 0,
          totalCount: 0,
          results: [],
          error: res.error || 'Execution failed.',
        });
      }
    } catch (err) {
      setSampleRunResult({
        success: false,
        allPassed: false,
        passedCount: 0,
        totalCount: 0,
        results: [],
        error: err instanceof Error ? err.message : 'Network execution error.',
      });
    } finally {
      setIsRunningTests(false);
    }
  };

  // Submit Solution
  const handleSubmitSolution = async () => {
    if (isEditorLocked || isSubmitting || !token) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setActiveDrawerTab('submission');
    try {
      const res = await submitArenaSolution(token, match.id, code);
      if (res.ok && res.data) {
        setSubmitResult(res.data);
        if (res.data.match) {
          setMatch(res.data.match);
          const submittedPlayer = res.data.match.player1.isYou ? res.data.match.player1 : res.data.match.player2;
          setAttemptsCount(submittedPlayer.attemptsCount);
        }
        if (
          res.data.allPassed ||
          res.data.matchConcluded ||
          ['completed', 'expired'].includes(res.data.match?.status)
        ) {
          void loadMatchResult();
        }
      } else {
        setSubmitError(res.error || 'Submission failed.');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network submission error.');
    } finally {
      const latestMatch = await fetchMatchDetails(token, match.id);
      if (latestMatch.ok && latestMatch.data) {
        const currentPlayer = latestMatch.data.player1.isYou ? latestMatch.data.player1 : latestMatch.data.player2;
        setAttemptsCount(currentPlayer.attemptsCount);
      }
      setIsSubmitting(false);
    }
  };

  // Forfeit
  const handleForfeit = async () => {
    if (isForfeiting || !token) return;
    setIsForfeiting(true);
    try {
      const res = await forfeitArenaMatch(token, match.id);
      if (res.ok && res.data) {
        setMatch(res.data.match);
        setShowForfeitConfirm(false);
        void loadMatchResult();
      } else {
        alert(res.error || 'Failed to forfeit match.');
      }
    } catch {
      alert('Network error while forfeiting.');
    } finally {
      setIsForfeiting(false);
    }
  };

  // Final Result variables
  const youResult = matchResult
    ? matchResult.player1.isYou
      ? matchResult.player1
      : matchResult.player2
    : null;
  const oppResult = matchResult
    ? matchResult.player1.isYou
      ? matchResult.player2
      : matchResult.player1
    : null;
  const resultRatingBefore = youResult?.ratingBefore ?? you.ratingBefore;
  const resultRatingAfter =
    youResult?.ratingAfter !== null && youResult?.ratingAfter !== undefined
      ? youResult.ratingAfter
      : resultRatingBefore;
  const resultRatingDelta = resultRatingAfter - resultRatingBefore;
  const divBefore = getDivision(resultRatingBefore);
  const divAfter = getDivision(resultRatingAfter);
  const hasDivisionChanged = divBefore !== divAfter;
  const resultOutcome = matchResult?.result ?? (matchResult?.status === 'cancelled'
    ? 'cancelled'
    : matchResult?.status === 'expired'
      ? 'expired'
      : matchResult?.status === 'abandoned'
        ? 'abandoned'
        : 'unscored');
  const isTournamentMatch = matchResult?.matchType === 'tournament';

  return (
    <div className="arena-workspace-container animate-fadeIn">
      {/* ══════════════════════════════════════════════════════════════
          TOP MATCH HUD
          ══════════════════════════════════════════════════════════════ */}
      <div className="arena-workspace-hud">
        {/* Combatant 1: You */}
        <div className="arena-hud-combatant you">
          <div className="arena-hud-avatar" style={{ borderColor: yourDivInfo.color }}>
            <span>{match.matchType === 'tournament' ? <Shield size={20} aria-hidden="true" /> : yourDivInfo.icon}</span>
          </div>
          <div className="arena-hud-meta">
            <div className="arena-hud-name-row">
              <span className="arena-hud-badge-you">YOU</span>
              <strong className="arena-hud-name">{you.name}</strong>
            </div>
            <div className="arena-hud-stats-row">
              <span style={{ color: yourDivInfo.color }} className="arena-hud-div-name">
                {yourDivInfo.name}
              </span>
              <span className="arena-hud-sr">{you.ratingBefore} SR</span>
              {you.status && (
                <span className={`arena-hud-status-chip ${you.status}`}>
                  {you.status.replace('_', ' ').toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Timer & Status */}
        <div className="arena-hud-center">
          <div className={`arena-hud-timer-card ${isUrgent ? 'urgent' : ''} ${isExpired ? 'expired' : ''}`}>
            <span className="arena-hud-timer-icon">{match.matchType === 'tournament' ? <Clock3 size={16} aria-hidden="true" /> : '⏱️'}</span>
            <span className="arena-hud-timer-digits">{timerStr}</span>
          </div>
          <div className="arena-hud-match-meta">
            <span className={`arena-hud-status-badge ${match.status}`}>
              <span className="arena-status-dot" />
              {match.status.replace('_', ' ').toUpperCase()}
            </span>
            <span className="arena-hud-match-id">Match #{match.id.slice(0, 8)}</span>
            {match.matchType === 'tournament' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.35)', marginTop: '4px' }}>
                <Trophy size={14} aria-hidden="true" />
                <span>{match.tournamentContext?.tournamentTitle || 'Tournament Duel'}</span>
                {match.tournamentContext?.round && (
                  <span>· R{match.tournamentContext.round}</span>
                )}
                <span>(Elo Protected)</span>
              </div>
            )}
          </div>
        </div>

        {/* Combatant 2: Opponent */}
        <div className="arena-hud-combatant opponent">
          <div className="arena-hud-meta text-right">
            <div className="arena-hud-name-row justify-end">
              <strong className="arena-hud-name">{opponent.name}</strong>
              <span className="arena-hud-badge-opp">OPPONENT</span>
            </div>
            <div className="arena-hud-stats-row justify-end">
              <span className={`arena-hud-status-chip ${oppStatusDisplay.badgeClass}`}>
                {oppStatusDisplay.label}
              </span>
              <span className="arena-hud-sr">{opponent.ratingBefore} SR</span>
              <span style={{ color: oppDivInfo.color }} className="arena-hud-div-name">
                {oppDivInfo.name}
              </span>
            </div>
          </div>
          <div className="arena-hud-avatar" style={{ borderColor: oppDivInfo.color }}>
            <span>{match.matchType === 'tournament' ? <Shield size={20} aria-hidden="true" /> : oppDivInfo.icon}</span>
          </div>

          <div className="arena-hud-actions">
            {match.matchType === 'tournament' && (
              <button
                type="button"
                className="arena-btn arena-btn-secondary"
                onClick={() => navigate(match.tournamentContext?.tournamentId ? `/tournaments/${match.tournamentContext.tournamentId}` : '/tournaments')}
                title="Return to Tournament Details"
              >
                <><ArrowLeft size={15} aria-hidden="true" /> Tournament</>
              </button>
            )}
            {match.status === 'ready' && attemptsCount === 0 && onCancelMatch && (
              <button
                type="button"
                className="arena-btn arena-btn-secondary arena-btn-cancel-match"
                onClick={() => setShowCancelConfirm(true)}
                title="Cancel Untouched Match (No rating penalty)"
              >
                {match.matchType === 'tournament' ? <><X size={15} aria-hidden="true" /> Cancel Match</> : '✕ Cancel Match'}
              </button>
            )}
            {!isConcluded && (
              <button
                type="button"
                className="arena-btn arena-btn-danger arena-btn-forfeit"
                onClick={() => setShowForfeitConfirm(true)}
                title="Surrender Duel"
              >
                {match.matchType === 'tournament' ? <><Flag size={15} aria-hidden="true" /> Forfeit</> : '🏳️ Forfeit'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MAIN SPLIT WORKSPACE
          ══════════════════════════════════════════════════════════════ */}
      <div className="arena-workspace-main">
        {/* ─── LEFT PANEL: PROBLEM SPECIFICATION ───────────────────── */}
        <div className="arena-problem-panel">
          <div className="arena-panel-tab-bar">
            <button
              type="button"
              className={`arena-tab-btn ${leftTab === 'problem' ? 'active' : ''}`}
              onClick={() => setLeftTab('problem')}
            >
              {match.matchType === 'tournament' ? <><BookOpenText size={15} aria-hidden="true" /> Problem Statement</> : '📜 Problem Statement'}
            </button>
            <button
              type="button"
              className={`arena-tab-btn ${leftTab === 'samples' ? 'active' : ''}`}
              onClick={() => setLeftTab('samples')}
            >
              {match.matchType === 'tournament' ? <><FlaskConical size={15} aria-hidden="true" /> Sample Tests ({match.challenge.sampleTests?.length || 0})</> : `🧪 Sample Tests (${match.challenge.sampleTests?.length || 0})`}
            </button>
            <button
              type="button"
              className={`arena-tab-btn ${leftTab === 'requirements' ? 'active' : ''}`}
              onClick={() => setLeftTab('requirements')}
            >
              {match.matchType === 'tournament' ? <><Settings2 size={15} aria-hidden="true" /> Constraints</> : '⚙️ Constraints'}
            </button>
          </div>

          <div className="arena-problem-content">
            {leftTab === 'problem' && (
              <div className="arena-problem-tab-body">
                <div className="arena-problem-header">
                  <span className="arena-kicker">
                    {match.matchType === 'tournament'
                      ? <><Trophy size={14} aria-hidden="true" /> Tournament Duel · Single Elimination</>
                      : `Algorithm Duel · Rank ${match.matchType.toUpperCase()}`}
                  </span>
                  <h2 className="arena-problem-title">{match.challenge.title}</h2>
                </div>

                {/* Lore / Story intro if present */}
                {challengeInfo?.storyIntro && (
                  <div className="arena-story-callout">
                    <div className="arena-story-icon">{match.matchType === 'tournament' ? <Swords size={19} aria-hidden="true" /> : '⚔️'}</div>
                    <blockquote className="arena-story-text">{challengeInfo.storyIntro}</blockquote>
                  </div>
                )}

                {/* Main Problem Description */}
                <div className="arena-problem-description">
                  <h4>Task Description</h4>
                  <p>{challengeInfo?.description || match.challenge.lesson}</p>
                </div>

                {/* Function Signature */}
                <div className="arena-signature-card">
                  <div className="arena-signature-head">
                    <span>Target Function Signature</span>
                    <button
                      type="button"
                      className="arena-btn-copy-sig"
                      onClick={() => {
                        void navigator.clipboard.writeText(`def ${match.challenge.functionName}:`);
                      }}
                      title="Copy Signature"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="arena-signature-code">
                    <code>def {match.challenge.functionName}(*args):</code>
                  </pre>
                </div>
              </div>
            )}

            {leftTab === 'samples' && (
              <div className="arena-problem-tab-body">
                <h4>Sample Test Cases</h4>
                <p className="arena-tab-subtitle">
                  Use these visible cases to verify your implementation before submitting.
                </p>

                <div className="arena-sample-tests-list">
                  {match.challenge.sampleTests && match.challenge.sampleTests.length > 0 ? (
                    match.challenge.sampleTests.map((t: any, idx: number) => (
                      <div key={idx} className="arena-sample-test-item">
                        <div className="arena-sample-test-head">
                          <strong>Sample Case #{idx + 1}</strong>
                          {t.inputDescription && (
                            <span className="arena-sample-desc">{t.inputDescription}</span>
                          )}
                        </div>
                        <div className="arena-sample-test-io">
                          <div className="arena-io-block">
                            <span className="arena-io-label">Input / Arguments:</span>
                            <pre className="arena-io-pre">
                              {Array.isArray(t.args)
                                ? t.args.map((a: any) => JSON.stringify(a)).join(', ')
                                : JSON.stringify(t.args ?? t.input ?? '')}
                            </pre>
                          </div>
                          <div className="arena-io-block">
                            <span className="arena-io-label">Expected Output:</span>
                            <pre className="arena-io-pre expected">
                              {JSON.stringify(t.expected, null, 2)}
                            </pre>
                          </div>
                        </div>
                        {t.explanation && (
                          <div className="arena-sample-explanation">
                            <em>Explanation:</em> {t.explanation}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="arena-empty-inline">
                      <span>{match.matchType === 'tournament' ? <FlaskConical size={17} aria-hidden="true" /> : '🧪'}</span>
                      <p>No sample test cases defined for this challenge.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {leftTab === 'requirements' && (
              <div className="arena-problem-tab-body">
                <h4>Execution Rules & Constraints</h4>
                <ul className="arena-constraints-list">
                  <li>
                    <strong>Environment:</strong> Python 3 runtime with standard library isolation.
                  </li>
                  <li>
                    <strong>Execution Limit:</strong> 5,000ms per test invocation.
                  </li>
                  <li>
                    <strong>Submission Quota:</strong> Maximum of 5 official submissions permitted per duel.
                  </li>
                  <li>
                    <strong>Scoring Criteria:</strong> Solutions passing all tests earn victory. In ties, fastest execution time decides.
                  </li>
                  {challengeInfo?.constraints?.map((c, i) => (
                    <li key={i}>
                      <strong>Requirement:</strong> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT PANEL: CODE EDITOR & EXECUTION RESULTS ────────── */}
        <div className="arena-editor-panel">
          {/* Editor Header Toolbar */}
          <div className="arena-editor-toolbar">
            <div className="arena-attempts-chip">
              <span className="arena-attempts-label">Submissions:</span>
              <strong className={`arena-attempts-count ${attemptsRemaining <= 1 ? 'critical' : ''}`}>
                {attemptsCount} / 5
              </strong>
              <span className="arena-attempts-sub">({attemptsRemaining} remaining)</span>
            </div>

            <div className="arena-toolbar-actions">
              <button
                type="button"
                className="arena-btn arena-btn-secondary arena-btn-reset-code"
                onClick={handleResetCode}
                title="Reset to starter template"
                disabled={isEditorLocked}
              >
                ↺ Reset
              </button>

              <button
                type="button"
                className="arena-btn arena-btn-run-tests"
                onClick={() => void handleRunSampleTests()}
                disabled={isRunningTests || isSubmitting}
                title="Run Sample Tests (Ctrl+Enter)"
              >
                {isRunningTests ? (
                  <>
                    <div className="arena-spinner-xs" /> Running Tests…
                  </>
                ) : (
                  match.matchType === 'tournament' ? <><Play size={15} aria-hidden="true" /> Run Sample Tests</> : '▶ Run Sample Tests'
                )}
              </button>

              <button
                type="button"
                className="arena-btn arena-btn-primary arena-btn-submit-solution"
                onClick={() => void handleSubmitSolution()}
                disabled={isEditorLocked || isRunningTests || isSubmitting}
                title="Submit solution for official evaluation"
              >
                {isSubmitting ? (
                  <>
                    <div className="arena-spinner-xs" /> Submitting…
                  </>
                ) : (
                  match.matchType === 'tournament' ? <><Rocket size={15} aria-hidden="true" /> Submit Solution</> : '🚀 Submit Solution'
                )}
              </button>
            </div>
          </div>

          {/* Code Editor Container */}
          <div className="arena-code-editor-box">
            <CodeEditor
              value={code}
              onChange={handleCodeChange}
              onRun={() => void handleRunSampleTests()}
              onReset={handleResetCode}
              disabled={isEditorLocked}
            />

            {isEditorLocked && (
              <div className="arena-editor-lock-banner">
                <span className="arena-lock-icon">{match.matchType === 'tournament' ? <LockKeyhole size={15} aria-hidden="true" /> : '🔒'}</span>
                <span>
                  {isPlayerCompleted
                    ? 'Solution finalized — all test cases successfully passed!'
                    : isOutOfAttempts
                      ? 'Maximum official submission attempts reached (5/5).'
                      : isConcluded
                        ? 'Match is concluded and no longer accepts code edits.'
                        : 'Code editor locked.'}
                </span>
              </div>
            )}
          </div>

          {/* ─── EXECUTION RESULTS DRAWER ─────────────────────────── */}
          <div className="arena-results-drawer">
            <div className="arena-results-drawer-header">
              <div className="arena-results-tabs">
                <button
                  type="button"
                  className={`arena-results-tab-btn ${activeDrawerTab === 'sample-tests' ? 'active' : ''}`}
                  onClick={() => setActiveDrawerTab('sample-tests')}
                >
                  Sample Tests
                  {sampleRunResult && (
                    <span className={`arena-tab-badge ${sampleRunResult.allPassed ? 'pass' : 'fail'}`}>
                      {sampleRunResult.passedCount}/{sampleRunResult.totalCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`arena-results-tab-btn ${activeDrawerTab === 'submission' ? 'active' : ''}`}
                  onClick={() => setActiveDrawerTab('submission')}
                >
                  Submission Status
                  {submitResult && (
                    <span className={`arena-tab-badge ${submitResult.allPassed ? 'pass' : 'fail'}`}>
                      {submitResult.passedCount}/{submitResult.totalCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`arena-results-tab-btn ${activeDrawerTab === 'console' ? 'active' : ''}`}
                  onClick={() => setActiveDrawerTab('console')}
                >
                  Console Output
                  {sampleRunResult?.stdout && <span className="arena-tab-badge-dot" />}
                </button>
              </div>

              {sampleRunResult?.durationMs !== undefined && (
                <span className="arena-execution-time">
                  {match.matchType === 'tournament' ? <Zap size={14} aria-hidden="true" /> : '⚡'} {sampleRunResult.durationMs}ms
                </span>
              )}
            </div>

            <div className="arena-results-drawer-body">
              {/* Tab: Sample Tests */}
              {activeDrawerTab === 'sample-tests' && (
                <div className="arena-tab-panel">
                  {isRunningTests ? (
                    <div className="arena-evaluating-placeholder">
                      <div className="arena-spinner-sm" />
                      <span>Executing solution against sample test harness…</span>
                    </div>
                  ) : sampleRunResult ? (
                    <div className="arena-test-results-container">
                      <div className={`arena-run-summary-banner ${sampleRunResult.allPassed ? 'success' : 'failure'}`}>
                        <span>{sampleRunResult.allPassed ? '✓ ALL SAMPLE TESTS PASSED' : '✗ SAMPLE TESTS FAILED'}</span>
                        <span>
                          {sampleRunResult.passedCount} of {sampleRunResult.totalCount} tests passed
                        </span>
                      </div>

                      {sampleRunResult.error && (
                        <div className="arena-result-error-banner">
                          <strong>Runtime / Harness Error:</strong>
                          <pre>{sampleRunResult.error}</pre>
                        </div>
                      )}

                      <div className="arena-test-cards-grid">
                        {sampleRunResult.results.map((r, i) => (
                          <div
                            key={i}
                            className={`arena-test-case-card ${r.passed ? 'passed' : 'failed'}`}
                          >
                            <div className="arena-test-case-card-head">
                              <span className="arena-test-case-idx">Test #{i + 1}</span>
                              <span className={`arena-test-badge ${r.passed ? 'pass' : 'fail'}`}>
                                {r.passed ? 'PASSED' : 'FAILED'}
                              </span>
                            </div>

                            <div className="arena-test-io-comparison">
                              <div className="arena-io-half">
                                <span className="arena-io-label">Expected:</span>
                                <pre className="arena-code-block expected">
                                  {JSON.stringify(r.expected, null, 2)}
                                </pre>
                              </div>
                              <div className="arena-io-half">
                                <span className="arena-io-label">Actual:</span>
                                <pre className="arena-code-block actual">
                                  {r.actual !== undefined ? JSON.stringify(r.actual, null, 2) : 'None'}
                                </pre>
                              </div>
                            </div>

                            {r.error && (
                              <div className="arena-test-card-error">
                                <em>Error:</em> {r.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="arena-results-empty">
                      <span>{match.matchType === 'tournament' ? <Play size={17} aria-hidden="true" /> : '▶️'}</span>
                      <p>Run sample tests to verify your algorithm against visible cases.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Submission Evaluation */}
              {activeDrawerTab === 'submission' && (
                <div className="arena-tab-panel">
                  {isSubmitting ? (
                    <div className="arena-evaluating-placeholder">
                      <div className="arena-spinner-sm" />
                      <span>Submitting and evaluating full test harness…</span>
                    </div>
                  ) : submitResult ? (
                    <div className="arena-submission-result-box">
                      <div className={`arena-submission-banner ${submitResult.allPassed ? 'victory' : 'partial'}`}>
                        <div className="arena-sub-banner-icon">
                          {match.matchType === 'tournament'
                            ? submitResult.allPassed ? <Trophy size={19} aria-hidden="true" /> : <AlertTriangle size={19} aria-hidden="true" />
                            : submitResult.allPassed ? '🏆' : '⚠️'}
                        </div>
                        <div>
                          <h4>
                            {submitResult.allPassed
                              ? 'ALL TESTS PASSED — SUBMISSION FINALIZED'
                              : 'SUBMISSION INCOMPLETE — TESTS FAILED'}
                          </h4>
                          <p>
                            {submitResult.allPassed
                              ? 'Congratulations! Your algorithm met all test constraints.'
                              : `${submitResult.totalCount - submitResult.passedCount} test case(s) failed. You have ${attemptsRemaining} attempts remaining.`}
                          </p>
                        </div>
                      </div>

                      <div className="arena-submission-stats-row">
                        <div className="arena-sub-stat">
                          <span className="arena-sub-stat-label">Tests Passed</span>
                          <strong>
                            {submitResult.passedCount} / {submitResult.totalCount}
                          </strong>
                        </div>
                        <div className="arena-sub-stat">
                          <span className="arena-sub-stat-label">Calculated Score</span>
                          <strong>{submitResult.score} pts</strong>
                        </div>
                        <div className="arena-sub-stat">
                          <span className="arena-sub-stat-label">Server Elapsed</span>
                          <strong>{(submitResult.elapsedMs / 1000).toFixed(2)}s</strong>
                        </div>
                        <div className="arena-sub-stat">
                          <span className="arena-sub-stat-label">Remaining Attempts</span>
                          <strong>{attemptsRemaining} / 5</strong>
                        </div>
                      </div>
                    </div>
                  ) : submitError ? (
                    <div className="arena-result-error-banner">
                      <strong>Submission Rejected:</strong>
                      <p>{submitError}</p>
                    </div>
                  ) : (
                    <div className="arena-results-empty">
                      <span>{match.matchType === 'tournament' ? <Rocket size={17} aria-hidden="true" /> : '🚀'}</span>
                      <p>No official submission made yet. Submit when ready to test against full criteria.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Console Output */}
              {activeDrawerTab === 'console' && (
                <div className="arena-tab-panel">
                  {sampleRunResult?.stdout ? (
                    <div className="arena-console-box">
                      <div className="arena-console-title">Standard Output (stdout)</div>
                      <pre className="arena-console-stream">{sampleRunResult.stdout}</pre>
                    </div>
                  ) : (
                    <div className="arena-results-empty">
                      <span>{match.matchType === 'tournament' ? <Laptop size={17} aria-hidden="true" /> : '💻'}</span>
                      <p>No stdout printed. Use print() in Python to inspect internal variables.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          FORFEIT CONFIRMATION MODAL
          ══════════════════════════════════════════════════════════════ */}
      {showForfeitConfirm && (
        <div className="arena-modal-backdrop animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="forfeit-title" aria-describedby="forfeit-description">
          <div className="arena-modal-card">
            <div className="arena-modal-icon-badge danger">{match.matchType === 'tournament' ? <AlertTriangle size={20} aria-hidden="true" /> : '⚠️'}</div>
            <h3 id="forfeit-title">Surrender Duel?</h3>
            <p id="forfeit-description">
              Forfeiting will immediately concede victory to your opponent.
              Your competitive rating will decrease, and this duel will be permanently recorded as a defeat.
            </p>
            <div className="arena-modal-actions">
              <button
                type="button"
                className="arena-btn arena-btn-secondary"
                onClick={() => setShowForfeitConfirm(false)}
                disabled={isForfeiting}
              >
                Continue Fighting
              </button>
              <button
                type="button"
                className="arena-btn arena-btn-danger"
                onClick={() => void handleForfeit()}
                disabled={isForfeiting}
              >
                {isForfeiting ? 'Forfeiting…' : 'Confirm Forfeit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          CANCEL UNTOUCHED MATCH MODAL
          ══════════════════════════════════════════════════════════════ */}
      {showCancelConfirm && (
        <div className="arena-modal-backdrop animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="cancel-match-title" aria-describedby="cancel-match-description">
          <div className="arena-modal-card">
            <div className="arena-modal-icon-badge warning">{match.matchType === 'tournament' ? <X size={20} aria-hidden="true" /> : '✕'}</div>
            <h3 id="cancel-match-title">Cancel Untouched Match?</h3>
            <p id="cancel-match-description">
              This duel has not started yet. Cancelling will safely close this match session
              without adjusting rating or recording a defeat.
            </p>
            <div className="arena-modal-actions">
              <button
                type="button"
                className="arena-btn arena-btn-secondary"
                onClick={() => setShowCancelConfirm(false)}
                disabled={isCancelling}
              >
                Keep Match
              </button>
              <button
                type="button"
                className="arena-btn arena-btn-danger"
                onClick={async () => {
                  if (!onCancelMatch) return;
                  setIsCancelling(true);
                  try {
                    await onCancelMatch(match.id);
                  } finally {
                    setIsCancelling(false);
                    setShowCancelConfirm(false);
                  }
                }}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MATCH RESULT OVERLAY
          ══════════════════════════════════════════════════════════════ */}
      {showResultOverlay && matchResult && (
        <div className="arena-result-overlay animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="arena-result-title" aria-describedby="arena-result-description">
          <div className={`arena-result-card outcome-${resultOutcome}`}>
            <div className="arena-result-card-header">
              <span className="arena-result-sysmsg">[ SYSTEM NOTIFICATION · MATCH RESOLVED ]</span>
              <h1 id="arena-result-title" className="arena-result-main-title">
                {resultOutcome === 'win' ? 'VICTORY ACHIEVED'
                  : resultOutcome === 'loss' ? 'DEFEAT'
                    : resultOutcome === 'draw' ? 'STALEMATE · DRAW'
                      : resultOutcome === 'cancelled' ? 'MATCH CANCELLED'
                        : resultOutcome === 'expired' ? 'MATCH EXPIRED · NO RESULT'
                          : resultOutcome === 'abandoned' ? 'MATCH ABANDONED'
                            : 'MATCH RESULT UNAVAILABLE'}
              </h1>
              <p id="arena-result-description" className="arena-result-sub-lore">
                {resultOutcome === 'win' ? (isTournamentMatch ? 'You advanced in the tournament.' : 'You won the ranked duel.')
                  : resultOutcome === 'loss' ? (isTournamentMatch ? 'Your opponent advanced in the tournament.' : 'Your opponent won the ranked duel.')
                    : resultOutcome === 'draw' ? 'The match ended with an officially scored draw.'
                      : resultOutcome === 'cancelled' ? 'This match was cancelled before a scored result was recorded.'
                        : resultOutcome === 'expired' ? 'The deadline passed without a scored result. No match rewards were awarded.'
                          : resultOutcome === 'abandoned' ? 'The match ended without a confirmed winner.'
                            : 'The server did not provide a scored result for this match.'}
              </p>
            </div>

            {/* Combatants Results Comparison */}
            <div className="arena-result-combatants-stage">
              <div className="arena-result-fighter you">
                <span className="arena-fighter-label">YOU</span>
                <strong className="arena-fighter-name">{youResult?.name || you.name}</strong>
                <div className="arena-fighter-score">{youResult?.score ?? 0} pts</div>
                <div className="arena-fighter-tests">
                  {youResult?.passedCount ?? 0} / {youResult?.totalTests ?? 0} tests passed
                </div>
              </div>

              <div className="arena-result-vs-pill">VS</div>

              <div className="arena-result-fighter opponent">
                <span className="arena-fighter-label">OPPONENT</span>
                <strong className="arena-fighter-name">{oppResult?.name || opponent.name}</strong>
                <div className="arena-fighter-score">{oppResult?.score ?? 0} pts</div>
                <div className="arena-fighter-tests">
                  {oppResult?.passedCount ?? 0} / {oppResult?.totalTests ?? 0} tests passed
                </div>
              </div>
            </div>

            {/* Rating Progression Card */}
            <div className="arena-result-rating-panel">
              <span className="arena-kicker">Rating Adjustment</span>
              {isTournamentMatch ? (
                <div style={{ padding: '8px 0', color: 'var(--accent-cyan)', fontSize: '0.85rem', fontWeight: 600 }}>
                  <><Trophy size={16} aria-hidden="true" /> Tournament Match — Normal Ranked Arena Elo is strictly isolated (0 SR adjustment).</>
                </div>
              ) : (
                <div className="arena-rating-transition-row">
                  <span className="arena-res-rating before">{resultRatingBefore} SR</span>
                  <span className="arena-res-arrow">➔</span>
                  <span className="arena-res-rating after">{resultRatingAfter} SR</span>
                  <span className={`arena-res-delta ${resultRatingDelta >= 0 ? 'positive' : 'negative'}`}>
                    ({resultRatingDelta >= 0 ? `+${resultRatingDelta}` : resultRatingDelta} SR)
                  </span>
                </div>
              )}

              {hasDivisionChanged && (
                <div className="arena-res-division-alert">
                  {match.matchType === 'tournament' ? <Medal size={16} aria-hidden="true" /> : <span>🎖️</span>}
                  <strong>
                    {resultRatingDelta > 0
                      ? `PROMOTED TO ${divAfter.toUpperCase()} DIVISION!`
                      : `DEMOTED TO ${divAfter.toUpperCase()} DIVISION`}
                  </strong>
                </div>
              )}
            </div>

            {/* Confirmed Server Rewards */}
            {matchResult.rewards && (matchResult.rewards.hunterXp > 0 || matchResult.rewards.seasonXp > 0) && <div className="arena-result-rewards-panel">
              <span className="arena-kicker">Rewards Awarded</span>
              <div className="arena-result-rewards-chips">
                {matchResult.rewards.hunterXp > 0 && (
                  <div className="arena-res-reward-chip">
                    <span className="arena-reward-chip-icon">{match.matchType === 'tournament' ? <Zap size={15} aria-hidden="true" /> : '⚡'}</span>
                    <span>+{matchResult.rewards.hunterXp} Hunter XP</span>
                  </div>
                )}
                {matchResult.rewards.seasonXp > 0 && <div className="arena-res-reward-chip">
                  <span className="arena-reward-chip-icon">{match.matchType === 'tournament' ? <Trophy size={15} aria-hidden="true" /> : '🏆'}</span>
                  <span>+{matchResult.rewards.seasonXp} Season XP</span>
                </div>}
              </div>
            </div>}

            <div className="arena-result-card-actions">
              {match.matchType === 'tournament' ? (
                <button
                  type="button"
                  className="arena-btn arena-btn-primary arena-btn-lg"
                  onClick={() => navigate(match.tournamentContext?.tournamentId ? `/tournaments/${match.tournamentContext.tournamentId}` : '/tournaments')}
                >
                  <><Trophy size={16} aria-hidden="true" /> Return to Tournament Bracket</>
                </button>
              ) : (
                <button
                  type="button"
                  className="arena-btn arena-btn-primary arena-btn-lg"
                  onClick={onExitMatch}
                >
                  Return to Arena Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  FIND MATCH SECTION (PHASE 2 MATCHMAKING STATE MACHINE)
// ═══════════════════════════════════════════════════════════════════

function FindMatchSection({
  profile,
  token,
  username,
  mmState,
  setMmState,
  onProfileUpdate,
}: {
  profile: ArenaProfile | null;
  token: string | null;
  username: string;
  mmState: MatchmakingFlowState;
  setMmState: React.Dispatch<React.SetStateAction<MatchmakingFlowState>>;
  onProfileUpdate: () => void;
}) {
  const navigate = useNavigate();
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [queuePollError, setQueuePollError] = useState<string | null>(null);
  const [matchDetailsError, setMatchDetailsError] = useState<string | null>(null);

  useEffect(() => {
    if (mmState.status === 'matched' && !mmState.matchDetails) {
      setMatchDetailsError((current) => current || 'Your match is confirmed, but match details could not be loaded.');
    } else if (mmState.status === 'matched' && mmState.matchDetails) {
      setMatchDetailsError(null);
    }
  }, [mmState]);

  // References to keep polling clean & prevent duplicate polls
  const pollIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Clean countdown helper
  const stopCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      stopCountdown();
    };
  }, [stopPolling, stopCountdown]);

  // ─── Handle Poll Loop when QUEUED ────────────────────────────────
  useEffect(() => {
    if (mmState.status !== 'queued' || !token) {
      stopPolling();
      return;
    }

    const queuedAtIso = mmState.queuedAt;

    // 1. Elapsed timer tick
    timerIntervalRef.current = window.setInterval(() => {
      setMmState((prev) => {
        if (prev.status !== 'queued') return prev;
        const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(queuedAtIso)) / 1000));
        return { ...prev, elapsedSeconds: elapsed };
      });
    }, 1000);

    // 2. Poll server queue status every 2000ms
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const res = await fetchQueueStatus(token);
        if (!res.ok || !res.data) {
          setQueuePollError(res.error || 'Could not refresh matchmaking status.');
          return;
        }
        setQueuePollError(null);

        const data: QueueStatusResponse = res.data;

        // Condition A: Match is created!
        if (data.hasActiveMatch && data.matchId) {
          stopPolling();
          // Fetch confirmed match details
          const matchRes = await fetchMatchDetails(token, data.matchId);
          if (matchRes.ok && matchRes.data) {
            setMmState({
              status: 'matched',
              matchId: data.matchId,
              matchDetails: matchRes.data,
            });
            onProfileUpdate();
          } else {
            // Still matched, but waiting for details
            setMatchDetailsError(matchRes.error || 'Match found, but its details could not be loaded.');
            setMmState({
              status: 'matched',
              matchId: data.matchId,
              matchDetails: null,
            });
          }
          return;
        }

        // Condition B: Left queue or expired
        if (!data.inQueue) {
          stopPolling();
          setMmState({
            status: 'error',
            message: 'Queue session expired or was completed. Please search for a match again.',
            canRetry: true,
          });
        }
      } catch (err) {
        setQueuePollError(err instanceof Error ? err.message : 'Network error while checking matchmaking.');
      }
    }, 2000);

    return () => {
      stopPolling();
    };
  }, [mmState.status, token, stopPolling, setMmState, onProfileUpdate]);

  // ─── Countdown when MATCHED ──────────────────────────────────────
  useEffect(() => {
    if (mmState.status !== 'matched') {
      stopCountdown();
      setCountdown(null);
      return;
    }

    const matchedState = mmState;
    setCountdown(4);

    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          stopCountdown();
          // Transition to MATCH READY!
          if (matchedState.matchDetails) {
            setMmState({ status: 'ready', match: matchedState.matchDetails });
            navigate(`/arena/match/${matchedState.matchId}`);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      stopCountdown();
    };
  }, [mmState, stopCountdown, setMmState, navigate]);

  // ─── Actions: Join Queue ─────────────────────────────────────────
  const handleJoinQueue = async () => {
    if (!token || isJoining || mmState.status === 'queued') return;
    setIsJoining(true);

    try {
      const res = await joinQueue(token);

      if (!res.ok || !res.data) {
        setMmState({
          status: 'error',
          message: res.error || 'Failed to enter matchmaking queue.',
          canRetry: true,
        });
        setIsJoining(false);
        return;
      }

      const data = res.data;

      if (data.status === 'matched' && data.matchId) {
        // Matched immediately or reconnected to active match!
        const matchRes = await fetchMatchDetails(token, data.matchId);
        if (matchRes.ok && matchRes.data) {
          setMmState({
            status: 'matched',
            matchId: data.matchId,
            opponentName: data.opponentName,
            matchDetails: matchRes.data,
          });
        } else {
          setMatchDetailsError(matchRes.error || 'Match found, but its details could not be loaded.');
          setMmState({
            status: 'matched',
            matchId: data.matchId,
            opponentName: data.opponentName,
            matchDetails: null,
          });
        }
        onProfileUpdate();
      } else {
        // Queued successfully
        const queuedAt = data.queuedAt || new Date().toISOString();
        setMmState({
          status: 'queued',
          queuedAt,
          elapsedSeconds: 0,
        });
      }
    } catch (err) {
      setMmState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Matchmaking server connection error.',
        canRetry: true,
      });
    } finally {
      setIsJoining(false);
    }
  };

  const retryMatchDetails = async () => {
    if (!token || mmState.status !== 'matched' || isJoining) return;
    setIsJoining(true);
    setMatchDetailsError(null);
    const res = await fetchMatchDetails(token, mmState.matchId);
    if (res.ok && res.data) {
      setMmState({ ...mmState, matchDetails: res.data });
    } else {
      setMatchDetailsError(res.error || 'Match found, but its details could not be loaded.');
    }
    setIsJoining(false);
  };

  // ─── Actions: Leave Queue ────────────────────────────────────────
  const handleLeaveQueue = async () => {
    if (!token || isLeaving) return;
    setIsLeaving(true);

    try {
      stopPolling();
      const res = await leaveQueue(token);
      if (res.ok) {
        setMmState({ status: 'idle' });
      } else {
        setMmState({
          status: 'error',
          message: res.error || 'Could not leave queue.',
          canRetry: true,
        });
      }
    } catch (err) {
      setMmState({
        status: 'error',
        message: 'Network error while attempting to leave queue.',
        canRetry: true,
      });
    } finally {
      setIsLeaving(false);
    }
  };

  // ─── Actions: Cancel Active Match ────────────────────────────────
  const handleCancelActiveMatch = async (matchId: string) => {
    if (!token) return;
    try {
      const res = await cancelArenaMatch(token, matchId);
      if (res.ok && res.data?.success) {
        setMmState({ status: 'idle' });
        navigate('/arena');
        onProfileUpdate();
      } else {
        alert(res.error || 'Match cannot be cancelled once active.');
      }
    } catch {
      alert('Failed to cancel match.');
    }
  };

  const divInfo = profile ? getDivisionInfo(profile.division) : null;

  // ═════════════════════════════════════════════════════════════════
  //  STATE RENDERING
  // ═════════════════════════════════════════════════════════════════

  return (
    <div className="arena-find-match">
      {/* ─── State: ERROR ────────────────────────────────────────── */}
      {mmState.status === 'error' && (
        <div className="arena-mm-card error-card">
          <div className="arena-mm-error-badge">⚠️</div>
          <h3>Matchmaking Notice</h3>
          <p className="arena-mm-error-message">{mmState.message}</p>
          <div className="arena-mm-actions">
            {mmState.canRetry && (
              <button
                type="button"
                className="arena-btn arena-btn-primary"
                onClick={() => setMmState({ status: 'idle' })}
              >
                Return to Matchmaking
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── State: QUEUED ───────────────────────────────────────── */}
      {mmState.status === 'queued' && (
        <div className="arena-mm-card queued-card">
          <div className="arena-radar-wrapper">
            <div className="arena-radar-ring outer" />
            <div className="arena-radar-ring middle" />
            <div className="arena-radar-ring inner" />
            <div className="arena-radar-sweep" />
            <div className="arena-radar-core">
              <span className="arena-radar-core-icon">⚡</span>
            </div>
          </div>

          <div className="arena-queued-info">
            {queuePollError && <p className="arena-alert arena-alert-error" role="alert">{queuePollError}</p>}
            <span className="arena-kicker">Matchmaking In Progress</span>
            <h2>Searching for Opponent</h2>
            <div className="arena-queued-timer">
              <span className="arena-timer-value">{formatElapsed(mmState.elapsedSeconds)}</span>
              <span className="arena-timer-label">Elapsed Time</span>
            </div>

            <p className="arena-queued-phase-text">
              {mmState.elapsedSeconds < 15
                ? 'Scanning active hunters within current division rating bracket…'
                : mmState.elapsedSeconds < 30
                  ? 'Widening rating window (±100 SR) for optimal match balance…'
                  : mmState.elapsedSeconds < 45
                    ? 'Expanding search parameters across neighboring divisions…'
                    : 'Searching all available hunters in active season…'}
            </p>

            {/* Current Hunter Card in Queue */}
            {profile && divInfo && (
              <div className="arena-queued-hunter-chip">
                <div className="arena-hunter-chip-avatar">
                  <span>{divInfo.icon}</span>
                </div>
                <div className="arena-hunter-chip-details">
                  <strong>{username}</strong>
                  <span style={{ color: divInfo.color }}>{profile.division} · {profile.rating} SR</span>
                </div>
              </div>
            )}
          </div>

          <div className="arena-queued-actions">
            <button
              type="button"
              className="arena-btn arena-btn-secondary arena-btn-cancel-search"
              onClick={() => void handleLeaveQueue()}
              disabled={isLeaving}
            >
              {isLeaving ? 'Cancelling Search…' : 'Cancel Search'}
            </button>
          </div>
        </div>
      )}

      {/* ─── State: MATCH FOUND ──────────────────────────────────── */}
      {mmState.status === 'matched' && (
        <div className="arena-mm-card matched-card animate-fadeInUp">
          <div className="arena-matched-banner">
            <span className="arena-matched-badge">CONFIRMED</span>
            <h2>OPPONENT FOUND</h2>
          </div>

          {mmState.matchDetails ? (
            (() => {
              const match = mmState.matchDetails;
              const you = match.player1.isYou ? match.player1 : match.player2;
              const opponent = match.player1.isYou ? match.player2 : match.player1;
              const oppDiv = getDivision(opponent.ratingBefore);
              const oppDivInfo = getDivisionInfo(oppDiv);
              const yourDiv = getDivision(you.ratingBefore);
              const yourDivInfo = getDivisionInfo(yourDiv);

              return (
                <div className="arena-vs-stage">
                  {/* Combatant 1: You */}
                  <div className="arena-combatant-card you">
                    <div className="arena-combatant-emblem" style={{ borderColor: yourDivInfo.color }}>
                      <span>{yourDivInfo.icon}</span>
                    </div>
                    <div className="arena-combatant-info">
                      <span className="arena-combatant-label">YOU</span>
                      <strong className="arena-combatant-name">{you.name}</strong>
                      <span className="arena-combatant-rank" style={{ color: yourDivInfo.color }}>
                        {yourDiv} Division
                      </span>
                      <span className="arena-combatant-sr">{you.ratingBefore} SR</span>
                    </div>
                  </div>

                  {/* VS Divider */}
                  <div className="arena-vs-divider">
                    <span className="arena-vs-text">VS</span>
                    <div className="arena-vs-sparks" />
                  </div>

                  {/* Combatant 2: Confirmed Opponent */}
                  <div className="arena-combatant-card opponent">
                    <div className="arena-combatant-emblem" style={{ borderColor: oppDivInfo.color }}>
                      <span>{oppDivInfo.icon}</span>
                    </div>
                    <div className="arena-combatant-info">
                      <span className="arena-combatant-label">OPPONENT</span>
                      <strong className="arena-combatant-name">{opponent.name}</strong>
                      <span className="arena-combatant-rank" style={{ color: oppDivInfo.color }}>
                        {oppDiv} Division
                      </span>
                      <span className="arena-combatant-sr">{opponent.ratingBefore} SR</span>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="arena-loading-inline" role="status">
              {matchDetailsError ? <>
                <span role="alert">{matchDetailsError}</span>
                <button type="button" className="arena-btn arena-btn-secondary" onClick={() => void retryMatchDetails()} disabled={isJoining}>
                  {isJoining ? 'Retrying…' : 'Retry match details'}
                </button>
              </> : <><div className="arena-spinner-sm" /> Loading confirmed opponent details…</>}
            </div>
          )}

          {/* Match Challenge Briefing */}
          {mmState.matchDetails && (
            <div className="arena-match-briefing">
              <div className="arena-briefing-item">
                <span className="arena-briefing-label">Challenge</span>
                <strong>{mmState.matchDetails.challenge.title}</strong>
              </div>
              <div className="arena-briefing-item">
                <span className="arena-briefing-label">Time Limit</span>
                <strong>{Math.floor(mmState.matchDetails.durationLimitSec / 60)} Minutes</strong>
              </div>
              <div className="arena-briefing-item">
                <span className="arena-briefing-label">Mode</span>
                <strong>1v1 Ranked Duel</strong>
              </div>
            </div>
          )}

          {/* Transition CTA */}
          <div className="arena-matched-transition-bar">
            <span className="arena-countdown-text">
              {countdown !== null && countdown > 0
                ? `Entering Match Arena in ${countdown}s…`
                : 'Entering Match Arena…'}
            </span>
            <button
              type="button"
              className="arena-btn arena-btn-primary arena-btn-enter-match"
              disabled={!mmState.matchDetails || isJoining}
              onClick={() => {
                stopCountdown();
                if (mmState.matchDetails) {
                  setMmState({ status: 'ready', match: mmState.matchDetails });
                  navigate(`/arena/match/${mmState.matchId}`);
                }
              }}
            >
              Enter Match Arena Now →
            </button>
          </div>
        </div>
      )}

      {/* ─── State: MATCH READY / LIVE CODING WORKSPACE ────────────── */}
      {mmState.status === 'ready' && (
        <ArenaMatchWorkspace
          initialMatch={mmState.match}
          token={token!}
          onExitMatch={() => {
            navigate('/arena');
            setMmState({ status: 'idle' });
            onProfileUpdate();
          }}
          onProfileUpdate={onProfileUpdate}
          onCancelMatch={handleCancelActiveMatch}
        />
      )}

      {/* ─── State: IDLE ─────────────────────────────────────────── */}
      {mmState.status === 'idle' && (
        <div className="arena-matchmaking-card">
          <div className="arena-matchmaking-header">
            <div className="arena-header-headline">
              <div>
                <h2>Ranked Matchmaking</h2>
                <p>
                  Queue for an automated 1v1 algorithmic duel. Matches pair you against verified hunters in your division window.
                </p>
              </div>
              <div className="arena-connection-status">
                <span className="arena-connection-dot online" />
                <span className="arena-connection-text">Ranked Service: Online</span>
              </div>
            </div>
          </div>

          <div className="arena-matchmaking-body">
            {/* Player info summary */}
            {profile && divInfo && (
              <div className="arena-matchmaking-player">
                <div className="arena-matchmaking-player-div" style={{ borderColor: divInfo.color, boxShadow: `0 0 16px ${divInfo.color}33` }}>
                  <span>{divInfo.icon}</span>
                </div>
                <div className="arena-matchmaking-player-meta">
                  <strong style={{ color: divInfo.color }}>{profile.division} Division</strong>
                  <span>{profile.rating} SR · {profile.matchesPlayed} matches · {profile.winRate}% Win Rate</span>
                </div>
              </div>
            )}

            {/* Find Match Button */}
            <div className="arena-matchmaking-action">
              <button
                type="button"
                className="arena-btn arena-btn-primary arena-btn-find-match"
                onClick={() => void handleJoinQueue()}
                disabled={isJoining}
              >
                {isJoining ? (
                  <><div className="arena-spinner-sm" /> Joining Queue…</>
                ) : (
                  <>⚔️ Find Match</>
                )}
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="arena-matchmaking-info">
            <h4>Matchmaking Rules & System</h4>
            <div className="arena-matchmaking-steps">
              <div className="arena-matchmaking-step">
                <span className="arena-step-number">1</span>
                <div>
                  <strong>Queue Entry</strong>
                  <span>Join matchmaking with real-time division rating matching.</span>
                </div>
              </div>
              <div className="arena-matchmaking-step">
                <span className="arena-step-number">2</span>
                <div>
                  <strong>Opponent Lock</strong>
                  <span>Paired with a compatible hunter within expanding rating boundaries.</span>
                </div>
              </div>
              <div className="arena-matchmaking-step">
                <span className="arena-step-number">3</span>
                <div>
                  <strong>Timed Duel</strong>
                  <span>Solve the server challenge before the deadline.</span>
                </div>
              </div>
              <div className="arena-matchmaking-step">
                <span className="arena-step-number">4</span>
                <div>
                  <strong>Elo Progression</strong>
                  <span>Win to earn rating points and promote to higher divisions.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Division Tiers */}
      <div className="arena-panel">
        <div className="arena-panel-header">
          <h3>Competitive Division Tiers</h3>
          <span className="arena-panel-subtitle">Rating requirements for each division</span>
        </div>
        <div className="arena-panel-body">
          <div className="arena-division-tiers">
            {DIVISIONS.map((d) => (
              <div
                key={d.name}
                className={`arena-division-tier ${profile?.division === d.name ? 'current' : ''}`}
                style={{ '--div-color': d.color } as React.CSSProperties}
              >
                <span className="arena-tier-icon">{d.icon}</span>
                <strong>{d.name}</strong>
                <span className="arena-tier-range">
                  {d.minRating}–{d.maxRating > 9000 ? '∞' : d.maxRating}
                </span>
                {profile?.division === d.name && <span className="arena-tier-you">YOU</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MATCH HISTORY SECTION
// ═══════════════════════════════════════════════════════════════════

function HistorySection({ token }: { token: string | null }) {
  const [history, setHistory] = useState<MatchHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number) => {
    if (!token) return;
    setLoading(true);
    const res = await fetchMatchHistory(token, p, 10);
    if (res.ok && res.data) { setHistory(res.data); setError(null); }
    else setError(res.error || 'Unable to load match history.');
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  return (
    <div className="arena-history">
      <div className="arena-panel">
        <div className="arena-panel-header">
          <h3>Match History</h3>
          {history && <span className="arena-panel-subtitle">{history.total} total matches</span>}
        </div>
        <div className="arena-panel-body">
          {loading ? (
            <div className="arena-loading-inline"><div className="arena-spinner-sm" /> Loading match history…</div>
          ) : error ? (
            <div className="arena-empty-inline" role="alert"><p>{error}</p><button type="button" className="arena-btn arena-btn-secondary" onClick={() => void load(page)}>Retry</button></div>
          ) : !history || history.matches.length === 0 ? (
            <div className="arena-empty-inline">
              <span>📭</span>
              <p>No match history yet. Complete your first ranked match to see results here.</p>
            </div>
          ) : (
            <>
              <div className="arena-match-list">
                {history.matches.map((m) => (
                  <MatchRow key={m.id} match={m} showDate />
                ))}
              </div>

              {/* Pagination */}
              {history.totalPages > 1 && (
                <div className="arena-pagination">
                  <button
                    type="button"
                    className="arena-btn arena-btn-small"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    ← Previous
                  </button>
                  <span className="arena-pagination-info">
                    Page {history.page} of {history.totalPages}
                  </span>
                  <button
                    type="button"
                    className="arena-btn arena-btn-small"
                    disabled={page >= history.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  LEADERBOARD SECTION
// ═══════════════════════════════════════════════════════════════════

function LeaderboardSection({ token }: { token: string | null }) {
  const [lb, setLb] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [division, setDivision] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, div: string) => {
    if (!token) return;
    setLoading(true);
    const res = await fetchArenaLeaderboard(token, p, 25, div);
    if (res.ok && res.data) { setLb(res.data); setError(null); }
    else setError(res.error || 'Unable to load leaderboard.');
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load(page, division);
  }, [load, page, division]);

  return (
    <div className="arena-leaderboard-section">
      <div className="arena-panel">
        <div className="arena-panel-header">
          <h3>Arena Leaderboard</h3>
          <div className="arena-lb-filters">
            <select
              className="arena-select"
              value={division}
              onChange={(e) => { setDivision(e.target.value); setPage(1); }}
              aria-label="Filter by division"
            >
              <option value="all">All Divisions</option>
              {DIVISIONS.map((d) => (
                <option key={d.name} value={d.name}>{d.icon} {d.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="arena-panel-body">
          {loading ? (
            <div className="arena-loading-inline"><div className="arena-spinner-sm" /> Loading leaderboard…</div>
          ) : error ? (
            <div className="arena-empty-inline" role="alert"><p>{error}</p><button type="button" className="arena-btn arena-btn-secondary" onClick={() => void load(page, division)}>Retry</button></div>
          ) : !lb || lb.entries.length === 0 ? (
            <div className="arena-empty-inline">
              <span>🏆</span>
              <p>No rankings yet{division !== 'all' ? ` in ${division} division` : ''}. Be the first to compete!</p>
            </div>
          ) : (
            <>
              <div className="arena-lb-table-wrap">
                <table className="arena-lb-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Hunter</th>
                      <th>Division</th>
                      <th>Rating</th>
                      <th>W/L/D</th>
                      <th>Win%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lb.entries.map((entry) => (
                      <LeaderboardRow key={entry.userId} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>

              {lb.totalPages > 1 && (
                <div className="arena-pagination">
                  <button
                    type="button"
                    className="arena-btn arena-btn-small"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    ← Previous
                  </button>
                  <span className="arena-pagination-info">
                    Page {lb.page} of {lb.totalPages}
                  </span>
                  <button
                    type="button"
                    className="arena-btn arena-btn-small"
                    disabled={page >= lb.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  SHARED SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent?: string;
}) {
  return (
    <div className="arena-stat-card">
      <span className="arena-stat-icon" style={accent ? { color: accent } : undefined}>
        {icon}
      </span>
      <div className="arena-stat-info">
        <span className="arena-stat-value">{value}</span>
        <span className="arena-stat-label">{label}</span>
      </div>
    </div>
  );
}

function MatchRow({ match, showDate }: { match: MatchHistoryEntry; showDate?: boolean }) {
  const resultClass = match.result === 'win' ? 'win' : match.result === 'loss' ? 'loss' : 'draw';
  const resultLabel = match.result === 'win' ? 'Victory' : match.result === 'loss' ? 'Defeat' : 'Draw';
  const changeDisplay = ratingChangeStr(match.ratingChange);

  return (
    <div className={`arena-match-row ${resultClass}`}>
      <div className={`arena-match-result-badge ${resultClass}`}>
        {match.result === 'win' ? '✓' : match.result === 'loss' ? '✗' : '='}
      </div>
      <div className="arena-match-info">
        <div className="arena-match-primary">
          <strong className={`arena-match-result-text ${resultClass}`}>{resultLabel}</strong>
          <span className="arena-match-vs">vs {match.opponentName}</span>
        </div>
        <div className="arena-match-secondary">
          {showDate && match.endTime && <span>{formatDateTime(match.endTime)}</span>}
          {!showDate && match.endTime && <span>{formatTimeAgo(match.endTime)}</span>}
          <span className="arena-match-type-label">{match.matchType === 'tournament' ? 'Tournament' : 'Ranked'}</span>
        </div>
      </div>
      {match.matchType === 'tournament' ? <div className="arena-match-rating-change"><span className="arena-match-type-label">No ranked SR change</span></div> : <div className="arena-match-rating-change">
        <span className={`arena-rating-delta ${match.ratingChange >= 0 ? 'positive' : 'negative'}`}>
          {changeDisplay}
        </span>
        <span className="arena-match-rating-after">{match.ratingAfter} SR</span>
        <Link
          to={`/arena/spectate/${match.id}`}
          className="arena-match-spectate-btn"
          title="View match analysis in Spectator mode"
        >
          👁️
        </Link>
      </div>}
    </div>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const divInfo = getDivisionInfo(entry.division);

  return (
    <tr>
      <td>
        <span className={`arena-lb-rank ${entry.rank <= 3 ? `top-${entry.rank}` : ''}`}>
          #{entry.rank}
        </span>
      </td>
      <td>
        <div className="arena-lb-player">
          <strong>{entry.name}</strong>
          {entry.title && <small>{entry.title}</small>}
        </div>
      </td>
      <td>
        <span className="arena-lb-division" style={{ color: divInfo.color }}>
          {divInfo.icon} {entry.division}
        </span>
      </td>
      <td className="arena-lb-rating">{entry.rating}</td>
      <td className="arena-lb-wld">{entry.wins}/{entry.losses}/{entry.draws}</td>
      <td className="arena-lb-winrate">{entry.winRate}%</td>
    </tr>
  );
}

// ─── Rating Chart (CSS/SVG — no dependencies) ────────────────────

function RatingChart({ entries }: { entries: RatingHistoryEntry[] }) {
  const sorted = [...entries].reverse();
  if (sorted.length === 0) return null;

  const ratings = sorted.map((e) => e.ratingAfter);
  const minR = Math.min(...ratings) - 30;
  const maxR = Math.max(...ratings) + 30;
  const range = maxR - minR || 1;

  const W = 600;
  const H = 200;
  const padX = 0;
  const padY = 10;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  const points = sorted.map((e, i) => {
    const x = padX + (i / Math.max(1, sorted.length - 1)) * plotW;
    const y = padY + plotH - ((e.ratingAfter - minR) / range) * plotH;
    return { x, y, entry: e };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaD = pathD
    + ` L ${points[points.length - 1].x.toFixed(1)} ${H}`
    + ` L ${points[0].x.toFixed(1)} ${H} Z`;

  const latestRating = sorted[sorted.length - 1].ratingAfter;
  const firstRating = sorted[0].ratingAfter;
  const netChange = latestRating - firstRating;
  const lineColor = netChange >= 0 ? 'var(--color-success)' : 'var(--color-danger)';

  return (
    <div className="arena-rating-chart">
      <div className="arena-rating-chart-header">
        <span>
          Current: <strong>{latestRating}</strong>
        </span>
        <span className={netChange >= 0 ? 'positive' : 'negative'}>
          {netChange >= 0 ? '+' : ''}{netChange} over {sorted.length} games
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="arena-chart-svg" preserveAspectRatio="none" role="img" aria-labelledby="rating-chart-title rating-chart-description">
        <title id="rating-chart-title">Arena rating progression</title>
        <desc id="rating-chart-description">Rating values across the recent recorded ranked matches.</desc>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#areaGrad)" />
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={lineColor} opacity="0.7" />
        ))}
      </svg>
      <div className="arena-chart-labels">
        <span>{formatDate(sorted[0].createdAt)}</span>
        <span>{formatDate(sorted[sorted.length - 1].createdAt)}</span>
      </div>
    </div>
  );
}
