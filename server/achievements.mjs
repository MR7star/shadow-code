/**
 * Shadow Code — Achievements & Hunter Collection System
 *
 * Defines server-authoritative achievements across 5 categories:
 *  - Programming
 *  - Progression
 *  - Exploration
 *  - Consistency
 *  - Mastery
 *
 * Manages player title unlocks, title equipping/unequipping,
 * and idempotent single-winner reward allocation.
 */

import crypto from 'node:crypto';
import { db } from './db.mjs';
import { awardQuestCompletionAtomic } from './auth.mjs';

// ─── Database Initialization ────────────────────────────────────────────────

export function initAchievementTables() {
  db.exec(`
    -- Player unlocked titles
    CREATE TABLE IF NOT EXISTS user_titles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, title)
    );

    -- Player unlocked achievements
    CREATE TABLE IF NOT EXISTS user_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      reward_claimed INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, achievement_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_titles_user ON user_titles(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
  `);
}

// ─── Achievement Catalog ────────────────────────────────────────────────────

export const ACHIEVEMENT_DEFINITIONS = [
  // ─── Programming ───────────────────────────────────────────────────────────
  {
    id: 'ach_first_spell',
    name: 'First Spell',
    description: 'Complete your first programming challenge.',
    category: 'programming',
    icon: '🪄',
    rarity: 'common',
    target: 1,
    xpReward: 100,
    titleReward: 'Initiate',
    check: (stats) => ({
      progress: Math.min(1, stats.challengesMasteredCount),
      isUnlocked: stats.challengesMasteredCount >= 1,
      remainingRequirement: stats.challengesMasteredCount >= 1 ? 'Completed' : 'Master 1 challenge',
    }),
  },
  {
    id: 'ach_code_weaver',
    name: 'Code Weaver',
    description: 'Master 5 distinct programming challenges.',
    category: 'programming',
    icon: '📜',
    rarity: 'rare',
    target: 5,
    xpReward: 250,
    titleReward: 'Script Weaver',
    check: (stats) => ({
      progress: Math.min(5, stats.challengesMasteredCount),
      isUnlocked: stats.challengesMasteredCount >= 5,
      remainingRequirement: stats.challengesMasteredCount >= 5
        ? 'Completed'
        : `Master ${5 - stats.challengesMasteredCount} more challenge${5 - stats.challengesMasteredCount > 1 ? 's' : ''}`,
    }),
  },
  {
    id: 'ach_tenacious_coder',
    name: 'Tenacious Coder',
    description: 'Master 10 distinct programming challenges.',
    category: 'programming',
    icon: '⚡',
    rarity: 'epic',
    target: 10,
    xpReward: 500,
    titleReward: 'Spell Architect',
    check: (stats) => ({
      progress: Math.min(10, stats.challengesMasteredCount),
      isUnlocked: stats.challengesMasteredCount >= 10,
      remainingRequirement: stats.challengesMasteredCount >= 10
        ? 'Completed'
        : `Master ${10 - stats.challengesMasteredCount} more challenges`,
    }),
  },
  {
    id: 'ach_concept_master',
    name: 'Deep Understanding',
    description: 'Reach maximum mastery (Level 5) in any programming concept.',
    category: 'programming',
    icon: '🧠',
    rarity: 'rare',
    target: 1,
    xpReward: 300,
    titleReward: 'The Mind',
    check: (stats) => ({
      progress: stats.maxConceptMasteryLevel >= 5 ? 1 : 0,
      isUnlocked: stats.maxConceptMasteryLevel >= 5,
      remainingRequirement: stats.maxConceptMasteryLevel >= 5
        ? 'Completed'
        : `Raise any concept to Level 5 (Current highest: Lv.${stats.maxConceptMasteryLevel})`,
    }),
  },
  {
    id: 'ach_omni_caster',
    name: 'Omni-Caster',
    description: 'Master at least 3 distinct concepts to Level 3 or higher.',
    category: 'programming',
    icon: '🔮',
    rarity: 'epic',
    target: 3,
    xpReward: 400,
    titleReward: 'Grand Arcanist',
    check: (stats) => ({
      progress: Math.min(3, stats.conceptsAtLevel3PlusCount),
      isUnlocked: stats.conceptsAtLevel3PlusCount >= 3,
      remainingRequirement: stats.conceptsAtLevel3PlusCount >= 3
        ? 'Completed'
        : `Raise ${3 - stats.conceptsAtLevel3PlusCount} more concepts to Level 3+`,
    }),
  },

  // ─── Progression ───────────────────────────────────────────────────────────
  {
    id: 'ach_level_5',
    name: 'Awakened Hunter',
    description: 'Reach Level 5 as a shadow hunter.',
    category: 'progression',
    icon: '🌱',
    rarity: 'common',
    target: 5,
    xpReward: 150,
    titleReward: 'Awakened',
    check: (stats) => ({
      progress: Math.min(5, stats.playerLevel),
      isUnlocked: stats.playerLevel >= 5,
      remainingRequirement: stats.playerLevel >= 5
        ? 'Completed'
        : `Reach Level 5 (Current: Lv.${stats.playerLevel})`,
    }),
  },
  {
    id: 'ach_level_10',
    name: 'Vanguard of Shadows',
    description: 'Reach Level 10 through relentless training.',
    category: 'progression',
    icon: '🛡️',
    rarity: 'rare',
    target: 10,
    xpReward: 300,
    titleReward: 'Vanguard',
    check: (stats) => ({
      progress: Math.min(10, stats.playerLevel),
      isUnlocked: stats.playerLevel >= 10,
      remainingRequirement: stats.playerLevel >= 10
        ? 'Completed'
        : `Reach Level 10 (Current: Lv.${stats.playerLevel})`,
    }),
  },
  {
    id: 'ach_rank_d',
    name: 'Breaking the Mold',
    description: 'Advance to D-Rank or higher.',
    category: 'progression',
    icon: '🗡️',
    rarity: 'common',
    target: 1,
    xpReward: 200,
    titleReward: 'Rank Breaker',
    check: (stats) => {
      const RANK_ORDER = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank', 'National Level', 'Monarch'];
      const currentIdx = RANK_ORDER.indexOf(stats.playerRank);
      const targetIdx = RANK_ORDER.indexOf('D-Rank');
      const isUnlocked = currentIdx >= targetIdx;
      return {
        progress: isUnlocked ? 1 : 0,
        isUnlocked,
        remainingRequirement: isUnlocked ? 'Completed' : 'Promote to D-Rank',
      };
    },
  },
  {
    id: 'ach_rank_c',
    name: 'Ascending Shadows',
    description: 'Advance to C-Rank or higher.',
    category: 'progression',
    icon: '⚔️',
    rarity: 'rare',
    target: 1,
    xpReward: 450,
    titleReward: 'Shadow Ascendant',
    check: (stats) => {
      const RANK_ORDER = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank', 'National Level', 'Monarch'];
      const currentIdx = RANK_ORDER.indexOf(stats.playerRank);
      const targetIdx = RANK_ORDER.indexOf('C-Rank');
      const isUnlocked = currentIdx >= targetIdx;
      return {
        progress: isUnlocked ? 1 : 0,
        isUnlocked,
        remainingRequirement: isUnlocked ? 'Completed' : 'Promote to C-Rank',
      };
    },
  },

  // ─── Exploration ───────────────────────────────────────────────────────────
  {
    id: 'ach_gate_explorer',
    name: 'Into the Shadows',
    description: 'Enter your first Programming Dungeon.',
    category: 'exploration',
    icon: '⛩️',
    rarity: 'common',
    target: 1,
    xpReward: 150,
    titleReward: 'Gatewalker',
    check: (stats) => ({
      progress: Math.min(1, stats.dungeonsStartedCount),
      isUnlocked: stats.dungeonsStartedCount >= 1,
      remainingRequirement: stats.dungeonsStartedCount >= 1 ? 'Completed' : 'Enter any Programming Dungeon',
    }),
  },
  {
    id: 'ach_first_boss',
    name: 'Giant Slayer',
    description: 'Defeat a Dungeon Boss encounter in combat.',
    category: 'exploration',
    icon: '💀',
    rarity: 'rare',
    target: 1,
    xpReward: 350,
    titleReward: 'Slayer of Giants',
    check: (stats) => ({
      progress: Math.min(1, stats.bossesDefeatedCount),
      isUnlocked: stats.bossesDefeatedCount >= 1,
      remainingRequirement: stats.bossesDefeatedCount >= 1 ? 'Completed' : 'Defeat 1 Dungeon Boss',
    }),
  },
  {
    id: 'ach_awakening_gate',
    name: 'Master of the First Gate',
    description: 'Completely clear The Awakening Gate dungeon.',
    category: 'exploration',
    icon: '🏰',
    rarity: 'rare',
    target: 1,
    xpReward: 300,
    titleReward: 'Gate Conqueror',
    check: (stats) => ({
      progress: stats.clearedAwakeningGate ? 1 : 0,
      isUnlocked: stats.clearedAwakeningGate,
      remainingRequirement: stats.clearedAwakeningGate ? 'Completed' : 'Clear The Awakening Gate',
    }),
  },
  {
    id: 'ach_dungeon_master',
    name: 'Dungeon Dominator',
    description: 'Conquer all required encounters in at least 2 dungeons.',
    category: 'exploration',
    icon: '👑',
    rarity: 'legendary',
    target: 2,
    xpReward: 600,
    titleReward: 'Dungeon Master',
    check: (stats) => ({
      progress: Math.min(2, stats.dungeonsCompletedCount),
      isUnlocked: stats.dungeonsCompletedCount >= 2,
      remainingRequirement: stats.dungeonsCompletedCount >= 2
        ? 'Completed'
        : `Complete ${2 - stats.dungeonsCompletedCount} more dungeon${2 - stats.dungeonsCompletedCount > 1 ? 's' : ''}`,
    }),
  },

  // ─── Consistency ───────────────────────────────────────────────────────────
  {
    id: 'ach_streak_3',
    name: 'Unyielding Will',
    description: 'Maintain a learning streak of at least 3 days.',
    category: 'consistency',
    icon: '🔥',
    rarity: 'common',
    target: 3,
    xpReward: 200,
    titleReward: 'Resolute',
    check: (stats) => ({
      progress: Math.min(3, stats.longestStreak),
      isUnlocked: stats.longestStreak >= 3,
      remainingRequirement: stats.longestStreak >= 3
        ? 'Completed'
        : `Reach a 3-day streak (Current: ${stats.currentStreak}d)`,
    }),
  },
  {
    id: 'ach_streak_7',
    name: 'Iron Discipline',
    description: 'Maintain a learning streak of at least 7 days.',
    category: 'consistency',
    icon: '⚡',
    rarity: 'rare',
    target: 7,
    xpReward: 450,
    titleReward: 'The Diligent',
    check: (stats) => ({
      progress: Math.min(7, stats.longestStreak),
      isUnlocked: stats.longestStreak >= 7,
      remainingRequirement: stats.longestStreak >= 7
        ? 'Completed'
        : `Reach a 7-day streak (Current: ${stats.currentStreak}d)`,
    }),
  },
  {
    id: 'ach_daily_bounty',
    name: "Hunter's Bounty",
    description: 'Claim a Daily Reward Chest.',
    category: 'consistency',
    icon: '🎁',
    rarity: 'common',
    target: 1,
    xpReward: 150,
    titleReward: 'Bounty Seeker',
    check: (stats) => ({
      progress: Math.min(1, stats.dailyChestsClaimedCount),
      isUnlocked: stats.dailyChestsClaimedCount >= 1,
      remainingRequirement: stats.dailyChestsClaimedCount >= 1 ? 'Completed' : 'Claim 1 Daily Reward Chest',
    }),
  },

  // ─── Mastery ───────────────────────────────────────────────────────────────
  {
    id: 'ach_first_skill',
    name: 'The Spark',
    description: 'Unlock your first node on the Skill Tree.',
    category: 'mastery',
    icon: '🌟',
    rarity: 'common',
    target: 1,
    xpReward: 100,
    titleReward: 'Adept',
    check: (stats) => ({
      progress: Math.min(1, stats.skillsUnlockedCount),
      isUnlocked: stats.skillsUnlockedCount >= 1,
      remainingRequirement: stats.skillsUnlockedCount >= 1 ? 'Completed' : 'Unlock 1 skill node',
    }),
  },
  {
    id: 'ach_skill_collector',
    name: 'Arsenal Expansion',
    description: 'Unlock 5 distinct skills across the Skill Tree.',
    category: 'mastery',
    icon: '🗝️',
    rarity: 'rare',
    target: 5,
    xpReward: 300,
    titleReward: 'Polymath',
    check: (stats) => ({
      progress: Math.min(5, stats.skillsUnlockedCount),
      isUnlocked: stats.skillsUnlockedCount >= 5,
      remainingRequirement: stats.skillsUnlockedCount >= 5
        ? 'Completed'
        : `Unlock ${5 - stats.skillsUnlockedCount} more skill${5 - stats.skillsUnlockedCount > 1 ? 's' : ''}`,
    }),
  },
  {
    id: 'ach_promotion_trial',
    name: 'Tested in Combat',
    description: 'Successfully conquer a Rank Promotion Trial.',
    category: 'mastery',
    icon: '🏆',
    rarity: 'rare',
    target: 1,
    xpReward: 250,
    titleReward: 'The Tested',
    check: (stats) => ({
      progress: Math.min(1, stats.promotionsCompletedCount),
      isUnlocked: stats.promotionsCompletedCount >= 1,
      remainingRequirement: stats.promotionsCompletedCount >= 1 ? 'Completed' : 'Pass 1 Rank Promotion Trial',
    }),
  },
  {
    id: 'ach_grandmaster',
    name: 'Grandmaster of Code',
    description: 'Unlock 10 distinct skills across the Skill Tree.',
    category: 'mastery',
    icon: '👑',
    rarity: 'legendary',
    target: 10,
    xpReward: 600,
    titleReward: 'Grandmaster',
    check: (stats) => ({
      progress: Math.min(10, stats.skillsUnlockedCount),
      isUnlocked: stats.skillsUnlockedCount >= 10,
      remainingRequirement: stats.skillsUnlockedCount >= 10
        ? 'Completed'
        : `Unlock ${10 - stats.skillsUnlockedCount} more skills`,
    }),
  },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(
  ACHIEVEMENT_DEFINITIONS.map((a) => [a.id, a])
);

// ─── Player Stats Aggregator ────────────────────────────────────────────────

/**
 * Collects authoritative progression metrics for a user from database tables.
 */
export function getPlayerAchievementStats(userId) {
  // Profiles
  const profile = db.prepare('SELECT rank, level, xp, title, streak, quests_completed, skills_unlocked FROM profiles WHERE user_id = ?').get(userId);
  const playerRank = profile ? profile.rank : 'E-Rank';
  const playerLevel = profile ? profile.level : 1;
  const playerXp = profile ? profile.xp : 0;
  const equippedTitle = profile ? profile.title : 'Novice Hunter';

  // Challenge mastery
  const cmRow = db.prepare('SELECT COUNT(*) as c FROM challenge_mastery WHERE user_id = ?').get(userId);
  const challengesMasteredCount = cmRow ? cmRow.c : 0;

  // Concept mastery
  const maxConceptRow = db.prepare('SELECT COALESCE(MAX(mastery_level), 0) as m FROM concept_mastery WHERE user_id = ?').get(userId);
  const maxConceptMasteryLevel = maxConceptRow ? maxConceptRow.m : 0;

  const lvl3ConceptsRow = db.prepare('SELECT COUNT(*) as c FROM concept_mastery WHERE user_id = ? AND mastery_level >= 3').get(userId);
  const conceptsAtLevel3PlusCount = lvl3ConceptsRow ? lvl3ConceptsRow.c : 0;

  // Dungeons
  let dungeonsStartedCount = 0;
  let dungeonsCompletedCount = 0;
  let clearedAwakeningGate = false;
  let bossesDefeatedCount = 0;

  try {
    const dStartRow = db.prepare('SELECT COUNT(*) as c FROM dungeon_progress WHERE user_id = ?').get(userId);
    dungeonsStartedCount = dStartRow ? dStartRow.c : 0;

    const dCompRow = db.prepare("SELECT COUNT(*) as c FROM dungeon_progress WHERE user_id = ? AND status = 'completed'").get(userId);
    dungeonsCompletedCount = dCompRow ? dCompRow.c : 0;

    const dGateRow = db.prepare("SELECT 1 FROM dungeon_progress WHERE user_id = ? AND dungeon_id = 'dungeon-001' AND status = 'completed'").get(userId);
    clearedAwakeningGate = !!dGateRow;

    const bossRow = db.prepare("SELECT COUNT(*) as c FROM dungeon_challenge_progress WHERE user_id = ? AND challenge_id IN ('py-03', 'py-06', 'py-10') AND status = 'completed'").get(userId);
    bossesDefeatedCount = Math.max(bossRow ? bossRow.c : 0, dungeonsCompletedCount);
  } catch {}

  // Streaks
  let currentStreak = profile ? profile.streak : 0;
  let longestStreak = currentStreak;
  try {
    const streakRow = db.prepare('SELECT current_streak, longest_streak FROM streak_data WHERE user_id = ?').get(userId);
    if (streakRow) {
      currentStreak = Math.max(currentStreak, streakRow.current_streak);
      longestStreak = Math.max(longestStreak, streakRow.longest_streak);
    }
  } catch {}

  // Daily chests
  let dailyChestsClaimedCount = 0;
  try {
    const chestRow = db.prepare("SELECT COUNT(*) as c FROM reward_chests WHERE user_id = ? AND status = 'claimed'").get(userId);
    dailyChestsClaimedCount = chestRow ? chestRow.c : 0;
  } catch {}

  // Mastery skills
  const skillsRow = db.prepare('SELECT COUNT(*) as c FROM mastery_records WHERE user_id = ? AND level > 0').get(userId);
  const skillsUnlockedCount = skillsRow ? skillsRow.c : 0;

  // Promotion trials
  const promoRow = db.prepare("SELECT COUNT(*) as c FROM rank_promotions WHERE user_id = ? AND status = 'completed'").get(userId);
  let promotionsCompletedCount = promoRow ? promoRow.c : 0;
  const RANK_ORDER = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank', 'National Level', 'Monarch'];
  const rankIndex = RANK_ORDER.indexOf(playerRank);
  if (rankIndex > 0 && promotionsCompletedCount < rankIndex) {
    promotionsCompletedCount = rankIndex;
  }

  return {
    playerRank,
    playerLevel,
    playerXp,
    equippedTitle,
    challengesMasteredCount,
    maxConceptMasteryLevel,
    conceptsAtLevel3PlusCount,
    dungeonsStartedCount,
    dungeonsCompletedCount,
    clearedAwakeningGate,
    bossesDefeatedCount,
    currentStreak,
    longestStreak,
    dailyChestsClaimedCount,
    skillsUnlockedCount,
    promotionsCompletedCount,
  };
}

// ─── Titles API ─────────────────────────────────────────────────────────────

/**
 * Ensures a user has the default "Novice Hunter" title unlocked.
 */
export function ensureDefaultTitle(userId) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO user_titles (id, user_id, title, source, unlocked_at, created_at)
    VALUES (?, ?, 'Novice Hunter', 'initial', ?, ?)
  `).run(`ut_${userId}_novice_hunter`, userId, now, now);
}

/**
 * Unlocks a specific title for a user.
 * Idempotent.
 */
export function unlockUserTitle(userId, title, source = 'achievement') {
  if (!title || typeof title !== 'string') return;
  const now = new Date().toISOString();
  ensureDefaultTitle(userId);
  const sanitized = title.trim();
  const id = `ut_${userId}_${sanitized.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

  db.prepare(`
    INSERT OR IGNORE INTO user_titles (id, user_id, title, source, unlocked_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, sanitized, source, now, now);
}

/**
 * Returns all unlocked titles for a user with equipped status.
 */
export function getUserTitles(userId) {
  ensureDefaultTitle(userId);

  // Auto-backfill titles earned from previous milestone progress if missing
  backfillEarnedTitles(userId);

  const profile = db.prepare('SELECT title FROM profiles WHERE user_id = ?').get(userId);
  const equippedTitle = profile ? profile.title : 'Novice Hunter';

  const rows = db.prepare(`
    SELECT id, title, source, unlocked_at
    FROM user_titles
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId);

  return {
    titles: rows.map((r) => ({
      id: r.id,
      title: r.title,
      source: r.source,
      unlockedAt: r.unlocked_at,
      isEquipped: r.title === equippedTitle,
    })),
    equippedTitle,
  };
}

/**
 * Equips an owned title. Rejects if not owned.
 */
export function equipTitle(userId, title) {
  if (!title || typeof title !== 'string') {
    return { success: false, error: 'Invalid title.' };
  }
  const cleanTitle = title.trim();

  ensureDefaultTitle(userId);
  backfillEarnedTitles(userId);

  const owned = db.prepare(
    'SELECT 1 FROM user_titles WHERE user_id = ? AND title = ?'
  ).get(userId, cleanTitle);

  if (!owned) {
    return { success: false, error: 'You do not own this title.' };
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE profiles SET title = ?, updated_at = ? WHERE user_id = ?').run(
    cleanTitle,
    now,
    userId
  );

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  return { success: true, title: cleanTitle, profile };
}

/**
 * Unequips current title and resets to "Novice Hunter".
 */
export function unequipTitle(userId) {
  return equipTitle(userId, 'Novice Hunter');
}

/**
 * Retrofits / backfills titles earned from promotions, rank, or dungeon completes
 * so existing accounts immediately have their deserved titles in user_titles.
 */
function backfillEarnedTitles(userId) {
  const profile = db.prepare('SELECT rank, title FROM profiles WHERE user_id = ?').get(userId);
  if (!profile) return;

  const RANK_TITLES = {
    'E-Rank': 'Novice Hunter',
    'D-Rank': 'Apprentice Coder',
    'C-Rank': 'Skilled Developer',
    'B-Rank': 'Elite Engineer',
    'A-Rank': 'Master Architect',
    'S-Rank': 'Shadow General',
    'National Level': 'National Level Hunter',
    'Monarch': 'Shadow Monarch',
  };

  const RANK_ORDER = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank', 'National Level', 'Monarch'];
  const userRankIdx = RANK_ORDER.indexOf(profile.rank);

  // Unlock all rank titles up to current rank
  for (let i = 0; i <= userRankIdx; i++) {
    const r = RANK_ORDER[i];
    if (RANK_TITLES[r]) {
      unlockUserTitle(userId, RANK_TITLES[r], 'rank');
    }
  }

  // Backfill dungeon titles if completed
  try {
    const d1 = db.prepare("SELECT status FROM dungeon_progress WHERE user_id = ? AND dungeon_id = 'dungeon-001'").get(userId);
    if (d1 && d1.status === 'completed') unlockUserTitle(userId, 'Gate Clearer', 'dungeon');

    const d2 = db.prepare("SELECT status FROM dungeon_progress WHERE user_id = ? AND dungeon_id = 'dungeon-002'").get(userId);
    if (d2 && d2.status === 'completed') unlockUserTitle(userId, 'Barracks Conqueror', 'dungeon');

    const d3 = db.prepare("SELECT status FROM dungeon_progress WHERE user_id = ? AND dungeon_id = 'dungeon-003'").get(userId);
    if (d3 && d3.status === 'completed') unlockUserTitle(userId, 'Abyss Vanquisher', 'dungeon');
  } catch {}

  // If user has a current profile.title, make sure it's in user_titles
  if (profile.title) {
    unlockUserTitle(userId, profile.title, 'legacy');
  }
}

// ─── Achievements Evaluation & Claiming ──────────────────────────────────────

/**
 * Checks all achievement conditions against the player's current authoritative stats.
 * Automatically unlocks any newly completed achievements, awards XP, and grants titles.
 * Fully idempotent under repeated and concurrent calls.
 */
export function checkAndUnlockAchievements(userId) {
  ensureDefaultTitle(userId);
  backfillEarnedTitles(userId);

  const stats = getPlayerAchievementStats(userId);
  const now = new Date().toISOString();

  // Load existing unlocked achievements
  const existingRows = db.prepare(`
    SELECT achievement_id, unlocked_at, xp_awarded
    FROM user_achievements
    WHERE user_id = ?
  `).all(userId);

  const unlockedMap = Object.fromEntries(
    existingRows.map((r) => [r.achievement_id, r])
  );

  const newlyUnlocked = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const checkResult = def.check(stats);
    const wasUnlocked = !!unlockedMap[def.id];

    if (checkResult.isUnlocked && !wasUnlocked) {
      // Atomic insert guard
      db.exec('BEGIN IMMEDIATE');
      try {
        const id = `uach_${userId}_${def.id}`;
        const insertRes = db.prepare(`
          INSERT OR IGNORE INTO user_achievements
            (id, user_id, achievement_id, unlocked_at, xp_awarded, reward_claimed, created_at)
          VALUES (?, ?, ?, ?, ?, 1, ?)
        `).run(id, userId, def.id, now, def.xpReward, now);

        const wonRace = insertRes.changes > 0;
        db.exec('COMMIT');

        if (wonRace) {
          // Award XP through canonical path (awardQuestCompletionAtomic has its own transaction)
          if (def.xpReward > 0) {
            awardQuestCompletionAtomic(userId, `ach_${def.id}`, def.xpReward);
          }

          // Award title if specified
          if (def.titleReward) {
            unlockUserTitle(userId, def.titleReward, 'achievement');
          }

          unlockedMap[def.id] = {
            achievement_id: def.id,
            unlocked_at: now,
            xp_awarded: def.xpReward,
          };
          newlyUnlocked.push(def.id);
        }
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch {}
      }
    }
  }

  // Re-read updated unlocked list
  const currentUnlockedRows = db.prepare(`
    SELECT achievement_id, unlocked_at, xp_awarded
    FROM user_achievements
    WHERE user_id = ?
  `).all(userId);
  const currentUnlockedMap = Object.fromEntries(
    currentUnlockedRows.map((r) => [r.achievement_id, r])
  );

  // Build the complete achievements response
  const achievements = ACHIEVEMENT_DEFINITIONS.map((def) => {
    const checkResult = def.check(stats);
    const unl = currentUnlockedMap[def.id];
    const isUnlocked = !!unl;
    const progress = isUnlocked ? def.target : checkResult.progress;
    const progressPercent = Math.min(100, Math.round((progress / def.target) * 100));

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      category: def.category,
      icon: def.icon,
      rarity: def.rarity,
      target: def.target,
      xpReward: def.xpReward,
      titleReward: def.titleReward || null,
      isUnlocked,
      unlockedAt: unl ? unl.unlocked_at : null,
      progress,
      progressPercent,
      remainingRequirement: isUnlocked ? 'Completed' : checkResult.remainingRequirement,
    };
  });

  // Category stats
  const CATEGORIES = [
    { id: 'programming', name: 'Programming' },
    { id: 'progression', name: 'Progression' },
    { id: 'exploration', name: 'Exploration' },
    { id: 'consistency', name: 'Consistency' },
    { id: 'mastery', name: 'Mastery' },
  ];

  const categories = CATEGORIES.map((cat) => {
    const inCat = achievements.filter((a) => a.category === cat.id);
    const unlCat = inCat.filter((a) => a.isUnlocked).length;
    return {
      id: cat.id,
      name: cat.name,
      total: inCat.length,
      unlocked: unlCat,
      completionPercent: inCat.length > 0 ? Math.round((unlCat / inCat.length) * 100) : 0,
    };
  });

  // Overall stats
  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;
  const totalXpEarned = currentUnlockedRows.reduce((sum, r) => sum + (r.xp_awarded || 0), 0);
  const titlesData = getUserTitles(userId);

  return {
    achievements,
    categories,
    stats: {
      total: achievements.length,
      unlockedCount,
      completionPercent: achievements.length > 0 ? Math.round((unlockedCount / achievements.length) * 100) : 0,
      totalXpEarned,
      titlesUnlockedCount: titlesData.titles.length,
    },
    titles: titlesData.titles,
    equippedTitle: titlesData.equippedTitle,
    newlyUnlocked,
  };
}

/**
 * Explicit claim of a specific achievement.
 * Verifies requirement on the server before granting rewards.
 */
export function claimAchievement(userId, achievementId) {
  const def = ACHIEVEMENT_MAP[achievementId];
  if (!def) {
    return { success: false, error: 'Achievement not found.' };
  }

  ensureDefaultTitle(userId);
  const stats = getPlayerAchievementStats(userId);
  const checkResult = def.check(stats);

  if (!checkResult.isUnlocked) {
    return {
      success: false,
      error: `Requirements not met: ${checkResult.remainingRequirement}`,
      remainingRequirement: checkResult.remainingRequirement,
    };
  }

  const existing = db.prepare(
    'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
  ).get(userId, achievementId);

  if (existing) {
    return {
      success: true,
      alreadyClaimed: true,
      xpAwarded: 0,
      achievementId,
    };
  }

  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const id = `uach_${userId}_${achievementId}`;
    const insertRes = db.prepare(`
      INSERT OR IGNORE INTO user_achievements
        (id, user_id, achievement_id, unlocked_at, xp_awarded, reward_claimed, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, userId, achievementId, now, def.xpReward, now);

    const wonRace = insertRes.changes > 0;
    db.exec('COMMIT');

    let xpAwarded = 0;
    if (wonRace) {
      if (def.xpReward > 0) {
        const awardRes = awardQuestCompletionAtomic(userId, `ach_${achievementId}`, def.xpReward);
        xpAwarded = awardRes.xpAwarded;
      }
      if (def.titleReward) {
        unlockUserTitle(userId, def.titleReward, 'achievement');
      }
    }

    const fullProgression = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);

    return {
      success: true,
      alreadyClaimed: !wonRace,
      xpAwarded,
      titleUnlocked: def.titleReward || null,
      profile: fullProgression,
    };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

export const getAchievements = checkAndUnlockAchievements;
