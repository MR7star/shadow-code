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

    -- Active user sessions
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Indexes for fast query resolution
    CREATE INDEX IF NOT EXISTS idx_quest_progress_user ON quest_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_xp_tx_user ON xp_transactions(user_id);
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
}
