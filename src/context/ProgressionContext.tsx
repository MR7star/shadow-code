import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Player, Quest, Skill, ActivityEntry, ConceptMastery } from '../types';
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

export interface ProgressionContextValue {
  player: Player;
  quests: Quest[];
  skills: Skill[];
  recentActivity: ActivityEntry[];
  claimedRewardIds: string[];
  conceptMastery: ConceptMastery[];
  isSyncing: boolean;
  startQuest: (questId: string) => boolean;
  completeQuest: (questId: string) => CompletionResult;
  applyServerAward: (questId: string, award: ServerAwardPayload) => void;
  refreshProgress: () => Promise<void>;
  resetProgress: () => void;
  isQuestClaimed: (questId: string) => boolean;
  lastLevelUp: { level: number; rank: string; timestamp: number } | null;
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
}

const ProgressionContext = createContext<ProgressionContextValue | null>(null);

function createPreviewData(): StoredProgressionData {
  const initialClaimed = defaultQuests
    .filter((q) => q.status === 'completed')
    .map((q) => q.id);

  return {
    player: defaultPlayer,
    quests: defaultQuests,
    skills: defaultSkills,
    recentActivity: defaultActivity,
    claimedRewardIds: initialClaimed,
    conceptMastery: [],
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
        startQuest,
        completeQuest,
        applyServerAward,
        refreshProgress,
        resetProgress,
        isQuestClaimed,
        lastLevelUp,
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
