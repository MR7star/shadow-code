import crypto from 'node:crypto';
import { db, hashPassword, verifyPassword } from './db.mjs';

const SESSION_TTL_HOURS = parseInt(process.env.SESSION_TTL_HOURS || '72', 10);

/**
 * Rank calculation thresholds matching the core game progression rules.
 */
export const RANK_THRESHOLDS = [
  { rank: 'E-Rank', minLevel: 1, title: 'Novice Hunter' },
  { rank: 'D-Rank', minLevel: 10, title: 'Apprentice Coder' },
  { rank: 'C-Rank', minLevel: 20, title: 'Skilled Developer' },
  { rank: 'B-Rank', minLevel: 35, title: 'Elite Engineer' },
  { rank: 'A-Rank', minLevel: 50, title: 'Master Architect' },
  { rank: 'S-Rank', minLevel: 70, title: 'Shadow General' },
  { rank: 'National Level', minLevel: 90, title: 'National Level Hunter' },
  { rank: 'Monarch', minLevel: 100, title: 'Shadow Monarch' },
];

export function getRankAndTitleForLevel(level) {
  let matched = RANK_THRESHOLDS[0];
  for (const t of RANK_THRESHOLDS) {
    if (level >= t.minLevel) {
      matched = t;
    } else {
      break;
    }
  }
  return { rank: matched.rank, title: matched.title };
}

export function getXpRequiredForLevel(level) {
  return Math.round(1500 + level * 150 + Math.pow(level, 1.4) * 20);
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_LENGTH = 128;

const DEFAULT_SKILL_IDS = [
  'skill-variables',
  'skill-control-flow',
  'skill-functions',
  'skill-arrays',
  'skill-objects',
  'skill-dom',
  'skill-linked-lists',
  'skill-stacks-queues',
  'skill-searching',
  'skill-sorting',
  'skill-trees',
  'skill-graphs',
  'skill-dp',
  'skill-async',
];

const QUEST_SKILL_UNLOCKS = {
  'quest-001': ['skill-variables'],
  'quest-002': ['skill-control-flow'],
  'quest-003': ['skill-functions'],
  'quest-004': ['skill-arrays'],
  'quest-005': ['skill-objects', 'skill-dom'],
  'quest-006': ['skill-linked-lists'],
  'quest-007': ['skill-searching'],
  'quest-008': ['skill-sorting', 'skill-stacks-queues'],
  'quest-009': ['skill-trees', 'skill-graphs'],
  'quest-010': ['skill-dp', 'skill-async'],
};

/**
 * Public profile DTO — never includes password hashes, salts, or raw JSON blobs.
 */
export function sanitizeProfile(profile) {
  if (!profile) return null;
  let stats = profile.stats;
  if (!stats && profile.stats_json) {
    try {
      stats = JSON.parse(profile.stats_json);
    } catch {
      stats = {};
    }
  }
  return {
    user_id: profile.user_id,
    display_name: profile.display_name,
    title: profile.title,
    rank: profile.rank,
    level: profile.level,
    xp: profile.xp,
    xp_to_next_level: profile.xp_to_next_level,
    streak: profile.streak,
    quests_completed: profile.quests_completed,
    skills_unlocked: profile.skills_unlocked,
    total_skills: profile.total_skills,
    stats,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

function parseProfileRow(profile) {
  return sanitizeProfile(profile);
}

/**
 * Creates an authenticated session for a user.
 */
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, now.toISOString(), expires.toISOString());

  return { token, expiresAt: expires.toISOString() };
}

/**
 * Validates a session token and returns the corresponding user and profile.
 */
export function verifySession(token) {
  if (!token) return null;

  const session = db.prepare(`
    SELECT s.user_id, s.expires_at, u.username, u.email
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token);

  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    // Session expired, remove it
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  const profile = parseProfileRow(
    db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(session.user_id)
  );

  return {
    id: session.user_id,
    username: session.username,
    email: session.email,
    profile,
  };
}

/**
 * Deletes a session token on logout.
 */
export function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/**
 * Register a new user with input validation and default profile creation.
 */
export function registerUser({ username, email, password }) {
  if (!username || typeof username !== 'string' || !USERNAME_PATTERN.test(username.trim())) {
    throw new Error('Username must be 3-30 characters and use only letters, numbers, underscores, or hyphens.');
  }

  if (!email || typeof email !== 'string' || email.trim().length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    throw new Error('Please enter a valid email address.');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long.`);
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  const existingUser = db.prepare(
    'SELECT id, username, email FROM users WHERE username = ? OR email = ?'
  ).get(cleanUsername, cleanEmail);

  if (existingUser) {
    if (existingUser.username.toLowerCase() === cleanUsername.toLowerCase()) {
      throw new Error(`Username '${cleanUsername}' is already taken.`);
    }
    throw new Error('An account with this email address already exists.');
  }

  const userId = `usr_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const { hash, salt } = hashPassword(password);

  // Atomic user and profile creation
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, cleanUsername, cleanEmail, hash, salt, now, now);

    const defaultStats = {
      strength: 15,
      intelligence: 15,
      agility: 15,
      vitality: 15,
      perception: 15,
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
      cleanUsername,
      'Novice Hunter',
      'E-Rank',
      1,
      0,
      getXpRequiredForLevel(1),
      1,
      0,
      1,
      32,
      JSON.stringify(defaultStats),
      now,
      now
    );

    // Initial quests for beginner hunter
    const initialQuests = [
      { id: 'quest-001', status: 'available' },
      { id: 'quest-002', status: 'locked' },
      { id: 'quest-003', status: 'locked' },
      { id: 'quest-004', status: 'locked' },
      { id: 'quest-005', status: 'locked' },
      { id: 'quest-006', status: 'locked' },
      { id: 'quest-007', status: 'locked' },
      { id: 'quest-008', status: 'locked' },
      { id: 'quest-009', status: 'locked' },
      { id: 'quest-010', status: 'locked' },
    ];

    const insertQuest = db.prepare(`
      INSERT INTO quest_progress (id, user_id, quest_id, status, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const q of initialQuests) {
      insertQuest.run(`qp_${userId}_${q.id}`, userId, q.id, q.status, null, null);
    }

    const insertSkill = db.prepare(`
      INSERT INTO mastery_records (id, user_id, skill_id, level, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const skillId of DEFAULT_SKILL_IDS) {
      insertSkill.run(`mr_${userId}_${skillId}`, userId, skillId, 0, now);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const session = createSession(userId);
  const userRecord = verifySession(session.token);

  return {
    token: session.token,
    user: { id: userRecord.id, username: userRecord.username, email: userRecord.email },
    profile: userRecord.profile,
  };
}

/**
 * Authenticate existing user with username/email and password.
 */
export function loginUser({ usernameOrEmail, password }) {
  if (!usernameOrEmail || typeof usernameOrEmail !== 'string' || !password || typeof password !== 'string') {
    throw new Error('Please provide both username/email and password.');
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Invalid credentials. Check your username and password.');
  }

  const query = usernameOrEmail.trim();
  const user = db.prepare(`
    SELECT * FROM users
    WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
  `).get(query, query.toLowerCase());

  if (!user) {
    throw new Error('Invalid credentials. Check your username and password.');
  }

  const valid = verifyPassword(password, user.salt, user.password_hash);
  if (!valid) {
    throw new Error('Invalid credentials. Check your username and password.');
  }

  const session = createSession(user.id);
  const userRecord = verifySession(session.token);

  return {
    token: session.token,
    user: { id: userRecord.id, username: userRecord.username, email: userRecord.email },
    profile: userRecord.profile,
  };
}

/**
 * Retrieves full user progression state: profile, quests, skills, claimed transactions.
 */
export function getUserFullProgression(userId) {
  const profile = parseProfileRow(
    db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId)
  );

  const questRows = db.prepare(`
    SELECT quest_id as id, status, started_at, completed_at
    FROM quest_progress
    WHERE user_id = ?
  `).all(userId);

  const skillRows = db.prepare(`
    SELECT skill_id as id, level
    FROM mastery_records
    WHERE user_id = ?
  `).all(userId);

  const claimedRows = db.prepare(`
    SELECT quest_id
    FROM xp_transactions
    WHERE user_id = ?
  `).all(userId);

  const submissions = db.prepare(`
    SELECT id, challenge_id, quest_id, passed, passed_count, total_count, duration_ms, created_at
    FROM submissions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(userId);

  return {
    profile,
    quests: questRows,
    skills: skillRows,
    claimedQuestIds: claimedRows.map((r) => r.quest_id),
    submissions,
  };
}

/**
 * Starts a quest for a user (transitions 'available' to 'in-progress').
 */
export function startQuestForUser(userId, questId) {
  if (!questId || typeof questId !== 'string' || !/^(quest-\d{3}|daily-\d+)$/.test(questId)) {
    return false;
  }

  const existing = db.prepare(`
    SELECT status FROM quest_progress
    WHERE user_id = ? AND quest_id = ?
  `).get(userId, questId);

  if (!existing) {
    db.prepare(`
      INSERT INTO quest_progress (id, user_id, quest_id, status, started_at)
      VALUES (?, ?, ?, 'in-progress', ?)
    `).run(`qp_${userId}_${questId}`, userId, questId, new Date().toISOString());
    return true;
  }

  if (existing.status === 'locked' || existing.status === 'completed') {
    return false;
  }

  db.prepare(`
    UPDATE quest_progress
    SET status = 'in-progress', started_at = ?
    WHERE user_id = ? AND quest_id = ?
  `).run(new Date().toISOString(), userId, questId);

  return true;
}

/**
 * Atomically marks quest completed, verifies single-claim in xp_transactions,
 * and updates authorative player level, XP, and ranks.
 */
export function awardQuestCompletionAtomic(userId, questId, xpReward) {
  const now = new Date().toISOString();
  const safeXp = Number.isInteger(xpReward) && xpReward > 0 ? xpReward : 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    // Unique (user_id, quest_id) makes this claim single-winner even under concurrent requests.
    const insertResult = db.prepare(`
      INSERT OR IGNORE INTO xp_transactions (id, user_id, quest_id, amount, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`xptx_${userId}_${questId}`, userId, questId, safeXp, `Completed quest ${questId}`, now);

    const isDuplicate = insertResult.changes === 0;

    const existingQp = db.prepare('SELECT id FROM quest_progress WHERE user_id = ? AND quest_id = ?').get(userId, questId);
    if (existingQp) {
      db.prepare(`
        UPDATE quest_progress
        SET status = 'completed', completed_at = ?
        WHERE user_id = ? AND quest_id = ?
      `).run(now, userId, questId);
    } else {
      db.prepare(`
        INSERT INTO quest_progress (id, user_id, quest_id, status, completed_at)
        VALUES (?, ?, ?, 'completed', ?)
      `).run(`qp_${userId}_${questId}`, userId, questId, now);
    }

    unlockPrerequisiteQuests(userId);

    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    if (!profile) {
      throw new Error('Player profile not found.');
    }

    if (isDuplicate) {
      db.exec('COMMIT');
      return {
        isDuplicate: true,
        xpAwarded: 0,
        profile: parseProfileRow(profile),
        leveledUp: false,
        rankChanged: false,
      };
    }

    applySkillUnlocks(userId, questId, now);

    let level = profile.level;
    let xp = profile.xp + safeXp;
    let xpNeeded = profile.xp_to_next_level;
    let levelsGained = 0;

    while (xp >= xpNeeded) {
      xp -= xpNeeded;
      level += 1;
      levelsGained += 1;
      xpNeeded = getXpRequiredForLevel(level);
    }

    const { rank: newRank, title: newTitle } = getRankAndTitleForLevel(level);
    const rankChanged = newRank !== profile.rank;
    const completedCount = profile.quests_completed + 1;
    const skillsUnlocked = db.prepare(`
      SELECT COUNT(*) as c FROM mastery_records WHERE user_id = ? AND level > 0
    `).get(userId).c;

    db.prepare(`
      UPDATE profiles
      SET level = ?, xp = ?, xp_to_next_level = ?, rank = ?, title = ?, quests_completed = ?, skills_unlocked = ?, updated_at = ?
      WHERE user_id = ?
    `).run(level, xp, xpNeeded, newRank, newTitle, completedCount, skillsUnlocked, now, userId);

    const updatedProfile = parseProfileRow(
      db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId)
    );

    db.exec('COMMIT');

    return {
      isDuplicate: false,
      xpAwarded: safeXp,
      profile: updatedProfile,
      leveledUp: levelsGained > 0,
      newLevel: level,
      rankChanged,
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors when the transaction never started
    }
    throw err;
  }
}

function applySkillUnlocks(userId, questId, now) {
  const skillIds = QUEST_SKILL_UNLOCKS[questId] || [];
  for (const skillId of skillIds) {
    const existing = db.prepare(
      'SELECT level FROM mastery_records WHERE user_id = ? AND skill_id = ?'
    ).get(userId, skillId);

    if (!existing) {
      db.prepare(`
        INSERT INTO mastery_records (id, user_id, skill_id, level, updated_at)
        VALUES (?, ?, ?, 1, ?)
      `).run(`mr_${userId}_${skillId}`, userId, skillId, now);
    } else if (existing.level === 0) {
      db.prepare(`
        UPDATE mastery_records
        SET level = 1, updated_at = ?
        WHERE user_id = ? AND skill_id = ?
      `).run(now, userId, skillId);
    }
  }
}

/**
 * Unlocks locked quests for a user if their prerequisites are all completed.
 */
function unlockPrerequisiteQuests(userId) {
  // Prerequisite dependency tree for main quests
  const dependencies = {
    'quest-002': ['quest-001'],
    'quest-003': ['quest-002'],
    'quest-004': ['quest-003'],
    'quest-005': ['quest-003'],
    'quest-006': ['quest-004', 'quest-005'],
    'quest-007': ['quest-004'],
    'quest-008': ['quest-006', 'quest-007'],
    'quest-009': ['quest-008'],
    'quest-010': ['quest-009'],
  };

  const completed = db.prepare(`
    SELECT quest_id FROM quest_progress
    WHERE user_id = ? AND status = 'completed'
  `).all(userId).map((r) => r.quest_id);

  for (const [targetQuest, prereqs] of Object.entries(dependencies)) {
    const allMet = prereqs.every((p) => completed.includes(p));
    if (allMet) {
      db.prepare(`
        UPDATE quest_progress
        SET status = 'available'
        WHERE user_id = ? AND quest_id = ? AND status = 'locked'
      `).run(userId, targetQuest);
    }
  }
}

/**
 * Returns dynamic leaderboard from profiles table.
 */
export function getLeaderboard() {
  const rows = db.prepare(`
    SELECT p.user_id as playerId, p.display_name as name, p.rank as playerRank,
           p.level, p.xp, p.quests_completed as questsCompleted
    FROM profiles p
    ORDER BY p.level DESC, p.xp DESC
    LIMIT 25
  `).all();

  return rows.map((r, i) => ({
    rank: i + 1,
    ...r,
    avatar: '',
  }));
}
