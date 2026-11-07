import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useProgression } from '../context/ProgressionContext';
import { useAuth } from '../context/AuthContext';
import { leaderboard as defaultLeaderboard } from '../data/mockData';
import type { LeaderboardCategory } from '../types';
import './Leaderboard.css';

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

function getGradient(rank: number): string {
  if (rank === 1) return 'linear-gradient(135deg, #fbbf24, #f59e0b)';
  if (rank === 2) return 'linear-gradient(135deg, #9ca3af, #6b7280)';
  if (rank === 3) return 'linear-gradient(135deg, #d97706, #b45309)';
  return 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))';
}

const medals = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const { player } = useProgression();
  const { isAuthenticated } = useAuth();

  const [activeTab, setActiveTab] = useState<LeaderboardCategory>('players');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [rankFilter, setRankFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [serverData, setServerData] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fetch competitive leaderboard from backend
  const fetchLeaderboard = useCallback(
    async (type: LeaderboardCategory, page = 1, search = '', rank = 'all') => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('type', type);
        params.set('page', String(page));
        params.set('limit', '25');
        if (search.trim()) params.set('search', search.trim());
        if (rank !== 'all') params.set('rank', rank);

        const res = await fetch(`/api/leaderboard?${params.toString()}`);
        if (!res.ok) return;

        const data = await res.json();
        if (Array.isArray(data)) {
          setServerData(data);
          setTotalPages(1);
          setCurrentPage(1);
        } else if (data && Array.isArray(data.entries)) {
          setServerData(data.entries);
          setTotalPages(data.totalPages || 1);
          setCurrentPage(data.page || 1);
        }
      } catch (err) {
        console.warn('Failed to load competitive leaderboard:', err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchLeaderboard(activeTab, currentPage, searchQuery, rankFilter);
  }, [fetchLeaderboard, activeTab, currentPage, searchQuery, rankFilter]);

  // Fallback to mock data only for global players tab when offline
  const entries = useMemo(() => {
    if (serverData !== null) {
      return serverData.map((entry) => {
        const isYou =
          isAuthenticated &&
          activeTab !== 'guilds' &&
          (entry.playerId === player.id || entry.name === player.name);
        return {
          ...entry,
          isCurrentPlayer: isYou,
          ...(isYou && activeTab === 'players'
            ? {
                level: player.level,
                xp: player.xp,
                playerRank: player.rank,
                questsCompleted: player.questsCompleted,
                name: player.name,
              }
            : {}),
        };
      });
    }

    if (activeTab === 'players') {
      return defaultLeaderboard.map((entry) => {
        const isYou =
          isAuthenticated &&
          (entry.playerId === player.id || entry.name === player.name);
        return {
          ...entry,
          isCurrentPlayer: isYou,
          ...(isYou
            ? {
                level: player.level,
                xp: player.xp,
                playerRank: player.rank,
                questsCompleted: player.questsCompleted,
                name: player.name,
              }
            : {}),
        };
      });
    }

    return [];
  }, [serverData, defaultLeaderboard, activeTab, player, isAuthenticated]);

  const top3 = entries.slice(0, 3);

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <h1 className="leaderboard-title">Competitive Leaderboard</h1>
        <p className="leaderboard-desc">
          Authoritative rankings of elite hunters and guilds across the realm. Rise through code and glory.
        </p>
      </div>

      {/* Tabs */}
      <div className="lb-tabs">
        <button
          className={`lb-tab-btn ${activeTab === 'players' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('players');
            setCurrentPage(1);
          }}
        >
          ⚔️ Global Hunters
        </button>
        <button
          className={`lb-tab-btn ${activeTab === 'weekly' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('weekly');
            setCurrentPage(1);
          }}
        >
          🔥 Weekly Rankings
        </button>
        <button
          className={`lb-tab-btn ${activeTab === 'guilds' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('guilds');
            setCurrentPage(1);
          }}
        >
          🛡️ Guild Standings
        </button>
        <button
          className={`lb-tab-btn ${activeTab === 'contributions' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('contributions');
            setCurrentPage(1);
          }}
        >
          🌟 Top Contributors
        </button>
      </div>

      {/* Toolbar: Search & Rank Filter */}
      <div className="lb-toolbar">
        <div className="lb-search-box">
          <span>🔍</span>
          <input
            type="text"
            className="lb-search-input"
            placeholder={activeTab === 'guilds' ? 'Search guilds...' : 'Search hunters...'}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <select
          className="lb-filter-select"
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
      </div>

      {/* Podium (Top 3) */}
      {top3.length > 0 && (
        <div className="podium stagger-children">
          {top3.map((entry, i) => {
            const displayName = entry.name || entry.guildName || 'Hunter';
            const displayRank = entry.playerRank || entry.guildRank || 'E-Rank';
            const isGuild = activeTab === 'guilds';

            return (
              <div
                key={entry.playerId || entry.id || `${displayName}-${i}`}
                className={`podium-card ${i === 0 ? 'first' : i === 1 ? 'second' : 'third'}`}
              >
                <div className="podium-medal">{medals[i]}</div>
                <div
                  className="podium-avatar"
                  style={{ background: isGuild ? 'rgba(168, 85, 247, 0.2)' : getGradient(entry.rank) }}
                >
                  {isGuild ? entry.emblem || '🛡️' : displayName.charAt(0)}
                </div>
                <div className="podium-name">{displayName}</div>
                <span
                  className="podium-rank-badge"
                  style={{
                    background: `${getRankColor(displayRank)}18`,
                    color: getRankColor(displayRank),
                    border: `1px solid ${getRankColor(displayRank)}40`,
                  }}
                >
                  {displayRank}
                </span>
                <div className="podium-level">Level {entry.level}</div>
                <div className="podium-xp">
                  {activeTab === 'weekly'
                    ? `+${(entry.weeklyXp || 0).toLocaleString()} XP`
                    : activeTab === 'contributions'
                    ? `${(entry.contributedXp || 0).toLocaleString()} XP`
                    : `${(entry.totalXp || entry.xp || 0).toLocaleString()} XP`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="leaderboard-table-wrap animate-fadeInUp">
        <table className="leaderboard-table">
          <thead>
            {activeTab === 'guilds' ? (
              <tr>
                <th>#</th>
                <th>Guild</th>
                <th>Rank</th>
                <th>Level</th>
                <th>Total XP</th>
                <th>Weekly XP</th>
                <th>Members</th>
                <th>Leader</th>
              </tr>
            ) : activeTab === 'weekly' ? (
              <tr>
                <th>#</th>
                <th>Hunter</th>
                <th>Rank</th>
                <th>Level</th>
                <th>Weekly XP</th>
                <th>Quests Completed</th>
                <th>Guild</th>
              </tr>
            ) : activeTab === 'contributions' ? (
              <tr>
                <th>#</th>
                <th>Hunter</th>
                <th>Guild</th>
                <th>Role</th>
                <th>Total Contributed</th>
                <th>Weekly Contributed</th>
              </tr>
            ) : (
              <tr>
                <th>#</th>
                <th>Hunter</th>
                <th>Rank</th>
                <th>Level</th>
                <th>Total XP</th>
                <th>Quests Completed</th>
                <th>Guild</th>
              </tr>
            )}
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  No ranking records found for this category.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const isGuild = activeTab === 'guilds';
                const rowKey = entry.playerId || entry.id || `${entry.name}-${entry.rank}`;

                if (isGuild) {
                  return (
                    <tr key={rowKey}>
                      <td className="lb-rank-cell">{entry.rank}</td>
                      <td>
                        <Link
                          to={`/guilds/${entry.id}`}
                          className="lb-player-cell"
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <div className="lb-player-avatar" style={{ background: 'rgba(168, 85, 247, 0.2)' }}>
                            {entry.emblem || '🛡️'}
                          </div>
                          <div>
                            <div className="lb-player-name">{entry.name}</div>
                            <div className="lb-player-rank">{entry.description || 'Hunter Guild'}</div>
                          </div>
                        </Link>
                      </td>
                      <td>
                        <span
                          className="podium-rank-badge"
                          style={{
                            background: `${getRankColor(entry.guildRank)}18`,
                            color: getRankColor(entry.guildRank),
                            border: `1px solid ${getRankColor(entry.guildRank)}40`,
                          }}
                        >
                          {entry.guildRank}
                        </span>
                      </td>
                      <td className="lb-level">Lv. {entry.level}</td>
                      <td className="lb-xp">{entry.totalXp.toLocaleString()} XP</td>
                      <td style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                        +{entry.weeklyXp.toLocaleString()} XP
                      </td>
                      <td className="lb-quests">
                        {entry.memberCount}/{entry.maxMembers}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{entry.leaderName}</td>
                    </tr>
                  );
                }

                if (activeTab === 'contributions') {
                  return (
                    <tr key={rowKey} className={entry.isCurrentPlayer ? 'current-player' : ''}>
                      <td className="lb-rank-cell">{entry.rank}</td>
                      <td>
                        <div className="lb-player-cell">
                          <div className="lb-player-avatar" style={{ background: getGradient(entry.rank) }}>
                            {entry.name.charAt(0)}
                          </div>
                          <div>
                            <div className="lb-player-name">
                              {entry.name}
                              {entry.isCurrentPlayer && <span className="lb-you-badge">YOU</span>}
                            </div>
                            <div className="lb-player-rank">{entry.title || entry.playerRank}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {entry.guildName ? (
                          <Link
                            to={`/guilds/${entry.guildId}`}
                            style={{ textDecoration: 'none', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <span>{entry.guildEmblem || '🛡️'}</span>
                            <span>{entry.guildName}</span>
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <span className={`guild-role-badge ${entry.role}`}>{entry.role}</span>
                      </td>
                      <td className="lb-xp">{entry.contributedXp.toLocaleString()} XP</td>
                      <td style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                        +{entry.weeklyContributedXp.toLocaleString()} XP
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={rowKey} className={entry.isCurrentPlayer ? 'current-player' : ''}>
                    <td className="lb-rank-cell">{entry.rank}</td>
                    <td>
                      <div className="lb-player-cell">
                        <div className="lb-player-avatar" style={{ background: getGradient(entry.rank) }}>
                          {entry.name.charAt(0)}
                        </div>
                        <div>
                          <div className="lb-player-name">
                            {entry.name}
                            {entry.isCurrentPlayer && <span className="lb-you-badge">YOU</span>}
                          </div>
                          <div className="lb-player-rank">{entry.title || entry.playerRank}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className="podium-rank-badge"
                        style={{
                          background: `${getRankColor(entry.playerRank)}18`,
                          color: getRankColor(entry.playerRank),
                          border: `1px solid ${getRankColor(entry.playerRank)}40`,
                        }}
                      >
                        {entry.playerRank}
                      </span>
                    </td>
                    <td className="lb-level">Lv. {entry.level}</td>
                    <td className="lb-xp">
                      {activeTab === 'weekly'
                        ? `+${(entry.weeklyXp || 0).toLocaleString()} XP`
                        : `${(entry.xp || 0).toLocaleString()} XP`}
                    </td>
                    <td className="lb-quests">{entry.questsCompleted}</td>
                    <td>
                      {entry.guildName ? (
                        <span style={{ color: '#c084fc', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>{entry.guildEmblem || '🛡️'}</span>
                          <span>[{entry.guildName}]</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="lb-pagination">
          <button
            className="lb-page-btn"
            disabled={currentPage <= 1 || isLoading}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="lb-page-btn"
            disabled={currentPage >= totalPages || isLoading}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
