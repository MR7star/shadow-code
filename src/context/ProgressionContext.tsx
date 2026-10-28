import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Player, Quest, Skill, ActivityEntry, ConceptMastery, DailyQuestData, SkillWithState, PromotionTrialEligibility } from '../types';
import { useAuth } from './AuthContext';
import {
  currentPlayer as defaultPlayer,
  quests as defaultQuests,
  skills as defaultSkills,
  recentActivity as defaultActivity,
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
  refreshSkills: () => Promise<void>;
  // Promotion trials
  promotionTrials: PromotionTrialEligibility[];
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
    recentActivity: defaultActivity,
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
        const updatedPlayer = mapPlayerFromProfile(prev.player, profile);

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
    if (!token) return;

    try {
      const res = await fetch('/api/daily', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const dailyData = await res.json();
      setData((prev) => ({
        ...prev,
        dailyQuestData: dailyData,
      }));
    } catch (err) {
      console.warn('Could not sync daily quests with backend:', err);
    }
  }, [token]);

  const claimDailyChest = useCallback(async () => {
    if (!token) return { success: false, xpAwarded: 0, reason: 'unauthorized' };

    try {
      const res = await fetch('/api/daily/claim', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
      });

      const result = await res.json();
      
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
        
        // Also refresh full progress to get updated streak, etc.
        void refreshProgress();
      }
      
      return { success: result.success, xpAwarded: result.xpAwarded || 0, reason: result.reason };
    } catch (err) {
      console.warn('Could not claim daily chest:', err);
      return { success: false, xpAwarded: 0, reason: 'error' };
    }
  }, [token, refreshProgress]);

  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated && token) {
      void refreshProgress();
      return;
    }

    setData(createPreviewData());
  }, [authLoading, isAuthenticated, token, refreshProgress]);

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
    if (!token) return;

    try {
      const res = await fetch('/api/skills', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const backendData = await res.json();
      setData((prev) => ({
        ...prev,
        skillStates: backendData.skills || [],
      }));
    } catch (err) {
      console.warn('Could not sync skills with backend:', err);
    }
  }, [token]);

  const refreshPromotions = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch('/api/promotion/trials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const backendData = await res.json();
      setData((prev) => ({
        ...prev,
        promotionTrials: backendData.trials || [],
      }));
    } catch (err) {
      console.warn('Could not sync promotion trials with backend:', err);
    }
  }, [token]);

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
        skillStates: data.skillStates,
        refreshSkills,
        // Promotion trials
        promotionTrials: data.promotionTrials,
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
