import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CircleX,
  Crown,
  Eye,
  Gift,
  Info,
  LoaderCircle,
  Medal,
  Radio,
  Search,
  ShieldCheck,
  Swords,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProgression } from '../context/ProgressionContext';
import { Modal, ProgressBar, ErrorState } from '../components/ui';
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
  type TournamentLiveMatch,
  type TournamentRewards,
} from '../services/tournamentApi';
import './Tournaments.css';

type DetailTab = 'bracket' | 'live' | 'roster' | 'rewards';
type DetailFailureKind = 'notFound' | 'unauthorized' | 'forbidden' | 'error';
type RewardDraft = { xp: string; title: string };

interface TournamentCancelDialogProps {
  open: boolean;
  tournamentName: string;
  error: string | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function TournamentCancelDialog({ open, tournamentName, error, pending, onClose, onConfirm }: TournamentCancelDialogProps) {
  return (
    <Modal
      open={open}
      title={`Cancel “${tournamentName}”?`}
      description={`This will cancel “${tournamentName}” for all registered participants. This action cannot be undone.`}
      onClose={onClose}
    >
      {error && <p className="tournament-form-error" role="alert">{error}</p>}
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Keep tournament</button>
        <button type="button" className="btn-action-cancel" onClick={onConfirm} disabled={pending}>
          {pending ? <><LoaderCircle className="spinning-icon" size={16} aria-hidden="true" /> Cancelling…</> : 'Cancel tournament'}
        </button>
      </div>
    </Modal>
  );
}

function bracketStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled': return 'Scheduled';
    case 'ready': return 'Ready';
    case 'in_progress': return 'In progress';
    case 'completed': return 'Completed';
    case 'bye': return 'BYE';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function liveStatusLabel(status: TournamentLiveMatch['status']): string {
  switch (status) {
    case 'ready': return 'Ready';
    case 'in_progress': return 'In progress';
    case 'completed': return 'Completed';
    case 'expired': return 'Expired';
    case 'cancelled': return 'Cancelled';
    case 'abandoned': return 'Abandoned';
    case 'bye': return 'BYE';
    case 'scheduled': return 'Scheduled';
  }
}

function liveStatusClass(status: TournamentLiveMatch['status']): string {
  if (status === 'ready' || status === 'in_progress') return 'ongoing';
  if (status === 'completed' || status === 'bye') return 'completed';
  if (status === 'cancelled' || status === 'expired' || status === 'abandoned') return 'cancelled';
  return 'pending';
}

function formatTournamentStart(value: string | null): string {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Start time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function Tournaments() {
  const { tournamentId: routeTournamentId } = useParams<{ tournamentId?: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated, openAuthModal, user } = useAuth();
  const { refreshProgress } = useProgression();

  // ─── Component State ─────────────────────────────────────────────
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const hasTournamentListRef = useRef(false);
  const [selectedTournament, setSelectedTournament] = useState<TournamentDetails | null>(null);
  const [liveMatches, setLiveMatches] = useState<TournamentLiveMatch[]>([]);
  const [listState, setListState] = useState<'loading' | 'success' | 'error'>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [detailState, setDetailState] = useState<'loading' | 'success' | DetailFailureKind>('loading');
  const [detailStateId, setDetailStateId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<'loading' | 'success' | 'error'>('loading');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [isRefreshingLive, setIsRefreshingLive] = useState(false);
  const [listRefreshVersion, setListRefreshVersion] = useState(0);
  const [detailRefreshVersion, setDetailRefreshVersion] = useState(0);
  const [liveRefreshVersion, setLiveRefreshVersion] = useState(0);
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const pendingActionsRef = useRef<Set<string>>(new Set());
  const pollControllerRef = useRef<AbortController | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | TournamentStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('bracket');

  // ─── Modal State ─────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newSize, setNewSize] = useState<number>(8);
  const [newStartTime, setNewStartTime] = useState<string>('');
  const [customizeRewards, setCustomizeRewards] = useState(false);
  const [rewardDrafts, setRewardDrafts] = useState<Record<'firstPlace' | 'secondPlace' | 'semifinalist', RewardDraft>>({
    firstPlace: { xp: '', title: '' },
    secondPlace: { xp: '', title: '' },
    semifinalist: { xp: '', title: '' },
  });
  const [tournamentPendingCancel, setTournamentPendingCancel] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Notice helper
  const showNotice = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setNotice({ text, type });
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => {
      noticeTimeoutRef.current = null;
      setNotice(null);
    }, 5000);
  }, []);

  useEffect(() => () => {
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
  }, []);

  const showTournamentNotice = (id: string, text: string, type: 'success' | 'error' = 'success') => {
    if (!routeTournamentId || routeTournamentId === id) showNotice(text, type);
  };

  // ─── Data Fetching ───────────────────────────────────────────────
  const beginAction = (key: string) => {
    if (pendingActionsRef.current.has(key)) return false;
    pendingActionsRef.current.add(key);
    setPendingActions(new Set(pendingActionsRef.current));
    return true;
  };

  const endAction = (key: string) => {
    pendingActionsRef.current.delete(key);
    setPendingActions(new Set(pendingActionsRef.current));
  };

  const refreshTournamentView = useCallback((id: string) => {
    if (routeTournamentId && routeTournamentId !== id) return;
    if (routeTournamentId === id) {
      pollControllerRef.current?.abort();
      if (selectedTournament?.id === id && selectedTournament.status === 'in_progress') {
        setLiveRefreshVersion((version) => version + 1);
      } else {
        setDetailRefreshVersion((version) => version + 1);
      }
    } else {
      setListRefreshVersion((version) => version + 1);
    }
  }, [routeTournamentId, selectedTournament]);

  // Discovery requests are cancelled when leaving the list, changing auth, or retrying.
  useEffect(() => {
    if (routeTournamentId) return;
    const controller = new AbortController();
    let active = true;
    if (!hasTournamentListRef.current) setListState('loading');
    setIsRefreshingList(true);
    setListError(null);

    void fetchTournamentsList(token, controller.signal).then((res) => {
      if (!active) return;
      if (res.ok && res.data) {
        setTournaments(res.data.tournaments);
        hasTournamentListRef.current = true;
        setListState('success');
      } else {
        setListState('error');
        setListError(res.error || 'Failed to load tournaments. Retry the request.');
      }
    }).catch((error: unknown) => {
      if (!active) return;
      setListState('error');
      setListError(error instanceof Error ? error.message : 'Failed to load tournaments. Retry the request.');
    }).finally(() => {
      if (active) setIsRefreshingList(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [routeTournamentId, token, listRefreshVersion]);

  // The route parameter is the source of truth. Responses must match it before state is updated.
  useEffect(() => {
    if (!routeTournamentId) {
      setSelectedTournament(null);
      setDetailError(null);
      setDetailState('loading');
      setDetailStateId(null);
      setLiveMatches([]);
      setLiveError(null);
      setLiveState('loading');
      return;
    }

    const id = routeTournamentId;
    const controller = new AbortController();
    let active = true;
    setDetailStateId(id);
    if (selectedTournament?.id !== id) {
      setSelectedTournament(null);
      setDetailState('loading');
      setLiveMatches([]);
      setLiveState('loading');
      setDetailTab('bracket');
    }
    setDetailError(null);

    void fetchTournamentDetails(id, token, controller.signal).then((res) => {
      if (!active) return;
      if (res.ok && res.data && res.data.id === id) {
        setSelectedTournament(res.data);
        setDetailState('success');
        setDetailError(null);
        setDetailTab(res.data.status === 'in_progress' || res.data.status === 'completed' ? 'bracket' : 'roster');
      } else {
        setDetailError(res.error || (res.data && res.data.id !== id ? 'The server returned a different tournament.' : 'Unable to load tournament details.'));
        setDetailState(res.status === 404 ? 'notFound' : res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'error');
        if (res.status === 404 || res.status === 401 || res.status === 403) setSelectedTournament(null);
      }
    }).catch((error: unknown) => {
      if (!active) return;
      setDetailError(error instanceof Error ? error.message : 'Unable to load tournament details.');
      setDetailState('error');
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [routeTournamentId, token, detailRefreshVersion]);

  // A single sequential polling loop refreshes both the bracket details and live matches.
  useEffect(() => {
    const id = routeTournamentId;
    if (!id || selectedTournament?.id !== id || selectedTournament.status !== 'in_progress') {
      setIsRefreshingLive(false);
      if (id && selectedTournament?.id === id && selectedTournament.status !== 'in_progress') {
        setLiveMatches([]);
        setLiveState('success');
        setLiveError(null);
      }
      return;
    }

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const refresh = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      pollControllerRef.current = controller;
      setIsRefreshingLive(true);
      setLiveState((state) => state === 'success' ? state : 'loading');
      try {
        const [detailRes, liveRes] = await Promise.all([
          fetchTournamentDetails(id, token, controller.signal),
          fetchTournamentLiveMatches(token, id, controller.signal),
        ]);
        if (active && !controller.signal.aborted) {
          if (detailRes.ok && detailRes.data?.id === id) {
            setSelectedTournament(detailRes.data);
            setDetailState('success');
            setDetailError(null);
          } else if (detailRes.ok) {
            setDetailError('The server returned a different tournament.');
          } else if (!detailRes.ok) {
            setDetailError(detailRes.error || 'Unable to refresh tournament details.');
            if (detailRes.status === 404 || detailRes.status === 401 || detailRes.status === 403) {
              setDetailStateId(id);
              setDetailState(detailRes.status === 404 ? 'notFound' : detailRes.status === 401 ? 'unauthorized' : 'forbidden');
              setSelectedTournament(null);
            }
          }
          if (liveRes.ok && liveRes.data) {
            setLiveMatches(liveRes.data.matches);
            setLiveState('success');
            setLiveError(null);
          } else {
            setLiveState('error');
            setLiveError(liveRes.error || 'Unable to refresh live matches.');
          }
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setLiveState('error');
          setLiveError(error instanceof Error ? error.message : 'Unable to refresh tournament data.');
        }
      } finally {
        if (pollControllerRef.current === controller) pollControllerRef.current = null;
        inFlight = false;
        if (active) {
          setIsRefreshingLive(false);
          timeout = setTimeout(() => { void refresh(); }, 4000);
        }
      }
    };

    void refresh();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      pollControllerRef.current?.abort();
      pollControllerRef.current = null;
    };
  // Live data changes must not restart the coordinated polling loop.
  }, [routeTournamentId, selectedTournament?.id, selectedTournament?.status, token, liveRefreshVersion]);

  // ─── Actions ─────────────────────────────────────────────────────

  const handleRegister = async (tournId: string) => {
    if (!isAuthenticated || !token) {
      openAuthModal();
      return;
    }

    const key = `register:${tournId}`;
    if (!beginAction(key)) return;
    try {
      const res = await registerTournament(token, tournId);
      if (res.ok && res.data?.success) {
        showTournamentNotice(tournId, 'Successfully registered for tournament! Your seed has been reserved.');
        void refreshProgress();
        refreshTournamentView(tournId);
      } else showTournamentNotice(tournId, res.error || 'Failed to register for tournament.', 'error');
    } finally { endAction(key); }
  };

  const handleWithdraw = async (tournId: string) => {
    if (!isAuthenticated || !token) return;

    const key = `withdraw:${tournId}`;
    if (!beginAction(key)) return;
    try {
      const res = await withdrawTournament(token, tournId);
      if (res.ok && res.data?.success) {
        showTournamentNotice(tournId, 'You have withdrawn from the tournament.');
        void refreshProgress();
        refreshTournamentView(tournId);
      } else showTournamentNotice(tournId, res.error || 'Failed to withdraw from tournament.', 'error');
    } finally { endAction(key); }
  };

  const handleStart = async (tournId: string) => {
    if (!isAuthenticated || !token) return;

    const key = `start:${tournId}`;
    if (!beginAction(key)) return;
    try {
      const res = await startTournament(token, tournId);
      if (res.ok && res.data?.success) {
        showTournamentNotice(tournId, 'Tournament started! Single-elimination bracket generated.');
        refreshTournamentView(tournId);
      } else showTournamentNotice(tournId, res.error || 'Failed to start tournament.', 'error');
    } finally { endAction(key); }
  };

  const handleCancel = (tournId: string) => {
    if (!isAuthenticated || !token) return;
    setCancelError(null);
    setTournamentPendingCancel(tournId);
  };

  const confirmCancelTournament = async () => {
    const tournId = tournamentPendingCancel;
    if (!isAuthenticated || !token || !tournId) return;
    setCancelError(null);
    const key = `cancel:${tournId}`;
    if (!beginAction(key)) return;
    try {
      const res = await cancelTournament(token, tournId);
      if (res.ok && res.data?.success) {
        showTournamentNotice(tournId, 'Tournament has been cancelled.');
        refreshTournamentView(tournId);
        setTournamentPendingCancel(null);
      } else setCancelError(res.error || 'Failed to cancel tournament.');
    } finally { endAction(key); }
  };

  const handleClaimReward = async (tournId: string) => {
    if (!isAuthenticated || !token) return;

    const key = `claim:${tournId}`;
    if (!beginAction(key)) return;
    try {
      const res = await claimTournamentReward(token, tournId);
      if (res.ok && res.data?.success) {
        const awarded = [
          typeof res.data.xpAwarded === 'number' ? `+${res.data.xpAwarded} XP` : null,
          res.data.titleAwarded ? `“${res.data.titleAwarded}”` : null,
        ].filter((value): value is string => value !== null);
        showTournamentNotice(tournId, `Claimed Rank #${res.data.rank} rewards${awarded.length ? `: ${awarded.join(' · ')}` : '.'}`);
        void refreshProgress();
        refreshTournamentView(tournId);
      } else showTournamentNotice(tournId, res.error || 'Failed to claim tournament placement reward.', 'error');
    } finally { endAction(key); }
  };

  // Connects Tournament match directly to Phase 3 Ranked Arena Workspace
  const handleEnterMatch = async (matchId: string) => {
    if (!isAuthenticated || !token) {
      openAuthModal();
      return;
    }
    if (!selectedTournament) return;
    const tournamentId = selectedTournament.id;

    const key = `match:${matchId}`;
    if (!beginAction(key)) return;
    try {
      const res = await startTournamentMatch(token, tournamentId, matchId);
      if (routeTournamentId === tournamentId && res.ok && res.data?.success && res.data.matchId) {
        navigate(`/arena/match/${res.data.matchId}`);
      } else if (routeTournamentId === tournamentId) showNotice(res.error || 'Unable to enter match. Verify match readiness.', 'error');
    } finally {
      endAction(key);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!isAuthenticated || !token) {
      openAuthModal();
      return;
    }

    if (!newTitle.trim() || newTitle.trim().length < 3) {
      setCreateError('Tournament title must be at least 3 characters long.');
      return;
    }

    let rewards: TournamentRewards | undefined;
    if (customizeRewards) {
      rewards = {};
      for (const [key, label] of [
        ['firstPlace', 'First place'],
        ['secondPlace', 'Second place'],
        ['semifinalist', 'Semifinalist'],
      ] as const) {
        const draft = rewardDrafts[key];
        if (!draft.xp.trim() && !draft.title.trim()) continue;
        const xp = Number(draft.xp);
        if (!draft.xp.trim() || !Number.isInteger(xp) || xp < 0 || !draft.title.trim()) {
          setCreateError(`${label} rewards need a non-negative whole-number XP amount and a title.`);
          return;
        }
        rewards[key] = { xp, title: draft.title.trim() };
      }
      if (Object.keys(rewards).length === 0) {
        setCreateError('Add at least one complete reward tier, or turn off custom rewards to use the server defaults.');
        return;
      }
    }

    const key = 'create';
    if (!beginAction(key)) return;
    setIsSubmitting(true);
    try {
      const res = await createTournament(token, {
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        maxParticipants: newSize,
        startTime: newStartTime || undefined,
        rewards,
      });
      if (res.ok && res.data?.success && res.data.tournamentId) {
        showNotice('Tournament created successfully! Registration is now open.');
        setShowCreateModal(false);
        setNewTitle('');
        setNewDescription('');
        setNewSize(8);
        setNewStartTime('');
        setCustomizeRewards(false);
        setRewardDrafts({ firstPlace: { xp: '', title: '' }, secondPlace: { xp: '', title: '' }, semifinalist: { xp: '', title: '' } });
        navigate(`/tournaments/${res.data.tournamentId}`);
      } else setCreateError(res.error || 'Failed to create tournament.');
    } finally {
      setIsSubmitting(false);
      endAction(key);
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

  // The details endpoint returns grouped rounds under `bracket`.
  const bracketRounds: BracketRound[] = useMemo(() => {
    return selectedTournament?.bracket ?? [];
  }, [selectedTournament]);
  const hasBracketMatches = bracketRounds.some((round) => round.matches.length > 0);
  const rewardTiers = selectedTournament ? [
    { key: 'firstPlace', label: '1st Place Champion', icon: <Medal size={16} aria-hidden="true" />, reward: selectedTournament.rewards.firstPlace, className: 'first' },
    { key: 'secondPlace', label: '2nd Place Finalist', icon: <Medal size={16} aria-hidden="true" />, reward: selectedTournament.rewards.secondPlace, className: 'second' },
    { key: 'semifinalist', label: 'Semifinalists', icon: <Medal size={16} aria-hidden="true" />, reward: selectedTournament.rewards.semifinalist, className: 'semis' },
  ].filter((tier) => tier.reward) : [];

  // ─── Render: Details View ─────────────────────────────────────────
  if (routeTournamentId && selectedTournament?.id !== routeTournamentId) {
    const isDetailPending = detailStateId !== routeTournamentId || detailState === 'loading';
    return (
      <div className="tournaments-page">
        <button className="details-nav-back" onClick={() => navigate('/tournaments')}><ArrowLeft size={16} aria-hidden="true" /> Back to All Tournaments</button>
        <div className="tournaments-empty" role={isDetailPending ? 'status' : 'alert'}>
          {isDetailPending ? (
            <>
              <div className="tournaments-empty-icon"><LoaderCircle className="spinning-icon" aria-hidden="true" /></div>
              <h3>Loading tournament details…</h3>
              <p>Fetching the selected tournament from the server.</p>
            </>
          ) : (
            <>
              <div className="tournaments-empty-icon"><AlertTriangle aria-hidden="true" /></div>
              <h3>{detailState === 'notFound' ? 'Tournament not found' : detailState === 'unauthorized' ? 'Authentication required' : detailState === 'forbidden' ? 'Access unavailable' : 'Tournament details unavailable'}</h3>
              <ErrorState message={detailError || 'The tournament details could not be loaded.'} onRetry={() => setDetailRefreshVersion((version) => version + 1)} retryLabel="Retry" />
            </>
          )}
        </div>
      </div>
    );
  }

  if (routeTournamentId && selectedTournament?.id === routeTournamentId) {
    const isOwner = selectedTournament.userContext.isCreator;
    const isRegistered = selectedTournament.userContext.isRegistered;
    const canStart = isOwner && selectedTournament.status === 'registration' && selectedTournament.currentParticipants >= 2;
    const canCancel = isOwner && ['registration', 'in_progress'].includes(selectedTournament.status);
    const canWithdraw = isRegistered && selectedTournament.status === 'registration';
    const participant = selectedTournament.userContext.participant;
    const rewardClaimed = Boolean(participant?.rewardsClaimed);
    const rewardStatus = rewardClaimed
      ? 'Your placement reward has been claimed.'
      : selectedTournament.userContext.canClaimReward
        ? 'A placement reward is available to claim.'
        : selectedTournament.status === 'completed' && participant
          ? 'No unclaimed reward is available for your placement.'
          : selectedTournament.status === 'completed'
            ? 'This account did not participate in the completed tournament.'
            : 'Reward claim status is available after the tournament ends.';

    return (
      <div className="tournaments-page">
        {/* Back navigation */}
        <div className="detail-nav-row">
          <button className="details-nav-back" onClick={() => navigate('/tournaments')}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to tournaments
          </button>
        </div>

        {/* Toast Alert */}
        {notice && (
          <div className={`tournaments-toast ${notice.type}`}>
            <span>{notice.text}</span>
            <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={16} aria-hidden="true" /></button>
          </div>
        )}

        {detailError && (
          <div className="tournaments-toast error" role="alert">
            <span>{detailError}</span>
            <button onClick={() => {
              refreshTournamentView(routeTournamentId);
            }}>Retry refresh</button>
          </div>
        )}

        {/* Detail Hero Banner */}
        <div className="tournament-detail-banner">
          <div className="detail-banner-main">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={`status-badge ${selectedTournament.status}`}>
                <span className="dot" />
                {selectedTournament.status === 'registration' ? 'Registration Open' : selectedTournament.status === 'in_progress' ? 'In Progress' : selectedTournament.status}
              </span>
              <span className="detail-format-label">
                Format: Single Elimination ({selectedTournament.maxParticipants} Hunters)
              </span>
            </div>
            <h2>{selectedTournament.title}</h2>
            <p className="detail-banner-desc">
              {selectedTournament.description || 'No tournament description provided.'}
            </p>
          </div>

          <div className="detail-banner-actions">
            {canStart && (
              <button className="btn-action-start" onClick={() => handleStart(selectedTournament.id)} disabled={pendingActions.has(`start:${selectedTournament.id}`)}>
                {pendingActions.has(`start:${selectedTournament.id}`) ? <LoaderCircle className="spinning-icon" size={16} aria-hidden="true" /> : <Swords size={16} aria-hidden="true" />}
                {pendingActions.has(`start:${selectedTournament.id}`) ? 'Starting…' : `Start tournament (${selectedTournament.currentParticipants} registered)`}
              </button>
            )}

            {!isRegistered && selectedTournament.status === 'registration' && selectedTournament.currentParticipants < selectedTournament.maxParticipants && (
              <button className="btn-primary-create" onClick={() => handleRegister(selectedTournament.id)} disabled={pendingActions.has(`register:${selectedTournament.id}`)}>
                {pendingActions.has(`register:${selectedTournament.id}`) ? 'Joining…' : 'Join Tournament'}
              </button>
            )}

            {canWithdraw && (
              <button className="btn-action-withdraw" onClick={() => handleWithdraw(selectedTournament.id)} disabled={pendingActions.has(`withdraw:${selectedTournament.id}`)}>
                {pendingActions.has(`withdraw:${selectedTournament.id}`) ? 'Withdrawing…' : 'Withdraw'}
              </button>
            )}

            {selectedTournament.userContext.canClaimReward && (
              <button className="btn-action-claim" onClick={() => handleClaimReward(selectedTournament.id)} disabled={pendingActions.has(`claim:${selectedTournament.id}`)}>
                {pendingActions.has(`claim:${selectedTournament.id}`)
                  ? <><LoaderCircle className="spinning-icon" size={16} aria-hidden="true" /> Claiming…</>
                  : typeof selectedTournament.userContext.claimableReward?.xp === 'number'
                    ? <><Gift size={16} aria-hidden="true" /> Claim {selectedTournament.userContext.claimableReward.xp} XP reward</>
                    : <><Gift size={16} aria-hidden="true" /> Claim placement reward</>}
              </button>
            )}

            {canCancel && (
              <button className="btn-action-cancel" onClick={() => handleCancel(selectedTournament.id)} disabled={pendingActions.has(`cancel:${selectedTournament.id}`)}>
                {pendingActions.has(`cancel:${selectedTournament.id}`) ? 'Cancelling…' : 'Cancel Tournament'}
              </button>
            )}
          </div>
        </div>

        <section className="detail-facts" aria-label="Tournament facts">
          <div className="detail-fact">
            <Users size={18} aria-hidden="true" />
            <div><span>Participants</span><strong>{selectedTournament.currentParticipants} / {selectedTournament.maxParticipants}</strong></div>
          </div>
          <div className="detail-fact">
            <CalendarDays size={18} aria-hidden="true" />
            <div><span>Scheduled start</span><strong>{formatTournamentStart(selectedTournament.startTime)}</strong></div>
          </div>
          <div className="detail-fact">
            <Trophy size={18} aria-hidden="true" />
            <div><span>Bracket</span><strong>{selectedTournament.totalRounds} rounds · Single elimination</strong></div>
          </div>
          <div className="detail-fact">
            <UserRound size={18} aria-hidden="true" />
            <div><span>Organizer</span><strong>{isOwner ? 'You' : selectedTournament.createdBy ? 'Name unavailable' : 'Not listed'}</strong></div>
          </div>
          {selectedTournament.status === 'completed' && (
            <div className="detail-fact reward-fact">
              {rewardClaimed ? <CheckCircle2 size={18} aria-hidden="true" /> : <Gift size={18} aria-hidden="true" />}
              <div>
                <span>Reward status</span>
                <strong>{participant?.finalRank ? `Placement #${participant.finalRank} · ` : ''}{rewardStatus}</strong>
              </div>
            </div>
          )}
        </section>

        {selectedTournament.status === 'completed' && (
          <section className="completed-result" aria-labelledby="completed-result-title">
            <div className="completed-result-icon"><Trophy size={20} aria-hidden="true" /></div>
            <div className="completed-result-copy">
              <span className="section-kicker">Final result</span>
              <h3 id="completed-result-title">{selectedTournament.winnerName ? `${selectedTournament.winnerName} won the tournament` : 'Tournament completed'}</h3>
              <p>{participant?.finalRank ? `Your final placement: #${participant.finalRank}.` : 'No personal placement is available for this account.'}</p>
            </div>
          </section>
        )}

        {/* User Registration Status Card */}
        <div className={`user-status-card ${isRegistered ? 'registered' : ''}`}>
          <div className="user-status-left">
            <span className="user-status-icon">{isRegistered ? <ShieldCheck size={21} aria-hidden="true" /> : <Swords size={21} aria-hidden="true" />}</span>
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
                  : selectedTournament.status === 'in_progress'
                  ? 'Matches are currently underway.'
                  : selectedTournament.status === 'completed'
                  ? participant?.finalRank
                    ? `Final placement: #${participant.finalRank}${selectedTournament.winnerName ? ` · Champion: ${selectedTournament.winnerName}` : ''}.`
                    : selectedTournament.winnerName
                      ? `Tournament champion: ${selectedTournament.winnerName}.`
                      : 'Tournament completed.'
                  : 'Tournament cancelled.'}
              </div>
            </div>
          </div>
          {isRegistered && (
            <span className="badge-registered">
              <CheckCircle2 size={15} aria-hidden="true" /> {selectedTournament.status === 'completed' && participant?.finalRank ? `Final placement #${participant.finalRank}` : 'Registered'}
            </span>
          )}
        </div>

        {/* Details Tab Navigation */}
        <div className="details-tab-nav">
          <button
            type="button"
            className={`details-tab-btn ${detailTab === 'bracket' ? 'active' : ''}`}
            onClick={() => setDetailTab('bracket')}
            aria-pressed={detailTab === 'bracket'}
          >
            <Trophy size={16} aria-hidden="true" /> Bracket Tree ({bracketRounds.length} Rounds)
          </button>
          <button
            type="button"
            className={`details-tab-btn ${detailTab === 'live' ? 'active' : ''}`}
            onClick={() => setDetailTab('live')}
            aria-pressed={detailTab === 'live'}
          >
            <Radio size={16} aria-hidden="true" /> Live Matches {liveMatches.length > 0 && `(${liveMatches.length})`}
          </button>
          <button
            type="button"
            className={`details-tab-btn ${detailTab === 'roster' ? 'active' : ''}`}
            onClick={() => setDetailTab('roster')}
            aria-pressed={detailTab === 'roster'}
          >
            <Users size={16} aria-hidden="true" /> Hunters ({selectedTournament.participants.length})
          </button>
          <button
            type="button"
            className={`details-tab-btn ${detailTab === 'rewards' ? 'active' : ''}`}
            onClick={() => setDetailTab('rewards')}
            aria-pressed={detailTab === 'rewards'}
          >
            <Gift size={16} aria-hidden="true" /> Prize Pool & Rules
          </button>
        </div>

        {/* ─── TAB 1: BRACKET VISUALIZER ──────────────────────────────── */}
        {detailTab === 'bracket' && (
          <div className="details-card" style={{ padding: '16px' }}>
            <div className="details-card-header">
              <div className="details-card-title">
                <Swords size={17} aria-hidden="true" /> Elimination Bracket ({selectedTournament.maxParticipants} Contenders)
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Scroll horizontally to view progression · use arrow keys while focused
              </span>
            </div>

            {!hasBracketMatches ? (
              <div className="bracket-empty-state">
                <div className="tournaments-empty-icon"><Trophy aria-hidden="true" /></div>
                <h3>Bracket not generated yet</h3>
                <p>{selectedTournament.status === 'registration'
                  ? 'The bracket will appear after the tournament creator starts the event.'
                  : 'No match data is available for this bracket yet.'}</p>
              </div>
            ) : (
              <div className="bracket-container" role="region" aria-label="Tournament bracket; rounds progress from left to right" tabIndex={0}>
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
                        const canSpectate = (isLive || isCompleted) && Boolean(matchNode.arenaMatchId);
                        const p1IsWinner = Boolean(matchNode.winnerId && matchNode.p1Id && matchNode.winnerId === matchNode.p1Id && (isCompleted || isBye));
                        const p2IsWinner = Boolean(matchNode.winnerId && matchNode.p2Id && matchNode.winnerId === matchNode.p2Id && (isCompleted || isBye));
                        const p1IsEliminated = Boolean(isCompleted && matchNode.winnerId && matchNode.p1Id && matchNode.winnerId !== matchNode.p1Id);
                        const p2IsEliminated = Boolean(isCompleted && matchNode.winnerId && matchNode.p2Id && matchNode.winnerId !== matchNode.p2Id);

                        return (
                          <div
                            key={matchNode.id}
                            role="group"
                            className={`bracket-match-node status-${matchNode.status} ${isLive ? 'live' : ''} ${isYourMatch ? 'your-match' : ''}`}
                            aria-label={`Round ${matchNode.round}, match ${matchNode.matchIndex + 1}: ${bracketStatusLabel(matchNode.status)}`}
                          >
                            <div className="bracket-match-meta">
                              <span>Match #{matchNode.matchIndex + 1}</span>
                              <span className={`bracket-status-label ${isLive ? 'active' : ''}`}>
                                {isLive && <span aria-hidden="true">● </span>}{bracketStatusLabel(matchNode.status)}
                              </span>
                            </div>

                            {/* Combatant 1 Slot */}
                            <div className={`bracket-match-slot ${p1IsWinner ? 'winner' : ''} ${p1IsEliminated ? 'eliminated' : ''} ${matchNode.p1Id === user?.id ? 'you' : ''}`}>
                              <div className="bracket-slot-name">
                                {p1IsWinner ? <Crown size={15} aria-hidden="true" /> : <Swords size={15} aria-hidden="true" />}
                                <span>{matchNode.p1Name || (matchNode.round === 1 ? 'Empty slot' : 'To be determined')}</span>
                              </div>
                              {matchNode.p1Id === user?.id && (
                                <span className="participant-badge-you">You</span>
                              )}
                              {p1IsEliminated && <span className="bracket-eliminated"><CircleX size={13} aria-hidden="true" /> Eliminated</span>}
                            </div>

                            {/* Combatant 2 Slot */}
                            <div className={`bracket-match-slot ${p2IsWinner ? 'winner' : ''} ${p2IsEliminated ? 'eliminated' : ''} ${matchNode.p2Id === user?.id ? 'you' : ''}`}>
                              <div className="bracket-slot-name">
                                {p2IsWinner ? <Crown size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
                                <span>{matchNode.p2Name || (isBye ? 'BYE (Auto Advance)' : matchNode.round === 1 ? 'Empty slot' : 'To be determined')}</span>
                              </div>
                              {matchNode.p2Id === user?.id && (
                                <span className="participant-badge-you">You</span>
                              )}
                              {p2IsEliminated && <span className="bracket-eliminated"><CircleX size={13} aria-hidden="true" /> Eliminated</span>}
                            </div>

                            {/* Match Actions */}
                            <div className="bracket-match-actions">
                              {canEnter && (
                                <button
                                  className="btn-bracket-enter"
                                  onClick={() => handleEnterMatch(matchNode.id)}
                                  disabled={pendingActions.has(`match:${matchNode.id}`)}
                                  aria-label={`Enter duel for round ${matchNode.round}, match ${matchNode.matchIndex + 1}`}
                                >
                                  {pendingActions.has(`match:${matchNode.id}`) ? <><LoaderCircle className="spinning-icon" size={15} aria-hidden="true" /> Connecting…</> : <><Swords size={15} aria-hidden="true" /> Enter Duel</>}
                                </button>
                              )}

                              {canSpectate && matchNode.arenaMatchId && (
                                <button
                                  className="btn-bracket-spectate"
                                  onClick={() => navigate(`/arena/spectate/${matchNode.arenaMatchId}`)}
                                  aria-label={`${isCompleted ? 'View results for' : 'Spectate'} round ${matchNode.round}, match ${matchNode.matchIndex + 1}`}
                                >
                                  <><Eye size={15} aria-hidden="true" /> {isCompleted ? 'Results' : 'Spectate'}</>
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
                <Radio size={17} aria-hidden="true" /> Live Tournament Matches
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Status refreshes every four seconds
              </span>
            </div>

            {liveState === 'loading' && liveMatches.length === 0 ? (
              <div className="tournaments-empty" role="status">
                <div className="tournaments-empty-icon"><LoaderCircle className="spinning-icon" aria-hidden="true" /></div>
                <h3>Loading live matches…</h3>
              </div>
            ) : liveState === 'error' && liveMatches.length === 0 ? (
              <div className="tournaments-empty" role="alert">
                <div className="tournaments-empty-icon"><AlertTriangle aria-hidden="true" /></div>
                <h3>Live matches unavailable</h3>
                <p>{liveError || 'The live-match request failed.'}</p>
                <button className="btn-primary-create" onClick={() => setLiveRefreshVersion((version) => version + 1)}>
                  Retry
                </button>
              </div>
            ) : liveMatches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                <div className="tournaments-empty-icon"><Radio aria-hidden="true" /></div>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>No Matches Currently in Progress</h3>
                <p style={{ fontSize: '0.85rem' }}>
                  When contenders enter duel workspace, live matches will populate here for spectating.
                </p>
              </div>
            ) : (
              <>
              {liveError && <div className="tournaments-toast error" role="alert">
                <span>{liveError}</span>
                <button onClick={() => setLiveRefreshVersion((version) => version + 1)}>Retry</button>
              </div>}
              {isRefreshingLive && <div className="live-refresh-indicator" role="status">Updating live matches…</div>}
              <div className="live-matches-grid">
                {liveMatches.map((m) => (
                  <div key={m.tournamentMatchId} className="live-match-card">
                    <div className="live-match-top">
                      <span className={`status-badge ${liveStatusClass(m.status)}`}>
                        <span className="dot" />
                        Round {m.round} · {liveStatusLabel(m.status)}
                      </span>
                      {(m.status === 'ready' || m.status === 'in_progress') && Number.isFinite(m.remainingSeconds) && (
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f87171' }}>
                          <Clock3 size={15} aria-hidden="true" /> {Math.floor(m.remainingSeconds / 60)}:{(m.remainingSeconds % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>

                    {m.challengeTitle && <div className="live-match-challenge">Challenge: {m.challengeTitle}</div>}

                    <div className="live-duelists">
                      <div className="live-duelist">
                        <Swords size={15} aria-hidden="true" />
                        {m.player1?.name ? <strong>{m.player1.name}</strong> : <span className="participant-unavailable">Participant unavailable</span>}
                      </div>
                      <div className="live-vs-text">VS</div>
                      <div className="live-duelist">
                        <ShieldCheck size={15} aria-hidden="true" />
                        {m.player2?.name ? <strong>{m.player2.name}</strong> : <span className="participant-unavailable">Participant unavailable</span>}
                      </div>
                    </div>

                    {m.arenaMatchId && (
                      <button
                        className="btn-primary-create"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => navigate(`/arena/spectate/${m.arenaMatchId}`)}
                        aria-label={`${m.status === 'ready' || m.status === 'in_progress' ? 'Spectate' : 'View'} round ${m.round} match details`}
                      >
                        <><Eye size={15} aria-hidden="true" /> {m.status === 'ready' || m.status === 'in_progress' ? 'Spectate Match' : 'View Match Details'}</>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              </>
            )}
          </div>
        )}

        {/* ─── TAB 3: PARTICIPANTS ROSTER ─────────────────────────────── */}
        {detailTab === 'roster' && (
          <div className="details-card">
            <div className="details-card-header">
              <div className="details-card-title">
                <Users size={17} aria-hidden="true" /> Registered Hunters ({selectedTournament.participants.length} / {selectedTournament.maxParticipants})
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
              <div className="participants-table-wrap" role="region" aria-label="Registered tournament participants" tabIndex={0}>
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
                              {isChampion && <span className="participant-badge-champion"><Crown size={13} aria-hidden="true" /> Champion</span>}
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
                  <Trophy size={17} aria-hidden="true" /> Prize Pool & Rewards
                </div>
              </div>

              <div className="rewards-breakdown">
                {rewardTiers.length > 0 ? rewardTiers.map((tier) => (
                  <div className={`reward-tier-item ${tier.className}`} key={tier.key}>
                    <div className="reward-tier-label">
                      <span aria-hidden="true">{tier.icon}</span>
                      <span>{tier.label}</span>
                    </div>
                    <div className="reward-tier-content">
                      {typeof tier.reward?.xp === 'number' && <div className="reward-xp-value">+{tier.reward.xp} XP</div>}
                      {tier.reward?.title && <div className="reward-title-value">«{tier.reward.title}»</div>}
                      {typeof tier.reward?.xp !== 'number' && !tier.reward?.title && <div className="reward-title-value">Reward details unavailable</div>}
                    </div>
                  </div>
                )) : (
                  <div className="reward-unavailable">Reward details are unavailable for this tournament.</div>
                )}
              </div>
            </div>

            <div className="details-card">
              <div className="details-card-header">
                <div className="details-card-title">
                  <Info size={17} aria-hidden="true" /> Tournament Rules
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
        <TournamentCancelDialog
          open={Boolean(tournamentPendingCancel)}
          tournamentName={tournamentPendingCancel === selectedTournament.id ? selectedTournament.title : 'this tournament'}
          error={cancelError}
          pending={Boolean(tournamentPendingCancel && pendingActions.has(`cancel:${tournamentPendingCancel}`))}
          onClose={() => {
            if (!tournamentPendingCancel || !pendingActions.has(`cancel:${tournamentPendingCancel}`)) setTournamentPendingCancel(null);
          }}
          onConfirm={() => void confirmCancelTournament()}
        />
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
            Browse coding tournaments, follow single-elimination brackets, and review match results and rewards returned by the tournament service.
          </p>
        </div>

        <div className="tournaments-hero-actions">
          <button
            className="btn-primary-create"
            onClick={() => {
              if (!isAuthenticated) openAuthModal();
              else { setCreateError(null); setShowCreateModal(true); }
            }}
          >
            <Swords size={17} aria-hidden="true" /> Create Tournament
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notice && (
        <div className={`tournaments-toast ${notice.type}`}>
          <span>{notice.text}</span>
          <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={16} aria-hidden="true" /></button>
        </div>
      )}

      {/* Toolbar: Filters & Search */}
      <div className="tournaments-toolbar">
        <div className="tournaments-tabs">
          <button
            className={`tournaments-tab-btn ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
            aria-pressed={activeFilter === 'all'}
          >
            All ({tournaments.length})
          </button>
          <button
            className={`tournaments-tab-btn ${activeFilter === 'registration' ? 'active' : ''}`}
            onClick={() => setActiveFilter('registration')}
            aria-pressed={activeFilter === 'registration'}
          >
            Registration Open
          </button>
          <button
            className={`tournaments-tab-btn ${activeFilter === 'in_progress' ? 'active' : ''}`}
            onClick={() => setActiveFilter('in_progress')}
            aria-pressed={activeFilter === 'in_progress'}
          >
            In Progress
          </button>
          <button
            className={`tournaments-tab-btn ${activeFilter === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveFilter('completed')}
            aria-pressed={activeFilter === 'completed'}
          >
            Completed
          </button>
          <button
            className={`tournaments-tab-btn ${activeFilter === 'cancelled' ? 'active' : ''}`}
            onClick={() => setActiveFilter('cancelled')}
            aria-pressed={activeFilter === 'cancelled'}
          >
            Cancelled
          </button>
        </div>

        <div className="tournaments-search-box">
          <Search size={17} aria-hidden="true" />
          <input
            type="text"
            placeholder="Search tournaments…"
            aria-label="Search tournaments"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {isRefreshingList && (
        <div className="live-refresh-indicator" role="status">Refreshing tournament list…</div>
      )}
      {listError && tournaments.length > 0 && (
        <div className="tournaments-toast error" role="alert">
          <span>{listError}</span>
          <button onClick={() => setListRefreshVersion((version) => version + 1)}>Retry</button>
        </div>
      )}

      {listState === 'success' && (
        <div className="tournament-result-count" role="status">
          {filteredTournaments.length === tournaments.length
            ? `${tournaments.length} tournament${tournaments.length === 1 ? '' : 's'}`
            : `${filteredTournaments.length} shown · ${tournaments.length} total`}
        </div>
      )}

      {/* Tournaments Grid */}
      {listState === 'loading' ? (
        <div className="tournaments-empty">
          <div className="tournaments-empty-icon"><LoaderCircle className="spinning-icon" aria-hidden="true" /></div>
          <h3>Loading tournaments</h3>
          <p>Retrieving the tournament list.</p>
        </div>
      ) : listState === 'error' && tournaments.length === 0 ? (
        <div className="tournaments-empty" role="alert">
          <div className="tournaments-empty-icon"><AlertTriangle aria-hidden="true" /></div>
          <h3>Tournaments unavailable</h3>
          <p>{listError || 'The tournament list request failed.'}</p>
          <button className="btn-primary-create" style={{ marginTop: '16px' }} onClick={() => setListRefreshVersion((version) => version + 1)}>
            Retry
          </button>
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="tournaments-empty">
          <div className="tournaments-empty-icon"><Trophy aria-hidden="true" /></div>
          <h3>{activeFilter !== 'all' || searchQuery ? 'No matching tournaments' : 'No tournaments yet'}</h3>
          <p>{activeFilter !== 'all' || searchQuery
            ? 'No tournaments match the current search and status filter.'
            : 'There are no tournaments in the list yet.'}</p>
          {activeFilter !== 'all' || searchQuery ? (
            <button type="button" className="btn-secondary" onClick={() => { setActiveFilter('all'); setSearchQuery(''); }}>Clear search and filters</button>
          ) : (
            <button type="button" className="btn-primary-create" onClick={() => { if (!isAuthenticated) openAuthModal(); else { setCreateError(null); setShowCreateModal(true); } }}>Host a Tournament</button>
          )}
        </div>
      ) : (
        <div className="tournaments-grid">
          {filteredTournaments.map((t) => {
            const percentFull = t.maxParticipants > 0 ? Math.min(100, Math.max(0, Math.round((t.currentParticipants / t.maxParticipants) * 100))) : 0;
            const isFull = t.currentParticipants >= t.maxParticipants;

            return (
              <div key={t.id} className="tournament-card">
                <div>
                  <div className="tournament-card-header">
                    <div className="tournament-card-heading">
                      <div className="tournament-card-title">{t.title}</div>
                      <div className="tournament-card-desc">
                        {t.description || 'No tournament description provided.'}
                      </div>
                    </div>
                    <span className={`status-badge ${t.status}`}>
                      <span className="dot" />
                      {t.status === 'registration'
                        ? 'Registration Open'
                        : t.status === 'in_progress'
                        ? 'In Progress'
                        : t.status === 'completed'
                        ? 'Completed'
                        : 'Cancelled'}
                    </span>
                  </div>
                  {t.isCreator && (
                    <div className="tournament-card-flags" aria-label="Your tournament status">
                      <span className="tournament-flag creator">Created by you</span>
                    </div>
                  )}
                  {t.isRegistered && !t.isCreator && (
                    <div className="tournament-card-flags" aria-label="Your tournament status">
                      <span className="tournament-flag participant"><CheckCircle2 size={13} aria-hidden="true" /> Registered</span>
                    </div>
                  )}

                  {/* Card Meta Box */}
                  <div className="tournament-card-meta" style={{ marginTop: '14px' }}>
                    <div className="meta-row">
                      <span className="meta-label">Participants</span>
                      <span className="meta-value">
                        {t.currentParticipants} / {t.maxParticipants} Hunters
                      </span>
                    </div>
                    <ProgressBar value={t.currentParticipants} max={t.maxParticipants} label={`${t.currentParticipants} of ${t.maxParticipants} tournament places filled`} variant={percentFull >= 100 ? 'success' : 'cyan'} className="tournament-capacity-progress" />

                    <div className="meta-row" style={{ marginTop: '4px' }}>
                      <span className="meta-label">Bracket Format</span>
                      <span className="meta-value">{t.totalRounds} Rounds Single Elimination</span>
                    </div>
                    {t.startTime && <div className="meta-row">
                      <span className="meta-label">Starts</span>
                      <span className="meta-value tournament-start-value"><CalendarDays size={14} aria-hidden="true" /> {formatTournamentStart(t.startTime)}</span>
                    </div>}

                    {t.rewards?.firstPlace && (typeof t.rewards.firstPlace.xp === 'number' || t.rewards.firstPlace.title) && (
                      <div className="meta-row">
                        <span className="meta-label">Grand Prize</span>
                        <div className="rewards-pill">
                          <Trophy size={15} aria-hidden="true" />
                          <span>{typeof t.rewards.firstPlace.xp === 'number' && `+${t.rewards.firstPlace.xp} XP`}{typeof t.rewards.firstPlace.xp === 'number' && t.rewards.firstPlace.title && ' · '}{t.rewards.firstPlace.title || ''}</span>
                        </div>
                      </div>
                    )}

                    {t.winnerName && (
                      <div className="meta-row">
                        <span className="meta-label">Champion</span>
                        <span className="meta-value" style={{ color: '#fbbf24' }}>
                          <Crown size={15} aria-hidden="true" /> {t.winnerName}
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
                      <CheckCircle2 size={14} aria-hidden="true" /> Registered
                    </span>
                  ) : t.status === 'registration' && !isFull ? (
                    <button
                      className="btn-register-quick"
                      onClick={() => handleRegister(t.id)}
                      disabled={pendingActions.has(`register:${t.id}`)}
                    >
                      {pendingActions.has(`register:${t.id}`) ? 'Joining…' : 'Join Tournament'}
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
        <Modal
          open={showCreateModal}
          title="Host a Tournament"
          description="Set the public details, bracket size, and optional reward tiers."
          className="tournament-create-modal"
          onClose={() => { if (!isSubmitting) setShowCreateModal(false); }}
        >
            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                {createError && <p className="tournament-form-error" role="alert">{createError}</p>}
                <div className="form-group">
                  <label htmlFor="tournament-name">Tournament Name *</label>
                  <input
                    id="tournament-name"
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
                  <label htmlFor="tournament-description">Description</label>
                  <textarea
                    id="tournament-description"
                    className="form-textarea"
                    placeholder="Explain the format, requirements, or prizes for contenders…"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>

                <fieldset className="form-group bracket-size-fieldset">
                  <legend>Bracket Size (Hunters)</legend>
                  <div className="size-picker-grid">
                    {[4, 8, 16, 32].map((size) => (
                      <button
                        type="button"
                        key={size}
                        className={`size-option-card ${newSize === size ? 'selected' : ''}`}
                        onClick={() => setNewSize(size)}
                        aria-pressed={newSize === size}
                      >
                        <div className="size-number">{size}</div>
                        <div className="size-label">{Math.ceil(Math.log2(size))} Rounds</div>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="form-group">
                  <label htmlFor="tournament-start-time">Start Date & Time (Optional)</label>
                  <input
                    id="tournament-start-time"
                    type="datetime-local"
                    className="form-input"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                  />
                </div>

                <div className="reward-customization">
                  <label className="reward-customization-toggle">
                    <input type="checkbox" checked={customizeRewards} onChange={(event) => setCustomizeRewards(event.target.checked)} />
                    <span>Set custom reward tiers</span>
                  </label>
                  {!customizeRewards ? (
                    <p className="tournament-reward-note">Leave this off to use the tournament service defaults.</p>
                  ) : (
                    <div className="reward-draft-grid">
                      {([
                        ['firstPlace', 'First place'],
                        ['secondPlace', 'Second place'],
                        ['semifinalist', 'Semifinalist'],
                      ] as const).map(([key, label]) => (
                        <fieldset className="reward-draft" key={key}>
                          <legend>{label}</legend>
                          <label htmlFor={`reward-${key}-xp`}>XP amount</label>
                          <input id={`reward-${key}-xp`} type="number" min="0" step="1" inputMode="numeric" value={rewardDrafts[key].xp} onChange={(event) => setRewardDrafts((current) => ({ ...current, [key]: { ...current[key], xp: event.target.value } }))} />
                          <label htmlFor={`reward-${key}-title`}>Title</label>
                          <input id={`reward-${key}-title`} type="text" value={rewardDrafts[key].title} onChange={(event) => setRewardDrafts((current) => ({ ...current, [key]: { ...current[key], title: event.target.value } }))} />
                        </fieldset>
                      ))}
                    </div>
                  )}
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
        </Modal>
      )}
    </div>
  );
}
