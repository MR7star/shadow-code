/**
 * Arena API Service — isolates all ranked arena backend calls from UI components.
 */

// ─── Types ────────────────────────────────────────────────────────

export interface ArenaProfile {
  userId: string;
  rating: number;
  peakRating: number;
  division: string;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  matchesPlayed: number;
  winRate: number;
  updatedAt: string;
}

export interface MatchHistoryEntry {
  id: string;
  challengeId: string;
  matchType: string;
  status: string;
  result: 'win' | 'loss' | 'draw';
  opponentName: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  myScore: number | null;
  opponentScore: number | null;
  startTime: string;
  endTime: string | null;
}

export interface MatchHistoryResponse {
  matches: MatchHistoryEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export interface RatingHistoryEntry {
  matchId: string | null;
  ratingBefore: number;
  ratingAfter: number;
  change: number;
  reason: string;
  createdAt: string;
}

export interface RatingHistoryResponse {
  entries: RatingHistoryEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  title: string;
  rating: number;
  peakRating: number;
  division: string;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  matchesPlayed: number;
  winRate: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QueueStatusResponse {
  inQueue: boolean;
  queuedAt: string | null;
  queueExpiresAt: string | null;
  hasActiveMatch: boolean;
  matchId: string | null;
}

export interface QueueJoinResponse {
  status: 'queued' | 'matched' | 'error';
  matchId?: string;
  queuedAt?: string;
  opponentName?: string;
  ratingDifference?: number;
  message?: string;
  error?: string;
}

export interface ArenaMatchPlayer {
  id: string;
  name: string;
  ratingBefore: number;
  ratingAfter: number | null;
  score: number | null;
  passedCount: number | null;
  totalTests: number | null;
  timeMs: number | null;
  status: string | null;
  isYou: boolean;
  attemptsCount: number;
}

export interface ArenaMatchChallenge {
  id: string;
  title: string;
  functionName: string;
  lesson: string;
  sampleTests: SampleTestCase[];
}

export interface SampleTestCase {
  input?: unknown;
  expected?: unknown;
  description?: string;
}

export interface ArenaMatchDetails {
  id: string;
  seasonId: string;
  matchType: string;
  status: 'ready' | 'in_progress' | 'completed' | 'expired' | 'cancelled' | 'abandoned';
  challenge: ArenaMatchChallenge;
  player1: ArenaMatchPlayer;
  player2: ArenaMatchPlayer;
  winnerId: string | null;
  durationLimitSec: number;
  remainingSeconds: number;
  isParticipant: boolean;
  startTime: string;
  deadlineAt: string;
  endTime: string | null;
  result: 'win' | 'loss' | 'draw' | null;
  rewards: { hunterXp: number; seasonXp: number } | null;
  tournamentContext?: {
    tournamentId: string;
    tournamentTitle: string;
    tournamentMatchId: string;
    round: number;
    totalRounds: number;
    matchIndex: number;
  } | null;
}

export interface SpectatorMatchDetails {
  id: string;
  seasonId: string;
  matchType: string;
  status: 'ready' | 'in_progress' | 'completed' | 'expired' | 'cancelled' | 'abandoned';
  challenge: {
    id: string;
    title: string;
    functionName: string;
    lesson?: string;
    sampleTests: SampleTestCase[];
  };
  player1: {
    id: string;
    name: string;
    ratingBefore: number;
    ratingAfter: number | null;
    score: number;
    passedCount: number;
    totalTests: number;
    timeMs: number;
    status: string;
    attemptsCount: number;
  };
  player2: {
    id: string;
    name: string;
    ratingBefore: number;
    ratingAfter: number | null;
    score: number;
    passedCount: number;
    totalTests: number;
    timeMs: number;
    status: string;
    attemptsCount: number;
  };
  winnerId: string | null;
  winnerName: string | null;
  durationLimitSec: number;
  remainingSeconds: number;
  startTime: string;
  deadlineAt: string;
  endTime: string | null;
  tournamentContext?: {
    tournamentId: string;
    tournamentTitle: string;
    tournamentMatchId: string;
    round: number;
    totalRounds: number;
    matchIndex: number;
  } | null;
}

export interface SampleTestCaseResult {
  index: number;
  description?: string;
  expected?: any;
  actual?: any;
  passed: boolean;
  error?: string;
  isHidden?: boolean;
  executionTimeMs?: number;
}

export interface ArenaRunResult {
  success: boolean;
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  results: SampleTestCaseResult[];
  stdout?: string;
  error?: string;
  durationMs?: number;
}

export interface ArenaSubmitResult {
  success: boolean;
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  score: number;
  elapsedMs: number;
  matchConcluded: boolean;
  match: ArenaMatchDetails;
  error?: string;
}

export interface ArenaForfeitResult {
  success: boolean;
  winnerId: string;
  match: ArenaMatchDetails;
  error?: string;
}

// ─── Division Metadata ────────────────────────────────────────────

export interface DivisionInfo {
  name: string;
  minRating: number;
  maxRating: number;
  icon: string;
  color: string;
}

export const DIVISIONS: DivisionInfo[] = [
  { name: 'Bronze', minRating: 0, maxRating: 1199, icon: '🥉', color: '#cd7f32' },
  { name: 'Silver', minRating: 1200, maxRating: 1399, icon: '🥈', color: '#c0c0c0' },
  { name: 'Gold', minRating: 1400, maxRating: 1599, icon: '🥇', color: '#fbbf24' },
  { name: 'Platinum', minRating: 1600, maxRating: 1799, icon: '💎', color: '#22d3ee' },
  { name: 'Diamond', minRating: 1800, maxRating: 1999, icon: '💠', color: '#818cf8' },
  { name: 'Monarch', minRating: 2000, maxRating: 99999, icon: '👑', color: '#c084fc' },
];

export function getDivision(rating: number): string {
  const parsed = Number(rating);
  const r = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1000;
  for (let i = DIVISIONS.length - 1; i >= 0; i--) {
    if (r >= DIVISIONS[i].minRating) {
      return DIVISIONS[i].name;
    }
  }
  return 'Bronze';
}

export function getDivisionInfo(divisionName: string): DivisionInfo {
  return DIVISIONS.find((d) => d.name === divisionName) || DIVISIONS[0];
}

export function getDivisionProgress(rating: number, divisionName: string): number {
  const div = DIVISIONS.find((d) => d.name === divisionName);
  if (!div) return 0;
  if (div.name === 'Monarch') return 100;
  const range = div.maxRating - div.minRating + 1;
  return Math.min(100, Math.max(0, Math.round(((rating - div.minRating) / range) * 100)));
}

export function getNextDivision(divisionName: string): DivisionInfo | null {
  const idx = DIVISIONS.findIndex((d) => d.name === divisionName);
  if (idx < 0 || idx >= DIVISIONS.length - 1) return null;
  return DIVISIONS[idx + 1];
}

// ─── API helpers ──────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  token: string | null,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options?.body) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, { ...options, headers: { ...headers, ...options?.headers } });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
          ? data.error
          : `Request failed (${res.status})`,
      };
    }
    return { ok: true, status: res.status, data: data as T, error: null };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ─── Public API functions ─────────────────────────────────────────

export async function fetchArenaProfile(token: string) {
  return apiFetch<ArenaProfile>('/api/arena/profile', token);
}

export async function fetchMatchHistory(token: string, page = 1, limit = 10) {
  return apiFetch<MatchHistoryResponse>(
    `/api/arena/history?page=${page}&limit=${limit}`,
    token
  );
}

export async function fetchRatingHistory(token: string, limit = 25) {
  return apiFetch<RatingHistoryResponse>(
    `/api/arena/rating-history?limit=${limit}`,
    token
  );
}

export async function fetchArenaLeaderboard(token: string, page = 1, limit = 25, division = 'all') {
  return apiFetch<LeaderboardResponse>(
    `/api/arena/leaderboard?page=${page}&limit=${limit}&division=${division}`,
    token
  );
}

export async function fetchQueueStatus(token: string) {
  return apiFetch<QueueStatusResponse>('/api/arena/queue/status', token);
}

export async function joinQueue(token: string) {
  return apiFetch<QueueJoinResponse>('/api/arena/queue', token, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function leaveQueue(token: string) {
  return apiFetch<{ success: boolean; removed: boolean }>('/api/arena/queue/leave', token, {
    method: 'POST',
  });
}

export async function fetchMatchDetails(token: string, matchId: string) {
  return apiFetch<ArenaMatchDetails>(`/api/arena/matches/${encodeURIComponent(matchId)}`, token);
}

export async function cancelArenaMatch(token: string, matchId: string) {
  return apiFetch<{ success: boolean; error?: string }>(
    `/api/arena/matches/${encodeURIComponent(matchId)}/cancel`,
    token,
    { method: 'POST' }
  );
}

export async function runArenaSampleTests(token: string, matchId: string, code: string) {
  return apiFetch<ArenaRunResult>(
    `/api/arena/matches/${encodeURIComponent(matchId)}/run`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ code }),
    }
  );
}

export async function submitArenaSolution(token: string, matchId: string, code: string) {
  return apiFetch<ArenaSubmitResult>(
    `/api/arena/matches/${encodeURIComponent(matchId)}/submit`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ code }),
    }
  );
}

export async function forfeitArenaMatch(token: string, matchId: string) {
  return apiFetch<ArenaForfeitResult>(
    `/api/arena/matches/${encodeURIComponent(matchId)}/forfeit`,
    token,
    {
      method: 'POST',
    }
  );
}

export async function fetchArenaMatchResult(token: string, matchId: string) {
  return apiFetch<ArenaMatchDetails>(
    `/api/arena/matches/${encodeURIComponent(matchId)}/result`,
    token
  );
}

export async function fetchSpectatorMatch(token: string | null | undefined, matchId: string) {
  return apiFetch<{ match: SpectatorMatchDetails }>(
    `/api/arena/matches/${encodeURIComponent(matchId)}/spectate`,
    token || null
  );
}
