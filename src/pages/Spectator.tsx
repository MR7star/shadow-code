import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Clock3, Crown, FileText, LockKeyhole, Radio, Shield, Swords, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchSpectatorMatch, type SpectatorMatchDetails } from '../services/arenaApi';
import './Spectator.css';

export default function Spectator() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [match, setMatch] = useState<SpectatorMatchDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(0);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch Sanitized Spectator Data ──────────────────────────────
  const loadSpectatorData = useCallback(async (isInitial = false) => {
    if (!matchId) return;
    if (isInitial) setLoading(true);

    const res = await fetchSpectatorMatch(token, matchId);
    if (res.ok && res.data?.match) {
      setMatch(res.data.match);
      setRemainingSec(res.data.match.remainingSeconds || 0);
      setError(null);
    } else {
      if (isInitial) {
        setError(res.error || 'Unable to connect to live match broadcast.');
      }
    }

    if (isInitial) setLoading(false);
  }, [matchId, token]);

  // ─── Initial Load & Polling Lifecycle ────────────────────────────
  useEffect(() => {
    loadSpectatorData(true);

    // Setup 3-second live polling loop
    pollTimerRef.current = setInterval(() => {
      loadSpectatorData(false);
    }, 3000);

    // Local 1-second timer ticker
    tickTimerRef.current = setInterval(() => {
      setRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, [loadSpectatorData]);

  // Stop polling if match is completed or cancelled
  useEffect(() => {
    if (match && ['completed', 'cancelled', 'expired', 'abandoned'].includes(match.status)) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    }
  }, [match]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleBack = () => {
    if (match?.tournamentContext?.tournamentId) {
      navigate(`/tournaments/${match.tournamentContext.tournamentId}`);
    } else {
      navigate('/arena');
    }
  };

  // ─── Render Loading & Error States ───────────────────────────────
  if (loading) {
    return (
      <div className="spectator-page">
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <Radio className="spectator-state-icon" aria-hidden="true" />
          <h2 style={{ color: 'var(--text-primary)' }}>Loading match details…</h2>
          <p>Connecting to the sanitized live match status feed.</p>
        </div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="spectator-page">
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <AlertTriangle className="spectator-state-icon" aria-hidden="true" />
          <h2 style={{ color: '#f87171' }}>Broadcast Unavailable</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>{error || 'Match not found.'}</p>
          <button className="spectator-nav-back" onClick={handleBack}>
            <ArrowLeft size={16} aria-hidden="true" /> Return
          </button>
        </div>
      </div>
    );
  }

  const isCompleted = ['completed', 'cancelled', 'expired', 'abandoned'].includes(match.status);
  const terminalResult = match.winnerId === 'draw' ? 'Draw'
    : match.winnerId ? `Winner: ${match.winnerName || (match.winnerId === match.player1.id ? match.player1.name : match.player2.name)}`
      : match.status === 'cancelled' ? 'Cancelled without a scored result'
        : match.status === 'expired' ? 'Expired without a scored result'
          : match.status === 'abandoned' ? 'Abandoned without a confirmed winner'
            : 'Result unavailable';
  const isUrgent = remainingSec < 120 && !isCompleted;
  const isP1Winner = match.winnerId === match.player1.id;
  const isP2Winner = match.winnerId === match.player2.id;

  return (
    <div className="spectator-page">
      {/* Header Bar */}
      <div className="spectator-header">
        <button className="spectator-nav-back" onClick={handleBack}>
          <ArrowLeft size={16} aria-hidden="true" /> {match.tournamentContext ? `Back to ${match.tournamentContext.tournamentTitle}` : 'Back to Arena'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {match.tournamentContext && (
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 700 }}>
              <Trophy size={15} aria-hidden="true" /> {match.tournamentContext.tournamentTitle} · Round {match.tournamentContext.round}
            </span>
          )}

          <div className="spectator-broadcast-pill">
            {!isCompleted && <span className="live-dot" />}
            <span>{isCompleted ? 'Match Details' : 'Live Match Status'}</span>
          </div>
        </div>
      </div>

      {/* Match Conclusion Banner */}
      {isCompleted && (
        <div className="spectator-conclusion-banner" role="status" aria-live="polite">
          <Trophy size={18} aria-hidden="true" />
          <span>
            {`Match Concluded — ${terminalResult}`}
          </span>
        </div>
      )}

      {/* Match HUD Hero */}
      <div className="spectator-hud">
        {/* Player 1 Card */}
        <div className={`spectator-combatant p1 ${isP1Winner ? 'winner' : ''}`}>
          <div className="spectator-avatar" aria-hidden="true"><Swords size={24} /></div>
          <div className="spectator-combatant-info">
            <div className="spectator-combatant-name">
              {match.player1.name} {isP1Winner && <Crown size={16} aria-label="Winner" />}
            </div>
            <div className="spectator-combatant-meta">
              <span>{match.player1.ratingBefore} SR</span>
              <span>•</span>
              <span style={{ textTransform: 'uppercase', color: 'var(--accent-cyan)' }}>
                {match.player1.status}
              </span>
            </div>
            <div className="spectator-stat-badges">
              <span className="stat-chip attempts">
                Attempts: {match.player1.attemptsCount}/5
              </span>
              <span className="stat-chip score">
                Score: {match.player1.score}
              </span>
              {match.player1.totalTests > 0 && (
                <span className="stat-chip completed">
                  {match.player1.passedCount}/{match.player1.totalTests} Tests
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Timer & VS */}
        <div className="spectator-center-hud">
          <div className={`spectator-timer-card ${isUrgent ? 'urgent' : ''}`}>
            <Clock3 size={17} aria-hidden="true" />
            <span className="spectator-timer-digits">
              {isCompleted ? '00:00' : formatTimer(remainingSec)}
            </span>
          </div>
          <div className="spectator-vs-badge">VS</div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Match #{match.id.slice(0, 8)}
          </span>
        </div>

        {/* Player 2 Card */}
        <div className={`spectator-combatant p2 ${isP2Winner ? 'winner' : ''}`}>
          <div className="spectator-avatar" aria-hidden="true"><Shield size={24} /></div>
          <div className="spectator-combatant-info">
            <div className="spectator-combatant-name">
              {match.player2.name} {isP2Winner && <Crown size={16} aria-label="Winner" />}
            </div>
            <div className="spectator-combatant-meta">
              <span>{match.player2.ratingBefore} SR</span>
              <span>•</span>
              <span style={{ textTransform: 'uppercase', color: 'var(--accent-cyan)' }}>
                {match.player2.status}
              </span>
            </div>
            <div className="spectator-stat-badges">
              <span className="stat-chip attempts">
                Attempts: {match.player2.attemptsCount}/5
              </span>
              <span className="stat-chip score">
                Score: {match.player2.score}
              </span>
              {match.player2.totalTests > 0 && (
                <span className="stat-chip completed">
                  {match.player2.passedCount}/{match.player2.totalTests} Tests
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="spectator-layout-grid">
        {/* Left Column: Challenge Overview & Sample Tests */}
        <div className="spectator-panel">
          <div className="spectator-panel-title">
            <FileText size={17} aria-hidden="true" /> Problem: {match.challenge.title}
          </div>

          {match.challenge.functionName && (
            <div className="spectator-signature-box">
              Target Function: def {match.challenge.functionName}(...)
            </div>
          )}

          <div className="spectator-problem-desc">
            {match.challenge.lesson || 'Complete the solution to pass all verification tests.'}
          </div>

          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Sample Verification Cases
            </div>
            <div className="spectator-tests-list">
              {match.challenge.sampleTests.map((t, idx) => (
                <div key={idx} className="spectator-test-card">
                  <div className="spectator-test-header">Case #{idx + 1}</div>
                  <div className="spectator-test-row">
                    <span className="spectator-test-label">Input:</span>
                    <span className="spectator-test-val">{typeof t.input === 'object' ? JSON.stringify(t.input) : String(t.input ?? '')}</span>
                  </div>
                  <div className="spectator-test-row">
                    <span className="spectator-test-label">Expected:</span>
                    <span className="spectator-test-val">{typeof t.expected === 'object' ? JSON.stringify(t.expected) : String(t.expected ?? '')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Broadcast Specs & Privacy Guard */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="spectator-panel">
            <div className="spectator-panel-title">
              <Shield size={17} aria-hidden="true" /> Spectator Privacy Shield
            </div>
            <div className="spectator-privacy-banner">
              <LockKeyhole size={16} aria-hidden="true" />
              <span>All competitor source code and hidden test suites are strictly masked to preserve competitive integrity.</span>
            </div>
            <ul style={{ paddingLeft: '18px', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.7', margin: 0 }}>
              <li>Live test pass counters update on submission.</li>
              <li>Match timer counts down to submission deadline.</li>
              <li>Sanitized match details refresh every 3 seconds while active.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
