import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Player, Quest, Skill, ActivityEntry, ConceptMastery, DailyQuestData, SkillWithState, PromotionTrialEligibility, Rank } from '../types';
import { useAuth } from './AuthContext';
import {
  currentPlayer as defaultPlayer,
  quests as defaultQuests,
  skills as defaultSkills,
} from '../data/mockData';
import {
  calculateXpGain,
  updateQuestsOnCompletion,
  updateSkillsOnQuestCompletion,
  createQuestActivity,
  createLevelUpActivity,
} from '../utils/progression';

export interface CompletionResult {
  success: boolean;
  xpGained: number;
  leveledUp: boolean;
  newLevel: number;
  rankChanged: boolean;
  message: string;
}

export type DailyQuestRequestState =
  | { status: 'loading' }
  | { status: 'success'; data: DailyQuestData }
  | { status: 'empty'; data: DailyQuestData }
  | { status: 'error'; message: string }
  | { status: 'unauthenticated' };

export type PromotionTrialsRequestState =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'unauthenticated' };

export type SkillProgressionRequestState =
  | { status: 'auth-loading' }
  | { status: 'preview' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'empty' }
  | { status: 'error'; message: string };

interface SkillProgressionRecord {
  id: string;
  level: number;
  maxLevel: number;
  state: SkillWithState['state'];
  unlockReason: string | null;
  conceptId: string | null;
  conceptMasteryLevel: number;
  prerequisiteIds: string[];
}

const PROMOTION_RANKS: readonly Rank[] = [
  'E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank', 'National Level', 'Monarch',
];

function isPromotionRank(value: unknown): value is Rank {
  return typeof value === 'string' && PROMOTION_RANKS.includes(value as Rank);
}

export interface PromotionAttemptResult {
  success: boolean;
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  results: any[];
  error?: string;
  errorType?: string;
  attempts?: number;
  newRank?: string;
  fromRank?: string;
  toRank?: string;
  alreadyCompleted?: boolean;
  profile?: {
    rank: string;
    title: string;
    level: number;
    xp: number;
  };
}

export interface ProgressionContextValue {
  player: Player;
  quests: Quest[];
  skills: Skill[];
  recentActivity: ActivityEntry[];
  claimedRewardIds: string[];
  conceptMastery: ConceptMastery[];
  isSyncing: boolean;
  // Daily quests
  dailyQuestData: DailyQuestData | null;
  dailyQuestRequest: DailyQuestRequestState;
  refreshDailyQuests: () => Promise<void>;
  claimDailyChest: () => Promise<{ success: boolean; xpAwarded: number; reason?: string }>;
  startQuest: (questId: string) => boolean;
  completeQuest: (questId: string) => CompletionResult;
  applyServerAward: (questId: string, award: ServerAwardPayload) => void;
  refreshProgress: () => Promise<void>;
  resetProgress: () => void;
  isQuestClaimed: (questId: string) => boolean;
  lastLevelUp: { level: number; rank: string; timestamp: number } | null;
  // Skills
  skillStates: SkillWithState[];
  skillProgressionRequest: SkillProgressionRequestState;
  refreshSkills: () => Promise<void>;
  // Promotion trials
  promotionTrials: PromotionTrialEligibility[];
  promotionTrialsRequest: PromotionTrialsRequestState;
  refreshPromotions: () => Promise<void>;
  attemptPromotion: (trialId: string, code: string) => Promise<PromotionAttemptResult>;
}

export interface ServerAwardPayload {
  xpReward?: number;
  isDuplicate?: boolean;
  leveledUp?: boolean;
  rankChanged?: boolean;
  player?: {
    user_id?: string;
    display_name?: string;
    title?: string;
    rank?: Player['rank'];
    level?: number;
    xp?: number;
    xp_to_next_level?: number;
    streak?: number;
    quests_completed?: number;
    skills_unlocked?: number;
    total_skills?: number;
    stats?: Player['stats'];
    created_at?: string;
  } | null;
}

interface StoredProgressionData {
  player: Player;
  quests: Quest[];
  skills: Skill[];
  recentActivity: ActivityEntry[];
  claimedRewardIds: string[];
  conceptMastery: ConceptMastery[];
  dailyQuestData: DailyQuestData | null;
  skillStates: SkillWithState[];
  promotionTrials: PromotionTrialEligibility[];
}

const ProgressionContext = createContext<ProgressionContextValue | null>(null);

const SKILL_STATES: readonly SkillWithState['state'][] = ['locked', 'available', 'in-progress', 'mastered'];

function isSkillProgressionRecord(value: unknown): value is SkillProgressionRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string'
    && typeof record.level === 'number'
    && Number.isInteger(record.level)
    && record.level >= 0
    && typeof record.maxLevel === 'number'
    && Number.isInteger(record.maxLevel)
    && record.maxLevel > 0
    && record.level <= record.maxLevel
    && typeof record.state === 'string'
    && SKILL_STATES.includes(record.state as SkillWithState['state'])
    && (typeof record.unlockReason === 'string' || record.unlockReason === null)
    && (typeof record.conceptId === 'string' || record.conceptId === null)
    && typeof record.conceptMasteryLevel === 'number'
    && Number.isFinite(record.conceptMasteryLevel)
    && record.conceptMasteryLevel >= 0
    && Array.isArray(record.prerequisiteIds)
    && record.prerequisiteIds.every((id) => typeof id === 'string');
}

function parseSkillProgressionRecords(value: unknown): SkillProgressionRecord[] {
  if (typeof value !== 'object' || value === null || !('skills' in value) || !Array.isArray(value.skills)) {
    throw new Error('The skill response did not contain a valid skills list. Retry to try again.');
  }

  const records: SkillProgressionRecord[] = [];
  const ids = new Set<string>();
  for (const item of value.skills as unknown[]) {
    if (!isSkillProgressionRecord(item)) {
      throw new Error('The skill response contains an invalid progression record. Retry to try again.');
    }

    if (ids.has(item.id)) {
      throw new Error(`The skill response contains a duplicate skill ID (${item.id}). Retry to try again.`);
    }
    ids.add(item.id);
    records.push(item);
  }
  return records;
}

function mergeSkillProgression(records: SkillProgressionRecord[]): SkillWithState[] {
  const catalogById = new Map(defaultSkills.map((skill) => [skill.id, skill]));
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const unknownId = records.find((record) => !catalogById.has(record.id));
  if (unknownId) {
    throw new Error(`The server returned an unsupported skill (${unknownId.id}). Refresh after the skill catalog is updated.`);
  }

  for (const record of records) {
    const catalogSkill = catalogById.get(record.id);
    if (catalogSkill && record.maxLevel !== catalogSkill.maxLevel) {
      throw new Error(`Maximum level for ${record.id} does not match the local skill catalog.`);
    }
    if (catalogSkill && record.prerequisiteIds.join('\0') !== catalogSkill.prerequisiteIds.join('\0')) {
      throw new Error(`Prerequisite data for ${record.id} does not match the local skill catalog.`);
    }
  }

  const missingIds = defaultSkills.filter((skill) => !recordsById.has(skill.id)).map((skill) => skill.id);
  if (missingIds.length > 0) {
    throw new Error(`The server response is missing progression for ${missingIds.length} catalog skills. Retry to try again.`);
  }

  return defaultSkills.map((skill) => {
    const progression = recordsById.get(skill.id);
    if (!progression) {
      throw new Error(`The server response is missing progression for ${skill.id}. Retry to try again.`);
    }
    return {
      ...skill,
      level: progression.level,
      state: progression.state,
      unlockReason: progression.unlockReason,
      conceptId: progression.conceptId ?? undefined,
      conceptMasteryLevel: progression.conceptMasteryLevel,
    };
  });
}

function createPreviewData(): StoredProgressionData {
  const initialClaimed = defaultQuests
    .filter((q) => q.status === 'completed')
    .map((q) => q.id);

  // Build preview skill states from mock data
  const previewSkillStates = defaultSkills.map(s => {
    const prereqs = s.prerequisiteIds;
    const prereqsMet = prereqs.length === 0 || prereqs.every(p => {
      const ps = defaultSkills.find(ss => ss.id === p);
      return ps && ps.level > 0;
    });
    let state: SkillWithState['state'] = 'locked';
    let unlockReason = null;
    if (!prereqsMet) {
      state = 'locked';
      const unmet = prereqs.filter(p => {
        const ps = defaultSkills.find(ss => ss.id === p);
        return !ps || ps.level === 0;
      });
      unlockReason = `Requires: ${unmet.join(', ')}`;
    } else if (s.level === 0) {
      state = 'available';
    } else if (s.level >= 5) {
      state = 'mastered';
    } else {
      state = 'in-progress';
    }
    return { ...s, state, unlockReason };
  });

  return {
    player: defaultPlayer,
    quests: defaultQuests,
    skills: defaultSkills,
    recentActivity: [],
    claimedRewardIds: initialClaimed,
    conceptMastery: [],
    dailyQuestData: null,
    skillStates: previewSkillStates,
    promotionTrials: [],
  };
}

function mapPlayerFromProfile(prev: Player, profile: NonNullable<ServerAwardPayload['player']>): Player {
  return {
    ...prev,
    id: profile.user_id || prev.id,
    name: profile.display_name || prev.name,
    title: profile.title || prev.title,
    rank: profile.rank || prev.rank,
    level: profile.level ?? prev.level,
    xp: profile.xp ?? prev.xp,
    xpToNextLevel: profile.xp_to_next_level ?? prev.xpToNextLevel,
    streak: profile.streak ?? prev.streak,
    questsCompleted: profile.quests_completed ?? prev.questsCompleted,
    skillsUnlocked: profile.skills_unlocked ?? prev.skillsUnlocked,
    totalSkills: profile.total_skills ?? prev.totalSkills,
    stats: profile.stats || prev.stats,
    joinedDate: profile.created_at ? profile.created_at.slice(0, 10) : prev.joinedDate,
  };
}

export const ProgressionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<StoredProgressionData>(createPreviewData);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dailyQuestRequest, setDailyQuestRequest] = useState<DailyQuestRequestState>({ status: 'unauthenticated' });
  const dailyRequestId = React.useRef(0);
  const promotionRequestId = React.useRef(0);
  const promotionRequestController = React.useRef<AbortController | null>(null);
  const promotionProviderMounted = React.useRef(false);
  const skillRequestId = React.useRef(0);
  const skillRequestController = React.useRef<AbortController | null>(null);
  const chestClaimInFlight = React.useRef(false);
  const [promotionTrialsRequest, setPromotionTrialsRequest] = useState<PromotionTrialsRequestState>({ status: 'loading' });
  const [skillProgressionRequest, setSkillProgressionRequest] = useState<SkillProgressionRequestState>({ status: 'auth-loading' });
  const [skillRequestOwnerToken, setSkillRequestOwnerToken] = useState<string | null>(null);
  const [authenticatedSkillStates, setAuthenticatedSkillStates] = useState<SkillWithState[]>([]);
  const [lastLevelUp] = useState<{ level: number; rank: string; timestamp: number } | null>(null);

  const refreshProgress = useCallback(async () => {
    if (!token) return;

    setIsSyncing(true);
    try {
      const res = await fetch('/api/player/progress', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const backendData = await res.json();
      const profile = backendData.profile;
      if (!profile) return;

      setData((prev) => {
        const updatedPlayer = {
          ...mapPlayerFromProfile(prev.player, profile),
          guild: backendData.guild ?? null,
        };

        const updatedQuests = prev.quests.map((q) => {
          const bq = backendData.quests?.find((item: { id: string }) => item.id === q.id);
          return bq ? { ...q, status: bq.status } : q;
        });

        // Server skill levels are authoritative for signed-in hunters (missing = locked).
        const updatedSkills = prev.skills.map((s) => {
          const bs = backendData.skills?.find((item: { id: string }) => item.id === s.id);
          return { ...s, level: bs ? bs.level : 0 };
        });

        const conceptMastery = backendData.conceptMastery || [];

        return {
          ...prev,
          player: updatedPlayer,
          quests: updatedQuests,
          skills: updatedSkills,
          claimedRewardIds: backendData.claimedQuestIds || [],
          conceptMastery,
        };
      });
    } catch (err) {
      console.warn('Could not sync progression with backend:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [token]);

  const refreshDailyQuests = useCallback(async () => {
    if (authLoading) return;
    const requestId = ++dailyRequestId.current;
    if (!isAuthenticated || !token) {
      setDailyQuestRequest({ status: 'unauthenticated' });
      return;
    }
    setDailyQuestRequest({ status: 'loading' });
    try {
      const res = await fetch('/api/daily', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const response = await res.json().catch(() => null) as { error?: unknown } | null;
        throw new Error(typeof response?.error === 'string' ? response.error : `Daily missions request failed (${res.status}).`);
      }
      const dailyData = await res.json() as DailyQuestData;
      if (requestId !== dailyRequestId.current) return;
      setData((prev) => ({
        ...prev,
        dailyQuestData: dailyData,
      }));
      setDailyQuestRequest(dailyData.quests.length > 0
        ? { status: 'success', data: dailyData }
        : { status: 'empty', data: dailyData });
    } catch (err) {
      console.warn('Could not sync daily quests with backend:', err);
      if (requestId === dailyRequestId.current) {
        setDailyQuestRequest({ status: 'error', message: err instanceof Error ? err.message : 'Unable to load daily missions.' });
      }
    } finally {
      if (requestId === dailyRequestId.current) {
        setDailyQuestRequest((current) => current.status === 'loading'
          ? { status: 'error', message: 'Daily missions request ended without a response.' }
          : current);
      }
    }
  }, [authLoading, isAuthenticated, token]);

  const claimDailyChest = useCallback(async () => {
    if (!token || chestClaimInFlight.current || (dailyQuestRequest.status !== 'success' && dailyQuestRequest.status !== 'empty') || dailyQuestRequest.data.chest.status !== 'available') {
      return { success: false, xpAwarded: 0, reason: 'unauthorized_or_unavailable' };
    }
    chestClaimInFlight.current = true;
    try {
      const res = await fetch('/api/daily/claim', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
      });

      const result = await res.json();
      if (!res.ok || !result.success) return { success: false, xpAwarded: 0, reason: result.reason || result.error || 'Claim failed.' };
      
      if (result.success) {
        // Update local state with new profile and daily quest data
        setData((prev) => ({
          ...prev,
          player: result.profile ? mapPlayerFromProfile(prev.player, result.profile) : prev.player,
          dailyQuestData: prev.dailyQuestData ? {
            ...prev.dailyQuestData,
            chest: { ...prev.dailyQuestData.chest, status: 'claimed' as const },
            quests: prev.dailyQuestData.quests.map(q => ({ ...q, status: 'claimed' as const })),
          } : null,
        }));
        
        // Refresh the server-owned cache and streak after a successful claim.
        void refreshDailyQuests();
        void refreshProgress();
      }
      
      return { success: result.success, xpAwarded: result.xpAwarded || 0, reason: result.reason };
    } catch (err) {
      console.warn('Could not claim daily chest:', err);
      return { success: false, xpAwarded: 0, reason: 'error' };
    } finally {
      chestClaimInFlight.current = false;
    }
  }, [token, dailyQuestRequest, refreshDailyQuests, refreshProgress]);

  const isQuestClaimed = useCallback(
    (questId: string) => data.claimedRewardIds.includes(questId),
    [data.claimedRewardIds]
  );

  const startQuest = useCallback(
    (questId: string): boolean => {
      let started = false;
      setData((prev) => {
        const quest = prev.quests.find((q) => q.id === questId);
        if (!quest || quest.status === 'locked' || quest.status === 'completed') {
          return prev;
        }
        started = true;
        return {
          ...prev,
          quests: prev.quests.map((q) =>
            q.id === questId ? { ...q, status: 'in-progress' as const } : q
          ),
        };
      });

      if (token) {
        fetch('/api/player/quest/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ questId }),
        }).catch(console.warn);
      }

      return started;
    },
    [token]
  );

  const applyServerAward = useCallback((questId: string, award: ServerAwardPayload) => {
    setData((prev) => {
      const quest = prev.quests.find((q) => q.id === questId);
      const xpGained = award.isDuplicate ? 0 : award.xpReward || 0;
      const updatedQuests = updateQuestsOnCompletion(questId, prev.quests);
      const updatedSkills = quest
        ? updateSkillsOnQuestCompletion(quest, prev.skills)
        : prev.skills;

      const newActivities = [...prev.recentActivity];
      if (quest && xpGained > 0) {
        newActivities.unshift(createQuestActivity(quest, xpGained));
      }

      const nextPlayer = award.player
        ? mapPlayerFromProfile(prev.player, award.player)
        : prev.player;

      if (award.leveledUp) {
        newActivities.unshift(createLevelUpActivity(nextPlayer.level, nextPlayer.rank));
      }

      const claimed = prev.claimedRewardIds.includes(questId)
        ? prev.claimedRewardIds
        : [...prev.claimedRewardIds, questId];

      return {
        player: nextPlayer,
        quests: updatedQuests,
        skills: updatedSkills,
        recentActivity: newActivities.slice(0, 20),
        claimedRewardIds: claimed,
        conceptMastery: prev.conceptMastery,
        dailyQuestData: prev.dailyQuestData,
        skillStates: prev.skillStates,
        promotionTrials: prev.promotionTrials,
      };
    });
  }, []);

  const completeQuest = useCallback(
    (questId: string): CompletionResult => {
      if (isAuthenticated) {
        return {
          success: false,
          xpGained: 0,
          leveledUp: false,
          newLevel: data.player.level,
          rankChanged: false,
          message: 'XP is awarded only after a passing server-side submission.',
        };
      }

      const quest = data.quests.find((q) => q.id === questId);
      if (!quest) {
        return {
          success: false,
          xpGained: 0,
          leveledUp: false,
          newLevel: data.player.level,
          rankChanged: false,
          message: 'Quest not found.',
        };
      }

      if (quest.status === 'locked') {
        return {
          success: false,
          xpGained: 0,
          leveledUp: false,
          newLevel: data.player.level,
          rankChanged: false,
          message: 'Cannot complete locked quest. Prerequisites required.',
        };
      }

      const alreadyClaimed = data.claimedRewardIds.includes(questId);
      const xpToAward = alreadyClaimed ? 0 : quest.xpReward;
      const prog = calculateXpGain(
        data.player.level,
        data.player.xp,
        data.player.xpToNextLevel,
        xpToAward
      );

      const updatedQuests = updateQuestsOnCompletion(questId, data.quests);
      const updatedSkills = updateSkillsOnQuestCompletion(quest, data.skills);
      const skillsUnlockedCount = updatedSkills.filter((s) => s.level > 0).length;
      const newActivities = [...data.recentActivity];
      if (xpToAward > 0) {
        newActivities.unshift(createQuestActivity(quest, xpToAward));
      }
      if (prog.levelsGained > 0) {
        newActivities.unshift(createLevelUpActivity(prog.newLevel, prog.newRank));
      }

      setData({
        player: {
          ...data.player,
          level: prog.newLevel,
          xp: prog.newXp,
          xpToNextLevel: prog.newXpToNextLevel,
          rank: prog.newRank,
          title: prog.newTitle,
          questsCompleted: alreadyClaimed
            ? data.player.questsCompleted
            : data.player.questsCompleted + 1,
          skillsUnlocked: skillsUnlockedCount,
        },
        quests: updatedQuests,
        skills: updatedSkills,
        recentActivity: newActivities.slice(0, 20),
        claimedRewardIds: alreadyClaimed
          ? data.claimedRewardIds
          : [...data.claimedRewardIds, questId],
        conceptMastery: data.conceptMastery,
        dailyQuestData: data.dailyQuestData,
        skillStates: data.skillStates,
        promotionTrials: data.promotionTrials,
      });

      return {
        success: true,
        xpGained: xpToAward,
        leveledUp: prog.levelsGained > 0,
        newLevel: prog.newLevel,
        rankChanged: prog.rankChanged,
        message: alreadyClaimed
          ? `Quest "${quest.title}" marked completed. (Preview only — sign in to save progress)`
          : `Preview completion! +${xpToAward} XP (sign in to save progress).`,
      };
    },
    [data, isAuthenticated]
  );

  const resetProgress = useCallback(() => {
    setData(createPreviewData());
  }, []);

  const refreshSkills = useCallback(async () => {
    const requestId = ++skillRequestId.current;
    skillRequestController.current?.abort();
    skillRequestController.current = null;

    if (authLoading) {
      setSkillProgressionRequest({ status: 'auth-loading' });
      setSkillRequestOwnerToken(null);
      return;
    }
    if (!isAuthenticated || !token) {
      setSkillProgressionRequest({ status: 'preview' });
      setSkillRequestOwnerToken(null);
      setAuthenticatedSkillStates([]);
      return;
    }

    const requestToken = token;
    const controller = new AbortController();
    skillRequestController.current = controller;
    setSkillRequestOwnerToken(requestToken);
    setSkillProgressionRequest({ status: 'loading' });
    try {
      const res = await fetch('/api/skills', {
        headers: { Authorization: `Bearer ${requestToken}` },
        signal: controller.signal,
      });

      if (!res.ok) {
        const response: unknown = await res.json().catch(() => null);
        const message = typeof response === 'object' && response !== null && 'error' in response && typeof response.error === 'string'
          ? response.error
          : `Skill progression request failed (${res.status}).`;
        throw new Error(message);
      }

      let response: unknown;
      try {
        response = await res.json();
      } catch {
        throw new Error('The skill server returned an unreadable response. Retry to try again.');
      }
      const records = parseSkillProgressionRecords(response);
      if (requestId !== skillRequestId.current || requestToken !== token || !promotionProviderMounted.current) return;

      if (records.length === 0) {
        setAuthenticatedSkillStates([]);
        setSkillProgressionRequest({ status: 'empty' });
        return;
      }

      const mergedSkills = mergeSkillProgression(records);
      setAuthenticatedSkillStates(mergedSkills);
      setSkillProgressionRequest({ status: 'success' });
    } catch (err) {
      if (controller.signal.aborted || requestId !== skillRequestId.current || requestToken !== token || !promotionProviderMounted.current) return;
      const message = err instanceof TypeError
        ? 'Unable to reach skill progression. Check your connection and retry.'
        : err instanceof Error ? err.message : 'Unable to load skill progression. Retry to try again.';
      console.warn('Could not sync skills with backend:', err);
      setSkillProgressionRequest({ status: 'error', message });
    } finally {
      if (requestId === skillRequestId.current && requestToken === token && promotionProviderMounted.current) {
        skillRequestController.current = null;
      }
    }
  }, [authLoading, isAuthenticated, token]);

  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated && token) {
      // The backend has no persisted activity feed; never carry preview events into an account session.
      setData((prev) => ({ ...prev, recentActivity: [] }));
      void refreshProgress();
      return;
    }

    setData(createPreviewData());
    skillRequestId.current += 1;
    skillRequestController.current?.abort();
    skillRequestController.current = null;
    setSkillRequestOwnerToken(null);
    setAuthenticatedSkillStates([]);
    setSkillProgressionRequest({ status: 'preview' });
  }, [authLoading, isAuthenticated, token, refreshProgress]);

  useEffect(() => {
    promotionProviderMounted.current = true;
    return () => {
      promotionProviderMounted.current = false;
      promotionRequestId.current += 1;
      promotionRequestController.current?.abort();
      promotionRequestController.current = null;
      skillRequestId.current += 1;
      skillRequestController.current?.abort();
      skillRequestController.current = null;
    };
  }, []);

  const refreshPromotions = useCallback(async () => {
    const requestId = ++promotionRequestId.current;
    promotionRequestController.current?.abort();
    promotionRequestController.current = null;

    if (authLoading) {
      setPromotionTrialsRequest({ status: 'loading' });
      return;
    }
    if (!isAuthenticated || !token) {
      setPromotionTrialsRequest({ status: 'unauthenticated' });
      return;
    }

    const controller = new AbortController();
    promotionRequestController.current = controller;
    setPromotionTrialsRequest({ status: 'loading' });
    try {
      const res = await fetch('/api/promotion/trials', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!res.ok) {
        const backendData: unknown = await res.json().catch(() => null);
        const errorText = typeof backendData === 'object' && backendData !== null && 'error' in backendData && typeof backendData.error === 'string'
          ? backendData.error
          : `Promotion trials request failed (${res.status}).`;
        throw new Error(errorText);
      }
      let backendData: unknown;
      try {
        backendData = await res.json();
      } catch {
        throw new Error('Promotion trials returned an unreadable response. Retry to try again.');
      }
      if (typeof backendData !== 'object' || backendData === null || !('trials' in backendData) || !Array.isArray(backendData.trials)) {
        throw new Error('Promotion trials response did not contain a valid trials list. Retry to try again.');
      }
      const trials = backendData.trials;
      const isTrial = (value: unknown): value is PromotionTrialEligibility => {
        if (typeof value !== 'object' || value === null) return false;
        const trial = value as Record<string, unknown>;
        return typeof trial.id === 'string'
          && isPromotionRank(trial.fromRank)
          && isPromotionRank(trial.toRank)
          && typeof trial.title === 'string'
          && typeof trial.description === 'string'
          && typeof trial.requiredLevel === 'number'
          && Array.isArray(trial.requiredMasteredChallenges)
          && trial.requiredMasteredChallenges.every((challenge) => typeof challenge === 'string')
          && typeof trial.requiredConceptMastery === 'object'
          && trial.requiredConceptMastery !== null
          && !Array.isArray(trial.requiredConceptMastery)
          && Object.values(trial.requiredConceptMastery).every((level) => typeof level === 'number')
          && typeof trial.trialChallengeId === 'string'
          && typeof trial.xpReward === 'number'
          && ['locked', 'available', 'in-progress', 'completed', 'failed'].includes(String(trial.status))
          && typeof trial.attempts === 'number'
          && typeof trial.eligible === 'boolean'
          && typeof trial.levelMet === 'boolean'
          && typeof trial.challengesMet === 'boolean'
          && typeof trial.conceptsMet === 'boolean'
          && typeof trial.currentLevel === 'number'
          && isPromotionRank(trial.currentRank);
      };
      if (!trials.every(isTrial)) {
        throw new Error('Promotion trials response contained invalid trial data. Retry to try again.');
      }
      if (requestId !== promotionRequestId.current || !promotionProviderMounted.current) return;

      setData((prev) => ({
        ...prev,
        promotionTrials: trials,
      }));
      setPromotionTrialsRequest(trials.length > 0 ? { status: 'success' } : { status: 'empty' });
    } catch (err) {
      if (controller.signal.aborted || requestId !== promotionRequestId.current || !promotionProviderMounted.current) return;
      const message = err instanceof TypeError
        ? 'Unable to reach promotion trials. Check your connection and retry.'
        : err instanceof Error ? err.message : 'Unable to load promotion trials. Retry to try again.';
      console.warn('Could not sync promotion trials with backend:', err);
      setPromotionTrialsRequest({ status: 'error', message });
    } finally {
      if (requestId === promotionRequestId.current && promotionProviderMounted.current) {
        promotionRequestController.current = null;
        setPromotionTrialsRequest((current) => current.status === 'loading'
          ? { status: 'error', message: 'Promotion trials request ended without a response. Retry to try again.' }
          : current);
      }
    }
  }, [authLoading, isAuthenticated, token]);

  const attemptPromotion = useCallback(async (trialId: string, code: string): Promise<PromotionAttemptResult> => {
    if (!token) {
      return { success: false, allPassed: false, passedCount: 0, totalCount: 0, results: [], error: 'Unauthorized', errorType: 'unauthorized' };
    }

    try {
      const res = await fetch('/api/promotion/trial/attempt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ trialId, code }),
      });

      const result = await res.json();

      if (result.success && result.profile) {
        // Update player with new rank/title
        setData((prev) => ({
          ...prev,
          player: {
            ...prev.player,
            rank: result.profile.rank,
            title: result.profile.title,
            level: result.profile.level,
            xp: result.profile.xp,
          },
        }));
        // Refresh promotions to update status
        void refreshPromotions();
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn('Could not attempt promotion:', errorMessage);
      return { success: false, allPassed: false, passedCount: 0, totalCount: 0, results: [], error: errorMessage, errorType: 'error' };
    }
  }, [token, refreshPromotions]);

  const skillProgressionView: SkillProgressionRequestState = authLoading
    ? { status: 'auth-loading' }
    : !isAuthenticated || !token
      ? { status: 'preview' }
      : skillRequestOwnerToken === token
        ? skillProgressionRequest
        : { status: 'loading' };
  const visibleSkillStates = skillProgressionView.status === 'preview'
    ? data.skillStates
    : skillProgressionView.status === 'success'
      ? authenticatedSkillStates
      : [];

  return (
    <ProgressionContext.Provider
      value={{
        player: data.player,
        quests: data.quests,
        skills: data.skills,
        recentActivity: data.recentActivity,
        claimedRewardIds: data.claimedRewardIds,
        conceptMastery: data.conceptMastery,
        isSyncing,
        dailyQuestData: data.dailyQuestData,
        dailyQuestRequest,
        refreshDailyQuests,
        claimDailyChest,
        startQuest,
        completeQuest,
        applyServerAward,
        refreshProgress,
        resetProgress,
        isQuestClaimed,
        lastLevelUp,
        // Skills
        skillStates: visibleSkillStates,
        skillProgressionRequest: skillProgressionView,
        refreshSkills,
        // Promotion trials
        promotionTrials: data.promotionTrials,
        promotionTrialsRequest,
        refreshPromotions,
        attemptPromotion,
      }}
    >
      {children}
    </ProgressionContext.Provider>
  );
};

export function useProgression(): ProgressionContextValue {
  const context = useContext(ProgressionContext);
  if (!context) {
    throw new Error('useProgression must be used within a ProgressionProvider');
  }
  return context;
}
