/**
 * Tournament API Service — isolates all tournament backend calls from UI components.
 * Matches Shadow Code API convention and data structures.
 */

import type { ArenaSubmitResult } from './arenaApi';

// ─── Types ────────────────────────────────────────────────────────

export type TournamentStatus = 'registration' | 'in_progress' | 'completed' | 'cancelled';
export type TournamentMatchStatus = 'scheduled' | 'ready' | 'in_progress' | 'completed' | 'bye' | 'cancelled';
export type TournamentLiveMatchStatus = TournamentMatchStatus | 'expired' | 'abandoned';

export interface TournamentRewards {
  firstPlace?: { xp: number; title: string };
  secondPlace?: { xp: number; title: string };
  semifinalist?: { xp: number; title: string };
}

export interface TournamentListItem {
  id: string;
  seasonId: string;
  title: string;
  description: string;
  format: 'single_elimination';
  maxParticipants: number;
  currentParticipants: number;
  status: TournamentStatus;
  createdBy: string | null;
  startTime: string | null;
  currentRound: number;
  totalRounds: number;
  rewards: TournamentRewards;
  winnerId: string | null;
  winnerName: string | null;
  isRegistered: boolean;
  isCreator: boolean;
}

export interface TournamentParticipant {
  userId: string;
  username: string;
  seed: number;
  eliminated: number;
  eliminatedRound: number | null;
  finalRank: number | null;
  rewardsClaimed: number;
  rating: number | null;
  division: string | null;
}

export interface TournamentMatchNode {
  id: string;
  round: number;
  matchIndex: number;
  p1Id: string | null;
  p1Name: string | null;
  p2Id: string | null;
  p2Name: string | null;
  winnerId: string | null;
  challengeId: string;
  status: TournamentMatchStatus;
  nextMatchId: string | null;
  arenaMatchId: string | null;
}

export interface BracketRound {
  roundNumber: number;
  title: string;
  matches: TournamentMatchNode[];
}

export interface TournamentLiveMatch {
  tournamentMatchId: string;
  arenaMatchId: string | null;
  round: number;
  matchIndex: number;
  challengeTitle: string;
  player1: { id: string | null; name: string | null };
  player2: { id: string | null; name: string | null };
  status: TournamentLiveMatchStatus;
  remainingSeconds: number;
}

export interface TournamentUserContext {
  isRegistered: boolean;
  isCreator: boolean;
  participant: TournamentParticipant | null;
  activeMatchId: string | null;
  canClaimReward: boolean;
  claimableReward: { xp: number; title: string } | null;
}

export interface TournamentDetails {
  id: string;
  seasonId: string;
  title: string;
  description: string;
  format: string;
  maxParticipants: number;
  currentParticipants: number;
  status: TournamentStatus;
  createdBy: string | null;
  startTime: string | null;
  endTime: string | null;
  currentRound: number;
  totalRounds: number;
  rewards: TournamentRewards;
  winnerId: string | null;
  winnerName: string | null;
  participants: TournamentParticipant[];
  bracket: BracketRound[];
  userContext: TournamentUserContext;
}

export interface TournamentProfile {
  user_id: string;
  display_name: string;
  title: string;
  rank: string;
  level: number;
  xp: number;
  xp_to_next_level: number;
  streak: number;
  quests_completed: number;
  skills_unlocked: number;
  total_skills: number;
  stats: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface CreateTournamentPayload {
  title: string;
  description?: string;
  maxParticipants?: number;
  startTime?: string;
  rewards?: TournamentRewards;
}

// ─── API Helper ───────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  token: string | null | undefined,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options?.body) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, { ...options, headers: { ...headers, ...options?.headers } });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      if (res.ok) {
        return { ok: false, status: res.status, data: null, error: 'Invalid JSON response' };
      }
    }

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
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

// ─── API Methods ──────────────────────────────────────────────────

export async function fetchTournamentsList(token?: string | null, signal?: AbortSignal) {
  return apiFetch<{ tournaments: TournamentListItem[] }>('/api/tournaments', token, { signal });
}

export async function fetchTournamentDetails(id: string, token?: string | null, signal?: AbortSignal) {
  return apiFetch<TournamentDetails>(`/api/tournaments/${encodeURIComponent(id)}`, token, { signal });
}

export async function createTournament(token: string, payload: CreateTournamentPayload) {
  return apiFetch<{ success: boolean; tournamentId: string }>(
    '/api/tournaments',
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function registerTournament(token: string, id: string) {
  return apiFetch<{ success: boolean; currentParticipants: number }>(
    `/api/tournaments/${encodeURIComponent(id)}/register`,
    token,
    {
      method: 'POST',
    }
  );
}

export async function withdrawTournament(token: string, id: string) {
  return apiFetch<{ success: boolean }>(
    `/api/tournaments/${encodeURIComponent(id)}/withdraw`,
    token,
    {
      method: 'POST',
    }
  );
}

export async function startTournament(token: string, id: string) {
  return apiFetch<{ success: boolean; totalRounds: number; bracketSize: number; participantsCount: number }>(
    `/api/tournaments/${encodeURIComponent(id)}/start`,
    token,
    {
      method: 'POST',
    }
  );
}

export async function cancelTournament(token: string, id: string) {
  return apiFetch<{ success: boolean; tournamentId: string; status: 'cancelled' }>(
    `/api/tournaments/${encodeURIComponent(id)}/cancel`,
    token,
    {
      method: 'POST',
    }
  );
}

export async function claimTournamentReward(token: string, id: string) {
  return apiFetch<{ success: boolean; rank: number; xpAwarded: number; titleAwarded: string; profile: TournamentProfile }>(
    `/api/tournaments/${encodeURIComponent(id)}/claim`,
    token,
    {
      method: 'POST',
    }
  );
}

export async function startTournamentMatch(token: string, tournamentId: string, matchId: string) {
  return apiFetch<{ success: boolean; matchId: string; tournamentMatchId: string }>(
    `/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/start`,
    token,
    {
      method: 'POST',
    }
  );
}

export async function submitTournamentMatch(token: string, tournamentId: string, matchId: string, code: string) {
  return apiFetch<ArenaSubmitResult>(
    `/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/submit`,
    token,
    { method: 'POST', body: JSON.stringify({ code }) }
  );
}

export async function fetchTournamentLiveMatches(
  token: string | null | undefined,
  tournamentId: string,
  signal?: AbortSignal
) {
  return apiFetch<{ matches: TournamentLiveMatch[] }>(
    `/api/tournaments/${encodeURIComponent(tournamentId)}/live`,
    token,
    { signal }
  );
}
