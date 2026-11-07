import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProgression } from '../context/ProgressionContext';
import type {
  GuildSummary,
  GuildDetailsResponse,
  UserGuildProfileResponse,
  GuildsListResponse,
} from '../types';
import './Guilds.css';

const EMBLEM_OPTIONS = ['🛡️', '⚔️', '🐉', '🦅', '🐺', '⚡', '🔮', '👑', '🔥', '🌑', '🩸', '❄️'];

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
  const { token, isAuthenticated, openAuthModal } = useAuth();
  const { refreshProgress } = useProgression();

  // Guild State
  const [userProfile, setUserProfile] = useState<UserGuildProfileResponse | null>(null);
  const [activeGuildDetails, setActiveGuildDetails] = useState<GuildDetailsResponse | null>(null);
  const [discoveryList, setDiscoveryList] = useState<GuildSummary[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [rankFilter, setRankFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'members' | 'quests' | 'milestones' | 'discovery'>('members');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [targetMemberForTransfer, setTargetMemberForTransfer] = useState<string>('');

  // Form states
  const [newGuildName, setNewGuildName] = useState<string>('');
  const [newGuildDesc, setNewGuildDesc] = useState<string>('');
  const [newGuildEmblem, setNewGuildEmblem] = useState<string>('🛡️');
  const [inviteUsername, setInviteUsername] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Helper to show temporary notification
  const showNotice = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 4500);
  }, []);

  // Fetch current user's guild profile
  const fetchUserProfile = useCallback(async () => {
    if (!token || !isAuthenticated) {
      setUserProfile(null);
      return;
    }
    try {
      const res = await fetch('/api/guilds/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: UserGuildProfileResponse = await res.json();
        setUserProfile(data);
        if (data.inGuild && data.details) {
          setActiveGuildDetails(data.details);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch user guild profile:', err);
    }
  }, [token, isAuthenticated]);

  // Fetch discovery guilds
  const fetchGuildsList = useCallback(
    async (page = 1, search = '', rank = 'all') => {
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', '12');
        if (search.trim()) params.set('search', search.trim());
        if (rank !== 'all') params.set('rank', rank);

        const res = await fetch(`/api/guilds?${params.toString()}`);
        if (res.ok) {
          const data: GuildsListResponse = await res.json();
          setDiscoveryList(data.guilds);
          setTotalPages(data.totalPages || 1);
          setCurrentPage(data.page || 1);
        }
      } catch (err) {
        console.warn('Failed to fetch guilds list:', err);
      }
    },
    []
  );

  // Fetch specific guild by ID (e.g. route /guilds/:guildId)
  const fetchGuildById = useCallback(
    async (id: string) => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`/api/guilds/${id}`, { headers });
        if (res.ok) {
          const data: GuildDetailsResponse = await res.json();
          setActiveGuildDetails(data);
        } else {
          showNotice('Guild not found.', 'error');
          navigate('/guilds');
        }
      } catch (err) {
        console.warn('Failed to fetch guild details:', err);
      }
    },
    [token, navigate, showNotice]
  );

  // Initialize
  useEffect(() => {
    let cancelled = false;
    async function init() {
      await fetchUserProfile();
      if (!cancelled) {
        if (routeGuildId) {
          await fetchGuildById(routeGuildId);
        } else {
          await fetchGuildsList(1, searchQuery, rankFilter);
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchUserProfile, fetchGuildById, fetchGuildsList, routeGuildId]);

  // If user is not in a guild and not viewing another guild, set tab to discovery
  useEffect(() => {
    if (userProfile && !userProfile.inGuild && !routeGuildId) {
      setActiveTab('discovery');
    }
  }, [userProfile, routeGuildId]);

  // Handle Create Guild
  const handleCreateGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return openAuthModal();
    if (!newGuildName.trim()) return showNotice('Guild name is required.', 'error');

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/guilds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newGuildName.trim(),
          description: newGuildDesc.trim(),
          emblem: newGuildEmblem,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Failed to create guild.', 'error');
      } else {
        showNotice(`Guild "${data.guild.name}" created successfully!`);
        setShowCreateModal(false);
        setNewGuildName('');
        setNewGuildDesc('');
        await fetchUserProfile();
        await refreshProgress();
        setActiveTab('members');
      }
    } catch (err: any) {
      showNotice(err.message || 'Error creating guild.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Join Guild
  const handleJoinGuild = async (targetGuildId: string) => {
    if (!isAuthenticated) return openAuthModal();
    try {
      const res = await fetch(`/api/guilds/${targetGuildId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Failed to join guild.', 'error');
      } else {
        showNotice('Successfully joined guild!');
        await fetchUserProfile();
        await refreshProgress();
        navigate('/guilds');
      }
    } catch (err: any) {
      showNotice(err.message || 'Error joining guild.', 'error');
    }
  };

  // Handle Leave Guild
  const handleLeaveGuild = async () => {
    if (!userProfile?.guild?.id) return;
    const confirmLeave = window.confirm(
      'Are you sure you want to leave your guild? If you are the leader and sole member, the guild will be disbanded.'
    );
    if (!confirmLeave) return;

    try {
      const res = await fetch(`/api/guilds/${userProfile.guild.id}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Failed to leave guild.', 'error');
      } else {
        showNotice('You have left the guild.');
        await fetchUserProfile();
        await refreshProgress();
        setActiveTab('discovery');
        await fetchGuildsList(1);
      }
    } catch (err: any) {
      showNotice(err.message || 'Error leaving guild.', 'error');
    }
  };

  // Handle Accept/Reject Invite
  const handleRespondInvite = async (guildId: string, inviteId: string, accept: boolean) => {
    try {
      const action = accept ? 'accept' : 'reject';
      const res = await fetch(`/api/guilds/${guildId}/invites/${inviteId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || `Failed to ${action} invite.`, 'error');
      } else {
        showNotice(accept ? 'Invitation accepted! Welcome to the guild.' : 'Invitation rejected.');
        await fetchUserProfile();
        await refreshProgress();
      }
    } catch (err: any) {
      showNotice(err.message || 'Error responding to invite.', 'error');
    }
  };

  // Handle Invite Hunter
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGuildDetails?.guild?.id || !inviteUsername.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/guilds/${activeGuildDetails.guild.id}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUsername: inviteUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Failed to send invite.', 'error');
      } else {
        showNotice(`Invitation dispatched to ${data.targetUsername}!`);
        setShowInviteModal(false);
        setInviteUsername('');
      }
    } catch (err: any) {
      showNotice(err.message || 'Error sending invite.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Kick Member
  const handleKickMember = async (targetUserId: string, targetName: string) => {
    if (!activeGuildDetails?.guild?.id) return;
    const confirmKick = window.confirm(`Are you sure you want to kick ${targetName} from the guild?`);
    if (!confirmKick) return;

    try {
      const res = await fetch(`/api/guilds/${activeGuildDetails.guild.id}/kick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Failed to kick member.', 'error');
      } else {
        showNotice(`${targetName} has been removed from the guild.`);
        await fetchUserProfile();
        if (routeGuildId) await fetchGuildById(routeGuildId);
      }
    } catch (err: any) {
      showNotice(err.message || 'Error kicking member.', 'error');
    }
  };

  // Handle Role Change (Promote / Demote)
  const handleRoleChange = async (targetUserId: string, newRole: 'officer' | 'member') => {
    if (!activeGuildDetails?.guild?.id) return;
    try {
      const res = await fetch(`/api/guilds/${activeGuildDetails.guild.id}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Failed to change member role.', 'error');
      } else {
        showNotice(`Member role updated to ${newRole}.`);
        await fetchUserProfile();
        if (routeGuildId) await fetchGuildById(routeGuildId);
      }
    } catch (err: any) {
      showNotice(err.message || 'Error updating role.', 'error');
    }
  };

  // Handle Leadership Transfer
  const handleTransferLeadership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGuildDetails?.guild?.id || !targetMemberForTransfer) return;

    const confirmTransfer = window.confirm(
      'Are you sure you want to step down and transfer Guild Leadership? This action cannot be undone.'
    );
    if (!confirmTransfer) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/guilds/${activeGuildDetails.guild.id}/transfer-leadership`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newLeaderId: targetMemberForTransfer }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Failed to transfer leadership.', 'error');
      } else {
        showNotice('Guild Leadership transferred successfully!');
        setShowTransferModal(false);
        await fetchUserProfile();
        if (routeGuildId) await fetchGuildById(routeGuildId);
      }
    } catch (err: any) {
      showNotice(err.message || 'Error transferring leadership.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Claim Quest Reward
  const handleClaimQuest = async (questId: string) => {
    if (!activeGuildDetails?.guild?.id) return;
    try {
      const res = await fetch(`/api/guilds/${activeGuildDetails.guild.id}/quests/${questId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Failed to claim quest reward.', 'error');
      } else {
        showNotice(`Guild quest reward claimed! +${data.xpAwarded} XP awarded to the guild.`);
        await fetchUserProfile();
        await refreshProgress();
        if (routeGuildId) await fetchGuildById(routeGuildId);
      }
    } catch (err: any) {
      showNotice(err.message || 'Error claiming quest reward.', 'error');
    }
  };

  // The displayed guild is either the route-specified guild or the user's active guild
  const displayedGuild = activeGuildDetails?.guild || (userProfile?.inGuild ? userProfile.guild : null);
  const isUserMember = userProfile?.inGuild && userProfile.guild?.id === displayedGuild?.id;
  const userRole = isUserMember ? userProfile?.membership?.role : null;
  const isLeader = userRole === 'leader';
  const isOfficer = userRole === 'officer' || isLeader;

  // Calculate XP fill
  const guildTotalXp = displayedGuild?.totalXp || 0;
  const nextRankXp = 10000;
  const xpProgressPercent = Math.min(100, Math.round(((guildTotalXp % nextRankXp) / nextRankXp) * 100));

  return (
    <div className="guilds-page">
      {/* Toast notice */}
      {actionMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '24px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: 'var(--radius-md)',
            background: actionMessage.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(34, 197, 94, 0.95)',
            color: '#fff',
            fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Pending Invites Banner */}
      {userProfile?.pendingInvites && userProfile.pendingInvites.length > 0 && !userProfile.inGuild && (
        <div className="pending-invites-panel animate-fadeInUp">
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#c084fc' }}>
            📬 Pending Guild Invitations ({userProfile.pendingInvites.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {userProfile.pendingInvites.map((inv) => (
              <div key={inv.inviteId} className="pending-invite-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.6rem' }}>{inv.guildEmblem}</span>
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
                    onClick={() => handleRespondInvite(inv.guild_id, inv.inviteId, true)}
                  >
                    Accept
                  </button>
                  <button
                    className="guilds-secondary-btn"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    onClick={() => handleRespondInvite(inv.guild_id, inv.inviteId, false)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Guild Banner or Discovery View */}
      {displayedGuild ? (
        <section className="guilds-hero animate-fadeInUp">
          <div className="guilds-hero-content">
            <div className="guilds-hero-top">
              <div className="guilds-hero-title-wrap">
                <div className="guilds-hero-emblem">{displayedGuild.emblem || '🛡️'}</div>
                <div>
                  <h1 className="guilds-hero-title">
                    <span>{displayedGuild.name}</span>
                    <span
                      className="guild-rank-tag"
                      style={{
                        background: `${getRankColor(displayedGuild.rank)}22`,
                        color: getRankColor(displayedGuild.rank),
                        border: `1px solid ${getRankColor(displayedGuild.rank)}44`,
                      }}
                    >
                      {displayedGuild.rank}
                    </span>
                    {userRole && <span className={`guild-role-badge ${userRole}`}>{userRole}</span>}
                  </h1>
                  <div className="guilds-hero-subtitle">
                    {displayedGuild.description || 'A fellowship of elite hunters advancing together.'}
                  </div>
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
                    <button className="guilds-danger-btn" onClick={handleLeaveGuild}>
                      Leave Guild
                    </button>
                  </>
                ) : (
                  <>
                    {!userProfile?.inGuild && (
                      <button className="guilds-action-btn" onClick={() => handleJoinGuild(displayedGuild.id)}>
                        Join Guild
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
            <div className="guilds-hero-stats">
              <div className="guild-stat-item">
                <span className="guild-stat-label">Guild Level</span>
                <span className="guild-stat-value">Lv. {displayedGuild.level}</span>
              </div>
              <div className="guild-stat-item">
                <span className="guild-stat-label">Total Guild XP</span>
                <span className="guild-stat-value" style={{ color: 'var(--accent-primary)' }}>
                  {displayedGuild.totalXp.toLocaleString()} XP
                </span>
              </div>
              <div className="guild-stat-item">
                <span className="guild-stat-label">Weekly XP</span>
                <span className="guild-stat-value" style={{ color: 'var(--color-success)' }}>
                  +{displayedGuild.weeklyXp.toLocaleString()} XP
                </span>
              </div>
              <div className="guild-stat-item">
                <span className="guild-stat-label">Members</span>
                <span className="guild-stat-value">
                  {displayedGuild.memberCount} / {displayedGuild.maxMembers}
                </span>
              </div>
              {isUserMember && userProfile?.membership && (
                <div className="guild-stat-item">
                  <span className="guild-stat-label">Your Contribution</span>
                  <span className="guild-stat-value" style={{ color: '#c084fc' }}>
                    {userProfile.membership.contributedXp.toLocaleString()} XP
                  </span>
                </div>
              )}
            </div>

            {/* XP Progress Bar */}
            <div className="guild-xp-bar-container">
              <div className="guild-xp-bar-header">
                <span>Progression to Next Guild Tier</span>
                <span>{xpProgressPercent}%</span>
              </div>
              <div className="guild-xp-bar-track">
                <div className="guild-xp-bar-fill" style={{ width: `${xpProgressPercent}%` }} />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="guilds-hero animate-fadeInUp">
          <div className="guilds-hero-content">
            <div className="guilds-hero-top">
              <div>
                <h1 className="guilds-hero-title">Hunter Guilds & Alliances</h1>
                <div className="guilds-hero-subtitle">
                  Form fellowships with fellow hunters, embark on cooperative quests, and conquer competitive rankings.
                </div>
              </div>
              {isAuthenticated && (
                <button className="guilds-action-btn" onClick={() => setShowCreateModal(true)}>
                  <span>🛡️</span> Create Guild
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Nav Tabs */}
      <div className="guilds-nav-tabs">
        {displayedGuild && (
          <>
            <button
              className={`guild-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
              onClick={() => setActiveTab('members')}
            >
              👥 Member Roster ({activeGuildDetails?.members?.length || displayedGuild.memberCount})
            </button>
            <button
              className={`guild-tab-btn ${activeTab === 'quests' ? 'active' : ''}`}
              onClick={() => setActiveTab('quests')}
            >
              ⚔️ Cooperative Quests ({activeGuildDetails?.quests?.length || 0})
            </button>
            <button
              className={`guild-tab-btn ${activeTab === 'milestones' ? 'active' : ''}`}
              onClick={() => setActiveTab('milestones')}
            >
              🏆 Milestones ({activeGuildDetails?.achievements?.length || 0})
            </button>
          </>
        )}
        <button
          className={`guild-tab-btn ${activeTab === 'discovery' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('discovery');
            void fetchGuildsList(1, searchQuery, rankFilter);
          }}
        >
          🔍 Discover Guilds
        </button>
      </div>

      {/* Tab: Members */}
      {activeTab === 'members' && activeGuildDetails && (
        <div className="guild-members-wrap animate-fadeInUp">
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
                            {m.userId === userProfile?.membership?.joinedAt && (
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
                              onClick={() => handleRoleChange(m.userId, 'officer')}
                            >
                              ⬆ Officer
                            </button>
                          )}
                          {canManageMember && m.role === 'officer' && (
                            <button
                              className="icon-btn"
                              title="Demote to Member"
                              onClick={() => handleRoleChange(m.userId, 'member')}
                            >
                              ⬇ Member
                            </button>
                          )}
                          {canKickMember && (
                            <button
                              className="icon-btn danger"
                              title="Kick from guild"
                              onClick={() => handleKickMember(m.userId, m.name)}
                            >
                              ✕ Kick
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
      )}

      {/* Tab: Cooperative Guild Quests */}
      {activeTab === 'quests' && activeGuildDetails && (
        <div className="guild-quests-grid animate-fadeInUp">
          {activeGuildDetails.quests.map((q) => {
            const isCompleted = q.status === 'completed' || q.currentValue >= q.targetValue;
            const isClaimed = q.status === 'claimed';
            return (
              <div
                key={q.id}
                className={`guild-quest-card ${isCompleted ? 'completed' : ''} ${isClaimed ? 'claimed' : ''}`}
              >
                <div className="guild-quest-header">
                  <div>
                    <div className="guild-quest-title">{q.title}</div>
                    <div className="guild-quest-desc">{q.description}</div>
                  </div>
                  <span
                    className="guild-rank-tag"
                    style={{
                      background: isClaimed
                        ? 'rgba(255,255,255,0.06)'
                        : isCompleted
                        ? 'rgba(34, 197, 94, 0.2)'
                        : 'rgba(59, 130, 246, 0.15)',
                      color: isClaimed ? 'var(--text-muted)' : isCompleted ? '#22c55e' : '#60a5fa',
                    }}
                  >
                    {isClaimed ? 'Claimed' : isCompleted ? 'Ready to Claim' : 'In Progress'}
                  </span>
                </div>

                <div className="guild-quest-progress-wrap">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Guild Objective</span>
                    <span style={{ fontWeight: 600 }}>
                      {q.currentValue.toLocaleString()} / {q.targetValue.toLocaleString()} ({q.progressPercent}%)
                    </span>
                  </div>
                  <div className="guild-quest-progress-track">
                    <div className="guild-quest-progress-fill" style={{ width: `${q.progressPercent}%` }} />
                  </div>
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

                  {isCompleted && !isClaimed && isUserMember && (
                    <button className="guilds-action-btn" onClick={() => handleClaimQuest(q.id)}>
                      Claim Reward
                    </button>
                  )}
                  {isClaimed && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>✓ Claimed</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Milestones */}
      {activeTab === 'milestones' && activeGuildDetails && (
        <div className="guild-quests-grid animate-fadeInUp">
          {activeGuildDetails.achievements.map((a) => (
            <div key={a.id} className="guild-quest-card completed">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '2rem' }}>{a.icon}</span>
                <div>
                  <div className="guild-quest-title">{a.name}</div>
                  <div className="guild-quest-desc">{a.description}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Unlocked: {new Date(a.unlockedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {activeGuildDetails.achievements.length === 0 && (
            <div className="guild-empty-state" style={{ gridColumn: '1 / -1' }}>
              <div className="guild-empty-icon">🏆</div>
              <div className="guild-empty-title">No Milestones Unlocked Yet</div>
              <div className="guild-empty-desc">
                Complete quests, clear programming dungeons, and recruit hunters to unlock prestigious guild milestones.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Discover Guilds */}
      {activeTab === 'discovery' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Toolbar */}
          <div className="guilds-toolbar">
            <div className="guilds-search-box">
              <span>🔍</span>
              <input
                type="text"
                className="guilds-search-input"
                placeholder="Search guilds by name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  void fetchGuildsList(1, e.target.value, rankFilter);
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                className="guilds-filter-select"
                value={rankFilter}
                onChange={(e) => {
                  setRankFilter(e.target.value);
                  void fetchGuildsList(1, searchQuery, e.target.value);
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

              {isAuthenticated && !userProfile?.inGuild && (
                <button className="guilds-action-btn" onClick={() => setShowCreateModal(true)}>
                  <span>+</span> Create Guild
                </button>
              )}
            </div>
          </div>

          {/* Guilds Grid */}
          <div className="guilds-grid animate-fadeInUp">
            {discoveryList.map((g) => (
              <div key={g.id} className="guild-card">
                <div className="guild-card-top">
                  <div className="guild-card-emblem">{g.emblem || '🛡️'}</div>
                  <div className="guild-card-info">
                    <div className="guild-card-name">{g.name}</div>
                    <div className="guild-card-meta">
                      <span
                        className="guild-rank-tag"
                        style={{
                          background: `${getRankColor(g.rank)}18`,
                          color: getRankColor(g.rank),
                        }}
                      >
                        {g.rank}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Lv. {g.level}</span>
                    </div>
                  </div>
                </div>

                <div className="guild-card-desc">{g.description || 'A gathering of powerful hunters.'}</div>

                <div className="guild-card-stats">
                  <span>
                    👥 {g.memberCount}/{g.maxMembers} Members
                  </span>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                    ⚡ {g.totalXp.toLocaleString()} XP
                  </span>
                </div>

                <div className="guild-card-actions">
                  <button
                    className="guilds-secondary-btn"
                    style={{ flex: 1 }}
                    onClick={() => {
                      navigate(`/guilds/${g.id}`);
                      void fetchGuildById(g.id);
                    }}
                  >
                    View Guild
                  </button>
                  {!userProfile?.inGuild && (
                    <button
                      className="guilds-action-btn"
                      style={{ flex: 1 }}
                      disabled={g.memberCount >= g.maxMembers}
                      onClick={() => handleJoinGuild(g.id)}
                    >
                      {g.memberCount >= g.maxMembers ? 'Full' : 'Join'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {discoveryList.length === 0 && (
            <div className="guild-empty-state">
              <div className="guild-empty-icon">🛡️</div>
              <div className="guild-empty-title">No Guilds Found</div>
              <div className="guild-empty-desc">
                {searchQuery ? `No guilds matching "${searchQuery}".` : 'Be the first hunter to establish a guild!'}
              </div>
              {isAuthenticated && !userProfile?.inGuild && (
                <button className="guilds-action-btn" style={{ marginTop: '8px' }} onClick={() => setShowCreateModal(true)}>
                  Create a Guild Now
                </button>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              <button
                className="guilds-secondary-btn"
                disabled={currentPage <= 1}
                onClick={() => void fetchGuildsList(currentPage - 1, searchQuery, rankFilter)}
              >
                Previous
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--text-secondary)' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="guilds-secondary-btn"
                disabled={currentPage >= totalPages}
                onClick={() => void fetchGuildsList(currentPage + 1, searchQuery, rankFilter)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Guild */}
      {showCreateModal && (
        <div className="guild-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="guild-modal" onClick={(e) => e.stopPropagation()}>
            <div className="guild-modal-header">
              <h2 className="guild-modal-title">Establish Hunter Guild</h2>
              <button className="icon-btn" onClick={() => setShowCreateModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGuild} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="guild-form-group">
                <label className="guild-form-label">Guild Emblem</label>
                <div className="emblem-picker">
                  {EMBLEM_OPTIONS.map((emb) => (
                    <button
                      key={emb}
                      type="button"
                      className={`emblem-option ${newGuildEmblem === emb ? 'selected' : ''}`}
                      onClick={() => setNewGuildEmblem(emb)}
                    >
                      {emb}
                    </button>
                  ))}
                </div>
              </div>

              <div className="guild-form-group">
                <label className="guild-form-label">Guild Name (3 - 30 characters)</label>
                <input
                  type="text"
                  className="guild-form-input"
                  placeholder="e.g. Shadow Monarchs"
                  maxLength={30}
                  required
                  value={newGuildName}
                  onChange={(e) => setNewGuildName(e.target.value)}
                />
              </div>

              <div className="guild-form-group">
                <label className="guild-form-label">Description & Manifesto</label>
                <textarea
                  className="guild-form-textarea"
                  rows={3}
                  placeholder="Describe your guild's mission, goals, and culture..."
                  maxLength={250}
                  value={newGuildDesc}
                  onChange={(e) => setNewGuildDesc(e.target.value)}
                />
              </div>

              <div className="guild-modal-actions">
                <button type="button" className="guilds-secondary-btn" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="guilds-action-btn" disabled={isSubmitting}>
                  {isSubmitting ? 'Establishing...' : 'Create Guild'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Invite Hunter */}
      {showInviteModal && (
        <div className="guild-modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="guild-modal" onClick={(e) => e.stopPropagation()}>
            <div className="guild-modal-header">
              <h2 className="guild-modal-title">Invite Hunter</h2>
              <button className="icon-btn" onClick={() => setShowInviteModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="guild-form-group">
                <label className="guild-form-label">Hunter Username</label>
                <input
                  type="text"
                  className="guild-form-input"
                  placeholder="Enter exact hunter username"
                  required
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                />
              </div>

              <div className="guild-modal-actions">
                <button type="button" className="guilds-secondary-btn" onClick={() => setShowInviteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="guilds-action-btn" disabled={isSubmitting}>
                  {isSubmitting ? 'Dispatching...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Leadership */}
      {showTransferModal && activeGuildDetails && (
        <div className="guild-modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="guild-modal" onClick={(e) => e.stopPropagation()}>
            <div className="guild-modal-header">
              <h2 className="guild-modal-title">Transfer Guild Leadership</h2>
              <button className="icon-btn" onClick={() => setShowTransferModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleTransferLeadership} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="guild-form-group">
                <label className="guild-form-label">Select Successor</label>
                <select
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
                  disabled={isSubmitting || !targetMemberForTransfer}
                >
                  {isSubmitting ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
