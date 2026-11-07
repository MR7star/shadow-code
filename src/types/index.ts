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
  guild?: {
    id: string;
    name: string;
    emblem: string;
    rank: Rank;
    role: GuildRole;
  } | null;
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

// ─── Achievement & Title Types ─────────────────────────────────────

export type AchievementCategory = 'all' | 'programming' | 'progression' | 'exploration' | 'consistency' | 'mastery';

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category?: string;
  icon: string;
  rarity: AchievementRarity;
  target?: number;
  xpReward?: number;
  titleReward?: string | null;
  isUnlocked: boolean;
  unlockedAt?: string | null;
  progress?: number;
  progressPercent?: number;
  remainingRequirement?: string;
}

export interface AchievementCategorySummary {
  id: string;
  name: string;
  total: number;
  unlocked: number;
  completionPercent: number;
}

export interface AchievementStats {
  total: number;
  unlockedCount: number;
  completionPercent: number;
  totalXpEarned: number;
  titlesUnlockedCount: number;
}

export interface UserTitle {
  id: string;
  title: string;
  source: string;
  unlockedAt: string;
  isEquipped: boolean;
}

export interface AchievementsResponse {
  achievements: Achievement[];
  categories: AchievementCategorySummary[];
  stats: AchievementStats;
  titles: UserTitle[];
  equippedTitle: string;
  newlyUnlocked: string[];
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

export type SkillState = 'locked' | 'available' | 'in-progress' | 'mastered';

export interface SkillWithState extends Skill {
  state: SkillState;
  unlockReason: string | null;
  conceptId?: string;
  conceptMasteryLevel?: number;
}

export interface PromotionTrial {
  id: string;
  fromRank: Rank;
  toRank: Rank;
  title: string;
  description: string;
  requiredLevel: number;
  requiredMasteredChallenges: string[];
  requiredConceptMastery: Record<string, number>;
  trialChallengeId: string;
  xpReward: number;
}

export interface RankPromotion {
  id: string;
  fromRank: string;
  toRank: string;
  challengeId: string;
  status: 'locked' | 'available' | 'in-progress' | 'completed' | 'failed';
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  results?: any;
}

export interface PromotionTrialEligibility extends PromotionTrial {
  status: RankPromotion['status'];
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  results?: any;
  eligible: boolean;
  lockReason?: string;
  levelMet: boolean;
  challengesMet: boolean;
  conceptsMet: boolean;
  currentLevel: number;
  currentRank: Rank;
}

// ─── Daily Quest Types ────────────────────────────────────────────

export type DailyMissionType = 'main_challenge' | 'practice_challenge' | 'concept_mastery';
export type DailyQuestStatus = 'available' | 'completed' | 'claimed';
export type ChestStatus = 'locked' | 'available' | 'claimed';

export interface DailyQuest {
  id: string;
  user_id: string;
  quest_date: string;
  mission_type: DailyMissionType;
  target_id: string;
  title: string;
  description: string;
  xp_reward: number;
  progress: number;
  target_progress: number;
  status: DailyQuestStatus;
  created_at: string;
  completed_at?: string;
}

export interface RewardChest {
  id: string;
  user_id: string;
  quest_date: string;
  total_xp_reward: number;
  status: ChestStatus;
  claimed_at?: string;
  created_at: string;
}

export interface StreakData {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date?: string;
  updated_at: string;
}

export interface DailyQuestData {
  quests: DailyQuest[];
  chest: RewardChest;
  streak: StreakData;
  date: string;
}

// ─── Dungeon Types ────────────────────────────────────────────

export type DungeonStatus = 'locked' | 'available' | 'in-progress' | 'completed';
export type DungeonChallengeStatus = 'locked' | 'available' | 'completed';

export interface DungeonChallenge {
  id: string;
  order: number;
  isRequired: boolean;
  isBoss: boolean;
  stageTitle: string;
  stageLore: string;
  title: string;
  xpReward: number;
  functionName: string;
  conceptId: string | null;
  sampleTests: any[];
  status: DungeonChallengeStatus;
  attempts: number;
  bestPassedCount: number;
  bestTotalCount: number;
  completedAt: string | null;
}

export interface Dungeon {
  id: string;
  name: string;
  description: string;
  theme: string;
  difficulty: QuestDifficulty;
  requiredRank: Rank;
  requiredChallenges: string[];
  lore: string;
  xpReward: number;
  bonusTitle: string;
  status: DungeonStatus;
  isAccessible: boolean;
  lockReason: string | null;
  challenges: DungeonChallenge[];
  bossId: string | null;
  bossStatus: DungeonChallengeStatus;
  bossAttempts: number;
  completedRequired: number;
  totalRequired: number;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DungeonSubmitResult {
  success: boolean;
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  results: any[];
  stdout?: string;
  error?: string | null;
  errorType?: string | null;
  durationMs?: number;
  isSubmission: boolean;
  xpReward: number;
  isDuplicate?: boolean;
  dungeonComplete?: boolean;
  dungeonXpAwarded?: number;
  nextUnlocked?: string | null;
  isBoss?: boolean;
  bonusTitle?: string | null;
  dungeon?: Dungeon;
  player?: any;
}

// ─── Guild Types ─────────────────────────────────────────────────

export type GuildRole = 'leader' | 'officer' | 'member';

export type GuildRank = Rank;

export type GuildQuestType =
  | 'challenges_completed'
  | 'xp_earned'
  | 'concepts_mastered'
  | 'dungeons_completed';

export type GuildQuestStatus = 'in-progress' | 'completed' | 'claimed';

export interface GuildMember {
  userId: string;
  name: string;
  rank: Rank;
  level: number;
  title: string;
  role: GuildRole;
  contributedXp: number;
  weeklyContributedXp: number;
  joinedAt: string;
}

export interface GuildQuest {
  id: string;
  questKey: string;
  questType: GuildQuestType;
  title: string;
  description: string;
  targetValue: number;
  currentValue: number;
  progressPercent: number;
  xpReward: number;
  status: GuildQuestStatus;
  userContribution?: number;
  completedAt?: string | null;
  claimedAt?: string | null;
}

export interface GuildAchievement {
  id: string;
  achievementKey: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string;
}

export interface GuildSummary {
  id: string;
  name: string;
  description: string;
  emblem: string;
  rank: Rank;
  level: number;
  totalXp: number;
  weeklyXp: number;
  memberCount: number;
  maxMembers: number;
  leaderId?: string;
  leaderName?: string;
  leaderRank?: Rank;
  createdAt: string;
}

export interface GuildInvite {
  inviteId: string;
  guild_id: string;
  guildName: string;
  guildEmblem: string;
  guildRank: Rank;
  guildLevel: number;
  memberCount: number;
  maxMembers: number;
  inviterName: string;
  created_at: string;
}

export interface UserGuildContext {
  isMember: boolean;
  role: GuildRole | null;
  isLeader: boolean;
  isOfficer: boolean;
  hasPendingInvite: boolean;
  hasPendingRequest: boolean;
}

export interface GuildDetailsResponse {
  guild: GuildSummary;
  members: GuildMember[];
  quests: GuildQuest[];
  achievements: GuildAchievement[];
  userContext: UserGuildContext;
}

export interface UserGuildProfileResponse {
  inGuild: boolean;
  guild: GuildSummary | null;
  membership: {
    role: GuildRole;
    contributedXp: number;
    weeklyContributedXp: number;
    joinedAt: string;
  } | null;
  details?: GuildDetailsResponse | null;
  pendingInvites: GuildInvite[];
}

export interface GuildsListResponse {
  guilds: GuildSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Competitive Leaderboard Types ───────────────────────────────

export type LeaderboardCategory = 'players' | 'weekly' | 'guilds' | 'contributions';

export interface GuildLeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  description: string;
  emblem: string;
  guildRank: Rank;
  level: number;
  totalXp: number;
  weeklyXp: number;
  memberCount: number;
  maxMembers: number;
  leaderName: string;
}

export interface WeeklyLeaderboardEntry extends LeaderboardEntry {
  weeklyXp: number;
  guildName?: string | null;
  guildEmblem?: string | null;
}

export interface ContributionLeaderboardEntry extends LeaderboardEntry {
  role: GuildRole;
  contributedXp: number;
  weeklyContributedXp: number;
  guildId: string;
  guildName: string;
  guildEmblem: string;
}

export interface CompetitiveLeaderboardResponse {
  type: LeaderboardCategory;
  entries: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
