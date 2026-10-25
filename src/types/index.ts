// ─── Player Types ────────────────────────────────────────────────

export type Rank =
  | 'E-Rank'
  | 'D-Rank'
  | 'C-Rank'
  | 'B-Rank'
  | 'A-Rank'
  | 'S-Rank'
  | 'National Level'
  | 'Monarch';

export interface Player {
  id: string;
  name: string;
  title: string;
  rank: Rank;
  level: number;
  xp: number;
  xpToNextLevel: number;
  avatar: string;
  joinedDate: string;
  streak: number;
  questsCompleted: number;
  skillsUnlocked: number;
  totalSkills: number;
  stats: PlayerStats;
}

export interface PlayerStats {
  strength: number;    // Problem-solving
  intelligence: number; // Algorithms
  agility: number;     // Speed / efficiency
  vitality: number;    // Consistency / streaks
  perception: number;  // Debugging
  endurance: number;   // Complex projects
}

// ─── Quest Types ─────────────────────────────────────────────────

export type QuestDifficulty = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type QuestStatus = 'locked' | 'available' | 'in-progress' | 'completed';
export type QuestCategory =
  | 'fundamentals'
  | 'data-structures'
  | 'algorithms'
  | 'web-dev'
  | 'databases'
  | 'system-design';

export interface Quest {
  id: string;
  title: string;
  description: string;
  category: QuestCategory;
  difficulty: QuestDifficulty;
  status: QuestStatus;
  xpReward: number;
  estimatedMinutes: number;
  objectives: string[];
  prerequisiteIds: string[];
  isDaily?: boolean;
}

// ─── Skill Types ─────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: QuestCategory;
  level: number;     // 0 = locked, 1-5 = proficiency
  maxLevel: number;
  prerequisiteIds: string[];
  position: { x: number; y: number }; // For tree layout
}

// ─── Leaderboard Types ───────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string;
  playerRank: Rank;
  level: number;
  xp: number;
  questsCompleted: number;
  avatar: string;
  isCurrentPlayer?: boolean;
}

// ─── Achievement Types ───────────────────────────────────────────

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  isUnlocked: boolean;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

// ─── Activity Types ──────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  message: string;
  timestamp: string;
  type: 'quest' | 'level-up' | 'achievement' | 'skill' | 'streak';
  icon: string;
}

// ─── Learning & Mastery Types ─────────────────────────────────────

export interface ConceptMastery {
  concept_id: string;
  mastery_level: number; // 0-5
  practice_count: number;
  first_completed_at?: string;
  last_practiced_at?: string;
}

export interface MasteryRecord {
  skill_id: string;
  level: number;
  updated_at: string;
}
