import crypto from 'node:crypto';
import { db, hashPassword, verifyPassword, getUserConceptMastery, getUserMasteredChallenges, getUserMasteryRecords, syncSkillLevelsFromMastery, getOrGenerateDailyQuests, getRewardChest, claimRewardChest, getStreakData, updateLearningStreak, getDailyQuestData, updateDailyQuestProgress } from './db.mjs';
import { serverChallenges } from './challenges.mjs';

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

/**
 * Promotion trial configuration — defines the requirements and challenge
 * for advancing from one rank to the next. Each trial uses an existing
 * challenge from serverChallenges as the gatekeeper challenge.
 * Requirements reference the existing curriculum to avoid arbitrary values.
 */
export const PROMOTION_TRIALS = [
  {
    id: 'promo-e-d',
    fromRank: 'E-Rank',
    toRank: 'D-Rank',
    title: 'The Gatekeeper Trial',
    description: 'Prove your command of variables and conditional logic to earn D-Rank.',
    requiredLevel: 10,
    requiredMasteredChallenges: ['py-01'],
    requiredConceptMastery: { variables: 2 },
    trialChallengeId: 'py-02',
    xpReward: 0,
  },
  {
    id: 'promo-d-c',
    fromRank: 'D-Rank',
    toRank: 'C-Rank',
    title: 'The C-Rank Advancement Trial',
    description: 'Demonstrate loop mastery and soldier-count precision to rise to C-Rank.',
    requiredLevel: 20,
    requiredMasteredChallenges: ['py-02', 'py-04'],
    requiredConceptMastery: { conditionals: 2, loops: 2 },
    trialChallengeId: 'py-06',
    xpReward: 0,
  },
  {
    id: 'promo-c-b',
    fromRank: 'C-Rank',
    toRank: 'B-Rank',
    title: 'The B-Rank Advancement Trial',
    description: 'Breach the shadow extraction perimeter with array and dictionary precision.',
    requiredLevel: 35,
    requiredMasteredChallenges: ['py-06', 'py-08'],
    requiredConceptMastery: { loops: 3, arrays: 2 },
    trialChallengeId: 'py-07',
    xpReward: 0,
  },
  {
    id: 'promo-b-a',
    fromRank: 'B-Rank',
    toRank: 'A-Rank',
    title: 'The A-Rank Advancement Trial',
    description: 'Command higher-order functions and potion-brewing mappings to reach A-Rank.',
    requiredLevel: 50,
    requiredMasteredChallenges: ['py-07', 'py-08'],
    requiredConceptMastery: { dictionaries: 3, functions: 2 },
    trialChallengeId: 'py-09',
    xpReward: 0,
  },
  {
    id: 'promo-a-s',
    fromRank: 'A-Rank',
    toRank: 'S-Rank',
    title: 'The S-Rank Advancement Trial',
    description: 'Survive the Abyss Boss recursive power surge to claim S-Rank.',
    requiredLevel: 70,
    requiredMasteredChallenges: ['py-09'],
    requiredConceptMastery: { functions: 3, recursion: 2 },
    trialChallengeId: 'py-10',
    xpReward: 0,
  },
];

export function getPromotionTrial(fromRank) {
  return PROMOTION_TRIALS.find(t => t.fromRank === fromRank) || null;
}

export function getAllPromotionTrials() {
  return PROMOTION_TRIALS;
}

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
 * Retrieves full user progression state: profile, quests, skills, claimed transactions, concept mastery.
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

  const conceptMastery = getUserConceptMastery(userId);

  return {
    profile,
    quests: questRows,
    skills: skillRows,
    claimedQuestIds: claimedRows.map((r) => r.quest_id),
    submissions,
    conceptMastery,
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

    // Sync skill levels with verified concept mastery
    syncSkillLevelsFromMastery(userId, now);

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

    // Preserve existing rank and title — rank only changes via promotion trials
    const completedCount = profile.quests_completed + 1;
    const skillsUnlocked = db.prepare(`
      SELECT COUNT(*) as c FROM mastery_records WHERE user_id = ? AND level > 0
    `).get(userId).c;

    db.prepare(`
      UPDATE profiles
      SET level = ?, xp = ?, xp_to_next_level = ?, quests_completed = ?, skills_unlocked = ?, updated_at = ?
      WHERE user_id = ?
    `).run(level, xp, xpNeeded, completedCount, skillsUnlocked, now, userId);

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
      rankChanged: false,
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

/**
 * Check if user meets all requirements for a promotion trial.
 * Returns { eligible: boolean, reasons: string[] }.
 */
export function checkPromotionEligibility(userId, trial) {
  const reasons = [];

  // Check level
  const profile = db.prepare('SELECT level FROM profiles WHERE user_id = ?').get(userId);
  if (!profile || profile.level < trial.requiredLevel) {
    reasons.push(`Requires Hunter Level ${trial.requiredLevel} (current: ${profile?.level || 1})`);
  }

  // Check mastered challenges
  const masteredChallenges = getUserMasteredChallenges(userId).map(r => r.challenge_id);
  for (const req of trial.requiredMasteredChallenges) {
    if (!masteredChallenges.includes(req)) {
      reasons.push(`Requires mastery of challenge: ${req}`);
    }
  }

  // Check concept mastery
  const conceptRows = getUserConceptMastery(userId);
  const conceptMap = {};
  for (const row of conceptRows) {
    conceptMap[row.concept_id] = row.mastery_level;
  }
  for (const [concept, requiredLevel] of Object.entries(trial.requiredConceptMastery)) {
    const current = conceptMap[concept] || 0;
    if (current < requiredLevel) {
      reasons.push(`Requires ${concept} mastery level ${requiredLevel} (current: ${current})`);
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

/**
 * Get the promotion state for all trials for a user.
 */
export function getUserPromotionState(userId) {
  const profile = db.prepare('SELECT rank, level FROM profiles WHERE user_id = ?').get(userId);
  if (!profile) return [];

  const promotionRows = db.prepare(`
    SELECT * FROM rank_promotions WHERE user_id = ?
  `).all(userId);
  const promotionMap = {};
  for (const row of promotionRows) {
    promotionMap[row.from_rank] = row;
  }

  const masteredChallenges = getUserMasteredChallenges(userId).map(r => r.challenge_id);
  const conceptRows = getUserConceptMastery(userId);
  const conceptMap = {};
  for (const row of conceptRows) {
    conceptMap[row.concept_id] = row.mastery_level;
  }

  return PROMOTION_TRIALS.map(trial => {
    const promoRow = promotionMap[trial.fromRank];
    const isCurrentRank = trial.fromRank === profile.rank;
    const isFutureRank = RANK_THRESHOLDS.findIndex(t => t.rank === trial.fromRank) > RANK_THRESHOLDS.findIndex(t => t.rank === profile.rank);

    let status = 'locked';
    let attempts = 0;
    let startedAt = null;
    let completedAt = null;
    let resultsJson = null;

    // Check requirements
    const levelMet = profile.level >= trial.requiredLevel;
    const challengesMet = trial.requiredMasteredChallenges.every(req => masteredChallenges.includes(req));
    const conceptsMet = Object.entries(trial.requiredConceptMastery).every(([c, lvl]) => (conceptMap[c] || 0) >= lvl);
    const eligible = levelMet && challengesMet && conceptsMet;

    if (promoRow) {
      status = promoRow.status;
      attempts = promoRow.attempts;
      startedAt = promoRow.started_at;
      completedAt = promoRow.completed_at;
      resultsJson = promoRow.results_json;
    } else if (isCurrentRank) {
      status = eligible ? 'available' : 'locked';
    } else if (isFutureRank) {
      status = 'locked';
    }

    let lockReason = null;
    if (!eligible && isCurrentRank) {
      if (!levelMet) lockReason = `Requires Level ${trial.requiredLevel}`;
      else if (!challengesMet) {
        const unmet = trial.requiredMasteredChallenges.filter(req => !masteredChallenges.includes(req));
        lockReason = `Requires mastery: ${unmet.join(', ')}`;
      } else {
        const unmet = Object.entries(trial.requiredConceptMastery)
          .filter(([c, lvl]) => (conceptMap[c] || 0) < lvl)
          .map(([c, lvl]) => `${c} Lv.${lvl}`);
        lockReason = `Requires mastery: ${unmet.join(', ')}`;
      }
    }

    return {
      ...trial,
      status,
      attempts,
      startedAt,
      completedAt,
      results: resultsJson ? JSON.parse(resultsJson) : null,
      eligible: isCurrentRank && eligible,
      lockReason: isCurrentRank ? lockReason : (isFutureRank ? 'Complete previous rank trial first' : null),
      levelMet,
      challengesMet,
      conceptsMet,
      currentLevel: profile.level,
      currentRank: profile.rank,
    };
  });
}

/**
 * Attempt a promotion trial - run the trial challenge's hidden tests.
 * If passed, atomically promote the user's rank.
 * Returns { success, allPassed, newRank, fromRank, toRank, results, attempts, error, errorType }.
 */
export async function attemptPromotion(userId, trialId, code, executeFn, buildHarnessFn) {
  const trial = PROMOTION_TRIALS.find(t => t.id === trialId);
  if (!trial) {
    return { success: false, error: 'Invalid promotion trial', errorType: 'invalid_trial' };
  }

  // Check if already promoted for this trial (idempotency guard for duplicate requests)
  const existingPromo = db.prepare(`
    SELECT status, results_json FROM rank_promotions WHERE user_id = ? AND from_rank = ?
  `).get(userId, trial.fromRank);
  if (existingPromo && existingPromo.status === 'completed') {
    const finalProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    let parsedResults = [];
    try { parsedResults = JSON.parse(existingPromo.results_json || '[]'); } catch {}
    return {
      success: true,
      allPassed: true,
      newRank: finalProfile ? finalProfile.rank : trial.toRank,
      fromRank: trial.fromRank,
      toRank: trial.toRank,
      alreadyCompleted: true,
      results: parsedResults,
      passedCount: parsedResults.filter((r) => r.passed).length,
      totalCount: parsedResults.length,
      profile: finalProfile ? {
        rank: finalProfile.rank,
        title: finalProfile.title,
        level: finalProfile.level,
        xp: finalProfile.xp,
      } : null,
    };
  }

  // Verify user's current rank matches trial's fromRank
  const profile = db.prepare('SELECT rank, level FROM profiles WHERE user_id = ?').get(userId);
  if (!profile || profile.rank !== trial.fromRank) {
    return { success: false, error: 'You are not eligible for this trial', errorType: 'not_eligible' };
  }

  // Check eligibility
  const eligibility = checkPromotionEligibility(userId, trial);
  if (!eligibility.eligible) {
    return { success: false, error: 'Requirements not met', errorType: 'requirements_not_met', reasons: eligibility.reasons };
  }

  // Get the trial challenge
  const challenge = serverChallenges[trial.trialChallengeId];
  if (!challenge) {
    return { success: false, error: 'Trial challenge not found', errorType: 'challenge_not_found' };
  }

  // Build test cases (sample + hidden)
  const testCases = [
    ...challenge.sampleTests.map(t => ({ ...t, isHidden: false })),
    ...challenge.hiddenTests.map(t => ({ ...t, isHidden: true })),
  ];

  try {
    let exec = executeFn;
    let buildScript = buildHarnessFn;
    if (!exec || !buildScript) {
      const runner = await import('./runner.mjs');
      exec = runner.executeInPythonProcess;
      buildScript = runner.buildHarnessScript;
    }

    const script = buildScript(code, challenge.functionName, testCases);
    const evalResult = await exec(script);

    const allPassed = evalResult.allPassed && evalResult.results.every(r => r.passed);
    const passedCount = evalResult.results ? evalResult.results.filter(r => r.passed).length : 0;
    const totalCount = evalResult.results ? evalResult.results.length : 0;
    const now = new Date().toISOString();

    if (allPassed) {
      // Atomic promotion transaction
      db.exec('BEGIN IMMEDIATE');
      try {
        // Re-verify rank hasn't changed
        const currentProfile = db.prepare('SELECT rank FROM profiles WHERE user_id = ?').get(userId);
        if (!currentProfile || currentProfile.rank !== trial.fromRank) {
          db.exec('ROLLBACK');
          return {
            success: false,
            error: 'Rank already changed, cannot promote',
            errorType: 'rank_changed',
          };
        }

        // Check if already promoted for this trial (idempotency)
        const existingPromo = db.prepare(`
          SELECT status FROM rank_promotions WHERE user_id = ? AND from_rank = ?
        `).get(userId, trial.fromRank);
        if (existingPromo && existingPromo.status === 'completed') {
          db.exec('COMMIT');
          // Already completed, return success with current rank
          const finalProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
          return {
            success: true,
            allPassed: true,
            newRank: finalProfile.rank,
            fromRank: trial.fromRank,
            toRank: trial.toRank,
            alreadyCompleted: true,
            results: evalResult.results,
            passedCount,
            totalCount,
          };
        }

        // Get rank title for new rank
        const { title: newTitle } = getRankAndTitleForLevel(profile.level);

        // Update profile rank and title (preserve XP, level, everything else)
        db.prepare(`
          UPDATE profiles
          SET rank = ?, title = ?, updated_at = ?
          WHERE user_id = ?
        `).run(trial.toRank, newTitle, now, userId);

        // Upsert promotion record
        if (existingPromo) {
          db.prepare(`
            UPDATE rank_promotions
            SET status = 'completed', attempts = attempts + 1, completed_at = ?, results_json = ?, updated_at = ?
            WHERE user_id = ? AND from_rank = ?
          `).run(now, JSON.stringify(evalResult.results), now, userId, trial.fromRank);
        } else {
          db.prepare(`
            INSERT INTO rank_promotions (id, user_id, from_rank, to_rank, challenge_id, status, attempts, started_at, completed_at, results_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'completed', 1, ?, ?, ?, ?, ?)
          `).run(`rp_${userId}_${trial.fromRank}`, userId, trial.fromRank, trial.toRank, trial.trialChallengeId, now, now, JSON.stringify(evalResult.results), now, now);
        }

        db.exec('COMMIT');

        const finalProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
        return {
          success: true,
          allPassed: true,
          newRank: finalProfile.rank,
          fromRank: trial.fromRank,
          toRank: trial.toRank,
          results: evalResult.results,
          passedCount,
          totalCount,
          profile: {
            rank: finalProfile.rank,
            title: finalProfile.title,
            level: finalProfile.level,
            xp: finalProfile.xp,
          },
        };
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch {}
        throw err;
      }
    } else {
      // Failed attempt - record it
      const existingPromo = db.prepare(`
        SELECT id FROM rank_promotions WHERE user_id = ? AND from_rank = ?
      `).get(userId, trial.fromRank);
      const now = new Date().toISOString();
      
      if (existingPromo) {
        db.prepare(`
          UPDATE rank_promotions
          SET attempts = attempts + 1, status = 'in-progress', updated_at = ?, results_json = ?
          WHERE id = ?
        `).run(now, JSON.stringify(evalResult.results), existingPromo.id);
      } else {
        db.prepare(`
          INSERT INTO rank_promotions (id, user_id, from_rank, to_rank, challenge_id, status, attempts, started_at, results_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'in-progress', 1, ?, ?, ?, ?)
        `).run(`rp_${userId}_${trial.fromRank}`, userId, trial.fromRank, trial.toRank, trial.trialChallengeId, now, JSON.stringify(evalResult.results), now, now);
      }

      const errorInfo = categorizeRunnerError(evalResult);
      return {
        success: false,
        allPassed: false,
        passedCount,
        totalCount,
        results: evalResult.results,
        error: errorInfo.message,
        errorType: errorInfo.type,
        attempts: (existingPromo?.attempts || 0) + 1,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Promotion trial error: ${err.message}`,
      errorType: 'internal_error',
    };
  }
}

// Helper to categorize runner errors (duplicated from runner for server-side use)
function categorizeRunnerError(evalResult) {
  if (!evalResult.success) {
    if (evalResult.error && evalResult.error.includes('Time Limit Exceeded')) {
      return { type: 'timeout', message: 'Time Limit Exceeded: Your code took too long to execute.' };
    }
    if (evalResult.error && (evalResult.error.includes('SyntaxError') || evalResult.error.includes('IndentationError'))) {
      return { type: 'syntax', message: `Syntax Error: ${evalResult.error.split('\n')[0]}` };
    }
    return { type: 'runtime', message: `Runtime Error: ${evalResult.error?.split('\n')[0] || 'Unknown error'}` };
  }
  if (!evalResult.allPassed) {
    const failedTest = evalResult.results.find(r => !r.passed);
    if (failedTest?.error) {
      return { type: 'runtime', message: `Runtime Error on test "${failedTest.description}": ${failedTest.error.split('\n')[0]}` };
    }
    return { type: 'incorrect_output', message: `Incorrect Output: Test "${failedTest?.description || 'unknown'}" failed.` };
  }
  return { type: 'success', message: 'All tests passed!' };
}

/**
 * Get daily quest data for user (quests, chest, streak)
 */
export function getDailyQuests(userId) {
  return getDailyQuestData(userId);
}

/**
 * Claim daily reward chest
 */
export function claimDailyChest(userId) {
  return claimRewardChest(userId);
}

/**
 * Record a qualifying learning activity (updates streak and daily quest progress)
 */
export function recordLearningActivity(userId, activityType, targetId) {
  // Update streak
  const streakResult = updateLearningStreak(userId);
  
  // Update daily quest progress
  let questProgress = null;
  if (activityType === 'main_challenge' || activityType === 'practice_challenge' || activityType === 'concept_mastery') {
    questProgress = updateDailyQuestProgress(userId, activityType, targetId);
  }
  
  return { streak: streakResult, questProgress };
}

/**
 * Learning profile — analyzes a user's submission history, concept mastery,
 * and skill levels to determine strengths, weaknesses, and recommendations.
 */
export function getLearningProfile(userId) {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!profile) return null;

  const conceptMastery = getUserConceptMastery(userId);
  const conceptMap = {};
  for (const row of conceptMastery) {
    conceptMap[row.concept_id] = row.mastery_level;
  }

  const skillRecords = db.prepare('SELECT skill_id, level FROM mastery_records WHERE user_id = ?').all(userId);
  const skillMap = {};
  for (const row of skillRecords) {
    skillMap[row.skill_id] = row.level;
  }

  const masteredChallenges = getUserMasteredChallenges(userId);
  const masteredChallengeIds = new Set(masteredChallenges.map(r => r.challenge_id));

  const submissions = db.prepare(`
    SELECT challenge_id, passed, passed_count, total_count, created_at
    FROM submissions
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);

  // Calculate per-concept success rates from mastery data
  const allConcepts = ['variables', 'conditionals', 'strings', 'loops', 'arrays', 'functions', 'dictionaries', 'recursion'];
  const fixedConceptStats = {};
  allConcepts.forEach(c => {
    fixedConceptStats[c] = { submissions: 0, passed: 0, successRate: 0 };
  });
  for (const [concept, level] of Object.entries(conceptMap)) {
    if (fixedConceptStats[concept]) {
      fixedConceptStats[concept].subscriptions += 1;
      if (level >= 3) {
        fixedConceptStats[concept].passed += 1;
      }
    }
  }
  for (const c of Object.keys(fixedConceptStats)) {
    const fs = fixedConceptStats[c];
    fs.successRate = fs.subscriptions > 0 ? fs.passed / fs.subscriptions : 0;
  }

  // Determine weak and strong concepts
  const weakConcepts = [];
  const strongConcepts = [];
  for (const c of allConcepts) {
    const fs = fixedConceptStats[c];
    if (fs.successRate < 0.5 || (fs.subscriptions > 0 && (conceptMap[c] || 0) < 3)) {
      weakConcepts.push(c);
    }
    if (fs.successRate >= 0.8 && (conceptMap[c] || 0) >= 4) {
      strongConcepts.push(c);
    }
  }

  // Determine recent attempt patterns
  const recentAttempts = {};
  submissions.slice(0, 20).forEach(s => {
    const cid = s.challenge_id;
    if (!recentAttempts[cid]) {
      recentAttempts[cid] = { attempts: 0, passed: 0, lastStatus: null };
    }
    recentAttempts[cid].attempts += 1;
    if (s.passed) {
      recentAttempts[cid].passed += 1;
    }
    if (s.total_count > 0) {
      const rate = s.passed_count / s.total_count;
      if (recentAttempts[cid].lastStatus === null || rate > recentAttempts[cid].lastStatus) {
        recentAttempts[cid].lastStatus = rate;
      }
    } else if (s.passed) {
      recentAttempts[cid].lastStatus = 1;
    }
  });

  // Count unlocked skills
  const skillsUnlocked = Object.values(skillMap).filter(l => l > 0).length;

  // Strategy 1: If there are weak concepts, recommend practice for those
  let recommendedChallengeId = null;
  let recommendationReason = '';
  let strengths = [];
  let needsPractice = [];

  if (weakConcepts.length > 0) {
    // Find practice challenges for weak concepts
    const practiceForWeak = [];
    for (const c of weakConcepts) {
      // Find main challenges with this concept
      const mainChallenges = Object.entries(serverChallenges).filter(([id, info]) => info.conceptId === c && !id.includes('-practice'));
      for (const [id, info] of mainChallenges) {
        if (!masteredChallengeIds.has(id)) {
          practiceForWeak.push({ id, concept: info.conceptId, difficulty: 'main' });
        }
      }
      // Also find practice challenges
      const practiceChallenges = Object.entries(serverChallenges).filter(([id, info]) => info.conceptId === c && id.includes('-practice'));
      for (const [id, info] of practiceChallenges) {
        const mainId = id.replace('-practice', '');
        if (!masteredChallengeIds.has(mainId)) {
          practiceForWeak.push({ id, concept: info.conceptId, difficulty: 'practice' });
        }
      }
    }
    // Sort by difficulty (easy first for weak concepts)
    const diffOrder = { easy: 1, medium: 2, hard: 3 };
    practiceForWeak.sort((a, b) => (diffOrder[a.difficulty] || 0) - (diffOrder[b.difficulty] || 0));
    if (practiceForWeak.length > 0) {
      recommendedChallengeId = practiceForWeak[0].id;
      recommendationReason = `Practice ${recommendedChallengeId} to strengthen ${practiceForWeak[0].concept} mastery`;
      needsPractice = [recommendedChallengeId];
      strengths = strongConcepts;
    }
  }

  // Strategy 2: If consistent success (last 3 submissions all passed), recommend harder challenge
  if (!recommendedChallengeId && submissions.length >= 3) {
    const lastThree = submissions.slice(0, 3);
    const allPassed = lastThree.every(s => s.passed);
    if (allPassed) {
      // Find available challenges that are harder than current level
      const availableChallenges = [];
      for (const [id, challenge] of Object.entries(serverChallenges)) {
        if (id.includes('-practice')) continue;
        if (masteredChallengeIds.has(id)) continue;
        const prereqs = challenge.prerequisiteIds || [];
        const prereqsMet = prerequisitesMet(userId, prereqs);
        if (prereqsMet) {
          const diffOrder = { easy: 1, medium: 2, hard: 3 };
          availableChallenges.push({ id, difficulty: diffOrder[challenge.conceptId] || 2, concept: challenge.conceptId });
        }
      }
      // Sort by difficulty ascending (recommend next level up)
      availableChallenges.sort((a, b) => a.difficulty - b.difficulty);
      if (availableChallenges.length > 0) {
        recommendedChallengeId = availableChallenges[0].id;
        recommendationReason = `Ready for a harder challenge: ${recommendedChallengeId}`;
        strengths = strongConcepts;
        needsPractice = [];
      }
    }
  }

  // Strategy 3: Default - recommend first available challenge meeting prerequisites
  if (!recommendedChallengeId) {
    for (const [id, challenge] of Object.entries(serverChallenges)) {
      if (id.includes('-practice')) continue;
      if (masteredChallengeIds.has(id)) continue;
      const prereqs = challenge.prerequisiteIds || [];
      const prereqsMet = prerequisitesMet(userId, prereqs);
      if (prereqsMet) {
        recommendedChallengeId = id;
        recommendationReason = `Start ${recommendedChallengeId} — ${challenge.conceptId} fundamentals`;
        strengths = strongConcepts;
        needsPractice = [];
        break;
      }
    }
  }

  // Fallback: py-01 if nothing else available
  if (!recommendedChallengeId && !masteredChallengeIds.has('py-01')) {
    recommendedChallengeId = 'py-01';
    recommendationReason = 'Start with The Awakening: Mana Calculation — variables fundamentals';
  }

  return {
    userId,
    level: profile.level,
    rank: profile.rank,
    conceptMastery: conceptMap,
    skillMap,
    masteredChallengeIds,
    weakConcepts,
    strongConcepts,
    fixedConceptStats,
    recentAttempts,
    recommendedChallengeId,
    recommendationReason,
    strengths,
    needsPractice,
    skillsUnlocked,
  };
}

/**
 * Check if user has mastered all given prerequisite challenge IDs
 */
function prerequisitesMet(userId, prerequisiteIds) {
  if (!prerequisiteIds || prerequisiteIds.length === 0) return true;
  const mastered = db.prepare(`
    SELECT challenge_id FROM challenge_mastery
    WHERE user_id = ? AND challenge_id IN (${prerequisiteIds.map(() => '?').join(',')})
  `).all(userId, ...prerequisiteIds);
  return mastered.length === prerequisiteIds.length;
}

/**
 * Get adaptive challenge recommendation for a user.
 * Returns a ready-to-display recommendation object.
 */
export function getChallengeRecommendation(userId) {
  const profile = getLearningProfile(userId);
  if (!profile) return null;

  // If user has a clear recommendation, return it with challenge details
  if (profile.recommendedChallengeId) {
    const challenge = serverChallenges[profile.recommendedChallengeId];
    if (challenge) {
      return {
        challengeId: profile.recommendedChallengeId,
        title: challenge.title,
        description: challenge.description,
        concept: challenge.conceptId,
        xpReward: challenge.xpReward,
        prerequisiteIds: challenge.prerequisiteIds,
        reason: profile.recommendationReason,
        strengths: profile.strengths,
        needsPractice: profile.needsPractice,
        levelMet: profile.level,
        rank: profile.rank,
      };
    }
  }

  // Fallback: return learning profile data for UI to display
  return {
    challengeId: profile.recommendedChallengeId || null,
    title: 'No recommendation available',
    description: 'Complete challenges to unlock personalized recommendations',
    concept: null,
    xpReward: 0,
    prerequisiteIds: [],
    reason: 'Build your learning history by completing challenges',
    strengths: profile.strongConcepts,
    needsPractice: profile.weakConcepts,
    levelMet: profile.level,
    rank: profile.rank,
    ...profile,
  };
}

/**
 * Get current learning progress summary for dashboard
 */
export function getLearningProgress(userId) {
  const profile = getLearningProfile(userId);
  if (!profile) return null;

  const masteredChallenges = getUserMasteredChallenges(userId);
  const totalMainChallenges = 10; // py-01 through py-10
  const completionRate = masteredChallenges.length / totalMainChallenges;

  // Count skills unlocked (level > 0)
  const skillsUnlocked = Object.values(profile.skillMap).filter(l => l > 0).length;
  const totalSkills = profile.skillMap ? Object.keys(profile.skillMap).length : 14;

  // Concept mastery summary
  const conceptOrder = ['variables', 'conditionals', 'strings', 'loops', 'arrays', 'functions', 'dictionaries', 'recursion'];
  const conceptSummary = [];
  for (const c of conceptOrder) {
    const masteryRow = profile.conceptMastery.find(m => m.concept_id === c);
    const masteryLevel = masteryRow ? masteryRow.mastery_level : 0;
    const fs = profile.fixedConceptStats[c];
    const successRate = fs ? fs.successRate : 0;
    conceptSummary.push({
      concept: c,
      masteryLevel,
      successRate,
    });
  }

  return {
    completionRate,
    skillsUnlocked,
    totalSkills,
    conceptSummary,
    weakConcepts: profile.weakConcepts,
    strongConcepts: profile.strongConcepts,
    recentAttempts: Object.keys(profile.recentAttempts).length,
    recommendedChallengeId: profile.recommendedChallengeId,
    recommendationReason: profile.recommendationReason,
  };
}
