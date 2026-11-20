import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProgression } from '../context/ProgressionContext';
import type {
  GuildSummary,
  GuildDetailsResponse,
  UserGuildProfileResponse,
} from '../types';
import { Button, EmptyState, ErrorState, LoadingState, Modal, Panel, ProgressBar, RankBadge, StatCard, StatusBadge, Toast } from '../components/ui';
import {
  claimGuildQuest,
  createGuild,
  fetchGuildDetails,
  fetchGuildProfile,
  fetchGuilds,
  inviteGuildPlayer,
  joinGuild,
  kickGuildMember,
  leaveGuild,
  respondToGuildInvite,
  transferGuildLeadership,
  updateGuildMemberRole,
} from '../services/guildApi';
import { AppIcon } from '../components/ui/AppIcon';
import './Guilds.css';

const EMBLEM_OPTIONS = ['🛡️', '⚔️', '🐉', '🦅', '🐺', '⚡', '🔮', '👑', '🔥', '🌑', '🩸', '❄️'];

interface ManagementConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  pendingKey: string;
  onConfirm: () => Promise<void>;
  reopenTransfer?: boolean;
}

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
  return map[rank] || 'var(--text-muted)';
}

export default function Guilds() {
  const { guildId: routeGuildId } = useParams<{ guildId?: string }>();
  const navigate = useNavigate();
  const { token, user, isAuthenticated, isLoading: authLoading, openAuthModal } = useAuth();
  const { refreshProgress } = useProgression();

  // Guild State
  const [userProfile, setUserProfile] = useState<UserGuildProfileResponse | null>(null);
  const [userProfileError, setUserProfileError] = useState<string | null>(null);
  const [guildDetailsData, setGuildDetailsData] = useState<GuildDetailsResponse | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'loaded' | 'not-found' | 'forbidden' | 'error'>('idle');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetry, setDetailRetry] = useState<number>(0);
  const [detailRefresh, setDetailRefresh] = useState<number>(0);
  const profileRequestId = useRef(0);
  const profileControllerRef = useRef<AbortController | null>(null);
  const [discoveryList, setDiscoveryList] = useState<GuildSummary[]>([]);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [totalGuilds, setTotalGuilds] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const normalizedSearchQuery = searchQuery.trim();
  const [rankFilter, setRankFilter] = useState<string>('all');
  const [discoveryLoading, setDiscoveryLoading] = useState<boolean>(false);
  const [discoveryHasLoaded, setDiscoveryHasLoaded] = useState<boolean>(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryRetry, setDiscoveryRetry] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'members' | 'quests' | 'milestones' | 'discovery'>('members');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [targetMemberForTransfer, setTargetMemberForTransfer] = useState<string>('');
  const [confirmation, setConfirmation] = useState<ManagementConfirmation | null>(null);
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [pendingInviteActions, setPendingInviteActions] = useState<Record<string, 'accept' | 'reject'>>({});
  const pendingActionRef = useRef<Set<string>>(new Set());
  const noticeTimeoutRef = useRef<number | null>(null);
  const activeGuildViewIdRef = useRef<string | null>(null);
  const [guildNameError, setGuildNameError] = useState<string | null>(null);

  // Form states
  const [newGuildName, setNewGuildName] = useState<string>('');
  const [newGuildDesc, setNewGuildDesc] = useState<string>('');
  const [newGuildEmblem, setNewGuildEmblem] = useState<string>('🛡️');
  const [inviteUsername, setInviteUsername] = useState<string>('');
  // Helper to show temporary notification
  const showNotice = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current);
    setActionMessage({ text, type });
    noticeTimeoutRef.current = window.setTimeout(() => setActionMessage(null), 4500);
  }, []);

  useEffect(() => () => {
    if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current);
  }, []);

  const runWithPending = useCallback(async (key: string, action: () => Promise<void>) => {
    if (pendingActionRef.current.has(key)) return;
    pendingActionRef.current.add(key);
    setPendingActions(new Set(pendingActionRef.current));
    try {
      await action();
    } finally {
      pendingActionRef.current.delete(key);
      setPendingActions(new Set(pendingActionRef.current));
    }
  }, []);

  // Fetch current user's guild profile
  const fetchUserProfile = useCallback(async () => {
    const requestId = ++profileRequestId.current;
    profileControllerRef.current?.abort();
    if (!token || !isAuthenticated) {
      setUserProfile(null);
      setUserProfileError(null);
      return;
    }
    const controller = new AbortController();
    profileControllerRef.current = controller;
    setUserProfileError(null);
    const result = await fetchGuildProfile(token, controller.signal);
    if (controller.signal.aborted || requestId !== profileRequestId.current) return;
    if (result.ok && result.data) {
      setUserProfile(result.data);
      setUserProfileError(null);
    } else {
      setUserProfileError(result.error || 'Could not load your guild profile.');
    }
  }, [token, isAuthenticated]);

  useEffect(() => {
    profileRequestId.current += 1;
    profileControllerRef.current?.abort();
    profileControllerRef.current = null;
    setUserProfile(null);
    setUserProfileError(null);
    if (authLoading || !isAuthenticated || !token) return;
    void fetchUserProfile();
    return () => profileControllerRef.current?.abort();
  }, [authLoading, isAuthenticated, token, fetchUserProfile]);

  // Guild details are selected and loaded exclusively from the current route.
  useEffect(() => {
    if (!routeGuildId) {
      setGuildDetailsData(null);
      setDetailState('idle');
      setDetailError(null);
      return;
    }

    setActiveTab('members');
    setGuildDetailsData(null);
    setDetailError(null);
    if (authLoading) {
      setDetailState('idle');
      return;
    }

    const controller = new AbortController();
    setDetailState('loading');
    void (async () => {
      const result = await fetchGuildDetails(routeGuildId, isAuthenticated ? token : null, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok && result.data) {
        if (result.data.guild.id !== routeGuildId) {
          setDetailError('The server returned details for a different guild. Please retry.');
          setDetailState('error');
          return;
        }
        setGuildDetailsData(result.data);
        setDetailState('loaded');
        return;
      }

      setDetailError(result.error ?? 'Unable to load this guild. Please try again.');
      if (result.status === 404) setDetailState('not-found');
      else if (result.status === 401 || result.status === 403) setDetailState('forbidden');
      else setDetailState('error');
    })();
    return () => controller.abort();
  }, [routeGuildId, token, isAuthenticated, authLoading, detailRetry, detailRefresh]);

  const refreshRouteDetails = useCallback(() => {
    if (routeGuildId) setDetailRefresh((count) => count + 1);
  }, [routeGuildId]);

  // Debounce text input while rank and page changes can apply immediately.
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearchQuery(normalizedSearchQuery), 350);
    return () => window.clearTimeout(timeout);
  }, [normalizedSearchQuery]);

  // A single effect owns public discovery requests and cancels obsolete ones.
  useEffect(() => {
    if (routeGuildId || activeTab !== 'discovery' || normalizedSearchQuery !== debouncedSearchQuery) return;

    const controller = new AbortController();
    setDiscoveryLoading(true);
    setDiscoveryError(null);

    void (async () => {
      const result = await fetchGuilds({
        page: currentPage,
        limit: 12,
        search: debouncedSearchQuery,
        rank: rankFilter,
      }, controller.signal);

      if (controller.signal.aborted) return;
      if (!result.ok || !result.data) {
        setDiscoveryError(result.error ?? 'Unable to load guilds. Please try again.');
        setDiscoveryHasLoaded(true);
        setDiscoveryLoading(false);
        return;
      }

      const data = result.data;
      setDiscoveryList(data.guilds);
      setTotalGuilds(Number.isFinite(data.total) ? data.total : null);
      setTotalPages(Number.isFinite(data.totalPages) ? data.totalPages : null);
      setCurrentPage(Number.isFinite(data.page) && data.page >= 1 ? data.page : currentPage);
      setDiscoveryHasLoaded(true);
      setDiscoveryLoading(false);
    })();

    return () => controller.abort();
  }, [routeGuildId, activeTab, currentPage, normalizedSearchQuery, debouncedSearchQuery, rankFilter, discoveryRetry]);

  // If user is not in a guild and not viewing another guild, set tab to discovery
  useEffect(() => {
    if (!authLoading && !routeGuildId && (!isAuthenticated || (userProfile && !userProfile.inGuild))) {
      setActiveTab('discovery');
    }
  }, [authLoading, isAuthenticated, userProfile, routeGuildId]);

  // Handle Create Guild
  const handleCreateGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return openAuthModal();
    const name = newGuildName.trim();
    if (!name || name.length < 3 || name.length > 30 || !/^[a-zA-Z0-9 _-]+$/.test(name)) {
      setGuildNameError(!name
        ? 'Guild name is required.'
        : name.length < 3 || name.length > 30
          ? 'Guild name must be between 3 and 30 characters.'
          : 'Use letters, numbers, spaces, underscores, or hyphens.');
      return;
    }
    if (!token) return openAuthModal();

    await runWithPending('create', async () => {
      const result = await createGuild(token, { name, description: newGuildDesc.trim(), emblem: newGuildEmblem });
      if (!result.ok || !result.data?.success || !result.data.guild?.id) {
        showNotice(result.data?.error || result.error || 'Failed to create guild.', 'error');
        return;
      }

      showNotice(`Guild "${result.data.guild.name}" created successfully!`);
      setShowCreateModal(false);
      setNewGuildName('');
      setNewGuildDesc('');
      setGuildNameError(null);
      await fetchUserProfile();
      await refreshProgress();
      navigate(`/guilds/${result.data.guild.id}`);
    });
  };

  // Handle Join Guild
  const handleJoinGuild = async (targetGuildId: string) => {
    if (!isAuthenticated) return openAuthModal();
    if (!token) return openAuthModal();
    await runWithPending(`join:${targetGuildId}`, async () => {
      const result = await joinGuild(token, targetGuildId);
      if (!result.ok || !result.data?.success) {
        showNotice(result.data?.error || result.error || 'Failed to join guild.', 'error');
        return;
      }
      showNotice('Successfully joined guild!');
      await fetchUserProfile();
      await refreshProgress();
      navigate(`/guilds/${targetGuildId}`);
    });
  };

  const performLeaveGuild = async () => {
    if (!sessionProfile?.guild?.id || !token) return;
    const result = await leaveGuild(token, sessionProfile.guild.id);
    if (!result.ok || !result.data?.success) {
      showNotice(result.data?.error || result.error || 'Failed to leave guild.', 'error');
      return;
    }
    showNotice('You have left the guild.');
    setConfirmation(null);
    await fetchUserProfile();
    await refreshProgress();
    setCurrentPage(1);
    setActiveTab('discovery');
    if (routeGuildId) navigate('/guilds');
  };

  const handleLeaveGuild = () => {
    if (!sessionProfile?.guild?.id) return;
    const soleLeader = isLeader && activeGuildDetails?.members.length === 1;
    const leaderWithRoster = isLeader && (activeGuildDetails?.members.length ?? 0) > 1;
    if (leaderWithRoster) return;
    const description = soleLeader
      ? 'Leaving as the sole leader will disband this guild. This cannot be undone.'
      : leaderWithRoster
        ? 'Leadership must be transferred to another guild member before you can leave. The server will enforce this rule.'
        : 'You will leave this guild and lose access to its member-only sections.';
    setConfirmation({ title: 'Leave Guild?', description, confirmLabel: 'Leave Guild', pendingKey: 'leave', onConfirm: performLeaveGuild });
  };

  // Handle Accept/Reject Invite
  const handleRespondInvite = async (guildId: string, inviteId: string, accept: boolean) => {
    if (!token) return openAuthModal();
    const action = accept ? 'accept' : 'reject';
    await runWithPending(`invite:${inviteId}`, async () => {
      setPendingInviteActions((current) => ({ ...current, [inviteId]: action }));
      try {
        const result = await respondToGuildInvite(token, guildId, inviteId, accept);
        if (!result.ok || !result.data?.success) {
          showNotice(result.data?.error || result.error || `Failed to ${action} invite.`, 'error');
          return;
        }
        showNotice(accept ? 'Invitation accepted! Welcome to the guild.' : 'Invitation rejected.');
        await fetchUserProfile();
        await refreshProgress();
        if (accept) {
          if (routeGuildId === guildId) refreshRouteDetails();
          else navigate(`/guilds/${guildId}`);
        }
      } finally {
        setPendingInviteActions((current) => {
          const next = { ...current };
          delete next[inviteId];
          return next;
        });
      }
    });
  };

  // Handle Invite Hunter
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGuildDetails?.guild?.id || !inviteUsername.trim() || !token) return;
    await runWithPending('invite-send', async () => {
      const result = await inviteGuildPlayer(token, activeGuildDetails.guild.id, inviteUsername.trim());
      if (!result.ok || !result.data?.success) {
        showNotice(result.data?.error || result.error || 'Failed to send invite.', 'error');
        return;
      }
      showNotice(`Invitation dispatched to ${result.data.targetUsername}!`);
      setShowInviteModal(false);
      setInviteUsername('');
    });
  };

  // Handle Kick Member
  const performKickMember = async (targetUserId: string, targetName: string) => {
    if (!activeGuildDetails?.guild?.id || !token) return;
    const result = await kickGuildMember(token, activeGuildDetails.guild.id, targetUserId);
    if (!result.ok || !result.data?.success) {
      showNotice(result.data?.error || result.error || 'Failed to remove member.', 'error');
      return;
    }
    showNotice(`${targetName} has been removed from the guild.`);
    setConfirmation(null);
    refreshRouteDetails();
    await fetchUserProfile();
  };

  const handleKickMember = (targetUserId: string, targetName: string) => {
    setConfirmation({
      title: 'Remove Guild Member?',
      description: `Remove ${targetName} from this guild? They will lose access to member-only sections.`,
      confirmLabel: 'Remove Member',
      pendingKey: `kick:${targetUserId}`,
      onConfirm: () => performKickMember(targetUserId, targetName),
    });
  };

  // Handle Role Change (Promote / Demote)
  const performRoleChange = async (targetUserId: string, newRole: 'officer' | 'member', targetName: string) => {
    if (!activeGuildDetails?.guild?.id || !token) return;
    const result = await updateGuildMemberRole(token, activeGuildDetails.guild.id, targetUserId, newRole);
    if (!result.ok || !result.data?.success) {
      showNotice(result.data?.error || result.error || 'Failed to change member role.', 'error');
      return;
    }
    showNotice(`${targetName} is now a ${newRole}.`);
    setConfirmation(null);
    refreshRouteDetails();
    await fetchUserProfile();
  };

  const handleRoleChange = (targetUserId: string, newRole: 'officer' | 'member', targetName: string) => {
    const action = newRole === 'officer' ? 'promote' : 'change to member';
    setConfirmation({
      title: newRole === 'officer' ? 'Promote Guild Member?' : 'Change Member Role?',
      description: `${action} ${targetName} ${newRole === 'officer' ? 'to Officer' : 'role to Member'}?`,
      confirmLabel: newRole === 'officer' ? 'Promote to Officer' : 'Change to Member',
      pendingKey: `role:${targetUserId}`,
      onConfirm: () => performRoleChange(targetUserId, newRole, targetName),
    });
  };

  // Handle Leadership Transfer
  const performTransferLeadership = async (newLeaderId: string) => {
    if (!activeGuildDetails?.guild?.id || !token) return;
    const successor = activeGuildDetails.members.find((member) => member.userId === newLeaderId);
    const result = await transferGuildLeadership(token, activeGuildDetails.guild.id, newLeaderId);
    if (!result.ok || !result.data?.success) {
      showNotice(result.data?.error || result.error || 'Failed to transfer leadership.', 'error');
      return;
    }
    showNotice(`Leadership transferred to ${successor?.name ?? 'the selected member'}.`);
    setConfirmation(null);
    setShowTransferModal(false);
    refreshRouteDetails();
    await fetchUserProfile();
  };

  const handleTransferLeadership = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGuildDetails?.guild?.id || !targetMemberForTransfer) return;
    const successor = activeGuildDetails.members.find((member) => member.userId === targetMemberForTransfer);
    const newLeaderId = targetMemberForTransfer;
    setShowTransferModal(false);
    setConfirmation({
      title: 'Transfer Guild Leadership?',
      description: `Transfer leadership to ${successor?.name ?? 'the selected member'}? You will step down from the Leader role. The server verifies that the successor is a current guild member.`,
      confirmLabel: 'Transfer Leadership',
      pendingKey: 'transfer',
      reopenTransfer: true,
      onConfirm: () => performTransferLeadership(newLeaderId),
    });
  };

  // Handle Claim Quest Reward
  const handleClaimQuest = async (questId: string) => {
    const guildId = activeGuildDetails?.guild?.id;
    if (!guildId || !token) return;
    await runWithPending(`quest:${guildId}:${questId}`, async () => {
      const result = await claimGuildQuest(token, guildId, questId);
      if (!result.ok || !result.data?.success) {
        if (activeGuildViewIdRef.current === guildId) {
          showNotice(result.data?.error || result.error || 'Failed to claim quest reward.', 'error');
        }
        return;
      }
      if (activeGuildViewIdRef.current === guildId) {
        if (Number.isFinite(result.data.xpAwarded)) {
          showNotice(`Guild quest reward claimed! +${result.data.xpAwarded} XP awarded to the guild.`);
        } else {
          showNotice('Guild quest reward claimed. The server did not return an XP amount.');
        }
        refreshRouteDetails();
      }
      await fetchUserProfile();
      await refreshProgress();
    });
  };

  // A route detail must match the URL; /guilds shows the authenticated user's own guild.
  const sessionProfile = isAuthenticated ? userProfile : null;
  const routeGuildDetails = routeGuildId && guildDetailsData?.guild.id === routeGuildId ? guildDetailsData : null;
  const activeGuildDetails = routeGuildId ? routeGuildDetails : sessionProfile?.details ?? null;
  activeGuildViewIdRef.current = activeGuildDetails?.guild.id ?? null;
  const displayedGuild = routeGuildId
    ? routeGuildDetails?.guild ?? null
    : activeGuildDetails?.guild ?? (sessionProfile?.inGuild ? sessionProfile.guild : null);
  const permissions = activeGuildDetails?.userContext;
  const isUserMember = permissions?.isMember === true && sessionProfile?.guild?.id === displayedGuild?.id;
  const userRole = isUserMember ? permissions?.role : null;
  const isLeader = isUserMember && permissions?.isLeader === true;
  const isOfficer = isUserMember && permissions?.isOfficer === true;

  return (
    <div className="guilds-page guild-command-center">
      {/* Toast notice */}
      {isAuthenticated && userProfileError && (
        <div className="guild-profile-load-error" role="alert">
          <span>{userProfileError}</span>
          <button type="button" className="guilds-secondary-btn" onClick={() => void fetchUserProfile()}>
            Retry
          </button>
        </div>
      )}
      {actionMessage && (
        <div className="guild-toast-slot">
          <Toast variant={actionMessage.type} title={actionMessage.type === 'error' ? 'Action failed' : 'Guild update'} message={actionMessage.text} />
        </div>
      )}

      {/* Pending Invites Banner */}
      {sessionProfile?.pendingInvites && sessionProfile.pendingInvites.length > 0 && !sessionProfile.inGuild && (
        <Panel className="pending-invites-panel guild-command-panel animate-fadeInUp">
          <div className="guild-section-heading">
            <div>
              <span className="guild-eyebrow">Incoming transmissions</span>
              <h2>Pending Invitations <span className="guild-count">{sessionProfile.pendingInvites.length}</span></h2>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sessionProfile.pendingInvites.map((inv) => (
              <div key={inv.inviteId} className="pending-invite-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="pending-invite-emblem" aria-hidden="true"><AppIcon glyph={inv.guildEmblem} fallback="shield" size={24} /></span>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{inv.guildName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Invited by <strong style={{ color: 'var(--text-secondary)' }}>{inv.inviterName}</strong> • {inv.guildRank} • {inv.memberCount}/{inv.maxMembers} Members
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="guilds-action-btn"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    disabled={pendingActions.has(`invite:${inv.inviteId}`)}
                    onClick={() => void handleRespondInvite(inv.guild_id, inv.inviteId, true)}
                  >
                    {pendingInviteActions[inv.inviteId] === 'accept' ? 'Accepting…' : 'Accept'}
                  </button>
                  <button
                    className="guilds-secondary-btn"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    disabled={pendingActions.has(`invite:${inv.inviteId}`)}
                    onClick={() => void handleRespondInvite(inv.guild_id, inv.inviteId, false)}
                  >
                    {pendingInviteActions[inv.inviteId] === 'reject' ? 'Declining…' : 'Decline'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Main Guild Banner or Discovery View */}
      {displayedGuild ? (
        <section className="guilds-hero guild-command-hero has-guild animate-fadeInUp">
          <div className="guilds-hero-content">
            <div className="guilds-hero-top">
              <div className="guilds-hero-title-wrap">
                <div className="guilds-hero-emblem" aria-hidden="true"><AppIcon glyph={displayedGuild.emblem} fallback="shield" size={28} /></div>
                <div>
                  <h1 className="guilds-hero-title">
                    <span>{displayedGuild.name}</span>
                    <RankBadge rank={displayedGuild.rank} className="guild-command-rank" />
                    {userRole && <span className={`guild-role-badge ${userRole}`}>{userRole}</span>}
                  </h1>
                  <div className="guilds-hero-subtitle">
                    {displayedGuild.description || 'No guild description provided.'}
                  </div>
                  {displayedGuild.leaderName && <div className="guild-leader-line">Led by <strong>{displayedGuild.leaderName}</strong>{displayedGuild.leaderRank && <> · <span>{displayedGuild.leaderRank}</span></>}</div>}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {isUserMember ? (
                  <>
                    {isOfficer && (
                      <button className="guilds-action-btn" onClick={() => setShowInviteModal(true)}>
                        <span>+</span> Invite Hunter
                      </button>
                    )}
                    {isLeader && activeGuildDetails && activeGuildDetails.members.length > 1 && (
                      <button className="guilds-secondary-btn" onClick={() => setShowTransferModal(true)}>
                        Transfer Leadership
                      </button>
                    )}
                    <button
                      className="guilds-danger-btn"
                      onClick={handleLeaveGuild}
                      disabled={pendingActions.has('leave') || (isLeader && (activeGuildDetails?.members.length ?? 0) > 1)}
                      aria-describedby={isLeader && (activeGuildDetails?.members.length ?? 0) > 1 ? 'guild-leave-restriction' : undefined}
                    >
                      Leave Guild
                    </button>
                    {isLeader && (activeGuildDetails?.members.length ?? 0) > 1 && (
                      <span id="guild-leave-restriction" className="guild-leave-restriction">
                        Transfer leadership before leaving.
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {!sessionProfile?.inGuild && (
                      <button className="guilds-action-btn" onClick={() => void handleJoinGuild(displayedGuild.id)} disabled={pendingActions.has(`join:${displayedGuild.id}`)}>
                        {pendingActions.has(`join:${displayedGuild.id}`) ? 'Joining…' : 'Join Guild'}
                      </button>
                    )}
                    <button className="guilds-secondary-btn" onClick={() => navigate('/guilds')}>
                      Browse All Guilds
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Guild Stats Grid */}
            <div className="guilds-hero-stats guild-command-stats">
              <StatCard label="Guild Level" value={`Lv. ${displayedGuild.level}`} icon={<AppIcon name="gem" />} />
              <StatCard label="Total Contribution" value={`${displayedGuild.totalXp.toLocaleString()} XP`} icon={<AppIcon name="sparkles" />} />
              <StatCard label="Weekly Contribution" value={`${displayedGuild.weeklyXp.toLocaleString()} XP`} icon={<AppIcon name="trendingUp" />} />
              <StatCard label="Roster" value={`${displayedGuild.memberCount} / ${displayedGuild.maxMembers}`} icon={<AppIcon name="users" />} />
              {isUserMember && sessionProfile?.membership && (
                <StatCard label="Your Contribution" value={`${sessionProfile.membership.contributedXp.toLocaleString()} XP`} icon={<AppIcon name="zap" />} />
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="guilds-hero guild-command-hero guild-discovery-hero animate-fadeInUp">
          <div className="guilds-hero-content">
            <div className="guilds-hero-top">
              <div>
                <span className="guild-eyebrow">Hunter Association · command network</span>
                <h1 className="guilds-hero-title">Guild Headquarters</h1>
                <div className="guilds-hero-subtitle">
                  Find your unit, coordinate with fellow hunters, and take on cooperative challenges.
                </div>
                {user && <div className="guild-hunter-context">Current hunter <strong>{user.username}</strong></div>}
              </div>
              {isAuthenticated && (
                <button className="guilds-action-btn" onClick={() => setShowCreateModal(true)}>
                  <AppIcon name="shield" size={16} /> Create Guild
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Nav Tabs */}
      <div className="guilds-nav-tabs guild-command-nav" aria-label="Guild sections">
        {displayedGuild && (
          <>
            <button
              className={`guild-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
              aria-pressed={activeTab === 'members'}
              onClick={() => setActiveTab('members')}
            >
              <><AppIcon name="users" size={15} /> Member Roster ({activeGuildDetails?.members?.length || displayedGuild.memberCount})</>
            </button>
            <button
              className={`guild-tab-btn ${activeTab === 'quests' ? 'active' : ''}`}
              aria-pressed={activeTab === 'quests'}
              onClick={() => setActiveTab('quests')}
            >
              <><AppIcon name="swords" size={15} /> Cooperative Quests ({activeGuildDetails?.quests?.length || 0})</>
            </button>
            <button
              className={`guild-tab-btn ${activeTab === 'milestones' ? 'active' : ''}`}
              aria-pressed={activeTab === 'milestones'}
              onClick={() => setActiveTab('milestones')}
            >
              <><AppIcon name="trophy" size={15} /> Milestones ({activeGuildDetails?.achievements?.length || 0})</>
            </button>
          </>
        )}
        <button
          className={`guild-tab-btn ${activeTab === 'discovery' ? 'active' : ''}`}
          aria-pressed={activeTab === 'discovery'}
          onClick={() => setActiveTab('discovery')}
        >
          <><AppIcon name="search" size={15} /> Discover Guilds</>
        </button>
      </div>

      {routeGuildId && (authLoading || detailState === 'loading') && (
        <LoadingState label={authLoading ? 'Checking session' : detailRetry > 0 || detailRefresh > 0 ? 'Retrying guild details' : 'Loading guild details'} lines={4} />
      )}
      {routeGuildId && detailState === 'not-found' && (
        <EmptyState
          title="Guild Not Found"
          description={detailError ?? 'This guild could not be found.'}
          action={<Button variant="secondary" onClick={() => setDetailRetry((count) => count + 1)}>Retry</Button>}
        />
      )}
      {routeGuildId && detailState === 'forbidden' && (
        <ErrorState message={detailError ?? 'You do not have access to this guild.'} onRetry={() => setDetailRetry((count) => count + 1)} retryLabel="Retry" />
      )}
      {routeGuildId && detailState === 'error' && (
        <ErrorState message={detailError ?? 'Unable to load guild details.'} onRetry={() => setDetailRetry((count) => count + 1)} retryLabel="Retry" />
      )}

      {/* Tab: Members */}
      {activeTab === 'members' && activeGuildDetails && (
        <Panel as="div" className="guild-members-wrap guild-command-panel animate-fadeInUp">
          <div className="guild-roster-heading">
            <div><span className="guild-eyebrow">Unit roster</span><h2>Guild Members</h2></div>
            <span className="guild-count">{activeGuildDetails.members.length} hunters</span>
          </div>
          <div className="guild-roster-scroll" role="region" aria-label="Guild member roster" tabIndex={0}>
          <table className="guild-members-table">
            <thead>
              <tr>
                <th>Hunter</th>
                <th>Rank</th>
                <th>Level</th>
                <th>Role</th>
                <th>Total Contributed</th>
                <th>Weekly Contributed</th>
                {isOfficer && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {activeGuildDetails.members.map((m) => {
                const canManageMember = isLeader && m.role !== 'leader';
                const canKickMember =
                  (isLeader && m.role !== 'leader') || (userRole === 'officer' && m.role === 'member');
                return (
                  <tr key={m.userId}>
                    <td>
                      <div className="member-user-cell">
                        <div className="member-avatar">{m.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="member-name">
                            {m.name}
                            {m.userId === user?.id && (
                              <span style={{ fontSize: '0.7rem', color: '#a855f7' }}> (YOU)</span>
                            )}
                          </div>
                          <div className="member-title">{m.title || 'Hunter'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className="guild-rank-tag"
                        style={{
                          background: `${getRankColor(m.rank)}18`,
                          color: getRankColor(m.rank),
                          border: `1px solid ${getRankColor(m.rank)}35`,
                        }}
                      >
                        {m.rank}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>Lv. {m.level}</td>
                    <td>
                      <span className={`guild-role-badge ${m.role}`}>{m.role}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {m.contributedXp.toLocaleString()} XP
                    </td>
                    <td style={{ color: 'var(--color-success)' }}>+{m.weeklyContributedXp.toLocaleString()} XP</td>
                    {isOfficer && (
                      <td>
                        <div className="member-actions-cell">
                          {canManageMember && m.role === 'member' && (
                            <button
                              className="icon-btn"
                              title="Promote to Officer"
                              disabled={pendingActions.has(`role:${m.userId}`)}
                              onClick={() => handleRoleChange(m.userId, 'officer', m.name)}
                            >
                              <><AppIcon name="arrowUp" size={14} /> Officer</>
                            </button>
                          )}
                          {canManageMember && m.role === 'officer' && (
                            <button
                              className="icon-btn"
                              title="Demote to Member"
                              disabled={pendingActions.has(`role:${m.userId}`)}
                              onClick={() => handleRoleChange(m.userId, 'member', m.name)}
                            >
                              <><AppIcon name="arrowDown" size={14} /> Member</>
                            </button>
                          )}
                          {canKickMember && (
                            <button
                              className="icon-btn danger"
                              title="Kick from guild"
                              disabled={pendingActions.has(`kick:${m.userId}`)}
                              onClick={() => handleKickMember(m.userId, m.name)}
                            >
                              <AppIcon name="x" size={14} /> Kick
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </Panel>
      )}

      {/* Tab: Cooperative Guild Quests */}
      {activeTab === 'quests' && activeGuildDetails && (
        <section className="guild-section animate-fadeInUp" aria-labelledby="guild-quests-heading">
          <div className="guild-section-heading">
            <div><span className="guild-eyebrow">Shared objectives</span><h2 id="guild-quests-heading">Cooperative Quests</h2></div>
          </div>
          <div className="guild-quests-grid">
          {activeGuildDetails.quests.map((q) => {
            const rawStatus: string = q.status;
            const isCompleted = rawStatus === 'completed';
            const isClaimed = rawStatus === 'claimed';
            const isInProgress = rawStatus === 'in-progress';
            const statusLabel = isInProgress || isCompleted || isClaimed ? rawStatus.replace('-', ' ') : 'status unavailable';
            const badgeStatus = isInProgress ? 'active' : isCompleted ? 'completed' : 'pending';
            const claimPendingKey = `quest:${activeGuildDetails.guild.id}:${q.id}`;
            return (
              <Panel as="article"
                key={q.id}
                className={`guild-quest-card ${isCompleted ? 'completed' : ''} ${isClaimed ? 'claimed' : ''}`}
              >
                <div className="guild-quest-header">
                  <div>
                    <div className="guild-quest-title">{q.title}</div>
                    <div className="guild-quest-desc">{q.description}</div>
                  </div>
                  <StatusBadge status={badgeStatus}>{statusLabel}</StatusBadge>
                </div>

                <div className="guild-quest-progress-wrap">
                  <div className="guild-quest-progress-labels">
                    <span style={{ color: 'var(--text-muted)' }}>Guild Objective</span>
                    <span style={{ fontWeight: 600 }}>
                      {q.currentValue.toLocaleString()} / {q.targetValue.toLocaleString()} ({q.progressPercent}%)
                    </span>
                  </div>
                  <ProgressBar value={q.progressPercent} label={`${q.title} progress`} variant="cyan" />
                  {isInProgress && (
                    <p className="guild-quest-claim-note">Claim availability is not included in this status. The server must confirm eligibility.</p>
                  )}
                  {isCompleted && q.completedAt && (
                    <p className="guild-quest-claim-note">Completed {new Date(q.completedAt).toLocaleDateString()}</p>
                  )}
                </div>

                <div className="guild-quest-footer">
                  <div>
                    <div style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>+{q.xpReward.toLocaleString()} Guild XP</div>
                    {q.userContribution !== undefined && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Your contribution: {q.userContribution.toLocaleString()}
                      </div>
                    )}
                  </div>

                  {isCompleted && isUserMember && (
                      <button className="guilds-action-btn" onClick={() => void handleClaimQuest(q.id)} disabled={pendingActions.has(claimPendingKey)}>
                      {pendingActions.has(claimPendingKey) ? 'Claiming…' : 'Claim Reward'}
                    </button>
                  )}
                  {isClaimed && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      <AppIcon name="checkCircle" size={14} /> Claimed{q.claimedAt ? ` ${new Date(q.claimedAt).toLocaleDateString()}` : ''}
                    </span>
                  )}
                </div>
              </Panel>
            );
          })}
          {activeGuildDetails.quests.length === 0 && <EmptyState title="No Cooperative Quests" description="There are no quest records available for this guild." />}
          </div>
        </section>
      )}

      {/* Tab: Milestones */}
      {activeTab === 'milestones' && activeGuildDetails && (
        <section className="guild-section animate-fadeInUp" aria-labelledby="guild-achievements-heading">
          <div className="guild-section-heading">
            <div><span className="guild-eyebrow">Guild record</span><h2 id="guild-achievements-heading">Unlocked Achievements</h2></div>
            <span className="guild-count">{activeGuildDetails.achievements.length}</span>
          </div>
          <div className="guild-quests-grid">
          {activeGuildDetails.achievements.map((a) => (
            <Panel as="article" key={a.id} className="guild-quest-card completed guild-achievement-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span><AppIcon glyph={a.icon} fallback="award" size={24} /></span>
                <div className="guild-achievement-copy">
                  <div className="guild-quest-title">{a.name}</div>
                  <div className="guild-quest-desc">{a.description}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Unlocked: {new Date(a.unlockedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </Panel>
          ))}
          {activeGuildDetails.achievements.length === 0 && (
            <div className="guild-empty-state" style={{ gridColumn: '1 / -1' }}>
              <div className="guild-empty-icon"><AppIcon name="trophy" size={24} /></div>
              <div className="guild-empty-title">No Achievements Unlocked Yet</div>
              <div className="guild-empty-desc">
                Unlocked guild achievements will appear here.
              </div>
            </div>
          )}
          </div>
        </section>
      )}

      {/* Tab: Discover Guilds */}
      {activeTab === 'discovery' && (
          <div className="guild-discovery-content">
          {/* Toolbar */}
          <div className="guilds-toolbar guild-discovery-toolbar">
            <div className="guilds-search-box">
              <span><AppIcon name="search" size={16} /></span>
              <input
                type="text"
                className="guilds-search-input"
                aria-label="Search guilds by name"
                placeholder="Search guilds by name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className="guild-filter-actions">
              <select
                className="guilds-filter-select"
                aria-label="Filter guilds by rank"
                value={rankFilter}
                onChange={(e) => {
                  setRankFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All Ranks</option>
                <option value="E-Rank">E-Rank</option>
                <option value="D-Rank">D-Rank</option>
                <option value="C-Rank">C-Rank</option>
                <option value="B-Rank">B-Rank</option>
                <option value="A-Rank">A-Rank</option>
                <option value="S-Rank">S-Rank</option>
                <option value="National Level">National Level</option>
                <option value="Monarch">Monarch</option>
              </select>

              {isAuthenticated && !sessionProfile?.inGuild && (
                <button className="guilds-action-btn" onClick={() => setShowCreateModal(true)}>
                  <span>+</span> Create Guild
                </button>
              )}
            </div>
          </div>

          {(normalizedSearchQuery || rankFilter !== 'all') && (
            <div className="guild-active-filters" aria-live="polite">
              <span className="guild-eyebrow">Active filters</span>
              {normalizedSearchQuery && <span className="guild-filter-chip">Name: “{normalizedSearchQuery}”</span>}
              {rankFilter !== 'all' && <span className="guild-filter-chip">Rank: {rankFilter}</span>}
              <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setRankFilter('all'); setCurrentPage(1); }}>Clear filters</Button>
            </div>
          )}
          {discoveryHasLoaded && !discoveryError && totalGuilds !== null && (
            <div className="guild-discovery-result-count" aria-live="polite">{totalGuilds} {totalGuilds === 1 ? 'guild' : 'guilds'} found</div>
          )}

          {/* Guilds Grid */}
          {discoveryError && discoveryList.length > 0 && (
            <ErrorState message={discoveryError} onRetry={() => setDiscoveryRetry((count) => count + 1)} retryLabel={discoveryLoading ? 'Retrying…' : 'Retry'} />
          )}
          {discoveryLoading && discoveryList.length === 0 && <LoadingState label={discoveryHasLoaded ? 'Retrying guild search' : 'Loading guilds'} lines={4} />}
          {discoveryHasLoaded && discoveryError && discoveryList.length === 0 && (
            <ErrorState message={discoveryError} onRetry={() => setDiscoveryRetry((count) => count + 1)} retryLabel={discoveryLoading ? 'Retrying…' : 'Retry'} />
          )}
          <div className="guilds-grid animate-fadeInUp">
            {discoveryList.map((g) => (
              <Panel as="article" key={g.id} className="guild-card guild-command-card">
                <div className="guild-card-top">
                  <div className="guild-card-emblem" aria-hidden="true"><AppIcon glyph={g.emblem} fallback="shield" size={24} /></div>
                  <div className="guild-card-info">
                    <h2 className="guild-card-name">{g.name}</h2>
                    <div className="guild-card-meta">
                      <RankBadge rank={g.rank} />
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Lv. {g.level}</span>
                    </div>
                  </div>
                </div>

                <div className="guild-card-desc">{g.description || 'No description provided.'}</div>
                {g.leaderName && <div className="guild-card-leader">Leader <strong>{g.leaderName}</strong>{g.leaderRank && <span>{g.leaderRank}</span>}</div>}

                <div className="guild-card-stats">
                  <span><AppIcon name="users" size={14} /> {g.memberCount}/{g.maxMembers} Members</span>
                  <span><AppIcon name="sparkles" size={14} /> {g.totalXp.toLocaleString()} Total XP</span>
                </div>
                <div className="guild-card-weekly">Weekly contribution <strong>{g.weeklyXp.toLocaleString()} XP</strong></div>

                <div className="guild-card-actions">
                  <button
                    className="guilds-secondary-btn"
                    style={{ flex: 1 }}
                    onClick={() => {
                      navigate(`/guilds/${g.id}`);
                    }}
                  >
                    View Guild
                  </button>
                  {!sessionProfile?.inGuild && (
                    <button
                      className="guilds-action-btn"
                      style={{ flex: 1 }}
                      disabled={g.memberCount >= g.maxMembers || pendingActions.has(`join:${g.id}`)}
                      onClick={() => void handleJoinGuild(g.id)}
                    >
                      {g.memberCount >= g.maxMembers ? 'Full' : pendingActions.has(`join:${g.id}`) ? 'Joining…' : 'Join'}
                    </button>
                  )}
                </div>
              </Panel>
            ))}
          </div>

          {/* Empty state */}
          {discoveryHasLoaded && !discoveryError && discoveryList.length === 0 && (
            <EmptyState
              icon={<AppIcon name="shield" />}
              title={normalizedSearchQuery || rankFilter !== 'all' ? 'No Matching Guilds' : 'No Guilds Available'}
              description={normalizedSearchQuery || rankFilter !== 'all' ? 'Try changing the search or rank filter.' : 'There are no guild records to display right now.'}
              action={isAuthenticated && !sessionProfile?.inGuild ? <Button onClick={() => setShowCreateModal(true)}>Create a Guild Now</Button> : undefined}
            />
          )}

          {/* Pagination */}
          {discoveryHasLoaded && !discoveryError && totalPages !== null && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              <button
                className="guilds-secondary-btn"
                disabled={discoveryLoading || currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--text-secondary)' }}>
                Page {currentPage} of {totalPages}{totalGuilds !== null ? ` · ${totalGuilds} guilds` : ''}
              </span>
              <button
                className="guilds-secondary-btn"
                disabled={discoveryLoading || currentPage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Guild */}
      <Modal
        open={showCreateModal}
        title="Establish Hunter Guild"
        description="Create a guild using the name and emblem that will identify it to other hunters."
        onClose={() => { if (!pendingActions.has('create')) setShowCreateModal(false); }}
        className="guild-modal"
      >
            <form onSubmit={handleCreateGuild} className="guild-management-form">
              <div className="guild-form-group">
                <label className="guild-form-label">Guild Emblem</label>
                <div className="emblem-picker">
                  {EMBLEM_OPTIONS.map((emb) => (
                    <button
                      key={emb}
                      type="button"
                      className={`emblem-option ${newGuildEmblem === emb ? 'selected' : ''}`}
                      aria-label={`Select ${emb} guild emblem`}
                      aria-pressed={newGuildEmblem === emb}
                      onClick={() => setNewGuildEmblem(emb)}
                    >
                      <AppIcon glyph={emb} fallback="shield" size={18} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="guild-form-group">
                <label className="guild-form-label" htmlFor="guild-create-name">Guild Name (3–30 characters)</label>
                <input
                  id="guild-create-name"
                  type="text"
                  className="guild-form-input"
                  placeholder="e.g. Shadow Monarchs"
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9 _-]+"
                  required
                  value={newGuildName}
                  aria-invalid={Boolean(guildNameError)}
                  aria-describedby={guildNameError ? 'guild-create-name-error' : 'guild-create-name-help'}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    setNewGuildName(e.target.value);
                    setGuildNameError(!value
                      ? null
                      : value.length < 3 || value.length > 30
                        ? 'Guild name must be between 3 and 30 characters.'
                        : !/^[a-zA-Z0-9 _-]+$/.test(value)
                          ? 'Use letters, numbers, spaces, underscores, or hyphens.'
                          : null);
                  }}
                />
                {guildNameError
                  ? <span className="guild-field-error" id="guild-create-name-error" role="alert">{guildNameError}</span>
                  : <span className="guild-field-help" id="guild-create-name-help">Letters, numbers, spaces, underscores, and hyphens.</span>}
              </div>

              <div className="guild-form-group">
                <label className="guild-form-label" htmlFor="guild-create-description">Description</label>
                <textarea
                  id="guild-create-description"
                  className="guild-form-textarea"
                  rows={3}
                  placeholder="Describe your guild's mission, goals, and culture..."
                  maxLength={300}
                  value={newGuildDesc}
                  onChange={(e) => setNewGuildDesc(e.target.value)}
                />
              </div>

              <div className="guild-modal-actions">
                <button type="button" className="guilds-secondary-btn" onClick={() => setShowCreateModal(false)} disabled={pendingActions.has('create')}>
                  Cancel
                </button>
                <button type="submit" className="guilds-action-btn" disabled={pendingActions.has('create')}>
                  {pendingActions.has('create') ? 'Establishing…' : 'Create Guild'}
                </button>
              </div>
            </form>
      </Modal>

      {/* Modal: Invite Hunter */}
      <Modal
        open={showInviteModal}
        title="Invite Hunter"
        description="Invite a hunter by their exact username. The server checks whether the invitation is allowed."
        onClose={() => { if (!pendingActions.has('invite-send')) setShowInviteModal(false); }}
        className="guild-modal"
      >
            <form onSubmit={handleSendInvite} className="guild-management-form">
              <div className="guild-form-group">
                <label className="guild-form-label" htmlFor="guild-invite-username">Hunter Username</label>
                <input
                  id="guild-invite-username"
                  type="text"
                  className="guild-form-input"
                  placeholder="Enter exact hunter username"
                  required
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                />
              </div>

              <div className="guild-modal-actions">
                <button type="button" className="guilds-secondary-btn" onClick={() => setShowInviteModal(false)} disabled={pendingActions.has('invite-send')}>
                  Cancel
                </button>
                <button type="submit" className="guilds-action-btn" disabled={pendingActions.has('invite-send')}>
                  {pendingActions.has('invite-send') ? 'Dispatching…' : 'Send Invitation'}
                </button>
              </div>
            </form>
      </Modal>

      {/* Modal: Transfer Leadership */}
      <Modal
        open={showTransferModal && Boolean(activeGuildDetails)}
        title="Transfer Guild Leadership"
        description="Leadership can only be transferred by the current leader to another current guild member."
        onClose={() => setShowTransferModal(false)}
        className="guild-modal"
      >
            {activeGuildDetails && <form onSubmit={handleTransferLeadership} className="guild-management-form">
              <div className="guild-form-group">
                <label className="guild-form-label" htmlFor="guild-successor">Select Successor</label>
                <select
                  id="guild-successor"
                  className="guild-form-input"
                  required
                  value={targetMemberForTransfer}
                  onChange={(e) => setTargetMemberForTransfer(e.target.value)}
                >
                  <option value="">-- Choose active member --</option>
                  {activeGuildDetails.members
                    .filter((m) => m.role !== 'leader')
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} ({m.role}) - Lv.{m.level} {m.rank}
                      </option>
                    ))}
                </select>
              </div>

              <div className="guild-modal-actions">
                <button type="button" className="guilds-secondary-btn" onClick={() => setShowTransferModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="guilds-danger-btn"
                  disabled={!targetMemberForTransfer}
                >
                  Continue to Confirmation
                </button>
              </div>
            </form>}
      </Modal>

      <Modal
        open={confirmation !== null}
        title={confirmation?.title ?? 'Confirm Guild Action'}
        description={confirmation?.description}
        onClose={() => {
          if (confirmation && !pendingActions.has(confirmation.pendingKey)) {
            const reopenTransfer = confirmation.reopenTransfer;
            setConfirmation(null);
            if (reopenTransfer) setShowTransferModal(true);
          }
        }}
        className="guild-confirm-modal"
      >
        <div className="guild-modal-actions">
          <button
            type="button"
            className="guilds-secondary-btn"
            disabled={Boolean(confirmation && pendingActions.has(confirmation.pendingKey))}
            onClick={() => {
              const reopenTransfer = confirmation?.reopenTransfer;
              setConfirmation(null);
              if (reopenTransfer) setShowTransferModal(true);
            }}
          >Cancel</button>
          <button
            type="button"
            className="guilds-danger-btn"
            disabled={!confirmation || pendingActions.has(confirmation.pendingKey)}
            onClick={() => {
              if (confirmation) void runWithPending(confirmation.pendingKey, confirmation.onConfirm);
            }}
          >
            {confirmation && pendingActions.has(confirmation.pendingKey) ? 'Working…' : confirmation?.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
