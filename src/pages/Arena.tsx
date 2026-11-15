import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
          setError(res.error || 'Match not found or access denied.');
          setMmState({ status: 'error', message: res.error || 'Match not found.', canRetry: true });
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
        <div className="arena-active-status-bar queued" onClick={onFindMatchClick}>
          <div className="arena-active-pulse" />
          <span>You are searching for a ranked match ({formatElapsed(mmState.elapsedSeconds)} elapsed)</span>
          <button type="button" className="arena-btn arena-btn-small">View Queue →</button>
        </div>
      )}
      {mmState.status === 'ready' && (
        <div className="arena-active-status-bar ready" onClick={onFindMatchClick}>
          <span className="arena-status-icon">⚔️</span>
          <span>Match in progress: #{mmState.match.id.slice(0, 12)}</span>
          <button type="button" className="arena-btn arena-btn-small arena-btn-primary">Return to Match →</button>
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
        if (!res.ok || !res.data) return;

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
        console.warn('Queue poll check error:', err);
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
            <div className="arena-loading-inline">
              <div className="arena-spinner-sm" /> Loading confirmed opponent details…
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

      {/* ─── State: MATCH READY / LOBBY ──────────────────────────── */}
      {mmState.status === 'ready' && (
        <div className="arena-mm-card ready-card animate-fadeInUp">
          {(() => {
            const match = mmState.match;
            const you = match.player1.isYou ? match.player1 : match.player2;
            const opponent = match.player1.isYou ? match.player2 : match.player1;
            const yourDivInfo = getDivisionInfo(getDivision(you.ratingBefore));
            const oppDivInfo = getDivisionInfo(getDivision(opponent.ratingBefore));

            return (
              <>
                <div className="arena-ready-header">
                  <div>
                    <span className="arena-kicker">Match Active · {match.matchType.toUpperCase()}</span>
                    <h2>Match Lobby: #{match.id.slice(0, 16)}</h2>
                  </div>
                  <span className={`arena-match-status-pill ${match.status}`}>
                    {match.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                <div className="arena-vs-stage compact">
                  <div className="arena-combatant-card you">
                    <div className="arena-combatant-emblem" style={{ borderColor: yourDivInfo.color }}>
                      <span>{yourDivInfo.icon}</span>
                    </div>
                    <div className="arena-combatant-info">
                      <span className="arena-combatant-label">YOU</span>
                      <strong className="arena-combatant-name">{you.name}</strong>
                      <span className="arena-combatant-sr">{you.ratingBefore} SR</span>
                    </div>
                  </div>

                  <div className="arena-vs-divider">
                    <span className="arena-vs-text">VS</span>
                  </div>

                  <div className="arena-combatant-card opponent">
                    <div className="arena-combatant-emblem" style={{ borderColor: oppDivInfo.color }}>
                      <span>{oppDivInfo.icon}</span>
                    </div>
                    <div className="arena-combatant-info">
                      <span className="arena-combatant-label">OPPONENT</span>
                      <strong className="arena-combatant-name">{opponent.name}</strong>
                      <span className="arena-combatant-sr">{opponent.ratingBefore} SR</span>
                    </div>
                  </div>
                </div>

                {/* Challenge Details */}
                <div className="arena-ready-challenge-card">
                  <div className="arena-ready-challenge-head">
                    <div>
                      <span className="arena-kicker">Algorithm Challenge</span>
                      <h3>{match.challenge.title}</h3>
                    </div>
                    <span className="arena-badge-function">
                      def {match.challenge.functionName}()
                    </span>
                  </div>
                  <p className="arena-challenge-lesson">{match.challenge.lesson}</p>
                </div>

                {/* Phase Notice */}
                <div className="arena-phase-notice">
                  <span className="arena-phase-notice-icon">💡</span>
                  <div>
                    <strong>Match Session Initialized</strong>
                    <p>
                      Match room and opponents are locked in server state. In Phase 3, the live Python code editor, real-time timer, and test evaluation will run directly here.
                    </p>
                  </div>
                </div>

                <div className="arena-ready-footer-actions">
                  <button
                    type="button"
                    className="arena-btn arena-btn-secondary"
                    onClick={() => {
                      navigate('/arena');
                      setMmState({ status: 'idle' });
                    }}
                  >
                    ← Back to Arena Overview
                  </button>
                  {match.status === 'ready' && (
                    <button
                      type="button"
                      className="arena-btn arena-btn-danger"
                      onClick={() => void handleCancelActiveMatch(match.id)}
                    >
                      Cancel Match (Untouched)
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number) => {
    if (!token) return;
    setLoading(true);
    const res = await fetchMatchHistory(token, p, 10);
    if (res.ok && res.data) setHistory(res.data);
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
  const [page, setPage] = useState(1);
  const [division, setDivision] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, div: string) => {
    if (!token) return;
    setLoading(true);
    const res = await fetchArenaLeaderboard(token, p, 25, div);
    if (res.ok && res.data) setLb(res.data);
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
        </div>
      </div>
      <div className="arena-match-rating-change">
        <span className={`arena-rating-delta ${match.ratingChange >= 0 ? 'positive' : 'negative'}`}>
          {changeDisplay}
        </span>
        <span className="arena-match-rating-after">{match.ratingAfter} SR</span>
      </div>
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
      <svg viewBox={`0 0 ${W} ${H}`} className="arena-chart-svg" preserveAspectRatio="none">
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
