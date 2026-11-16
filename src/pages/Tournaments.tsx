import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProgression } from '../context/ProgressionContext';
import {
  fetchTournamentsList,
  fetchTournamentDetails,
  createTournament,
  registerTournament,
  withdrawTournament,
  startTournament,
  cancelTournament,
  claimTournamentReward,
  startTournamentMatch,
  fetchTournamentLiveMatches,
  type TournamentListItem,
  type TournamentDetails,
  type TournamentStatus,
  type BracketRound,
} from '../services/tournamentApi';
import './Tournaments.css';

type DetailTab = 'bracket' | 'live' | 'roster' | 'rewards';

export default function Tournaments() {
  const { tournamentId: routeTournamentId } = useParams<{ tournamentId?: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated, openAuthModal, user } = useAuth();
  const { refreshProgress } = useProgression();

  // ─── Component State ─────────────────────────────────────────────
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<TournamentDetails | null>(null);
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<'all' | TournamentStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('bracket');
  const [isStartingMatch, setIsStartingMatch] = useState<string | null>(null);

  // ─── Modal State ─────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newSize, setNewSize] = useState<number>(8);
  const [newStartTime, setNewStartTime] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Notice helper
  const showNotice = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setNotice({ text, type });
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, []);

  // ─── Data Fetching ───────────────────────────────────────────────
  const loadTournaments = useCallback(async () => {
    setIsLoading(true);
    const res = await fetchTournamentsList(token);
    if (res.ok && res.data) {
      setTournaments(res.data.tournaments);
    } else {
      showNotice(res.error || 'Failed to load tournaments list.', 'error');
    }
    setIsLoading(false);
  }, [token, showNotice]);

  const loadDetails = useCallback(async (id: string) => {
    setIsLoading(true);
    const res = await fetchTournamentDetails(id, token);
    if (res.ok && res.data) {
      setSelectedTournament(res.data);
      // Auto-select bracket if ongoing or completed, else roster
      if (['ongoing', 'completed'].includes(res.data.status)) {
        setDetailTab('bracket');
      } else {
        setDetailTab('roster');
      }
    } else {
      showNotice(res.error || 'Tournament not found or failed to load.', 'error');
      setSelectedTournament(null);
    }
    setIsLoading(false);
  }, [token, showNotice]);

  const loadLiveMatches = useCallback(async (id: string) => {
    const res = await fetchTournamentLiveMatches(token, id);
    if (res.ok && res.data?.matches) {
      setLiveMatches(res.data.matches);
    }
  }, [token]);

  // Initial and route-driven loading
  useEffect(() => {
    if (routeTournamentId) {
      loadDetails(routeTournamentId);
      loadLiveMatches(routeTournamentId);
    } else {
      setSelectedTournament(null);
      loadTournaments();
    }
  }, [routeTournamentId, loadDetails, loadLiveMatches, loadTournaments]);

  // Periodic polling for live matches if tournament is ongoing
  useEffect(() => {
    if (!routeTournamentId || selectedTournament?.status !== 'ongoing') return;
    const interval = setInterval(() => {
      loadLiveMatches(routeTournamentId);
    }, 4000);
    return () => clearInterval(interval);
  }, [routeTournamentId, selectedTournament?.status, loadLiveMatches]);

  // ─── Actions ─────────────────────────────────────────────────────

  const handleRegister = async (tournId: string) => {
    if (!isAuthenticated || !token) {
      openAuthModal();
      return;
    }

    const res = await registerTournament(token, tournId);
    if (res.ok) {
      showNotice('Successfully registered for tournament! Your seed has been reserved.');
      refreshProgress();
      if (routeTournamentId) {
        loadDetails(routeTournamentId);
      } else {
        loadTournaments();
      }
    } else {
      showNotice(res.error || 'Failed to register for tournament.', 'error');
    }
  };

  const handleWithdraw = async (tournId: string) => {
    if (!isAuthenticated || !token) return;

    const res = await withdrawTournament(token, tournId);
    if (res.ok) {
      showNotice('You have withdrawn from the tournament.');
      refreshProgress();
      if (routeTournamentId) {
        loadDetails(routeTournamentId);
      } else {
        loadTournaments();
      }
    } else {
      showNotice(res.error || 'Failed to withdraw from tournament.', 'error');
    }
  };

  const handleStart = async (tournId: string) => {
    if (!isAuthenticated || !token) return;

    const res = await startTournament(token, tournId);
    if (res.ok) {
      showNotice('Tournament started! Single-elimination bracket generated.');
      if (routeTournamentId) {
        loadDetails(routeTournamentId);
      } else {
        loadTournaments();
      }
    } else {
      showNotice(res.error || 'Failed to start tournament.', 'error');
    }
  };

  const handleCancel = async (tournId: string) => {
    if (!isAuthenticated || !token) return;
    const confirm = window.confirm('Are you sure you want to cancel this tournament? This cannot be undone.');
    if (!confirm) return;

    const res = await cancelTournament(token, tournId);
    if (res.ok) {
      showNotice('Tournament has been cancelled.');
      if (routeTournamentId) {
        loadDetails(routeTournamentId);
      } else {
        loadTournaments();
      }
    } else {
      showNotice(res.error || 'Failed to cancel tournament.', 'error');
    }
  };

  const handleClaimReward = async (tournId: string) => {
    if (!isAuthenticated || !token) return;

    const res = await claimTournamentReward(token, tournId);
    if (res.ok && res.data) {
      showNotice(`Claimed Rank #${res.data.rank} rewards! +${res.data.xpAwarded} XP awarded!`);
      refreshProgress();
      if (routeTournamentId) {
        loadDetails(routeTournamentId);
      }
    } else {
      showNotice(res.error || 'Failed to claim tournament placement reward.', 'error');
    }
  };

  // Connects Tournament match directly to Phase 3 Ranked Arena Workspace
  const handleEnterMatch = async (matchId: string) => {
    if (!isAuthenticated || !token) {
      openAuthModal();
      return;
    }
    if (!selectedTournament) return;

    setIsStartingMatch(matchId);
    const res = await startTournamentMatch(token, selectedTournament.id, matchId);
    setIsStartingMatch(null);

    if (res.ok && res.data?.matchId) {
      navigate(`/arena/match/${res.data.matchId}`);
    } else {
      showNotice(res.error || 'Unable to enter match. Verify match readiness.', 'error');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !token) {
      openAuthModal();
      return;
    }

    if (!newTitle.trim() || newTitle.trim().length < 3) {
      showNotice('Tournament title must be at least 3 characters long.', 'error');
      return;
    }

    setIsSubmitting(true);
    const res = await createTournament(token, {
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      maxParticipants: newSize,
      startTime: newStartTime || undefined,
    });
    setIsSubmitting(false);

    if (res.ok && res.data) {
      showNotice('Tournament created successfully! Registration is now open.');
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewSize(8);
      setNewStartTime('');
      navigate(`/tournaments/${res.data.tournamentId}`);
    } else {
      showNotice(res.error || 'Failed to create tournament.', 'error');
    }
  };

  // ─── Filtered Tournaments List ───────────────────────────────────
  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      if (activeFilter !== 'all' && t.status !== activeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = (t.description || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }
      return true;
    });
  }, [tournaments, activeFilter, searchQuery]);

  // Extract bracket rounds defensively
  const bracketRounds: BracketRound[] = useMemo(() => {
    if (!selectedTournament) return [];
    if (Array.isArray(selectedTournament.bracket) && selectedTournament.bracket.length > 0) {
      return selectedTournament.bracket;
    }
    if (Array.isArray((selectedTournament as any).rounds)) {
      return (selectedTournament as any).rounds;
    }
    return [];
  }, [selectedTournament]);

  // ─── Render: Details View ─────────────────────────────────────────
  if (routeTournamentId && selectedTournament) {
    const isOwner = selectedTournament.userContext.isCreator;
    const isRegistered = selectedTournament.userContext.isRegistered;
    const canStart = isOwner && selectedTournament.status === 'registration' && selectedTournament.currentParticipants >= 2;
    const canCancel = isOwner && ['registration', 'ongoing'].includes(selectedTournament.status);
    const canWithdraw = isRegistered && selectedTournament.status === 'registration';

    return (
      <div className="tournaments-page">
        {/* Back navigation */}
        <div>
          <button className="details-nav-back" onClick={() => navigate('/tournaments')}>
            ← Back to All Tournaments
          </button>
        </div>

        {/* Toast Alert */}
        {notice && (
          <div className={`tournaments-toast ${notice.type}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Detail Hero Banner */}
        <div className="tournament-detail-banner">
          <div className="detail-banner-main">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`status-badge ${selectedTournament.status}`}>
                <span className="dot" />
                {selectedTournament.status === 'registration' ? 'Registration Open' : selectedTournament.status === 'ongoing' ? 'In Progress' : selectedTournament.status}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Format: Single Elimination ({selectedTournament.maxParticipants} Hunters)
              </span>
            </div>
            <h2>{selectedTournament.title}</h2>
            <p className="detail-banner-desc">
              {selectedTournament.description || 'Single-elimination competitive coding tournament.'}
            </p>
          </div>

          <div className="detail-banner-actions">
            {canStart && (
              <button className="btn-action-start" onClick={() => handleStart(selectedTournament.id)}>
                ⚔️ Start Tournament ({selectedTournament.currentParticipants} Registered)
              </button>
            )}

            {!isRegistered && selectedTournament.status === 'registration' && selectedTournament.currentParticipants < selectedTournament.maxParticipants && (
              <button className="btn-primary-create" onClick={() => handleRegister(selectedTournament.id)}>
                Join Tournament
              </button>
            )}

            {canWithdraw && (
              <button className="btn-action-withdraw" onClick={() => handleWithdraw(selectedTournament.id)}>
                Withdraw
              </button>
            )}

            {selectedTournament.userContext.canClaimReward && (
              <button className="btn-action-claim" onClick={() => handleClaimReward(selectedTournament.id)}>
                🎁 Claim {selectedTournament.userContext.claimableReward?.xp} XP Reward
              </button>
            )}

            {canCancel && (
              <button className="btn-action-cancel" onClick={() => handleCancel(selectedTournament.id)}>
                Cancel Tournament
              </button>
            )}
          </div>
        </div>

        {/* User Registration Status Card */}
        <div className={`user-status-card ${isRegistered ? 'registered' : ''}`}>
          <div className="user-status-left">
            <span className="user-status-icon">{isRegistered ? '🛡️' : '⚔️'}</span>
            <div>
              <div className="user-status-title">
                {isRegistered
                  ? `You are Registered as Seed #${selectedTournament.userContext.participant?.seed}`
                  : 'You are not registered in this tournament.'}
              </div>
              <div className="user-status-subtitle">
                {selectedTournament.status === 'registration'
                  ? selectedTournament.currentParticipants >= selectedTournament.maxParticipants
                    ? 'Tournament capacity reached.'
                    : `${selectedTournament.maxParticipants - selectedTournament.currentParticipants} slots remaining.`
                  : selectedTournament.status === 'ongoing'
                  ? 'Matches are currently underway.'
                  : `Tournament concluded with champion ${selectedTournament.winnerName || 'Winner'}.`}
              </div>
            </div>
          </div>
          {isRegistered && (
            <span className="badge-registered">
              ✓ Ready for Bracket
            </span>
          )}
        </div>

        {/* Details Tab Navigation */}
        <div className="details-tab-nav">
          <button
            className={`details-tab-btn ${detailTab === 'bracket' ? 'active' : ''}`}
            onClick={() => setDetailTab('bracket')}
          >
            🏆 Bracket Tree ({bracketRounds.length} Rounds)
          </button>
          <button
            className={`details-tab-btn ${detailTab === 'live' ? 'active' : ''}`}
            onClick={() => setDetailTab('live')}
          >
            📡 Live Matches {liveMatches.length > 0 && `(${liveMatches.length})`}
          </button>
          <button
            className={`details-tab-btn ${detailTab === 'roster' ? 'active' : ''}`}
            onClick={() => setDetailTab('roster')}
          >
            👥 Hunters ({selectedTournament.participants.length})
          </button>
          <button
            className={`details-tab-btn ${detailTab === 'rewards' ? 'active' : ''}`}
            onClick={() => setDetailTab('rewards')}
          >
            🎁 Prize Pool & Rules
          </button>
        </div>

        {/* ─── TAB 1: BRACKET VISUALIZER ──────────────────────────────── */}
        {detailTab === 'bracket' && (
          <div className="details-card" style={{ padding: '16px' }}>
            <div className="details-card-header">
              <div className="details-card-title">
                <span>⚔️</span> Elimination Bracket ({selectedTournament.maxParticipants} Contenders)
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Scroll horizontally to view progression
              </span>
            </div>

            {bracketRounds.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🌱</div>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>Bracket Not Generated Yet</h3>
                <p style={{ fontSize: '0.85rem' }}>
                  The single-elimination bracket will be constructed automatically once the tournament creator starts the event.
                </p>
              </div>
            ) : (
              <div className="bracket-container">
                {bracketRounds.map((round) => (
                  <div key={round.roundNumber} className="bracket-round-column">
                    <div className="bracket-round-header">
                      <div className="bracket-round-title">{round.title}</div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Round {round.roundNumber} of {selectedTournament.totalRounds}
                      </span>
                    </div>

                    <div className="bracket-round-matches">
                      {round.matches.map((matchNode) => {
                        const isYourMatch = user && (matchNode.p1Id === user.id || matchNode.p2Id === user.id);
                        const isLive = matchNode.status === 'in_progress' || matchNode.status === 'ready';
                        const isCompleted = matchNode.status === 'completed';
                        const isBye = matchNode.status === 'bye';
                        const canEnter = isYourMatch && (matchNode.status === 'ready' || matchNode.status === 'in_progress' || matchNode.status === 'scheduled') && matchNode.p1Id && matchNode.p2Id;
                        const canSpectate = (isLive || isCompleted) && (matchNode.arenaMatchId);

                        return (
                          <div
                            key={matchNode.id}
                            className={`bracket-match-node ${isLive ? 'live' : ''} ${isYourMatch ? 'your-match' : ''}`}
                          >
                            <div className="bracket-match-meta">
                              <span>Match #{matchNode.matchIndex + 1}</span>
                              <span style={{
                                textTransform: 'uppercase',
                                fontWeight: 700,
                                fontSize: '0.68rem',
                                color: isLive ? '#f87171' : isCompleted ? '#fbbf24' : isBye ? '#38bdf8' : 'var(--text-muted)'
                              }}>
                                {isLive ? '● LIVE' : isCompleted ? 'FINISHED' : isBye ? 'BYE' : matchNode.status}
                              </span>
                            </div>

                            {/* Combatant 1 Slot */}
                            <div className={`bracket-match-slot ${matchNode.winnerId === matchNode.p1Id && isCompleted ? 'winner' : ''} ${matchNode.p1Id === user?.id ? 'you' : ''}`}>
                              <div className="bracket-slot-name">
                                <span>{matchNode.winnerId === matchNode.p1Id && isCompleted ? '👑' : '⚔️'}</span>
                                <span>{matchNode.p1Name || (matchNode.round === 1 ? 'Empty Slot' : 'TBD')}</span>
                              </div>
                              {matchNode.p1Id === user?.id && (
                                <span className="participant-badge-you">You</span>
                              )}
                            </div>

                            {/* Combatant 2 Slot */}
                            <div className={`bracket-match-slot ${matchNode.winnerId === matchNode.p2Id && isCompleted ? 'winner' : ''} ${matchNode.p2Id === user?.id ? 'you' : ''}`}>
                              <div className="bracket-slot-name">
                                <span>{matchNode.winnerId === matchNode.p2Id && isCompleted ? '👑' : '🛡️'}</span>
                                <span>{matchNode.p2Name || (isBye ? 'BYE (Auto Advance)' : matchNode.round === 1 ? 'Empty Slot' : 'TBD')}</span>
                              </div>
                              {matchNode.p2Id === user?.id && (
                                <span className="participant-badge-you">You</span>
                              )}
                            </div>

                            {/* Match Actions */}
                            <div className="bracket-match-actions">
                              {canEnter && (
                                <button
                                  className="btn-bracket-enter"
                                  onClick={() => handleEnterMatch(matchNode.id)}
                                  disabled={isStartingMatch === matchNode.id}
                                >
                                  {isStartingMatch === matchNode.id ? 'Connecting…' : '⚔️ Enter Duel'}
                                </button>
                              )}

                              {canSpectate && matchNode.arenaMatchId && (
                                <button
                                  className="btn-bracket-spectate"
                                  onClick={() => navigate(`/arena/spectate/${matchNode.arenaMatchId}`)}
                                >
                                  {isCompleted ? '👁️ Results' : '👁️ Spectate'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: LIVE MATCHES ────────────────────────────────────── */}
        {detailTab === 'live' && (
          <div className="details-card">
            <div className="details-card-header">
              <div className="details-card-title">
                <span>📡</span> Live Tournament Matches
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Real-time observer stream
              </span>
            </div>

            {liveMatches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>⏳</div>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>No Matches Currently in Progress</h3>
                <p style={{ fontSize: '0.85rem' }}>
                  When contenders enter duel workspace, live matches will populate here for spectating.
                </p>
              </div>
            ) : (
              <div className="live-matches-grid">
                {liveMatches.map((m) => (
                  <div key={m.tournamentMatchId} className="live-match-card">
                    <div className="live-match-top">
                      <span className="status-badge ongoing">
                        <span className="dot" />
                        Round {m.round} Duel
                      </span>
                      {m.remainingSeconds !== undefined && (
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f87171' }}>
                          ⏱️ {Math.floor(m.remainingSeconds / 60)}:{(m.remainingSeconds % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Challenge: {m.challengeTitle}
                    </div>

                    <div className="live-duelists">
                      <div className="live-duelist">
                        <span>⚔️</span>
                        <strong>{m.player1?.name || 'Hunter 1'}</strong>
                      </div>
                      <div className="live-vs-text">VS</div>
                      <div className="live-duelist">
                        <span>🛡️</span>
                        <strong>{m.player2?.name || 'Hunter 2'}</strong>
                      </div>
                    </div>

                    {m.arenaMatchId && (
                      <button
                        className="btn-primary-create"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => navigate(`/arena/spectate/${m.arenaMatchId}`)}
                      >
                        👁️ Spectate Duel Live
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: PARTICIPANTS ROSTER ─────────────────────────────── */}
        {detailTab === 'roster' && (
          <div className="details-card">
            <div className="details-card-header">
              <div className="details-card-title">
                <span>👥</span> Registered Hunters ({selectedTournament.participants.length} / {selectedTournament.maxParticipants})
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Seeded by registration & Elo
              </span>
            </div>

            {selectedTournament.participants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No hunters have registered yet. Be the first to enter!
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="participants-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Seed</th>
                      <th>Hunter</th>
                      <th>Rank & Division</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTournament.participants.map((p) => {
                      const isCurrentUser = user && p.userId === user.id;
                      const isChampion = selectedTournament.winnerId === p.userId;
                      return (
                        <tr key={p.userId}>
                          <td>
                            <span className="participant-seed">#{p.seed}</span>
                          </td>
                          <td>
                            <div className="participant-name-cell">
                              <span>{p.username}</span>
                              {isCurrentUser && <span className="participant-badge-you">You</span>}
                              {isChampion && <span className="participant-badge-champion">🏆 Champion</span>}
                            </div>
                          </td>
                          <td>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              {p.division ? `${p.division} (${p.rating} Elo)` : 'Unranked'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8rem', color: p.eliminated ? '#f87171' : '#34d399' }}>
                              {isChampion
                                ? 'Tournament Winner'
                                : p.eliminated
                                ? `Eliminated in R${p.eliminatedRound || '?'}`
                                : 'Active Contender'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 4: REWARDS & RULES ─────────────────────────────────── */}
        {detailTab === 'rewards' && (
          <div className="details-layout-grid">
            <div className="details-card">
              <div className="details-card-header">
                <div className="details-card-title">
                  <span>🏆</span> Prize Pool & Rewards
                </div>
              </div>

              <div className="rewards-breakdown">
                <div className="reward-tier-item first">
                  <div className="reward-tier-label">
                    <span>🥇</span>
                    <span>1st Place Champion</span>
                  </div>
                  <div className="reward-tier-content">
                    <div className="reward-xp-value">
                      +{selectedTournament.rewards.firstPlace?.xp || 1500} XP
                    </div>
                    <div className="reward-title-value">
                      «{selectedTournament.rewards.firstPlace?.title || 'Grandmaster of Shadows'}»
                    </div>
                  </div>
                </div>

                <div className="reward-tier-item second">
                  <div className="reward-tier-label">
                    <span>🥈</span>
                    <span>2nd Place Finalist</span>
                  </div>
                  <div className="reward-tier-content">
                    <div className="reward-xp-value">
                      +{selectedTournament.rewards.secondPlace?.xp || 800} XP
                    </div>
                    <div className="reward-title-value">
                      «{selectedTournament.rewards.secondPlace?.title || 'Tournament Finalist'}»
                    </div>
                  </div>
                </div>

                <div className="reward-tier-item semis">
                  <div className="reward-tier-label">
                    <span>🥉</span>
                    <span>Semifinalists</span>
                  </div>
                  <div className="reward-tier-content">
                    <div className="reward-xp-value">
                      +{selectedTournament.rewards.semifinalist?.xp || 400} XP
                    </div>
                    <div className="reward-title-value">
                      «{selectedTournament.rewards.semifinalist?.title || 'Tournament Contender'}»
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="details-card">
              <div className="details-card-header">
                <div className="details-card-title">
                  <span>ℹ️</span> Tournament Rules
                </div>
              </div>
              <ul style={{ paddingLeft: '18px', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.7', margin: 0 }}>
                <li>Single-elimination format: 1 defeat eliminates contender from bracket.</li>
                <li>Live Python coding duels with automated test evaluation.</li>
                <li>Tournament matches never modify normal Ranked Arena Elo ratings.</li>
                <li>Fair deterministic tiebreaker: submission attempts, seed, seniority, and unbiased cryptographic coin flip.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Render: Dashboard List View ──────────────────────────────────
  return (
    <div className="tournaments-page">
      {/* Hero Header */}
      <div className="tournaments-hero">
        <div className="tournaments-hero-text">
          <span className="tournaments-kicker">Solo Leveling Esports Arena</span>
          <h1>Coding Tournaments</h1>
          <p>
            Compete in bracket-style coding duels, rise through elimination rounds,
            and claim legendary titles and massive XP rewards.
          </p>
        </div>

        <div className="tournaments-hero-actions">
          <button
            className="btn-primary-create"
            onClick={() => {
              if (!isAuthenticated) openAuthModal();
              else setShowCreateModal(true);
            }}
          >
            <span>⚔️</span> Create Tournament
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notice && (
        <div className={`tournaments-toast ${notice.type}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Toolbar: Filters & Search */}
      <div className="tournaments-toolbar">
        <div className="tournaments-tabs">
          <button
            className={`tournaments-tab-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All ({tournaments.length})
          </button>
          <button
            className={`tournaments-tab-btn ${activeFilter === 'registration' ? 'active' : ''}`}
            onClick={() => setActiveFilter('registration')}
          >
            Registration Open
          </button>
          <button
            className={`tournaments-tab-btn ${activeFilter === 'ongoing' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ongoing')}
          >
            In Progress
          </button>
          <button
            className={`tournaments-tab-btn ${activeFilter === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveFilter('completed')}
          >
            Completed
          </button>
        </div>

        <div className="tournaments-search-box">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search tournaments…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tournaments Grid */}
      {isLoading ? (
        <div className="tournaments-empty">
          <div className="tournaments-empty-icon">⏳</div>
          <h3>Loading tournaments…</h3>
          <p>Connecting to Shadow Code tournament matchmaking.</p>
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="tournaments-empty">
          <div className="tournaments-empty-icon">🏆</div>
          <h3>No tournaments found</h3>
          <p>
            {activeFilter !== 'all' || searchQuery
              ? 'Try adjusting your filters or search keywords.'
              : 'Be the first Hunter to host a coding tournament!'}
          </p>
          <button
            className="btn-primary-create"
            style={{ marginTop: '16px' }}
            onClick={() => {
              if (!isAuthenticated) openAuthModal();
              else setShowCreateModal(true);
            }}
          >
            Host a Tournament
          </button>
        </div>
      ) : (
        <div className="tournaments-grid">
          {filteredTournaments.map((t) => {
            const percentFull = Math.min(100, Math.round((t.currentParticipants / t.maxParticipants) * 100));
            const isFull = t.currentParticipants >= t.maxParticipants;

            return (
              <div key={t.id} className="tournament-card">
                <div>
                  <div className="tournament-card-header">
                    <div>
                      <div className="tournament-card-title">{t.title}</div>
                      <div className="tournament-card-desc">
                        {t.description || 'Single-elimination duel tournament.'}
                      </div>
                    </div>
                    <span className={`status-badge ${t.status}`}>
                      <span className="dot" />
                      {t.status === 'registration'
                        ? 'Registration Open'
                        : t.status === 'ongoing'
                        ? 'In Progress'
                        : t.status === 'completed'
                        ? 'Completed'
                        : 'Cancelled'}
                    </span>
                  </div>

                  {/* Card Meta Box */}
                  <div className="tournament-card-meta" style={{ marginTop: '14px' }}>
                    <div className="meta-row">
                      <span className="meta-label">Participants</span>
                      <span className="meta-value">
                        {t.currentParticipants} / {t.maxParticipants} Hunters
                      </span>
                    </div>
                    <div className="participants-progress">
                      <div className="participants-fill" style={{ width: `${percentFull}%` }} />
                    </div>

                    <div className="meta-row" style={{ marginTop: '4px' }}>
                      <span className="meta-label">Bracket Format</span>
                      <span className="meta-value">{t.totalRounds} Rounds Single Elimination</span>
                    </div>

                    {t.rewards?.firstPlace && (
                      <div className="meta-row">
                        <span className="meta-label">Grand Prize</span>
                        <div className="rewards-pill">
                          <span>🏆</span>
                          <span>+{t.rewards.firstPlace.xp} XP • {t.rewards.firstPlace.title}</span>
                        </div>
                      </div>
                    )}

                    {t.winnerName && (
                      <div className="meta-row">
                        <span className="meta-label">Champion</span>
                        <span className="meta-value" style={{ color: '#fbbf24' }}>
                          👑 {t.winnerName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="tournament-card-actions">
                  <button
                    className="btn-view-details"
                    onClick={() => navigate(`/tournaments/${t.id}`)}
                  >
                    View Details
                  </button>

                  {t.isRegistered ? (
                    <span className="badge-registered">
                      ✓ Registered
                    </span>
                  ) : t.status === 'registration' && !isFull ? (
                    <button
                      className="btn-register-quick"
                      onClick={() => handleRegister(t.id)}
                    >
                      Join Tournament
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Create Tournament Modal ──────────────────────────────── */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><span>⚔️</span> Host a Tournament</h3>
              <button className="btn-modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Tournament Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Monarch Invitational 2026"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    minLength={3}
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Explain the format, requirements, or prizes for contenders…"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Bracket Size (Hunters)</label>
                  <div className="size-picker-grid">
                    {[4, 8, 16, 32].map((size) => (
                      <div
                        key={size}
                        className={`size-option-card ${newSize === size ? 'selected' : ''}`}
                        onClick={() => setNewSize(size)}
                      >
                        <div className="size-number">{size}</div>
                        <div className="size-label">{Math.ceil(Math.log2(size))} Rounds</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Start Date & Time (Optional)</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                  />
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '6px' }}>
                    Standard Prize Pool Included:
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    🥇 1st Place: 1,500 XP + «Grandmaster of Shadows» Title<br />
                    🥈 2nd Place: 800 XP + «Tournament Finalist» Title<br />
                    🥉 Semifinalists: 400 XP + «Tournament Contender» Title
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-create"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating…' : 'Host Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
