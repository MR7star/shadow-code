/**
 * Shadow Code — Dungeon System
 *
 * Defines dungeon data, DB helpers, and server-side dungeon logic.
 * All dungeon challenges reuse existing serverChallenges entries.
 * Rewards flow through existing awardQuestCompletionAtomic to maintain
 * consistency with XP, rank, leaderboard, and daily quest systems.
 */

import crypto from 'node:crypto';
import { db } from './db.mjs';
import { serverChallenges } from './challenges.mjs';
import { awardQuestCompletionAtomic } from './auth.mjs';

// ─── Dungeon Definitions ────────────────────────────────────────────────────
// Each dungeon references existing challenge IDs from serverChallenges.
// bossId is the final challenge; the rest are in order.
// requiredRank / requiredChallenges are checked server-side before access.

export const DUNGEON_DEFINITIONS = [
  {
    id: 'dungeon-001',
    name: "The Awakening Gate",
    description:
      'The most ancient dungeon — every new hunter must prove their fundamentals before the gate seals. Master variables, conditionals, and strings to claim the Gate\'s Core.',
    theme: 'beginner',
    difficulty: 'E',
    requiredRank: 'E-Rank',
    requiredChallenges: [],
    lore: 'Shadows whisper of a gate that has stood since the first Awakening. No hunter has failed here… yet.',
    challenges: [
      {
        id: 'py-01',
        order: 1,
        isRequired: true,
        isBoss: false,
        stageTitle: 'The Mana Threshold',
        stageLore: 'The gate pulses with raw mana. Calculate your reserves or be consumed.',
      },
      {
        id: 'py-02',
        order: 2,
        isRequired: true,
        isBoss: false,
        stageTitle: 'The Rank Barrier',
        stageLore: 'Rank classification gates determine who may pass. Prove your rank logic.',
      },
      {
        id: 'py-03',
        order: 3,
        isRequired: true,
        isBoss: true,
        stageTitle: 'Inventory Golem — Boss Battle',
        stageLore: 'The Gate Boss: an ancient golem that guards its inventory with string-manipulation wards.',
      },
    ],
    xpReward: 500,
    bonusTitle: 'Gate Clearer',
  },
  {
    id: 'dungeon-002',
    name: "Shadow Army Barracks",
    description:
      'Loop through endless waves of shadow soldiers, filter the ranks, and face the Shadow Commander who orchestrates them all.',
    theme: 'loops',
    difficulty: 'D',
    requiredRank: 'E-Rank',
    requiredChallenges: ['py-01', 'py-02', 'py-03'],
    lore: 'Buried beneath the barracks lies a dungeon that hasn\'t been cleared in 50 years. Its boss evolves with each failed attempt.',
    challenges: [
      {
        id: 'py-04',
        order: 1,
        isRequired: true,
        isBoss: false,
        stageTitle: 'The Training Ground',
        stageLore: 'Row upon row of shadow soldiers await counting. Sum their strengths to advance.',
      },
      {
        id: 'py-05',
        order: 2,
        isRequired: true,
        isBoss: false,
        stageTitle: 'The Key Vault',
        stageLore: 'Dungeon keys encoded in even numbers. Filter the vault to find the paths forward.',
      },
      {
        id: 'py-06',
        order: 3,
        isRequired: true,
        isBoss: true,
        stageTitle: 'Double Dungeon Commander — Boss Battle',
        stageLore: 'The Commander of the Double Dungeon: a statue that activates when touched, counting down until it shatters the unprepared.',
      },
    ],
    xpReward: 750,
    bonusTitle: 'Barracks Conqueror',
  },
  {
    id: 'dungeon-003',
    name: "The Monarch's Treasury",
    description:
      'Navigate the Monarch\'s legendary treasury, brewing potions and reversing extraction squads before facing the Abyss itself.',
    theme: 'advanced',
    difficulty: 'C',
    requiredRank: 'D-Rank',
    requiredChallenges: ['py-04', 'py-05', 'py-06'],
    lore: 'Only hunters of D-Rank or above may enter. The Abyss Boss lurks at the deepest level, fueled by recursive power beyond reckoning.',
    challenges: [
      {
        id: 'py-07',
        order: 1,
        isRequired: true,
        isBoss: false,
        stageTitle: 'The Alchemist\'s Chamber',
        stageLore: 'Rare ingredients with exact costs. Brew the correct potion or waste your supplies.',
      },
      {
        id: 'py-08',
        order: 2,
        isRequired: true,
        isBoss: false,
        stageTitle: 'Shadow Extraction Vault',
        stageLore: 'The shadow army marches in reverse formation. Master the order to pass.',
      },
      {
        id: 'py-09',
        order: 3,
        isRequired: true,
        isBoss: false,
        stageTitle: 'Monarch\'s Command Center',
        stageLore: 'Higher-order spells govern the treasury\'s defenses. Create the multiplier.',
      },
      {
        id: 'py-10',
        order: 4,
        isRequired: true,
        isBoss: true,
        stageTitle: 'Abyss Boss — Final Boss',
        stageLore: 'The Abyss Boss: a recursive entity that re-spawns with doubled power until finally defeated. Only pure recursion will suffice.',
      },
    ],
    xpReward: 1200,
    bonusTitle: 'Abyss Vanquisher',
  },
];

// Build a quick lookup map
export const DUNGEON_MAP = Object.fromEntries(DUNGEON_DEFINITIONS.map((d) => [d.id, d]));

// ─── DB Schema Initialisation ───────────────────────────────────────────────

/**
 * Create dungeon tables if they do not already exist.
 * Called from initDatabase() in runner.mjs (via initDungeonTables exported here).
 */
export function initDungeonTables() {
  db.exec(`
    -- Per-player dungeon progression
    CREATE TABLE IF NOT EXISTS dungeon_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dungeon_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available'
        CHECK(status IN ('locked', 'available', 'in-progress', 'completed')),
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, dungeon_id)
    );

    -- Per-challenge progress within a dungeon
    CREATE TABLE IF NOT EXISTS dungeon_challenge_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dungeon_id TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'locked'
        CHECK(status IN ('locked', 'available', 'completed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      best_passed_count INTEGER NOT NULL DEFAULT 0,
      best_total_count INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, dungeon_id, challenge_id)
    );

    -- Dungeon-specific XP award guard (exactly-once per dungeon)
    CREATE TABLE IF NOT EXISTS dungeon_xp_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dungeon_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, dungeon_id)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_dungeon_progress_user ON dungeon_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_dungeon_challenge_progress_user ON dungeon_challenge_progress(user_id);
  `);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute dungeon availability for a user based on their mastered challenges.
 */
function computeDungeonStatus(dungeon, masteredChallengeIds) {
  if (dungeon.requiredChallenges.length === 0) return 'available';
  const allMet = dungeon.requiredChallenges.every((id) => masteredChallengeIds.includes(id));
  return allMet ? 'available' : 'locked';
}

/**
 * Ensure dungeon_progress and dungeon_challenge_progress rows exist for a user.
 * Returns the dungeon progress row.
 */
function ensureDungeonProgressRows(userId, dungeon, now) {
  // Dungeon-level row
  const existingDp = db.prepare(
    'SELECT * FROM dungeon_progress WHERE user_id = ? AND dungeon_id = ?'
  ).get(userId, dungeon.id);

  if (!existingDp) {
    db.prepare(`
      INSERT OR IGNORE INTO dungeon_progress
        (id, user_id, dungeon_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'available', ?, ?)
    `).run(`dp_${userId}_${dungeon.id}`, userId, dungeon.id, now, now);
  }

  // Per-challenge rows
  for (let i = 0; i < dungeon.challenges.length; i++) {
    const dc = dungeon.challenges[i];
    const initial = i === 0 ? 'available' : 'locked';
    db.prepare(`
      INSERT OR IGNORE INTO dungeon_challenge_progress
        (id, user_id, dungeon_id, challenge_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `dcp_${userId}_${dungeon.id}_${dc.id}`,
      userId,
      dungeon.id,
      dc.id,
      initial,
      now,
      now
    );
  }

  return db.prepare('SELECT * FROM dungeon_progress WHERE user_id = ? AND dungeon_id = ?').get(userId, dungeon.id);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns all dungeons with availability/progress for a user.
 */
export function getDungeonsForUser(userId) {
  const now = new Date().toISOString();

  // Get all mastered challenges for prerequisite checks
  const masteredRows = db.prepare(
    'SELECT challenge_id FROM challenge_mastery WHERE user_id = ?'
  ).all(userId);
  const mastered = masteredRows.map((r) => r.challenge_id);

  // Get user profile for rank check
  const profile = db.prepare('SELECT rank FROM profiles WHERE user_id = ?').get(userId);
  const userRank = profile ? profile.rank : 'E-Rank';

  const RANK_ORDER = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank', 'National Level', 'Monarch'];

  return DUNGEON_DEFINITIONS.map((dungeon) => {
    const rankIndex = RANK_ORDER.indexOf(userRank);
    const requiredRankIndex = RANK_ORDER.indexOf(dungeon.requiredRank);
    const rankOk = rankIndex >= requiredRankIndex;

    const prereqOk = computeDungeonStatus(dungeon, mastered) === 'available';
    const isAccessible = rankOk && prereqOk;

    // Get or create progress rows if accessible
    let dungeonProgress = null;
    let challengeProgressRows = [];

    if (isAccessible) {
      ensureDungeonProgressRows(userId, dungeon, now);
    }

    dungeonProgress = db.prepare(
      'SELECT * FROM dungeon_progress WHERE user_id = ? AND dungeon_id = ?'
    ).get(userId, dungeon.id);

    challengeProgressRows = db.prepare(
      'SELECT * FROM dungeon_challenge_progress WHERE user_id = ? AND dungeon_id = ?'
    ).all(userId, dungeon.id);

    const challengeProgressMap = {};
    for (const row of challengeProgressRows) {
      challengeProgressMap[row.challenge_id] = row;
    }

    const challenges = dungeon.challenges.map((dc) => {
      const cp = challengeProgressMap[dc.id];
      const serverChallenge = serverChallenges[dc.id];
      return {
        ...dc,
        title: serverChallenge ? serverChallenge.title : dc.stageTitle,
        xpReward: serverChallenge ? serverChallenge.xpReward : 0,
        sampleTests: serverChallenge ? serverChallenge.sampleTests : [],
        functionName: serverChallenge ? serverChallenge.functionName : '',
        conceptId: serverChallenge ? serverChallenge.conceptId : null,
        status: cp ? cp.status : (isAccessible && dc.order === 1 ? 'available' : 'locked'),
        attempts: cp ? cp.attempts : 0,
        bestPassedCount: cp ? cp.best_passed_count : 0,
        bestTotalCount: cp ? cp.best_total_count : 0,
        completedAt: cp ? cp.completed_at : null,
      };
    });

    const bossChallenge = dungeon.challenges.find((c) => c.isBoss);
    const bossProgress = bossChallenge ? challengeProgressMap[bossChallenge.id] : null;

    // Overall dungeon status
    let status = 'locked';
    if (!isAccessible) {
      status = 'locked';
    } else if (dungeonProgress) {
      status = dungeonProgress.status;
    } else {
      status = 'available';
    }

    const totalRequired = dungeon.challenges.filter((c) => c.isRequired).length;
    const completedRequired = dungeon.challenges.filter((c) => {
      const cp = challengeProgressMap[c.id];
      return c.isRequired && cp && cp.status === 'completed';
    }).length;

    return {
      id: dungeon.id,
      name: dungeon.name,
      description: dungeon.description,
      theme: dungeon.theme,
      difficulty: dungeon.difficulty,
      requiredRank: dungeon.requiredRank,
      requiredChallenges: dungeon.requiredChallenges,
      lore: dungeon.lore,
      xpReward: dungeon.xpReward,
      bonusTitle: dungeon.bonusTitle,
      status,
      isAccessible,
      lockReason: !isAccessible
        ? (!rankOk
          ? `Requires ${dungeon.requiredRank}`
          : `Complete prerequisites: ${dungeon.requiredChallenges.join(', ')}`)
        : null,
      challenges,
      bossId: bossChallenge ? bossChallenge.id : null,
      bossStatus: bossProgress ? bossProgress.status : 'locked',
      bossAttempts: bossProgress ? bossProgress.attempts : 0,
      completedRequired,
      totalRequired,
      progressPercent: totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0,
      startedAt: dungeonProgress ? dungeonProgress.started_at : null,
      completedAt: dungeonProgress ? dungeonProgress.completed_at : null,
    };
  });
}

/**
 * Get a single dungeon's full state for a user.
 */
export function getDungeonForUser(userId, dungeonId) {
  const dungeons = getDungeonsForUser(userId);
  return dungeons.find((d) => d.id === dungeonId) || null;
}

/**
 * Validate that a user meets rank and challenge prerequisites to enter a dungeon.
 * Returns { allowed, reason }.
 */
export function validateDungeonAccess(userId, dungeonId) {
  const dungeon = DUNGEON_MAP[dungeonId];
  if (!dungeon) return { allowed: false, reason: 'Dungeon not found.' };

  // Check dungeon prerequisites
  const mastered = db.prepare(
    'SELECT challenge_id FROM challenge_mastery WHERE user_id = ?'
  ).all(userId).map((r) => r.challenge_id);

  const prereqsMet = dungeon.requiredChallenges.every((id) => mastered.includes(id));
  if (!prereqsMet) {
    return {
      allowed: false,
      reason: `Prerequisites not met: requires mastering ${dungeon.requiredChallenges.join(', ')}`,
    };
  }

  // Check rank
  const profile = db.prepare('SELECT rank FROM profiles WHERE user_id = ?').get(userId);
  const RANK_ORDER = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank', 'National Level', 'Monarch'];
  if (!profile || RANK_ORDER.indexOf(profile.rank) < RANK_ORDER.indexOf(dungeon.requiredRank)) {
    return { allowed: false, reason: `Requires ${dungeon.requiredRank}.` };
  }

  return { allowed: true, reason: null };
}

/**
 * Mark a dungeon as in-progress (player has clicked Enter).
 * Returns { success, error }.
 */
export function startDungeon(userId, dungeonId) {
  const dungeon = DUNGEON_MAP[dungeonId];
  if (!dungeon) return { success: false, error: 'Dungeon not found.' };

  // Server-side check of dungeon eligibility
  const access = validateDungeonAccess(userId, dungeonId);
  if (!access.allowed) {
    return { success: false, error: access.reason };
  }

  const now = new Date().toISOString();
  ensureDungeonProgressRows(userId, dungeon, now);

  const dp = db.prepare(
    'SELECT status FROM dungeon_progress WHERE user_id = ? AND dungeon_id = ?'
  ).get(userId, dungeonId);

  if (!dp) return { success: false, error: 'Access denied.' };
  if (dp.status === 'completed') return { success: true, alreadyCompleted: true };

  db.prepare(`
    UPDATE dungeon_progress
    SET status = 'in-progress', started_at = COALESCE(started_at, ?), updated_at = ?
    WHERE user_id = ? AND dungeon_id = ?
  `).run(now, now, userId, dungeonId);

  return { success: true };
}

/**
 * Server-side verification and recording of a dungeon challenge completion.
 * Called after code evaluation confirms allPassed=true.
 *
 * Returns { success, isDuplicate, unlocked, dungeonComplete, xpAwarded, error }.
 */
export function recordDungeonChallengeCompletion(userId, dungeonId, challengeId, evalResult) {
  const dungeon = DUNGEON_MAP[dungeonId];
  if (!dungeon) return { success: false, error: 'Dungeon not found.' };

  const dcDef = dungeon.challenges.find((c) => c.id === challengeId);
  if (!dcDef) return { success: false, error: 'Challenge not part of this dungeon.' };

  const serverChallenge = serverChallenges[challengeId];
  if (!serverChallenge) return { success: false, error: 'Challenge definition not found.' };

  // Must have passed all tests
  if (!evalResult.allPassed) {
    return { success: false, error: 'Not all tests passed — no reward granted.' };
  }

  // Verify challenge is unlocked and eligible
  const access = validateDungeonChallengeAccess(userId, dungeonId, challengeId);
  if (!access.allowed) {
    return { success: false, error: access.reason };
  }

  const now = new Date().toISOString();
  let isDuplicate = false;
  let nextUnlocked = null;
  let dungeonComplete = false;
  let isDuplicateDungeon = false;

  db.exec('BEGIN IMMEDIATE');
  try {
    const cp = db.prepare(
      'SELECT * FROM dungeon_challenge_progress WHERE user_id = ? AND dungeon_id = ? AND challenge_id = ?'
    ).get(userId, dungeonId, challengeId);

    isDuplicate = cp && cp.status === 'completed';

    // Record attempt
    const newAttempts = (cp ? cp.attempts : 0) + 1;
    const passedCount = evalResult.results ? evalResult.results.filter((r) => r.passed).length : 0;
    const totalCount = evalResult.results ? evalResult.results.length : 0;

    db.prepare(`
      INSERT INTO dungeon_challenge_progress
        (id, user_id, dungeon_id, challenge_id, status, attempts, best_passed_count, best_total_count, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, dungeon_id, challenge_id) DO UPDATE SET
        status = 'completed',
        attempts = ?,
        best_passed_count = MAX(best_passed_count, ?),
        best_total_count = MAX(best_total_count, ?),
        completed_at = COALESCE(completed_at, ?),
        updated_at = ?
    `).run(
      `dcp_${userId}_${dungeonId}_${challengeId}`,
      userId, dungeonId, challengeId,
      newAttempts, passedCount, totalCount, now, now, now,
      // ON CONFLICT values
      newAttempts, passedCount, totalCount, now, now
    );

    // Unlock the next challenge in sequence
    const sortedChallenges = [...dungeon.challenges].sort((a, b) => a.order - b.order);
    const currentIndex = sortedChallenges.findIndex((c) => c.id === challengeId);
    if (currentIndex >= 0 && currentIndex + 1 < sortedChallenges.length) {
      const nextDc = sortedChallenges[currentIndex + 1];
      db.prepare(`
        UPDATE dungeon_challenge_progress
        SET status = CASE WHEN status = 'locked' THEN 'available' ELSE status END, updated_at = ?
        WHERE user_id = ? AND dungeon_id = ? AND challenge_id = ?
      `).run(now, userId, dungeonId, nextDc.id);
      nextUnlocked = nextDc.id;
    }

    // Mark dungeon in-progress if it wasn't yet
    db.prepare(`
      UPDATE dungeon_progress
      SET status = CASE WHEN status = 'available' THEN 'in-progress' ELSE status END,
          started_at = COALESCE(started_at, ?),
          updated_at = ?
      WHERE user_id = ? AND dungeon_id = ?
    `).run(now, now, userId, dungeonId);

    // Check if dungeon is now complete (all required challenges done)
    const requiredIds = dungeon.challenges.filter((c) => c.isRequired).map((c) => c.id);
    const completedRows = db.prepare(`
      SELECT challenge_id FROM dungeon_challenge_progress
      WHERE user_id = ? AND dungeon_id = ? AND status = 'completed'
    `).all(userId, dungeonId);
    const completedIds = completedRows.map((r) => r.challenge_id);
    dungeonComplete = requiredIds.every((id) => completedIds.includes(id));

    if (dungeonComplete) {
      // Award dungeon-level XP guard (exactly once per dungeon)
      const xpTxResult = db.prepare(`
        INSERT OR IGNORE INTO dungeon_xp_transactions
          (id, user_id, dungeon_id, amount, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `dtx_${userId}_${dungeonId}`,
        userId,
        dungeonId,
        dungeon.xpReward,
        `Dungeon completed: ${dungeon.name}`,
        now
      );
      isDuplicateDungeon = xpTxResult.changes === 0;

      // Mark dungeon completed
      db.prepare(`
        UPDATE dungeon_progress
        SET status = 'completed', completed_at = COALESCE(completed_at, ?), updated_at = ?
        WHERE user_id = ? AND dungeon_id = ?
      `).run(now, now, userId, dungeonId);
    }

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }

  // Perform progression XP award outside the transaction (awardQuestCompletionAtomic has its own transaction)
  let xpAwarded = 0;
  if (dungeonComplete && !isDuplicateDungeon) {
    const syntheticQuestId = `dungeon-${dungeonId}`;
    const awardResult = awardQuestCompletionAtomic(userId, syntheticQuestId, dungeon.xpReward);
    xpAwarded = awardResult.xpAwarded;

    // Award bonus title if defined
    if (dungeon.bonusTitle) {
      db.prepare('UPDATE profiles SET title = ?, updated_at = ? WHERE user_id = ?').run(
        dungeon.bonusTitle,
        now,
        userId
      );
    }
  }

  return {
    success: true,
    isDuplicate,
    isDuplicateDungeon,
    nextUnlocked,
    dungeonComplete,
    xpAwarded,
    isBoss: dcDef.isBoss,
    dungeonName: dungeon.name,
    bonusTitle: dungeonComplete ? dungeon.bonusTitle : null,
  };
}

/**
 * Record a failed boss attempt (no rewards, just increment attempts + provide feedback).
 */
export function recordDungeonChallengeAttempt(userId, dungeonId, challengeId, passedCount, totalCount) {
  const dungeon = DUNGEON_MAP[dungeonId];
  if (!dungeon) return { success: false, error: 'Dungeon not found.' };

  const now = new Date().toISOString();
  ensureDungeonProgressRows(userId, dungeon, now);

  db.prepare(`
    INSERT INTO dungeon_challenge_progress
      (id, user_id, dungeon_id, challenge_id, status, attempts, best_passed_count, best_total_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'available', 1, ?, ?, ?, ?)
    ON CONFLICT(user_id, dungeon_id, challenge_id) DO UPDATE SET
      attempts = attempts + 1,
      best_passed_count = MAX(best_passed_count, ?),
      best_total_count = MAX(best_total_count, ?),
      updated_at = ?
  `).run(
    `dcp_${userId}_${dungeonId}_${challengeId}`,
    userId, dungeonId, challengeId,
    passedCount, totalCount, now, now,
    passedCount, totalCount, now
  );

  const cp = db.prepare(
    'SELECT attempts FROM dungeon_challenge_progress WHERE user_id = ? AND dungeon_id = ? AND challenge_id = ?'
  ).get(userId, dungeonId, challengeId);

  return { success: true, attempts: cp ? cp.attempts : 1 };
}

/**
 * Validate that a user has access to a dungeon challenge.
 * Returns { allowed, reason }.
 */
export function validateDungeonChallengeAccess(userId, dungeonId, challengeId) {
  const dungeonAccess = validateDungeonAccess(userId, dungeonId);
  if (!dungeonAccess.allowed) return dungeonAccess;

  const dungeon = DUNGEON_MAP[dungeonId];
  const dcDef = dungeon.challenges.find((c) => c.id === challengeId);
  if (!dcDef) return { allowed: false, reason: 'Challenge not part of this dungeon.' };

  const now = new Date().toISOString();
  ensureDungeonProgressRows(userId, dungeon, now);

  // Check this specific challenge is unlocked
  const cp = db.prepare(
    'SELECT status FROM dungeon_challenge_progress WHERE user_id = ? AND dungeon_id = ? AND challenge_id = ?'
  ).get(userId, dungeonId, challengeId);

  if (!cp || cp.status === 'locked') {
    return { allowed: false, reason: 'Complete the previous dungeon challenge first.' };
  }

  return { allowed: true, reason: null };
}
