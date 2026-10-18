import { useEffect, useMemo, useState } from 'react';
import { useProgression } from '../context/ProgressionContext';
import { useAuth } from '../context/AuthContext';
import { leaderboard as defaultLeaderboard } from '../data/mockData';
import type { LeaderboardEntry, Rank } from '../types';
import './Leaderboard.css';

function getRankColor(rank: Rank): string {
  const map: Record<string, string> = {
    'E-Rank': 'var(--rank-e)',
    'D-Rank': 'var(--rank-d)',
    'C-Rank': 'var(--rank-c)',
    'B-Rank': 'var(--rank-b)',
    'A-Rank': 'var(--rank-a)',
    'S-Rank': 'var(--rank-s)',
    'National Level': 'var(--rank-national)',
    'Monarch': 'var(--rank-monarch)',
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
  const [serverEntries, setServerEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/leaderboard');
        if (!res.ok) return;
        const rows = (await res.json()) as LeaderboardEntry[];
        if (!cancelled && Array.isArray(rows)) {
          setServerEntries(rows);
        }
      } catch {
        // Keep the existing preview board if the backend is offline.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [player.xp, player.level, player.questsCompleted]);

  const entries = useMemo(() => {
    const source = serverEntries && serverEntries.length > 0 ? serverEntries : defaultLeaderboard;
    return source.map((entry) => {
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
  }, [serverEntries, player, isAuthenticated]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <h1 className="leaderboard-title">Leaderboard</h1>
        <p className="leaderboard-desc">
          The strongest hunters ranked by experience. Climb the ranks and challenge the top.
        </p>
      </div>

      {/* Podium */}
      <div className="podium stagger-children">
        {top3.map((entry, i) => (
          <div
            key={entry.playerId}
            className={`podium-card ${i === 0 ? 'first' : i === 1 ? 'second' : 'third'}`}
          >
            <div className="podium-medal">{medals[i]}</div>
            <div
              className="podium-avatar"
              style={{ background: getGradient(entry.rank) }}
            >
              {entry.name.charAt(0)}
            </div>
            <div className="podium-name">{entry.name}</div>
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
            <div className="podium-level">Level {entry.level}</div>
            <div className="podium-xp">{entry.xp.toLocaleString()} XP</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="leaderboard-table-wrap animate-fadeInUp">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Level</th>
              <th>XP</th>
              <th>Quests</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((entry) => (
              <tr
                key={entry.playerId}
                className={entry.isCurrentPlayer ? 'current-player' : ''}
              >
                <td className="lb-rank-cell">
                  {entry.rank}
                </td>
                <td>
                  <div className="lb-player-cell">
                    <div
                      className="lb-player-avatar"
                      style={{ background: getGradient(entry.rank) }}
                    >
                      {entry.name.charAt(0)}
                    </div>
                    <div>
                      <div className="lb-player-name">
                        {entry.name}
                        {entry.isCurrentPlayer && <span className="lb-you-badge">YOU</span>}
                      </div>
                      <div className="lb-player-rank">{entry.playerRank}</div>
                    </div>
                  </div>
                </td>
                <td className="lb-level">{entry.level}</td>
                <td className="lb-xp">{entry.xp.toLocaleString()}</td>
                <td className="lb-quests">{entry.questsCompleted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
