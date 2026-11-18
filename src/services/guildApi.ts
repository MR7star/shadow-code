import type {
  CompetitiveLeaderboardResponse,
  GuildDetailsResponse,
  GuildRole,
  GuildsListResponse,
  UserGuildProfileResponse,
} from '../types';

export interface GuildApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

interface GuildCreateResponse {
  success: boolean;
  guild?: GuildDetailsResponse['guild'];
  error?: string;
}
interface GuildMutationResponse {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}
interface GuildInviteResponse extends GuildMutationResponse {
  inviteId: string;
  targetUsername: string;
}
interface GuildClaimResponse extends GuildMutationResponse {
  xpAwarded: number;
  quest: Record<string, unknown>;
}

async function apiFetch<T>(url: string, token?: string | null, options: RequestInit = {}): Promise<GuildApiResult<T>> {
  try {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...options, headers });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, status: response.status, data: null, error: response.ok ? 'The server returned an invalid JSON response.' : `Request failed (${response.status})` };
    }
    if (!response.ok) {
      const error = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
        ? payload.error : `Request failed (${response.status})`;
      return { ok: false, status: response.status, data: null, error };
    }
    return { ok: true, status: response.status, data: payload as T, error: null };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : 'Network request failed.' };
  }
}

const authPost = (body?: unknown): RequestInit => ({
  method: 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function fetchGuilds(params: { page?: number; limit?: number; search?: string; rank?: string } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('limit', String(params.limit ?? 12));
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.rank && params.rank !== 'all') query.set('rank', params.rank);
  return apiFetch<GuildsListResponse>(`/api/guilds?${query}`, null, { signal });
}

export function fetchGuildProfile(token: string, signal?: AbortSignal) {
  return apiFetch<UserGuildProfileResponse>('/api/guilds/me', token, { signal });
}

export function fetchGuildDetails(guildId: string, token?: string | null, signal?: AbortSignal) {
  return apiFetch<GuildDetailsResponse>(`/api/guilds/${encodeURIComponent(guildId)}`, token, { signal });
}

export function createGuild(token: string, payload: { name: string; description: string; emblem: string }) {
  return apiFetch<GuildCreateResponse>('/api/guilds', token, authPost(payload));
}

export function joinGuild(token: string, guildId: string) {
  return apiFetch<GuildMutationResponse>(`/api/guilds/${encodeURIComponent(guildId)}/join`, token, authPost());
}

export function leaveGuild(token: string, guildId: string) {
  return apiFetch<GuildMutationResponse>(`/api/guilds/${encodeURIComponent(guildId)}/leave`, token, authPost());
}

export function inviteGuildPlayer(token: string, guildId: string, targetUsername: string) {
  return apiFetch<GuildInviteResponse>(`/api/guilds/${encodeURIComponent(guildId)}/invite`, token, authPost({ targetUsername }));
}

export function respondToGuildInvite(token: string, guildId: string, inviteId: string, accept: boolean) {
  const action = accept ? 'accept' : 'reject';
  return apiFetch<GuildMutationResponse>(`/api/guilds/${encodeURIComponent(guildId)}/invites/${encodeURIComponent(inviteId)}/${action}`, token, authPost());
}

export function kickGuildMember(token: string, guildId: string, targetUserId: string) {
  return apiFetch<GuildMutationResponse>(`/api/guilds/${encodeURIComponent(guildId)}/kick`, token, authPost({ targetUserId }));
}

export function updateGuildMemberRole(token: string, guildId: string, targetUserId: string, role: Extract<GuildRole, 'officer' | 'member'>) {
  return apiFetch<GuildMutationResponse>(`/api/guilds/${encodeURIComponent(guildId)}/role`, token, authPost({ targetUserId, role }));
}

export function transferGuildLeadership(token: string, guildId: string, newLeaderId: string) {
  return apiFetch<GuildMutationResponse>(`/api/guilds/${encodeURIComponent(guildId)}/transfer-leadership`, token, authPost({ newLeaderId }));
}

export function claimGuildQuest(token: string, guildId: string, questId: string) {
  return apiFetch<GuildClaimResponse>(`/api/guilds/${encodeURIComponent(guildId)}/quests/${encodeURIComponent(questId)}/claim`, token, authPost());
}

export function fetchGuildLeaderboard(params: { type: 'guilds' | 'contributions'; page?: number; limit?: number; search?: string; rank?: string; guildId?: string }, signal?: AbortSignal) {
  const query = new URLSearchParams({ type: params.type, page: String(params.page ?? 1), limit: String(params.limit ?? 25) });
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.rank && params.rank !== 'all') query.set('rank', params.rank);
  if (params.guildId) query.set('guildId', params.guildId);
  return apiFetch<CompetitiveLeaderboardResponse>(`/api/leaderboard?${query}`, null, { signal });
}
