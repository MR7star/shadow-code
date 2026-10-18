import type { Quest, Skill, Rank, ActivityEntry } from '../types';

export interface RankThreshold {
  rank: Rank;
  minLevel: number;
  title: string;
}

// Configurable rank thresholds based on player level
export const RANK_THRESHOLDS: RankThreshold[] = [
  { rank: 'E-Rank', minLevel: 1, title: 'Novice Hunter' },
  { rank: 'D-Rank', minLevel: 10, title: 'Apprentice Coder' },
  { rank: 'C-Rank', minLevel: 20, title: 'Skilled Developer' },
  { rank: 'B-Rank', minLevel: 35, title: 'Elite Engineer' },
  { rank: 'A-Rank', minLevel: 50, title: 'Master Architect' },
  { rank: 'S-Rank', minLevel: 70, title: 'Shadow General' },
  { rank: 'National Level', minLevel: 90, title: 'National Level Hunter' },
  { rank: 'Monarch', minLevel: 100, title: 'Shadow Monarch' },
];

/**
 * Returns the appropriate rank and title based on the player's level.
 */
export function getRankAndTitleForLevel(level: number, thresholds = RANK_THRESHOLDS): { rank: Rank; title: string } {
  let matched = thresholds[0];
  for (const t of thresholds) {
    if (level >= t.minLevel) {
      matched = t;
    } else {
      break;
    }
  }
  return { rank: matched.rank, title: matched.title };
}

/**
 * Calculates XP required to advance from the given level to the next.
 * Smoothly scales upwards so leveling feels rewarding.
 */
export function getXpRequiredForLevel(level: number): number {
  return Math.round(1500 + level * 150 + Math.pow(level, 1.4) * 20);
}

export interface ProgressionResult {
  newLevel: number;
  newXp: number;
  newXpToNextLevel: number;
  newRank: Rank;
  newTitle: string;
  levelsGained: number;
  rankChanged: boolean;
}

/**
 * Adds XP to the player and handles multi-level ups and rank changes.
 */
export function calculateXpGain(
  currentLevel: number,
  currentXp: number,
  currentXpToNextLevel: number,
  xpToAdd: number,
  thresholds = RANK_THRESHOLDS
): ProgressionResult {
  let level = currentLevel;
  let xp = currentXp + xpToAdd;
  let xpNeeded = currentXpToNextLevel;
  let levelsGained = 0;

  while (xp >= xpNeeded) {
    xp -= xpNeeded;
    level += 1;
    levelsGained += 1;
    xpNeeded = getXpRequiredForLevel(level);
  }

  const { rank: newRank, title: newTitle } = getRankAndTitleForLevel(level, thresholds);
  const currentRankInfo = getRankAndTitleForLevel(currentLevel, thresholds);
  const rankChanged = newRank !== currentRankInfo.rank;

  return {
    newLevel: level,
    newXp: xp,
    newXpToNextLevel: xpNeeded,
    newRank,
    newTitle,
    levelsGained,
    rankChanged,
  };
}

/**
 * Checks whether all prerequisites for a quest are completed.
 */
export function arePrerequisitesMet(quest: Quest, allQuests: Quest[]): boolean {
  if (!quest.prerequisiteIds || quest.prerequisiteIds.length === 0) {
    return true;
  }
  return quest.prerequisiteIds.every((prereqId) => {
    const prereqQuest = allQuests.find((q) => q.id === prereqId);
    return prereqQuest && prereqQuest.status === 'completed';
  });
}

/**
 * Updates quest statuses after a quest has been marked completed.
 * Any locked quests whose prerequisites are now satisfied become available.
 */
export function updateQuestsOnCompletion(completedQuestId: string, currentQuests: Quest[]): Quest[] {
  // First, mark the target quest as completed
  const updated = currentQuests.map((q) => {
    if (q.id === completedQuestId) {
      return { ...q, status: 'completed' as const };
    }
    return q;
  });

  // Then, unlock any locked quests whose prerequisites are now all met
  return updated.map((q) => {
    if (q.status === 'locked' && arePrerequisitesMet(q, updated)) {
      return { ...q, status: 'available' as const };
    }
    return q;
  });
}

/**
 * Map quest categories or IDs to skill upgrades/unlocks.
 * Completing a quest improves or unlocks corresponding skills in the skill tree.
 */
export function updateSkillsOnQuestCompletion(
  completedQuest: Quest,
  currentSkills: Skill[]
): Skill[] {
  return currentSkills.map((skill) => {
    // If the skill matches the quest category or is directly linked
    const matchesCategory = skill.category === completedQuest.category;
    
    if (matchesCategory) {
      // Check if prerequisites for this skill are satisfied
      const prereqsMet =
        skill.prerequisiteIds.length === 0 ||
        skill.prerequisiteIds.every((pid) => {
          const parent = currentSkills.find((s) => s.id === pid);
          return parent && parent.level > 0;
        });

      if (prereqsMet) {
        // Unlock if currently locked (level 0 -> 1) or give a minor progression if under max
        if (skill.level === 0) {
          return { ...skill, level: 1 };
        }
      }
    }
    return skill;
  });
}

/**
 * Create a new ActivityEntry for a quest completion.
 */
export function createQuestActivity(quest: Quest, xpAwarded: number): ActivityEntry {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    message: `Completed "${quest.title}" (+${xpAwarded} XP)`,
    timestamp: new Date().toISOString(),
    type: 'quest',
    icon: '⚔️',
  };
}

/**
 * Create a new ActivityEntry for a level-up event.
 */
export function createLevelUpActivity(level: number, rank: Rank): ActivityEntry {
  return {
    id: `act-lvl-${Date.now()}`,
    message: `Reached Hunter Level ${level}! Rank: ${rank}`,
    timestamp: new Date().toISOString(),
    type: 'level-up',
    icon: '⚡',
  };
}
