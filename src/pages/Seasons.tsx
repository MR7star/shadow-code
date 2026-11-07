import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProgression } from '../context/ProgressionContext';
import './Seasons.css';

interface SeasonReward {
  xp: number;
  title?: string;
  minRating?: number;
}

interface SeasonSummary {
  id: string;
  seasonNumber: number;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'active' | 'completed';
  participantCount: number;
  rewards: Record<string, SeasonReward>;
}

interface SeasonStanding {
  seasonalXp: number;
  arenaRating: number;
  peakRating: number;
  division: string;
  finalPlacement: number | null;
  rewardsClaimed: number;
  claimedAt: string | null;
}

interface SeasonRanker {
  rank: number;
  userId: string;
  name: string;
  title: string;
  seasonalXp: number;
  arenaRating: number;
  peakRating: number;
  division: string;
  placement: number | null;
}

interface SeasonDetails extends SeasonSummary {
  topRankers: SeasonRanker[];
  userStanding: SeasonStanding | null;
  canClaimReward: boolean;
  claimableReward: { tier: string; xp: number; title?: string } | null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Seasons() {
  const { token, isAuthenticated, openAuthModal } = useAuth();
  const { refreshProgress } = useProgression();
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [details, setDetails] = useState<SeasonDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId]
  );

  const fetchSeasons = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/seasons');
      if (!response.ok) throw new Error('Unable to load seasons.');
      const data: { seasons: SeasonSummary[] } = await response.json();
      setSeasons(data.seasons);
      setSelectedSeasonId((current) => {
        if (current && data.seasons.some((season) => season.id === current)) return current;
        return data.seasons.find((season) => season.status === 'active')?.id
          ?? data.seasons[0]?.id
          ?? null;
      });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load seasons.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDetails = useCallback(async (seasonId: string, activeToken: string | null) => {
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (activeToken) headers.Authorization = `Bearer ${activeToken}`;
      const response = await fetch(`/api/seasons/${encodeURIComponent(seasonId)}`, { headers });
      if (!response.ok) throw new Error('Unable to load this season.');
      const data: SeasonDetails = await response.json();
      setDetails(data);
    } catch (fetchError) {
      setDetails(null);
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load this season.');
    }
  }, []);

  useEffect(() => {
    void fetchSeasons();
  }, [fetchSeasons]);

  useEffect(() => {
    if (!selectedSeasonId) {
      setDetails(null);
      return;
    }
    void fetchDetails(selectedSeasonId, token);
  }, [fetchDetails, selectedSeasonId, token]);

  const claimReward = async () => {
    if (!selectedSeasonId || !token) {
      openAuthModal();
      return;
    }
    setIsClaiming(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/seasons/${encodeURIComponent(selectedSeasonId)}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to claim this season reward.');
      setNotice(`Claimed ${data.xpAwarded} XP${data.titleAwarded ? ` and the title “${data.titleAwarded}”` : ''}.`);
      await Promise.all([fetchDetails(selectedSeasonId, token), refreshProgress()]);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Unable to claim this season reward.');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="seasons-page">
      <header className="seasons-hero">
        <div>
          <span className="seasons-kicker">Seasonal events</span>
          <h1>Season Archives</h1>
          <p>Earn seasonal XP through completed coding challenges, climb the standings, and collect end-of-season rewards.</p>
        </div>
        {selectedSeason && (
          <div className={`season-status-badge ${selectedSeason.status}`}>
            <span className="season-status-dot" />
            {selectedSeason.status}
          </div>
        )}
      </header>

      {error && <div className="seasons-alert error" role="alert">{error}</div>}
      {notice && <div className="seasons-alert success" role="status">{notice}</div>}

      <div className="seasons-layout">
        <aside className="seasons-list-panel">
          <div className="seasons-section-heading">
            <h2>All seasons</h2>
            <span>{seasons.length}</span>
          </div>
          {isLoading ? (
            <p className="seasons-empty">Loading season archive…</p>
          ) : seasons.length === 0 ? (
            <p className="seasons-empty">No seasons have been scheduled yet.</p>
          ) : (
            <div className="seasons-list">
              {seasons.map((season) => (
                <button
                  type="button"
                  key={season.id}
                  className={`season-list-item ${selectedSeasonId === season.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSeasonId(season.id)}
                >
                  <span className={`season-list-icon ${season.status}`}>
                    {season.status === 'completed' ? '✓' : season.status === 'upcoming' ? '◷' : '✦'}
                  </span>
                  <span className="season-list-copy">
                    <strong>{season.name}</strong>
                    <small>Season {season.seasonNumber} · {season.participantCount} hunters</small>
                  </span>
                  <span className={`season-list-state ${season.status}`}>{season.status}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {selectedSeason && details ? (
          <section className="season-detail-panel">
            <div className="season-detail-heading">
              <div>
                <span className="seasons-kicker">Season {details.seasonNumber}</span>
                <h2>{details.name}</h2>
                <p>{details.description}</p>
              </div>
              <div className="season-date-range">
                <span>EVENT PERIOD</span>
                <strong>{formatDate(details.startDate)} — {formatDate(details.endDate)}</strong>
              </div>
            </div>

            <div className="season-stat-grid">
              <article className="season-stat-card">
                <span>PARTICIPANTS</span>
                <strong>{details.participantCount.toLocaleString()}</strong>
              </article>
              <article className="season-stat-card">
                <span>YOUR SEASONAL XP</span>
                <strong>{details.userStanding?.seasonalXp.toLocaleString() ?? '—'}</strong>
              </article>
              <article className="season-stat-card">
                <span>YOUR PLACEMENT</span>
                <strong>{details.userStanding?.finalPlacement ? `#${details.userStanding.finalPlacement}` : '—'}</strong>
              </article>
              <article className="season-stat-card">
                <span>YOUR DIVISION</span>
                <strong>{details.userStanding?.division ?? '—'}</strong>
              </article>
            </div>

            {details.canClaimReward && details.claimableReward && (
              <div className="season-reward-callout">
                <div>
                  <span className="seasons-kicker">Season reward unlocked</span>
                  <strong>{details.claimableReward.tier} · {details.claimableReward.xp} XP</strong>
                  {details.claimableReward.title && <small>Title: {details.claimableReward.title}</small>}
                </div>
                <button type="button" className="season-claim-button" onClick={() => void claimReward()} disabled={isClaiming}>
                  {isClaiming ? 'Claiming…' : 'Claim reward'}
                </button>
              </div>
            )}
            {details.userStanding?.rewardsClaimed === 1 && (
              <div className="season-reward-claimed" role="status">Season reward claimed {details.userStanding.claimedAt ? `on ${formatDate(details.userStanding.claimedAt)}` : ''}.</div>
            )}

            <section className="season-leaderboard">
              <div className="seasons-section-heading">
                <div>
                  <span className="seasons-kicker">Season standings</span>
                  <h3>Top hunters</h3>
                </div>
                <span>Ranked by seasonal XP</span>
              </div>
              {details.topRankers.length === 0 ? (
                <p className="seasons-empty">The standings will appear as hunters earn seasonal XP.</p>
              ) : (
                <div className="season-table-wrap">
                  <table className="season-table">
                    <thead>
                      <tr><th>Rank</th><th>Hunter</th><th>Division</th><th>Rating</th><th>Season XP</th></tr>
                    </thead>
                    <tbody>
                      {details.topRankers.map((hunter) => (
                        <tr key={hunter.userId}>
                          <td><span className={`season-rank-number ${hunter.rank <= 3 ? `top-${hunter.rank}` : ''}`}>#{hunter.rank}</span></td>
                          <td>
                            <strong>{hunter.name}</strong>
                            {hunter.title && <small>{hunter.title}</small>}
                          </td>
                          <td><span className="season-division">{hunter.division}</span></td>
                          <td>{hunter.arenaRating.toLocaleString()}</td>
                          <td className="season-xp">{hunter.seasonalXp.toLocaleString()} XP</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="season-rewards">
              <div className="seasons-section-heading">
                <div>
                  <span className="seasons-kicker">End of season</span>
                  <h3>Division rewards</h3>
                </div>
              </div>
              <div className="season-reward-grid">
                {Object.entries(details.rewards).map(([division, reward]) => (
                  <article className="season-reward-card" key={division}>
                    <span>{division}</span>
                    <strong>{reward.xp.toLocaleString()} XP</strong>
                    {reward.title && <small>{reward.title}</small>}
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : !isLoading && selectedSeason ? (
          <section className="season-detail-panel seasons-empty-panel">
            <p>{error ? 'Season information could not be displayed.' : 'Loading season details…'}</p>
          </section>
        ) : (
          <section className="season-detail-panel seasons-empty-panel">
            <span className="seasons-empty-icon">✦</span>
            <h2>Choose your next season</h2>
            <p>Seasonal events and their historical standings will appear here.</p>
            {!isAuthenticated && <button type="button" className="season-claim-button" onClick={openAuthModal}>Sign in to track your progress</button>}
          </section>
        )}
      </div>
    </div>
  );
}
