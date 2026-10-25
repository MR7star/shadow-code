import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import crypto from 'node:crypto';

const DB_PATH = process.env.DATABASE_PATH || './data/shadow_code.db';

// Ensure database directory exists
const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency and performance
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

/**
 * Initialize all database tables and indexes.
 */
export function initDatabase() {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Player profiles table (Authoritative XP, rank, level)
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Novice Hunter',
      rank TEXT NOT NULL DEFAULT 'E-Rank',
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      xp_to_next_level INTEGER NOT NULL DEFAULT 1500,
      streak INTEGER NOT NULL DEFAULT 1,
      quests_completed INTEGER NOT NULL DEFAULT 0,
      skills_unlocked INTEGER NOT NULL DEFAULT 0,
      total_skills INTEGER NOT NULL DEFAULT 32,
      stats_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Quest progress table
    CREATE TABLE IF NOT EXISTS quest_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('locked', 'available', 'in-progress', 'completed')),
      started_at TEXT,
      completed_at TEXT,
      UNIQUE(user_id, quest_id)
    );

    -- Authoritative XP transaction log (prevents duplicate rewards and race conditions)
    CREATE TABLE IF NOT EXISTS xp_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, quest_id)
    );

    -- Challenge submission records
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      code TEXT NOT NULL,
      passed INTEGER NOT NULL CHECK(passed IN (0, 1)),
      passed_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      results_json TEXT NOT NULL,
      stdout TEXT,
      error TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL
    );

    -- Mastery / skill records
    CREATE TABLE IF NOT EXISTS mastery_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, skill_id)
    );

    -- Concept mastery tracking (separate from skills - tracks understanding of programming concepts)
    CREATE TABLE IF NOT EXISTS concept_mastery (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL,
      mastery_level INTEGER NOT NULL DEFAULT 0 CHECK(mastery_level >= 0 AND mastery_level <= 5),
      first_completed_at TEXT,
      last_practiced_at TEXT,
      practice_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, concept_id)
    );

    -- Challenge mastery tracking (which challenges user has successfully completed)
    CREATE TABLE IF NOT EXISTS challenge_mastery (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      mastered_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 1,
      UNIQUE(user_id, challenge_id)
    );

    -- Active user sessions
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Daily quests (generated once per day per user)
    CREATE TABLE IF NOT EXISTS daily_quests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_date TEXT NOT NULL, -- YYYY-MM-DD in UTC
      mission_type TEXT NOT NULL CHECK(mission_type IN ('main_challenge', 'practice_challenge', 'concept_mastery')),
      target_id TEXT NOT NULL, -- challenge_id or concept_id
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      xp_reward INTEGER NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      target_progress INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN ('available', 'completed', 'claimed')),
      created_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(user_id, quest_date, mission_type, target_id)
    );

    -- Streak tracking
    CREATE TABLE IF NOT EXISTS streak_data (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_activity_date TEXT, -- YYYY-MM-DD in UTC when qualifying activity occurred
      updated_at TEXT NOT NULL
    );

    -- Reward chest state
    CREATE TABLE IF NOT EXISTS reward_chests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_date TEXT NOT NULL, -- YYYY-MM-DD in UTC
      total_xp_reward INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('locked', 'available', 'claimed')),
      claimed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, quest_date)
    );

    -- Indexes for fast query resolution
    CREATE INDEX IF NOT EXISTS idx_quest_progress_user ON quest_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_xp_tx_user ON xp_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_concept_mastery_user ON concept_mastery(user_id);
    CREATE INDEX IF NOT EXISTS idx_challenge_mastery_user ON challenge_mastery(user_id);
    CREATE INDEX IF NOT EXISTS idx_daily_quests_user_date ON daily_quests(user_id, quest_date);
    CREATE INDEX IF NOT EXISTS idx_reward_chests_user_date ON reward_chests(user_id, quest_date);
  `);

  seedDemoUserIfMissing();
}

/**
 * Secure password hashing using node:crypto scrypt.
 */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, storedHash) {
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const computed = Buffer.from(hash, 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    if (computed.length !== stored.length) return false;
    return crypto.timingSafeEqual(computed, stored);
  } catch {
    return false;
  }
}

/**
 * Seeds a default demo user matching the existing Solo Leveling protagonist so
 * returning or demo users have instant test data matching the initial mock view.
 */
function seedDemoUserIfMissing() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('ShadowMonarch');
  if (existing) return;

  const userId = 'usr_shadow_demo_001';
  const now = new Date().toISOString();
  const { hash, salt } = hashPassword('hunter123');

  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, salt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, 'ShadowMonarch', 'monarch@shadowcode.dev', hash, salt, now, now);

  const stats = {
    strength: 28,
    intelligence: 35,
    agility: 22,
    vitality: 30,
    perception: 18,
    endurance: 15,
  };

  db.prepare(`
    INSERT INTO profiles (
      user_id, display_name, title, rank, level, xp, xp_to_next_level,
      streak, quests_completed, skills_unlocked, total_skills, stats_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    'ShadowMonarch',
    'Apprentice Coder',
    'D-Rank',
    14,
    2750,
    3500,
    7,
    23,
    8,
    32,
    JSON.stringify(stats),
    now,
    now
  );

  // Seed default quest progress matching existing state
  const defaultQuests = [
    { quest_id: 'quest-001', status: 'completed' },
    { quest_id: 'quest-002', status: 'completed' },
    { quest_id: 'quest-003', status: 'completed' },
    { quest_id: 'quest-004', status: 'in-progress' },
    { quest_id: 'quest-005', status: 'available' },
    { quest_id: 'quest-006', status: 'available' },
    { quest_id: 'quest-007', status: 'locked' },
    { quest_id: 'quest-008', status: 'locked' },
    { quest_id: 'quest-009', status: 'locked' },
    { quest_id: 'quest-010', status: 'locked' },
  ];

  const insertQuest = db.prepare(`
    INSERT INTO quest_progress (id, user_id, quest_id, status, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertXpTx = db.prepare(`
    INSERT INTO xp_transactions (id, user_id, quest_id, amount, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const q of defaultQuests) {
    const qid = `qp_${userId}_${q.quest_id}`;
    insertQuest.run(
      qid,
      userId,
      q.quest_id,
      q.status,
      now,
      q.status === 'completed' ? now : null
    );

    // Initial completed quests are logged as claimed transactions
    if (q.status === 'completed') {
      insertXpTx.run(
        `xptx_${userId}_${q.quest_id}`,
        userId,
        q.quest_id,
        100,
        `Initial completed quest ${q.quest_id}`,
        now
      );
    }
  }

  // Seed initial mastery skills
  const defaultSkills = [
    { skill_id: 'skill-variables', level: 4 },
    { skill_id: 'skill-control-flow', level: 3 },
    { skill_id: 'skill-functions', level: 3 },
    { skill_id: 'skill-arrays', level: 2 },
    { skill_id: 'skill-objects', level: 1 },
    { skill_id: 'skill-dom', level: 1 },
    { skill_id: 'skill-linked-lists', level: 0 },
    { skill_id: 'skill-stacks-queues', level: 0 },
    { skill_id: 'skill-searching', level: 0 },
    { skill_id: 'skill-sorting', level: 0 },
    { skill_id: 'skill-trees', level: 0 },
    { skill_id: 'skill-graphs', level: 0 },
    { skill_id: 'skill-dp', level: 0 },
    { skill_id: 'skill-async', level: 0 },
  ];

  const insertSkill = db.prepare(`
    INSERT INTO mastery_records (id, user_id, skill_id, level, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const s of defaultSkills) {
    insertSkill.run(`mr_${userId}_${s.skill_id}`, userId, s.skill_id, s.level, now);
  }

  // Seed initial concept mastery for demo user
  const defaultConcepts = [
    { concept_id: 'variables', mastery_level: 4 },
    { concept_id: 'control-flow', mastery_level: 3 },
    { concept_id: 'functions', mastery_level: 3 },
    { concept_id: 'arrays', mastery_level: 2 },
    { concept_id: 'strings', mastery_level: 1 },
    { concept_id: 'loops', mastery_level: 2 },
    { concept_id: 'conditionals', mastery_level: 3 },
  ];

  const insertConcept = db.prepare(`
    INSERT INTO concept_mastery (id, user_id, concept_id, mastery_level, first_completed_at, last_practiced_at, practice_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of defaultConcepts) {
    insertConcept.run(
      `cm_${userId}_${c.concept_id}`,
      userId,
      c.concept_id,
      c.mastery_level,
      now,
      now,
      5
    );
  }
}

/**
 * Update or create concept mastery record
 */
export function updateConceptMastery(userId, conceptId, masteryLevel) {
  const now = new Date().toISOString();
  const existing = db.prepare(
    'SELECT id, mastery_level, practice_count FROM concept_mastery WHERE user_id = ? AND concept_id = ?'
  ).get(userId, conceptId);

  if (existing) {
    const newLevel = Math.min(5, Math.max(existing.mastery_level, masteryLevel));
    const newCount = existing.practice_count + 1;
    db.prepare(`
      UPDATE concept_mastery
      SET mastery_level = ?, last_practiced_at = ?, practice_count = ?
      WHERE id = ?
    `).run(newLevel, now, newCount, existing.id);
  } else {
    db.prepare(`
      INSERT INTO concept_mastery (id, user_id, concept_id, mastery_level, first_completed_at, last_practiced_at, practice_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`cm_${userId}_${conceptId}`, userId, conceptId, masteryLevel, now, now, 1);
  }
}

/**
 * Record challenge mastery on successful completion
 */
export function recordChallengeMastery(userId, challengeId, questId, attempts = 1) {
  const now = new Date().toISOString();
  const existing = db.prepare(
    'SELECT id FROM challenge_mastery WHERE user_id = ? AND challenge_id = ?'
  ).get(userId, challengeId);

  if (!existing) {
    db.prepare(`
      INSERT INTO challenge_mastery (id, user_id, challenge_id, quest_id, mastered_at, attempts)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`chm_${userId}_${challengeId}`, userId, challengeId, questId, now, attempts);
  }
}

/**
 * Get user's concept mastery levels
 */
export function getUserConceptMastery(userId) {
  return db.prepare(`
    SELECT concept_id, mastery_level, practice_count, last_practiced_at
    FROM concept_mastery
    WHERE user_id = ?
  `).all(userId);
}

/**
 * Get user's mastered challenges
 */
export function getUserMasteredChallenges(userId) {
  return db.prepare(`
    SELECT challenge_id, quest_id, mastered_at, attempts
    FROM challenge_mastery
    WHERE user_id = ?
    ORDER BY mastered_at DESC
  `).all(userId);
}

/**
 * Check if user has mastered prerequisite challenges
 */
export function hasMasteredPrerequisites(userId, challengeId, prerequisiteIds) {
  if (!prerequisiteIds || prerequisiteIds.length === 0) return true;
  
  const mastered = db.prepare(`
    SELECT challenge_id FROM challenge_mastery
    WHERE user_id = ? AND challenge_id IN (${prerequisiteIds.map(() => '?').join(',')})
  `).all(userId, ...prerequisiteIds);
  
  return mastered.length === prerequisiteIds.length;
}

/**
 * Get current UTC date as YYYY-MM-DD string for daily reset
 */
export function getUtcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Get or generate daily quests for a user for today
 */
export function getOrGenerateDailyQuests(userId) {
  const today = getUtcDateString();
  
  // Check if daily quests already exist for today
  const existing = db.prepare(`
    SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ?
  `).all(userId, today);
  
  if (existing.length > 0) {
    return existing;
  }
  
  // Generate new daily quests
  return generateDailyQuests(userId, today);
}

/**
 * Generate 3 daily missions for a user
 * Types: main_challenge, practice_challenge, concept_mastery
 */
function generateDailyQuests(userId, dateStr) {
  const now = new Date().toISOString();
  const missions = [];
  
  // Get user's mastered challenges and available challenges
  const masteredChallenges = db.prepare(`
    SELECT challenge_id FROM challenge_mastery WHERE user_id = ?
  `).all(userId).map(r => r.challenge_id);
  
  const masteredConcepts = db.prepare(`
    SELECT concept_id FROM concept_mastery WHERE user_id = ? AND mastery_level > 0
  `).all(userId).map(r => r.concept_id);
  
  // Get available main challenges (prerequisites met, not mastered)
  const availableMainChallenges = getAvailableMainChallenges(userId, masteredChallenges);
  
  // Get available practice challenges (main challenge mastered, practice not mastered)
  const availablePracticeChallenges = getAvailablePracticeChallenges(userId, masteredChallenges);
  
  // Get concepts that can be mastered (mastery_level < 5)
  const availableConcepts = getAvailableConcepts(userId, masteredConcepts);
  
  // Mission 1: Complete a main challenge
  if (availableMainChallenges.length > 0) {
    const challenge = availableMainChallenges[Math.floor(Math.random() * availableMainChallenges.length)];
    missions.push({
      id: `dq_${userId}_${dateStr}_main_${challenge.id}`,
      user_id: userId,
      quest_date: dateStr,
      mission_type: 'main_challenge',
      target_id: challenge.id,
      title: challenge.title,
      description: `Complete the challenge: ${challenge.title}`,
      xp_reward: 50,
      progress: 0,
      target_progress: 1,
      status: 'available',
      created_at: now,
    });
  }
  
  // Mission 2: Complete a practice challenge
  if (availablePracticeChallenges.length > 0) {
    const challenge = availablePracticeChallenges[Math.floor(Math.random() * availablePracticeChallenges.length)];
    missions.push({
      id: `dq_${userId}_${dateStr}_practice_${challenge.id}`,
      user_id: userId,
      quest_date: dateStr,
      mission_type: 'practice_challenge',
      target_id: challenge.id,
      title: challenge.title,
      description: `Complete the practice challenge: ${challenge.title}`,
      xp_reward: 30,
      progress: 0,
      target_progress: 1,
      status: 'available',
      created_at: now,
    });
  }
  
  // Mission 3: Master a concept (increase mastery level)
  if (availableConcepts.length > 0) {
    const concept = availableConcepts[Math.floor(Math.random() * availableConcepts.length)];
    missions.push({
      id: `dq_${userId}_${dateStr}_concept_${concept.concept_id}`,
      user_id: userId,
      quest_date: dateStr,
      mission_type: 'concept_mastery',
      target_id: concept.concept_id,
      title: `Master ${concept.concept_id}`,
      description: `Increase your mastery of ${concept.concept_id} (current: ${concept.mastery_level}/5)`,
      xp_reward: 40,
      progress: 0,
      target_progress: 1,
      status: 'available',
      created_at: now,
    });
  }
  
  // If we couldn't generate 3 missions, fill with fallback missions
  while (missions.length < 3) {
    const fallbackTypes = ['main_challenge', 'practice_challenge', 'concept_mastery'];
    const fallbackType = fallbackTypes[missions.length % fallbackTypes.length];
    let fallbackMission;
    
    if (fallbackType === 'main_challenge' && availableMainChallenges.length > 0) {
      const challenge = availableMainChallenges[missions.length % availableMainChallenges.length];
      fallbackMission = {
        id: `dq_${userId}_${dateStr}_main_fallback_${missions.length}`,
        user_id: userId,
        quest_date: dateStr,
        mission_type: 'main_challenge',
        target_id: challenge.id,
        title: challenge.title,
        description: `Complete the challenge: ${challenge.title}`,
        xp_reward: 50,
        progress: 0,
        target_progress: 1,
        status: 'available',
        created_at: now,
      };
    } else if (fallbackType === 'practice_challenge' && availablePracticeChallenges.length > 0) {
      const challenge = availablePracticeChallenges[missions.length % availablePracticeChallenges.length];
      fallbackMission = {
        id: `dq_${userId}_${dateStr}_practice_fallback_${missions.length}`,
        user_id: userId,
        quest_date: dateStr,
        mission_type: 'practice_challenge',
        target_id: challenge.id,
        title: challenge.title,
        description: `Complete the practice challenge: ${challenge.title}`,
        xp_reward: 30,
        progress: 0,
        target_progress: 1,
        status: 'available',
        created_at: now,
      };
    } else if (availableConcepts.length > 0) {
      const concept = availableConcepts[missions.length % availableConcepts.length];
      fallbackMission = {
        id: `dq_${userId}_${dateStr}_concept_fallback_${missions.length}`,
        user_id: userId,
        quest_date: dateStr,
        mission_type: 'concept_mastery',
        target_id: concept.concept_id,
        title: `Master ${concept.concept_id}`,
        description: `Increase your mastery of ${concept.concept_id} (current: ${concept.mastery_level}/5)`,
        xp_reward: 40,
        progress: 0,
        target_progress: 1,
        status: 'available',
        created_at: now,
      };
    } else {
      // Ultimate fallback - generic mission
      fallbackMission = {
        id: `dq_${userId}_${dateStr}_fallback_${missions.length}`,
        user_id: userId,
        quest_date: dateStr,
        mission_type: 'main_challenge',
        target_id: 'py-01',
        title: 'Daily Training',
        description: 'Complete any challenge to train your skills',
        xp_reward: 25,
        progress: 0,
        target_progress: 1,
        status: 'available',
        created_at: now,
      };
    }
    
    missions.push(fallbackMission);
  }
  
  // Insert all missions
  const insertMission = db.prepare(`
    INSERT INTO daily_quests (id, user_id, quest_date, mission_type, target_id, title, description, xp_reward, progress, target_progress, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const mission of missions) {
    insertMission.run(
      mission.id, mission.user_id, mission.quest_date, mission.mission_type,
      mission.target_id, mission.title, mission.description, mission.xp_reward,
      mission.progress, mission.target_progress, mission.status, mission.created_at
    );
  }
  
  // Create reward chest for today
  const totalXp = missions.reduce((sum, m) => sum + m.xp_reward, 0);
  db.prepare(`
    INSERT INTO reward_chests (id, user_id, quest_date, total_xp_reward, status, created_at)
    VALUES (?, ?, ?, ?, 'locked', ?)
  `).run(`rc_${userId}_${dateStr}`, userId, dateStr, totalXp, now);
  
  return missions;
}

/**
 * Get available main challenges (prerequisites met, not mastered)
 */
function getAvailableMainChallenges(userId, masteredChallenges) {
  let query = `
    SELECT c.id, c.title, c.prerequisite_ids, c.is_practice
    FROM (
      SELECT 'py-01' as id, 'The Awakening: Mana Calculation' as title, '[]' as prerequisite_ids, 0 as is_practice
      UNION SELECT 'py-02', 'Rank Identifier: Gate Thresholds', '["py-01"]', 0
      UNION SELECT 'py-03', 'Inventory Purification: Data Types', '["py-01"]', 0
      UNION SELECT 'py-04', 'Shadow Soldier Count: Loops & Iteration', '["py-02"]', 0
      UNION SELECT 'py-05', 'Dungeon Key Generator: Even/Odd Logic', '["py-02","py-04"]', 0
      UNION SELECT 'py-06', 'The Double Dungeon: While Loop Countdown', '["py-04"]', 0
      UNION SELECT 'py-07', 'Potion Brewer: Dictionary & Mapping', '["py-03","py-04"]', 0
      UNION SELECT 'py-08', 'Shadow Extraction: List Manipulation & Reversal', '["py-04","py-05"]', 0
      UNION SELECT 'py-09', 'Monarch''s Command: Higher-Order Functions', '["py-01","py-06"]', 0
      UNION SELECT 'py-10', 'Abyss Boss: Recursive Power Surge', '["py-04","py-06"]', 0
    ) c
    WHERE c.is_practice = 0
  `;
  
  const params = [];
  if (masteredChallenges.length > 0) {
    query += ` AND c.id NOT IN (${masteredChallenges.map(() => '?').join(',')})`;
    params.push(...masteredChallenges);
  }
  
  const allChallenges = db.prepare(query).all(...params);
  
  return allChallenges.filter(c => {
    if (!c.prerequisite_ids || c.prerequisite_ids === '[]') return true;
    try {
      const prereqs = JSON.parse(c.prerequisite_ids);
      return prereqs.every(p => masteredChallenges.includes(p));
    } catch {
      return false;
    }
  });
}

/**
 * Get available practice challenges (main challenge mastered, practice not mastered)
 */
function getAvailablePracticeChallenges(userId, masteredChallenges) {
  const practiceMap = {
    'py-01': 'py-01-practice',
    'py-02': 'py-02-practice',
    'py-03': 'py-03-practice',
    'py-04': 'py-04-practice',
    'py-05': 'py-05-practice',
    'py-06': 'py-06-practice',
    'py-07': 'py-07-practice',
    'py-08': 'py-08-practice',
    'py-09': 'py-09-practice',
    'py-10': 'py-10-practice',
  };
  
  const available = [];
  for (const [mainId, practiceId] of Object.entries(practiceMap)) {
    if (masteredChallenges.includes(mainId) && !masteredChallenges.includes(practiceId)) {
      // Get practice challenge title
      const practiceTitle = getPracticeTitle(practiceId);
      available.push({ id: practiceId, title: practiceTitle });
    }
  }
  return available;
}

function getPracticeTitle(practiceId) {
  const titles = {
    'py-01-practice': 'Practice: Mana Surge Calculation',
    'py-02-practice': 'Practice: Elite Rank Thresholds',
    'py-03-practice': 'Practice: Enhanced Item Formatter',
    'py-04-practice': 'Practice: Weighted Soldier Sum',
    'py-05-practice': 'Practice: Modulo Filter Variations',
    'py-06-practice': 'Practice: Variable Step Countdown',
    'py-07-practice': 'Practice: Bulk Potion Cost with Discounts',
    'py-08-practice': 'Practice: Partial Squad Reversal',
    'py-09-practice': 'Practice: Multiplier Chain',
    'py-10-practice': 'Practice: Iterative Power Surge',
  };
  return titles[practiceId] || practiceId;
}

/**
 * Get available concepts (mastery_level < 5)
 */
function getAvailableConcepts(userId, masteredConcepts) {
  const allConcepts = ['variables', 'conditionals', 'strings', 'loops', 'arrays', 'functions', 'dictionaries', 'recursion'];
  return allConcepts
    .filter(c => !masteredConcepts.includes(c) || 
      db.prepare('SELECT mastery_level FROM concept_mastery WHERE user_id = ? AND concept_id = ?').get(userId, c)?.mastery_level < 5)
    .map(concept_id => {
      const row = db.prepare('SELECT mastery_level FROM concept_mastery WHERE user_id = ? AND concept_id = ?').get(userId, concept_id);
      return { concept_id, mastery_level: row?.mastery_level || 0 };
    });
}

/**
 * Update daily quest progress when user completes a qualifying activity
 */
export function updateDailyQuestProgress(userId, missionType, targetId) {
  const today = getUtcDateString();
  const now = new Date().toISOString();
  
  const quest = db.prepare(`
    SELECT * FROM daily_quests 
    WHERE user_id = ? AND quest_date = ? AND mission_type = ? AND target_id = ? AND status = 'available'
  `).get(userId, today, missionType, targetId);
  
  if (!quest) return null;
  
  const newProgress = Math.min(quest.progress + 1, quest.target_progress);
  const newStatus = newProgress >= quest.target_progress ? 'completed' : 'available';
  
  db.prepare(`
    UPDATE daily_quests 
    SET progress = ?, status = ?, completed_at = ?
    WHERE id = ?
  `).run(newProgress, newStatus, newStatus === 'completed' ? now : null, quest.id);
  
  // Check if all daily quests are completed to unlock chest
  checkAndUnlockChest(userId, today);
  
  return { ...quest, progress: newProgress, status: newStatus };
}

/**
 * Check if all daily quests are completed and unlock chest
 */
function checkAndUnlockChest(userId, dateStr) {
  const incomplete = db.prepare(`
    SELECT COUNT(*) as count FROM daily_quests 
    WHERE user_id = ? AND quest_date = ? AND status != 'completed'
  `).get(userId, dateStr);
  
  if (incomplete.count === 0) {
    db.prepare(`
      UPDATE reward_chests 
      SET status = 'available' 
      WHERE user_id = ? AND quest_date = ? AND status = 'locked'
    `).run(userId, dateStr);
  }
}

/**
 * Get reward chest state for today
 */
export function getRewardChest(userId) {
  const today = getUtcDateString();
  return db.prepare(`
    SELECT * FROM reward_chests WHERE user_id = ? AND quest_date = ?
  `).get(userId, today);
}

/**
 * Claim reward chest (idempotent)
 */
export function claimRewardChest(userId) {
  const today = getUtcDateString();
  const now = new Date().toISOString();
  
  const chest = db.prepare(`
    SELECT * FROM reward_chests WHERE user_id = ? AND quest_date = ?
  `).get(userId, today);
  
  if (!chest || chest.status !== 'available') {
    return { success: false, reason: chest?.status === 'claimed' ? 'already_claimed' : 'not_available', xpAwarded: 0 };
  }
  
  // Atomically claim chest and award XP
  db.exec('BEGIN IMMEDIATE');
  try {
    // Check again inside transaction
    const chestCheck = db.prepare(`
      SELECT * FROM reward_chests WHERE user_id = ? AND quest_date = ?
    `).get(userId, today);
    
    if (!chestCheck || chestCheck.status !== 'available') {
      db.exec('ROLLBACK');
      return { success: false, reason: 'not_available', xpAwarded: 0 };
    }
    
    // Update chest status
    db.prepare(`
      UPDATE reward_chests SET status = 'claimed', claimed_at = ? WHERE id = ?
    `).run(now, chestCheck.id);
    
    // Mark all daily quests as claimed
    db.prepare(`
      UPDATE daily_quests SET status = 'claimed' WHERE user_id = ? AND quest_date = ?
    `).run(userId, today);
    
    // Award XP
    const xpAwarded = chestCheck.total_xp_reward;
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    
    if (profile) {
      let level = profile.level;
      let xp = profile.xp + xpAwarded;
      let xpNeeded = profile.xp_to_next_level;
      let levelsGained = 0;
      
      while (xp >= xpNeeded) {
        xp -= xpNeeded;
        level += 1;
        levelsGained += 1;
        xpNeeded = Math.round(1500 + level * 150 + Math.pow(level, 1.4) * 20);
      }
      
      const rankThresholds = [
        { rank: 'E-Rank', minLevel: 1 },
        { rank: 'D-Rank', minLevel: 10 },
        { rank: 'C-Rank', minLevel: 20 },
        { rank: 'B-Rank', minLevel: 35 },
        { rank: 'A-Rank', minLevel: 50 },
        { rank: 'S-Rank', minLevel: 70 },
        { rank: 'National Level', minLevel: 90 },
        { rank: 'Monarch', minLevel: 100 },
      ];
      
      let newRank = 'E-Rank';
      for (const t of rankThresholds) {
        if (level >= t.minLevel) newRank = t.rank;
      }
      
      const rankChanged = newRank !== profile.rank;
      const completedCount = profile.quests_completed + 1;
      
      db.prepare(`
        UPDATE profiles
        SET level = ?, xp = ?, xp_to_next_level = ?, rank = ?, quests_completed = ?, updated_at = ?
        WHERE user_id = ?
      `).run(level, xp, xpNeeded, newRank, completedCount, now, userId);
    }
    
    db.exec('COMMIT');
    
    return { success: true, xpAwarded, reason: null };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Update learning streak when user completes a qualifying activity
 */
export function updateLearningStreak(userId) {
  const today = getUtcDateString();
  const now = new Date().toISOString();
  
  const streak = db.prepare('SELECT * FROM streak_data WHERE user_id = ?').get(userId);
  
  if (!streak) {
    // First time - initialize streak
    db.prepare(`
      INSERT INTO streak_data (user_id, current_streak, longest_streak, last_activity_date, updated_at)
      VALUES (?, 1, 1, ?, ?)
    `).run(userId, today, now);
    
    // Update profile streak
    db.prepare('UPDATE profiles SET streak = 1, updated_at = ? WHERE user_id = ?').run(now, userId);
    return { currentStreak: 1, longestStreak: 1, streakContinued: true };
  }
  
  const lastDate = streak.last_activity_date;
  
  if (lastDate === today) {
    // Already counted today
    return { 
      currentStreak: streak.current_streak, 
      longestStreak: streak.longest_streak, 
      streakContinued: false,
      alreadyCounted: true
    };
  }
  
  let newStreak = streak.current_streak;
  let streakContinued = false;
  
  // Check if yesterday (streak continues)
  const yesterday = getUtcDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (lastDate === yesterday) {
    newStreak = streak.current_streak + 1;
    streakContinued = true;
  } else {
    // Missed day(s) - reset streak
    newStreak = 1;
  }
  
  const newLongest = Math.max(streak.longest_streak, newStreak);
  
  db.prepare(`
    UPDATE streak_data 
    SET current_streak = ?, longest_streak = ?, last_activity_date = ?, updated_at = ?
    WHERE user_id = ?
  `).run(newStreak, newLongest, today, now, userId);
  
  // Update profile streak
  db.prepare('UPDATE profiles SET streak = ?, updated_at = ? WHERE user_id = ?').run(newStreak, now, userId);
  
  return { currentStreak: newStreak, longestStreak: newLongest, streakContinued };
}

/**
 * Get streak data for user
 */
export function getStreakData(userId) {
  return db.prepare('SELECT * FROM streak_data WHERE user_id = ?').get(userId) || {
    user_id: userId,
    current_streak: 0,
    longest_streak: 0,
    last_activity_date: null,
  };
}

/**
 * Get daily quests with chest state for frontend
 */
export function getDailyQuestData(userId) {
  const quests = getOrGenerateDailyQuests(userId);
  const chest = getRewardChest(userId);
  const streak = getStreakData(userId);
  
  return {
    quests,
    chest: chest || { status: 'locked', total_xp_reward: 0 },
    streak,
    date: getUtcDateString(),
  };
}
