/**
 * Shadow Code — Seasonal Events, Ranked Arena & Coding Tournaments System
 *
 * Implements:
 *  1. Configurable Seasons: active/completed states, seasonal XP, leaderboards,
 *     historical archives, and exactly-once seasonal reward claims.
 *  2. Ranked Coding Arena: Elo-based matchmaking and rating calculation,
 *     divisions (Bronze to Monarch), match timers, live duels, rating history.
 *  3. Single-Elimination Tournament Brackets: registration, seeding, odd-participant
 *     byes, bracket progression, automatic winner determination, and rewards.
 *  4. Full integration with player progression, XP, achievements, and titles.
 */

import crypto from 'node:crypto';
import { db } from './db.mjs';
import { awardQuestCompletionAtomic, getXpRequiredForLevel } from './auth.mjs';
import { unlockUserTitle, checkAndUnlockAchievements } from './achievements.mjs';
import { serverChallenges } from './challenges.mjs';

function getPositiveSetting(name, fallback) {
  const parsed = Number.parseFloat(process.env[name] || '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const ARENA_K_FACTOR = getPositiveSetting('ARENA_K_FACTOR', 24);
const ARENA_PROVISIONAL_K_FACTOR = getPositiveSetting('ARENA_PROVISIONAL_K_FACTOR', 40);
const ARENA_QUEUE_TTL_MS = 5 * 60 * 1000;
const ARENA_QUEUE_BASE_RANGE = 100;
const ARENA_QUEUE_RANGE_STEP = 50;
const ARENA_QUEUE_RANGE_INTERVAL_MS = 15 * 1000;
const ARENA_MATCH_DURATION_SEC = 600;
const ARENA_MAX_SUBMISSION_ATTEMPTS = 5;

// ─── Database Initialization ────────────────────────────────────────────────

export function initSeasonTables() {
  db.exec(`
    -- Seasons Table
    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      season_number INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', -- 'upcoming', 'active', 'completed'
      rewards_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Season Participants & Standing
    CREATE TABLE IF NOT EXISTS season_participants (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seasonal_xp INTEGER NOT NULL DEFAULT 0,
      arena_rating INTEGER NOT NULL DEFAULT 1000,
      peak_rating INTEGER NOT NULL DEFAULT 1000,
      division TEXT NOT NULL DEFAULT 'Bronze',
      final_placement INTEGER,
      rewards_claimed INTEGER NOT NULL DEFAULT 0,
      claimed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(season_id, user_id)
    );

    -- Season Reward Claims (Idempotent Audit Log)
    CREATE TABLE IF NOT EXISTS season_reward_claims (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      title_awarded TEXT,
      claimed_at TEXT NOT NULL,
      UNIQUE(season_id, user_id)
    );

    -- Ranked Arena Profiles
    CREATE TABLE IF NOT EXISTS arena_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL DEFAULT 1000,
      peak_rating INTEGER NOT NULL DEFAULT 1000,
      division TEXT NOT NULL DEFAULT 'Bronze',
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    -- Ranked Arena Matchmaking Queue
    CREATE TABLE IF NOT EXISTS arena_queue (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL DEFAULT 1000,
      division TEXT NOT NULL DEFAULT 'Bronze',
      queued_at TEXT NOT NULL
    );

    -- Ranked Arena Matches
    CREATE TABLE IF NOT EXISTS arena_matches (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL REFERENCES seasons(id),
      challenge_id TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'ranked', -- 'ranked', 'tournament', 'practice'
      player1_id TEXT NOT NULL REFERENCES users(id),
      player2_id TEXT NOT NULL REFERENCES users(id),
      p1_name TEXT NOT NULL,
      p2_name TEXT NOT NULL,
      p1_rating_before INTEGER NOT NULL,
      p2_rating_before INTEGER NOT NULL,
      p1_rating_after INTEGER,
      p2_rating_after INTEGER,
      player1_score INTEGER NOT NULL DEFAULT 0,
      player2_score INTEGER NOT NULL DEFAULT 0,
      player1_passed_count INTEGER NOT NULL DEFAULT 0,
      player2_passed_count INTEGER NOT NULL DEFAULT 0,
      player1_total_tests INTEGER NOT NULL DEFAULT 0,
      player2_total_tests INTEGER NOT NULL DEFAULT 0,
      player1_time_ms INTEGER NOT NULL DEFAULT 0,
      player2_time_ms INTEGER NOT NULL DEFAULT 0,
      player1_status TEXT NOT NULL DEFAULT 'waiting' CHECK(player1_status IN ('waiting', 'submitted', 'completed', 'timed_out', 'forfeited')),
      player2_status TEXT NOT NULL DEFAULT 'waiting' CHECK(player2_status IN ('waiting', 'submitted', 'completed', 'timed_out', 'forfeited')),
      winner_id TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('waiting', 'ready', 'in_progress', 'completed', 'cancelled', 'expired', 'abandoned')),
      duration_limit_sec INTEGER NOT NULL DEFAULT 600,
      start_time TEXT NOT NULL,
      deadline_at TEXT,
      end_time TEXT,
      created_at TEXT NOT NULL
    );

    -- Match Submissions Log
    CREATE TABLE IF NOT EXISTS arena_match_submissions (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0,
      passed_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      attempt_number INTEGER NOT NULL DEFAULT 1 CHECK(attempt_number > 0),
      submitted_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Rating History Log
    CREATE TABLE IF NOT EXISTS rating_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id TEXT,
      rating_before INTEGER NOT NULL,
      rating_after INTEGER NOT NULL,
      change INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Ranked match participants are the authority for active-match ownership.
    CREATE TABLE IF NOT EXISTS arena_match_participants (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      state TEXT NOT NULL DEFAULT 'ready' CHECK(state IN ('ready', 'submitting', 'submitted', 'completed', 'forfeited', 'timed_out')),
      attempts_count INTEGER NOT NULL DEFAULT 0 CHECK(attempts_count >= 0),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      joined_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(match_id, user_id),
      UNIQUE(match_id, slot)
    );

    CREATE TABLE IF NOT EXISTS arena_submission_locks (
      match_id TEXT NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lock_id TEXT NOT NULL UNIQUE,
      locked_at TEXT NOT NULL,
      PRIMARY KEY(match_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS arena_match_rewards (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reward_type TEXT NOT NULL,
      xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK(xp_awarded >= 0),
      title_awarded TEXT,
      awarded_at TEXT NOT NULL,
      UNIQUE(match_id, user_id, reward_type)
    );

    -- Tournaments Table
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      format TEXT NOT NULL DEFAULT 'single_elimination',
      max_participants INTEGER NOT NULL DEFAULT 8,
      current_participants INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'registration', -- 'upcoming', 'registration', 'in_progress', 'completed', 'cancelled'
      start_time TEXT,
      end_time TEXT,
      current_round INTEGER NOT NULL DEFAULT 1,
      total_rounds INTEGER NOT NULL DEFAULT 3,
      rewards_json TEXT NOT NULL,
      winner_id TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Tournament Participants
    CREATE TABLE IF NOT EXISTS tournament_participants (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      seed INTEGER NOT NULL DEFAULT 0,
      eliminated INTEGER NOT NULL DEFAULT 0,
      eliminated_round INTEGER,
      final_rank INTEGER,
      rewards_claimed INTEGER NOT NULL DEFAULT 0,
      registered_at TEXT NOT NULL,
      UNIQUE(tournament_id, user_id)
    );

    -- Tournament Matches / Brackets
    CREATE TABLE IF NOT EXISTS tournament_matches (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      match_index INTEGER NOT NULL,
      player1_id TEXT,
      player2_id TEXT,
      p1_name TEXT,
      p2_name TEXT,
      winner_id TEXT,
      challenge_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'bye'
      next_match_id TEXT,
      arena_match_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_season_parts_user ON season_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_season_parts_season ON season_participants(season_id);
    CREATE INDEX IF NOT EXISTS idx_arena_matches_p1 ON arena_matches(player1_id);
    CREATE INDEX IF NOT EXISTS idx_arena_matches_p2 ON arena_matches(player2_id);
    CREATE INDEX IF NOT EXISTS idx_arena_queue_time ON arena_queue(queued_at);
    CREATE INDEX IF NOT EXISTS idx_arena_participants_user ON arena_match_participants(user_id, active);
    CREATE INDEX IF NOT EXISTS idx_arena_submissions_user ON arena_match_submissions(user_id, match_id);
    CREATE INDEX IF NOT EXISTS idx_rating_history_user_time ON rating_history(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tourn_matches_tourn ON tournament_matches(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tourn_parts_tourn ON tournament_participants(tournament_id);
  `);

  ensureArenaMigration();
  seedDefaultSeasonAndTournaments();
}

function ensureArenaMigration() {
  const tournCols = db.prepare('PRAGMA table_info(tournaments)').all();
  if (!tournCols.some((column) => column.name === 'created_by')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN created_by TEXT REFERENCES users(id)');
  }

  const columns = db.prepare('PRAGMA table_info(arena_matches)').all();
  if (!columns.some((column) => column.name === 'deadline_at')) {
    db.exec('ALTER TABLE arena_matches ADD COLUMN deadline_at TEXT');
  }
  const submissionColumns = db.prepare('PRAGMA table_info(arena_match_submissions)').all();
  if (!submissionColumns.some((column) => column.name === 'attempt_number')) {
    db.exec('ALTER TABLE arena_match_submissions ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1');
  }

  const missingDeadlines = db.prepare(`
    SELECT id, start_time, duration_limit_sec FROM arena_matches WHERE deadline_at IS NULL
  `).all();
  const setDeadline = db.prepare('UPDATE arena_matches SET deadline_at = ? WHERE id = ?');
  for (const match of missingDeadlines) {
    const start = Date.parse(match.start_time);
    if (Number.isFinite(start)) {
      setDeadline.run(new Date(start + match.duration_limit_sec * 1000).toISOString(), match.id);
    }
  }

  const submissionAttempts = db.prepare(`
    SELECT id, match_id, user_id
    FROM arena_match_submissions
    ORDER BY match_id, user_id, submitted_at, id
  `).all();
  const attemptCounts = new Map();
  const updateAttempt = db.prepare('UPDATE arena_match_submissions SET attempt_number = ? WHERE id = ?');
  for (const submission of submissionAttempts) {
    const key = `${submission.match_id}\u0000${submission.user_id}`;
    const attemptNumber = (attemptCounts.get(key) || 0) + 1;
    attemptCounts.set(key, attemptNumber);
    updateAttempt.run(attemptNumber, submission.id);
  }

  const activeMatches = db.prepare(`
    SELECT id, player1_id, player2_id
    FROM arena_matches
    WHERE status IN ('waiting', 'ready', 'in_progress')
    ORDER BY created_at DESC
  `).all();
  const assignedUsers = new Set();
  const cancelDuplicate = db.prepare(`
    UPDATE arena_matches SET status = 'cancelled', end_time = ? WHERE id = ?
  `);
  const nowIso = new Date().toISOString();
  for (const match of activeMatches) {
    if (assignedUsers.has(match.player1_id) || assignedUsers.has(match.player2_id)) {
      cancelDuplicate.run(nowIso, match.id);
      continue;
    }
    assignedUsers.add(match.player1_id);
    assignedUsers.add(match.player2_id);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_arena_matches_status_deadline ON arena_matches(status, deadline_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_submission_attempt
      ON arena_match_submissions(match_id, user_id, attempt_number);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_arena_one_active_match_per_user
      ON arena_match_participants(user_id) WHERE active = 1;
    CREATE TRIGGER IF NOT EXISTS trg_arena_match_status_insert
      BEFORE INSERT ON arena_matches
      WHEN NEW.status NOT IN ('waiting', 'ready', 'in_progress', 'completed', 'cancelled', 'expired', 'abandoned')
      BEGIN SELECT RAISE(ABORT, 'Invalid arena match status'); END;
    CREATE TRIGGER IF NOT EXISTS trg_arena_match_status_update
      BEFORE UPDATE OF status ON arena_matches
      WHEN NEW.status NOT IN ('waiting', 'ready', 'in_progress', 'completed', 'cancelled', 'expired', 'abandoned')
      BEGIN SELECT RAISE(ABORT, 'Invalid arena match status'); END;
    CREATE TRIGGER IF NOT EXISTS trg_arena_match_players_insert
      BEFORE INSERT ON arena_matches
      WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.player1_id)
        OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.player2_id)
      BEGIN SELECT RAISE(ABORT, 'Unknown arena match player'); END;
    CREATE TRIGGER IF NOT EXISTS trg_arena_match_players_update
      BEFORE UPDATE OF player1_id, player2_id ON arena_matches
      WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.player1_id)
        OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.player2_id)
      BEGIN SELECT RAISE(ABORT, 'Unknown arena match player'); END;
    CREATE TRIGGER IF NOT EXISTS trg_arena_match_player_status_insert
      BEFORE INSERT ON arena_matches
      WHEN NEW.player1_status NOT IN ('waiting', 'submitted', 'completed', 'timed_out', 'forfeited')
        OR NEW.player2_status NOT IN ('waiting', 'submitted', 'completed', 'timed_out', 'forfeited')
      BEGIN SELECT RAISE(ABORT, 'Invalid arena player status'); END;
    CREATE TRIGGER IF NOT EXISTS trg_arena_match_player_status_update
      BEFORE UPDATE OF player1_status, player2_status ON arena_matches
      WHEN NEW.player1_status NOT IN ('waiting', 'submitted', 'completed', 'timed_out', 'forfeited')
        OR NEW.player2_status NOT IN ('waiting', 'submitted', 'completed', 'timed_out', 'forfeited')
      BEGIN SELECT RAISE(ABORT, 'Invalid arena player status'); END;
  `);

  const participantInsert = db.prepare(`
    INSERT OR IGNORE INTO arena_match_participants
      (id, match_id, user_id, slot, state, attempts_count, active, joined_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const match of db.prepare(`
    SELECT id, player1_id, player2_id, player1_status, player2_status, status, created_at
    FROM arena_matches
  `).all()) {
    const active = ['waiting', 'ready', 'in_progress'].includes(match.status) ? 1 : 0;
    for (const [slot, userId, state] of [
      [1, match.player1_id, match.player1_status],
      [2, match.player2_id, match.player2_status],
    ]) {
      if (db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) {
        const submissionCount = db.prepare(`
          SELECT COUNT(*) as count FROM arena_match_submissions WHERE match_id = ? AND user_id = ?
        `).get(match.id, userId).count;
        participantInsert.run(
          `amp_${match.id}_${slot}`,
          match.id,
          userId,
          slot,
          state === 'completed' ? 'completed'
            : state === 'forfeited' ? 'forfeited'
              : state === 'timed_out' ? 'timed_out'
                : state === 'submitted' ? 'submitted' : 'ready',
          submissionCount,
          active,
          match.created_at,
          nowIso
        );
      }
    }
  }
}

// ─── Default Data Seeding ───────────────────────────────────────────────────

function seedDefaultSeasonAndTournaments() {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Seed Season 1 if no season exists
  const seasonCount = db.prepare('SELECT COUNT(*) as c FROM seasons').get().c;
  if (seasonCount === 0) {
    const startDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const rewards = {
      Monarch: { xp: 2500, title: 'Season 1 Monarch', minRating: 2000 },
      Diamond: { xp: 1500, title: 'Shadow Sovereign', minRating: 1800 },
      Platinum: { xp: 1000, title: 'Abyssal Knight', minRating: 1600 },
      Gold: { xp: 600, title: 'Shadow Ascendant', minRating: 1400 },
      Silver: { xp: 350, title: 'Dungeon Conqueror', minRating: 1200 },
      Bronze: { xp: 150, title: 'Novice Duelist', minRating: 0 },
    };

    db.prepare(`
      INSERT INTO seasons (id, season_number, name, description, start_date, end_date, status, rewards_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      'season-1',
      1,
      'Season 1: Monarch Awakening',
      'The inaugural competitive season of Shadow Code. Climb the arena divisions and carve your name in shadow history.',
      startDate,
      endDate,
      JSON.stringify(rewards),
      nowIso,
      nowIso
    );
  }

  // 2. Seed default tournaments if none exist
  const tournamentCount = db.prepare('SELECT COUNT(*) as c FROM tournaments').get().c;
  if (tournamentCount === 0) {
    const rewards = {
      firstPlace: { xp: 1500, title: 'Grandmaster of Shadows' },
      secondPlace: { xp: 800, title: 'Tournament Finalist' },
      semifinalist: { xp: 400, title: 'Tournament Contender' },
    };

    const t1StartTime = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const t2StartTime = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO tournaments (id, season_id, title, description, format, max_participants, current_participants, status, start_time, total_rounds, rewards_json, created_at, updated_at)
      VALUES (?, 'season-1', ?, ?, 'single_elimination', 8, 0, 'registration', ?, 3, ?, ?, ?)
    `).run(
      'tourn-001',
      'Shadow Monarch Invitational',
      'An 8-hunter single-elimination tournament for elite coders. Prove your algorithmic supremacy.',
      t1StartTime,
      JSON.stringify(rewards),
      nowIso,
      nowIso
    );

    db.prepare(`
      INSERT INTO tournaments (id, season_id, title, description, format, max_participants, current_participants, status, start_time, total_rounds, rewards_json, created_at, updated_at)
      VALUES (?, 'season-1', ?, ?, 'single_elimination', 8, 0, 'registration', ?, 3, ?, ?, ?)
    `).run(
      'tourn-002',
      'Abyssal Clash Open',
      'Open bracket tournament testing speed, accuracy, and algorithmic endurance under pressure.',
      t2StartTime,
      JSON.stringify(rewards),
      nowIso,
      nowIso
    );
  }
}

// ─── Division & Elo Rating Engine ───────────────────────────────────────────

export const DIVISIONS = [
  { name: 'Bronze', minRating: 0, maxRating: 1199, icon: '🥉', color: '#cd7f32' },
  { name: 'Silver', minRating: 1200, maxRating: 1399, icon: '🥈', color: '#c0c0c0' },
  { name: 'Gold', minRating: 1400, maxRating: 1599, icon: '🥇', color: '#fbbf24' },
  { name: 'Platinum', minRating: 1600, maxRating: 1799, icon: '💎', color: '#22d3ee' },
  { name: 'Diamond', minRating: 1800, maxRating: 1999, icon: '💠', color: '#818cf8' },
  { name: 'Monarch', minRating: 2000, maxRating: 99999, icon: '👑', color: '#c084fc' },
];

export function getDivision(rating) {
  const parsed = Number(rating);
  const r = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1000;
  for (let i = DIVISIONS.length - 1; i >= 0; i--) {
    if (r >= DIVISIONS[i].minRating) {
      return DIVISIONS[i].name;
    }
  }
  return 'Bronze';
}

/**
 * Calculates standard Elo rating changes for a match.
 * @param {number} ratingA - Player A current rating
 * @param {number} ratingB - Player B current rating
 * @param {number} scoreA - 1 (win), 0.5 (draw), 0 (loss)
 * @param {number} matchesPlayedA - Number of matches previously played by Player A
 * @returns {number} delta rating change for Player A
 */
export function calculateEloChange(ratingA, ratingB, scoreA, matchesPlayedA = 0, kFactor = null) {
  if (![ratingA, ratingB, scoreA, matchesPlayedA].every(Number.isFinite)
    || ratingA < 0 || ratingB < 0 || scoreA < 0 || scoreA > 1 || matchesPlayedA < 0) {
    throw new TypeError('Elo inputs must be finite ratings, a score from 0 to 1, and a non-negative match count.');
  }
  const rA = ratingA;
  const rB = ratingB;
  const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const k = kFactor ?? (matchesPlayedA < 10 ? ARENA_PROVISIONAL_K_FACTOR : ARENA_K_FACTOR);
  if (!Number.isFinite(k) || k <= 0) throw new TypeError('The Elo K-factor must be positive.');
  return Math.round(k * (scoreA - expectedA));
}

// ─── Seasonal System ────────────────────────────────────────────────────────

/**
 * Auto-checks and transitions expired seasons.
 */
export function checkAndCompleteExpiredSeasons() {
  const nowIso = new Date().toISOString();
  const transitions = db.prepare(`
    SELECT id, name, status,
           CASE
             WHEN end_date <= ? THEN 'completed'
             WHEN start_date > ? THEN 'upcoming'
             ELSE 'active'
           END as next_status
    FROM seasons
    WHERE status != 'completed'
      AND (
        (end_date <= ? AND status != 'completed')
        OR (start_date <= ? AND end_date > ? AND status != 'active')
        OR (start_date > ? AND status != 'upcoming')
      )
  `).all(nowIso, nowIso, nowIso, nowIso, nowIso, nowIso);

  for (const s of transitions) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE seasons SET status = ?, updated_at = ? WHERE id = ?')
        .run(s.next_status, nowIso, s.id);

      if (s.next_status === 'completed') {
        const participants = db.prepare(`
          SELECT user_id
          FROM season_participants
          WHERE season_id = ?
          ORDER BY seasonal_xp DESC, arena_rating DESC, user_id ASC
        `).all(s.id);

        participants.forEach((participant, index) => {
          db.prepare(`
            UPDATE season_participants
            SET final_placement = ?, updated_at = ?
            WHERE season_id = ? AND user_id = ?
          `).run(index + 1, nowIso, s.id, participant.user_id);
        });
      }

      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (rollbackError) {
        console.error(`Error rolling back season transition ${s.id}:`, rollbackError);
      }
      console.error(`Error completing expired season ${s.id}:`, err);
      throw err;
    }
  }
}

/**
 * Returns all seasons (active, upcoming, completed).
 */
export function getSeasonsList() {
  checkAndCompleteExpiredSeasons();
  const rows = db.prepare(`
    SELECT s.id, s.season_number as seasonNumber, s.name, s.description,
           s.start_date as startDate, s.end_date as endDate, s.status,
           s.rewards_json as rewardsJson,
           (SELECT COUNT(*) FROM season_participants sp WHERE sp.season_id = s.id) as participantCount
    FROM seasons s
    ORDER BY s.season_number DESC
  `).all();

  return rows.map((r) => ({
    ...r,
    rewards: JSON.parse(r.rewardsJson || '{}'),
  }));
}

/**
 * Returns the currently active season with user's standing.
 */
export function getActiveSeason(userId = null) {
  checkAndCompleteExpiredSeasons();
  let season = db.prepare(`
    SELECT s.id, s.season_number as seasonNumber, s.name, s.description,
           s.start_date as startDate, s.end_date as endDate, s.status,
           s.rewards_json as rewardsJson,
           (SELECT COUNT(*) FROM season_participants sp WHERE sp.season_id = s.id) as participantCount
    FROM seasons s
    WHERE s.status = 'active'
    ORDER BY s.season_number DESC
    LIMIT 1
  `).get();

  if (!season) {
    // If no active season, get the latest completed or upcoming one
    season = db.prepare(`
      SELECT s.id, s.season_number as seasonNumber, s.name, s.description,
             s.start_date as startDate, s.end_date as endDate, s.status,
             s.rewards_json as rewardsJson,
             (SELECT COUNT(*) FROM season_participants sp WHERE sp.season_id = s.id) as participantCount
      FROM seasons s
      ORDER BY s.season_number DESC
      LIMIT 1
    `).get();
  }

  if (!season) return null;

  const parsed = {
    ...season,
    rewards: JSON.parse(season.rewardsJson || '{}'),
    userStanding: null,
  };

  if (userId) {
    const standing = db.prepare(`
      SELECT seasonal_xp as seasonalXp, arena_rating as arenaRating,
             peak_rating as peakRating, division, final_placement as finalPlacement,
             rewards_claimed as rewardsClaimed, claimed_at as claimedAt
      FROM season_participants
      WHERE season_id = ? AND user_id = ?
    `).get(season.id, userId);

    if (standing) {
      parsed.userStanding = standing;
    } else {
      // Return default standing for authenticated user
      const arena = getArenaProfile(userId);
      parsed.userStanding = {
        seasonalXp: 0,
        arenaRating: arena.rating,
        peakRating: arena.peakRating,
        division: arena.division,
        finalPlacement: null,
        rewardsClaimed: 0,
        claimedAt: null,
      };
    }
  }

  return parsed;
}

/**
 * Returns season details, top rankers, and user eligibility.
 */
export function getSeasonDetails(seasonId, userId = null) {
  checkAndCompleteExpiredSeasons();
  const season = db.prepare(`
    SELECT s.id, s.season_number as seasonNumber, s.name, s.description,
           s.start_date as startDate, s.end_date as endDate, s.status,
           s.rewards_json as rewardsJson,
           (SELECT COUNT(*) FROM season_participants sp WHERE sp.season_id = s.id) as participantCount
    FROM seasons s
    WHERE s.id = ?
  `).get(seasonId);

  if (!season) return null;

  // Top season rankers
  const topRankers = db.prepare(`
    SELECT sp.user_id as userId, p.display_name as name, p.title,
           sp.seasonal_xp as seasonalXp, sp.arena_rating as arenaRating,
           sp.peak_rating as peakRating, sp.division, sp.final_placement as placement
    FROM season_participants sp
    JOIN profiles p ON p.user_id = sp.user_id
    WHERE sp.season_id = ?
    ORDER BY sp.seasonal_xp DESC, sp.arena_rating DESC, sp.user_id ASC
    LIMIT 25
  `).all(seasonId);

  let userStanding = null;
  let canClaimReward = false;
  let claimableReward = null;

  if (userId) {
    userStanding = db.prepare(`
      SELECT sp.seasonal_xp as seasonalXp, sp.arena_rating as arenaRating,
             sp.peak_rating as peakRating, sp.division, sp.final_placement as finalPlacement,
             sp.rewards_claimed as rewardsClaimed, sp.claimed_at as claimedAt
      FROM season_participants sp
      WHERE sp.season_id = ? AND sp.user_id = ?
    `).get(seasonId, userId);

    if (userStanding && season.status === 'completed' && !userStanding.rewardsClaimed) {
      const rewards = JSON.parse(season.rewardsJson || '{}');
      const tierReward = rewards[userStanding.division] || rewards.Bronze;
      if (tierReward) {
        canClaimReward = true;
        claimableReward = {
          tier: userStanding.division,
          xp: tierReward.xp,
          title: tierReward.title,
        };
      }
    }
    if (userStanding && season.status !== 'completed') {
      userStanding.finalPlacement = db.prepare(`
        SELECT COUNT(*) + 1 as placement
        FROM season_participants
        WHERE season_id = ?
          AND (
            seasonal_xp > ?
            OR (seasonal_xp = ? AND arena_rating > ?)
            OR (seasonal_xp = ? AND arena_rating = ? AND user_id < ?)
          )
      `).get(
        seasonId,
        userStanding.seasonalXp,
        userStanding.seasonalXp,
        userStanding.arenaRating,
        userStanding.seasonalXp,
        userStanding.arenaRating,
        userId
      ).placement;
    }
  }

  return {
    ...season,
    rewards: JSON.parse(season.rewardsJson || '{}'),
    topRankers: topRankers.map((r, i) => ({ rank: r.placement || (i + 1), ...r })),
    userStanding,
    canClaimReward,
    claimableReward,
  };
}

/**
 * Claims season rewards upon season completion.
 * Strictly idempotent: prevents duplicate claims via transaction and UNIQUE audit log.
 */
export function claimSeasonReward(userId, seasonId) {
  checkAndCompleteExpiredSeasons();

  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
  if (!season) {
    return { success: false, error: 'Season not found.' };
  }

  if (season.status !== 'completed') {
    return { success: false, error: 'Season is still active. Rewards can only be claimed after the season concludes.' };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const participant = db.prepare(`
      SELECT * FROM season_participants WHERE season_id = ? AND user_id = ?
    `).get(seasonId, userId);

    if (!participant) {
      db.exec('COMMIT');
      return { success: false, error: 'You did not participate in this season.' };
    }

    if (participant.rewards_claimed === 1) {
      db.exec('COMMIT');
      return { success: false, error: 'Seasonal rewards have already been claimed.' };
    }

    const rewards = JSON.parse(season.rewards_json || '{}');
    const tier = participant.division || 'Bronze';
    const rewardConfig = rewards[tier] || rewards.Bronze || { xp: 150, title: 'Novice Duelist' };
    const xpAwarded = Number.isSafeInteger(rewardConfig.xp) ? Math.max(0, rewardConfig.xp) : 0;

    const nowIso = new Date().toISOString();
    const claimId = `src_${seasonId}_${userId}`;

    // 1. Audit log insertion (idempotency guard)
    const logRes = db.prepare(`
      INSERT OR IGNORE INTO season_reward_claims (id, season_id, user_id, tier, xp_awarded, title_awarded, claimed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(claimId, seasonId, userId, tier, xpAwarded, rewardConfig.title || null, nowIso);

    if (logRes.changes === 0) {
      db.exec('COMMIT');
      return { success: false, error: 'Rewards already claimed for this season.' };
    }

    // 2. Mark participant rewards_claimed = 1
    db.prepare(`
      UPDATE season_participants
      SET rewards_claimed = 1, claimed_at = ?, updated_at = ?
      WHERE season_id = ? AND user_id = ?
    `).run(nowIso, nowIso, seasonId, userId);

    if (xpAwarded > 0) {
      const xpTransaction = db.prepare(`
        INSERT OR IGNORE INTO xp_transactions (id, user_id, quest_id, amount, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `xptx_${userId}_season_reward_${seasonId}`,
        userId,
        `season_reward_${seasonId}`,
        xpAwarded,
        `Season ${season.season_number} reward`,
        nowIso
      );

      if (xpTransaction.changes > 0) {
        const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
        if (!profile) throw new Error('Player profile not found while granting season reward.');

        let level = profile.level;
        let xp = profile.xp + xpAwarded;
        let xpNeeded = profile.xp_to_next_level;
        while (xp >= xpNeeded) {
          xp -= xpNeeded;
          level += 1;
          xpNeeded = getXpRequiredForLevel(level);
        }

        db.prepare(`
          UPDATE profiles
          SET level = ?, xp = ?, xp_to_next_level = ?, updated_at = ?
          WHERE user_id = ?
        `).run(level, xp, xpNeeded, nowIso, userId);
      }
    }

    if (rewardConfig.title) unlockUserTitle(userId, rewardConfig.title, 'season');

    db.exec('COMMIT');

    return {
      success: true,
      seasonId,
      tier,
      xpAwarded,
      titleAwarded: rewardConfig.title,
      claimedAt: nowIso,
    };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error(`Error rolling back season reward claim ${seasonId}:`, rollbackError);
    }
    throw err;
  }
}

/**
 * Records seasonal XP for an active season participant.
 */
export function recordSeasonalXp(userId, xpAmount) {
  if (!userId || !Number.isSafeInteger(xpAmount) || xpAmount <= 0) return;

  checkAndCompleteExpiredSeasons();

  const nowIso = new Date().toISOString();
  const activeSeason = db.prepare(`
    SELECT id FROM seasons
    WHERE status = 'active' AND start_date <= ? AND end_date > ?
    ORDER BY season_number DESC
    LIMIT 1
  `).get(nowIso, nowIso);
  if (!activeSeason) return;

  const id = `sp_${activeSeason.id}_${userId}`;
  const arena = db.prepare('SELECT rating, peak_rating, division FROM arena_profiles WHERE user_id = ?').get(userId);

  db.prepare(`
    INSERT INTO season_participants (id, season_id, user_id, seasonal_xp, arena_rating, peak_rating, division, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(season_id, user_id) DO UPDATE SET
      seasonal_xp = seasonal_xp + ?,
      updated_at = ?
  `).run(
    id,
    activeSeason.id,
    userId,
    xpAmount,
    arena?.rating || 1000,
    arena?.peak_rating || 1000,
    arena?.division || 'Bronze',
    nowIso,
    nowIso,
    xpAmount,
    nowIso
  );
}

// ─── Ranked Arena Subsystem ─────────────────────────────────────────────────

/**
 * Retrieves or initializes an arena profile for a user.
 */
export function getArenaProfile(userId) {
  if (!userId) return null;
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) return null;

  let profile = db.prepare('SELECT * FROM arena_profiles WHERE user_id = ?').get(userId);
  if (!profile) {
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO arena_profiles (user_id, rating, peak_rating, division, wins, losses, draws, streak, best_streak, matches_played, updated_at)
      VALUES (?, 1000, 1000, 'Bronze', 0, 0, 0, 0, 0, 0, ?)
    `).run(userId, nowIso);
    profile = db.prepare('SELECT * FROM arena_profiles WHERE user_id = ?').get(userId);
  }

  // Ensure division matches rating
  const currentDiv = getDivision(profile.rating);
  if (profile.division !== currentDiv) {
    db.prepare('UPDATE arena_profiles SET division = ?, updated_at = ? WHERE user_id = ?')
      .run(currentDiv, new Date().toISOString(), userId);
    profile.division = currentDiv;
  }

  return {
    userId: profile.user_id,
    rating: profile.rating,
    peakRating: profile.peak_rating,
    division: profile.division,
    wins: profile.wins,
    losses: profile.losses,
    draws: profile.draws,
    streak: profile.streak,
    bestStreak: profile.best_streak,
    matchesPlayed: profile.matches_played,
    winRate: profile.matches_played > 0 ? Math.round((profile.wins / profile.matches_played) * 100) : 0,
    updatedAt: profile.updated_at,
  };
}

function getQueueRatingRange(queuedAt, now = Date.now()) {
  const waitedMs = Math.max(0, now - Date.parse(queuedAt));
  return Math.min(1000, ARENA_QUEUE_BASE_RANGE
    + Math.floor(waitedMs / ARENA_QUEUE_RANGE_INTERVAL_MS) * ARENA_QUEUE_RANGE_STEP);
}

function cleanupArenaQueue(now = Date.now()) {
  db.prepare('DELETE FROM arena_queue WHERE queued_at <= ?')
    .run(new Date(now - ARENA_QUEUE_TTL_MS).toISOString());
  db.prepare(`
    DELETE FROM arena_queue
    WHERE EXISTS (
      SELECT 1 FROM arena_match_participants p
      WHERE p.user_id = arena_queue.user_id AND p.active = 1
    )
  `).run();
}

function expireArenaMatches(now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const expired = db.prepare(`
    SELECT id, player1_status, player2_status
    FROM arena_matches
    WHERE status IN ('waiting', 'ready', 'in_progress')
      AND COALESCE(deadline_at, datetime(start_time, '+' || duration_limit_sec || ' seconds')) <= ?
  `).all(nowIso);

  for (const match of expired) {
    const hasSubmission = db.prepare(`
      SELECT 1 FROM arena_match_submissions WHERE match_id = ? LIMIT 1
    `).get(match.id);
    if (!hasSubmission) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`
          UPDATE arena_matches
          SET status = 'expired', end_time = ?,
              player1_status = 'timed_out', player2_status = 'timed_out'
          WHERE id = ? AND status IN ('waiting', 'ready', 'in_progress')
        `).run(nowIso, match.id);
        db.prepare('UPDATE arena_match_participants SET active = 0, state = ?, updated_at = ? WHERE match_id = ?')
          .run('timed_out', nowIso, match.id);
        db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ?').run(match.id);
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch (rollbackError) {
          console.error(`Failed to roll back expired arena match ${match.id}:`, rollbackError);
        }
        throw error;
      }
      continue;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const current = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(match.id);
      if (!current || !['waiting', 'ready', 'in_progress'].includes(current.status)) {
        db.exec('COMMIT');
        continue;
      }
      for (const [slot, status] of [[1, current.player1_status], [2, current.player2_status]]) {
        if (status !== 'completed' && status !== 'forfeited') {
          const field = slot === 1 ? 'player1_status' : 'player2_status';
          db.prepare(`UPDATE arena_matches SET ${field} = 'timed_out' WHERE id = ?`).run(match.id);
          db.prepare(`
            UPDATE arena_match_participants
            SET state = 'timed_out', updated_at = ?
            WHERE match_id = ? AND slot = ?
          `).run(nowIso, match.id, slot);
        }
      }
      db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ?').run(match.id);
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (rollbackError) {
        console.error(`Failed to roll back timed-out arena match ${match.id}:`, rollbackError);
      }
      throw error;
    }
    concludeMatch(match.id, 'expired');
  }
}

function cleanupArenaState(now = Date.now()) {
  cleanupArenaQueue(now);
  db.prepare('DELETE FROM arena_submission_locks WHERE locked_at <= ?')
    .run(new Date(now - 60 * 1000).toISOString());
  expireArenaMatches(now);
}

/**
 * Enters user into the Ranked Arena queue.
 * The queue only matches verified players inside the widening rating window.
 */
export function joinArenaQueue(userId) {
  cleanupArenaState();
  const profile = getArenaProfile(userId);
  if (!profile) return { status: 'error', error: 'Player profile not found.' };
  const nowIso = new Date().toISOString();

  const activeMatch = db.prepare(`
    SELECT m.id FROM arena_match_participants p
    JOIN arena_matches m ON m.id = p.match_id
    WHERE p.user_id = ? AND p.active = 1
    ORDER BY m.created_at DESC LIMIT 1
  `).get(userId);

  if (activeMatch) {
    return {
      status: 'matched',
      matchId: activeMatch.id,
      message: 'Reconnected to your active match in progress.',
    };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    cleanupArenaQueue();
    const existingQueueEntry = db.prepare('SELECT * FROM arena_queue WHERE user_id = ?').get(userId);
    const queueEntry = existingQueueEntry || {
      user_id: userId,
      rating: profile.rating,
      division: profile.division,
      queued_at: nowIso,
    };

    const now = Date.now();
    const selfRange = getQueueRatingRange(queueEntry.queued_at, now);
    const opponents = db.prepare(`
      SELECT q.user_id, q.rating, q.division, q.queued_at, p.display_name
      FROM arena_queue q
      JOIN profiles p ON p.user_id = q.user_id
      WHERE q.user_id != ?
        AND NOT EXISTS (
          SELECT 1 FROM arena_match_participants mp
          WHERE mp.user_id = q.user_id AND mp.active = 1
        )
    `).all(userId);
    const opponent = opponents
      .filter((candidate) => {
        const theirRange = getQueueRatingRange(candidate.queued_at, now);
        return Math.abs(candidate.rating - profile.rating) <= Math.min(selfRange, theirRange);
      })
      .sort((a, b) => Math.abs(a.rating - profile.rating) - Math.abs(b.rating - profile.rating)
        || a.queued_at.localeCompare(b.queued_at))[0];

    if (!existingQueueEntry) {
      db.prepare(`
        INSERT INTO arena_queue (user_id, rating, division, queued_at)
        VALUES (?, ?, ?, ?)
      `).run(userId, profile.rating, profile.division, nowIso);
    }

    if (!opponent) {
      db.exec('COMMIT');
      return { status: 'queued', queuedAt: queueEntry.queued_at, message: 'Searching for a compatible opponent...' };
    }

    const activeSeason = db.prepare(`
      SELECT id FROM seasons WHERE status = 'active' AND start_date <= ? AND end_date > ?
      ORDER BY season_number DESC LIMIT 1
    `).get(nowIso, nowIso);
    if (!activeSeason) {
      db.exec('ROLLBACK');
      return { status: 'error', error: 'Ranked matchmaking is unavailable because there is no active season.' };
    }

    const challengePool = getChallengesForRating(profile.rating);
    const selectedChallengeId = challengePool.find((challengeId) => serverChallenges[challengeId]) || 'py-01';
    const matchId = `match_${crypto.randomUUID()}`;
    const deadlineAt = new Date(now + ARENA_MATCH_DURATION_SEC * 1000).toISOString();
    const firstProfile = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(userId);

    db.prepare('DELETE FROM arena_queue WHERE user_id IN (?, ?)').run(userId, opponent.user_id);
    db.prepare(`
      INSERT INTO arena_matches (
        id, season_id, challenge_id, match_type,
        player1_id, player2_id, p1_name, p2_name,
        p1_rating_before, p2_rating_before,
        status, duration_limit_sec, start_time, deadline_at, created_at
      )
      VALUES (?, ?, ?, 'ranked', ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)
    `).run(
      matchId,
      activeSeason.id,
      selectedChallengeId,
      userId,
      opponent.user_id,
      firstProfile?.display_name || 'Hunter',
      opponent.display_name || 'Hunter',
      profile.rating,
      opponent.rating,
      ARENA_MATCH_DURATION_SEC,
      nowIso,
      deadlineAt,
      nowIso
    );
    const addParticipant = db.prepare(`
      INSERT INTO arena_match_participants
        (id, match_id, user_id, slot, state, active, joined_at, updated_at)
      VALUES (?, ?, ?, ?, 'ready', 1, ?, ?)
    `);
    addParticipant.run(`amp_${matchId}_1`, matchId, userId, 1, nowIso, nowIso);
    addParticipant.run(`amp_${matchId}_2`, matchId, opponent.user_id, 2, nowIso, nowIso);

    db.exec('COMMIT');
    return {
      status: 'matched',
      matchId,
      opponentName: opponent.display_name || 'Hunter',
      ratingDifference: Math.abs(profile.rating - opponent.rating),
    };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error(`Failed to roll back arena matchmaking for ${userId}:`, rollbackError);
    }
    throw err;
  }
}

/**
 * Removes user from arena queue.
 */
export function leaveArenaQueue(userId) {
  const result = db.prepare('DELETE FROM arena_queue WHERE user_id = ?').run(userId);
  return { success: true, removed: result.changes > 0 };
}

/**
 * Returns current queue status for user.
 */
export function getQueueStatus(userId) {
  cleanupArenaState();
  const queued = db.prepare('SELECT * FROM arena_queue WHERE user_id = ?').get(userId);
  const activeMatch = db.prepare(`
    SELECT m.id FROM arena_match_participants p
    JOIN arena_matches m ON m.id = p.match_id
    WHERE p.user_id = ? AND p.active = 1
    LIMIT 1
  `).get(userId);

  return {
    inQueue: !!queued,
    queuedAt: queued?.queued_at || null,
    queueExpiresAt: queued ? new Date(Date.parse(queued.queued_at) + ARENA_QUEUE_TTL_MS).toISOString() : null,
    hasActiveMatch: !!activeMatch,
    matchId: activeMatch?.id || null,
  };
}

/**
 * Returns details of an arena match.
 */
export function getArenaMatch(matchId, userId = null) {
  cleanupArenaState();
  const match = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
  if (!match) return null;

  const challenge = serverChallenges[match.challenge_id];
  if (!challenge) return null;

  const isPlayer1 = userId === match.player1_id;
  const isPlayer2 = userId === match.player2_id;
  const isParticipant = isPlayer1 || isPlayer2;
  if (!isParticipant) return null;

  // Remaining time in seconds
  const startTimeMs = new Date(match.start_time).getTime();
  const elapsedSec = Math.floor((Date.now() - startTimeMs) / 1000);
  const remainingSec = Math.max(0, match.duration_limit_sec - elapsedSec);

  return {
    id: match.id,
    seasonId: match.season_id,
    matchType: match.match_type,
    status: match.status,
    challenge: {
      id: challenge.id,
      title: challenge.title,
      functionName: challenge.functionName,
      lesson: challenge.lesson,
      sampleTests: challenge.sampleTests,
    },
    player1: {
      id: match.player1_id,
      name: match.p1_name,
      ratingBefore: match.p1_rating_before,
      ratingAfter: match.p1_rating_after,
      score: match.player1_score,
      passedCount: match.player1_passed_count,
      totalTests: match.player1_total_tests,
      timeMs: match.player1_time_ms,
      status: match.player1_status,
      isYou: isPlayer1,
    },
    player2: {
      id: match.player2_id,
      name: match.p2_name,
      ratingBefore: match.p2_rating_before,
      ratingAfter: match.p2_rating_after,
      score: match.player2_score,
      passedCount: match.player2_passed_count,
      totalTests: match.player2_total_tests,
      timeMs: match.player2_time_ms,
      status: match.player2_status,
      isYou: isPlayer2,
    },
    winnerId: match.winner_id,
    durationLimitSec: match.duration_limit_sec,
    remainingSeconds: remainingSec,
    isParticipant,
    startTime: match.start_time,
    deadlineAt: match.deadline_at,
    endTime: match.end_time,
    result: match.winner_id === 'draw'
      ? 'draw'
      : match.winner_id === userId
        ? 'win'
        : match.winner_id
          ? 'loss'
          : null,
    tournamentContext: (() => {
      const tm = db.prepare(`
        SELECT tm.id as tournamentMatchId, tm.round, tm.match_index as matchIndex,
               t.id as tournamentId, t.title as tournamentTitle, t.total_rounds as totalRounds
        FROM tournament_matches tm
        JOIN tournaments t ON t.id = tm.tournament_id
        WHERE tm.arena_match_id = ?
      `).get(match.id);
      return tm ? {
        tournamentId: tm.tournamentId,
        tournamentTitle: tm.tournamentTitle,
        tournamentMatchId: tm.tournamentMatchId,
        round: tm.round,
        totalRounds: tm.totalRounds,
        matchIndex: tm.matchIndex,
      } : null;
    })(),
  };
}

export function getArenaMatchResult(matchId, userId) {
  const match = getArenaMatch(matchId, userId);
  if (!match || !['completed', 'cancelled', 'expired', 'abandoned'].includes(match.status)) return null;
  return match;
}

/**
 * Submits player solution for an active arena match.
 * Server-side evaluation, Elo rating calculation, division updates, and idempotency guards.
 */
export async function submitArenaMatch(userId, matchId, code, executeInPythonProcess, buildHarnessScript) {
  if (typeof code !== 'string' || code.length === 0) {
    return { success: false, error: 'Solution code is required.' };
  }
  expireArenaMatches();
  const match = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
  if (!match) {
    return { success: false, error: 'Match not found.' };
  }

  if (!['ready', 'in_progress'].includes(match.status)) {
    return { success: false, error: 'Match is already concluded.' };
  }

  const isPlayer1 = userId === match.player1_id;
  const isPlayer2 = userId === match.player2_id;
  if (!isPlayer1 && !isPlayer2) {
    return { success: false, error: 'You are not a participant in this duel.' };
  }

  const challenge = serverChallenges[match.challenge_id];
  if (!challenge || !Array.isArray(challenge.sampleTests) || !Array.isArray(challenge.hiddenTests)) {
    return { success: false, error: 'Challenge definition not found.' };
  }

  const nowMs = Date.now();
  if (nowMs >= Date.parse(match.deadline_at)) {
    expireArenaMatches(nowMs);
    return { success: false, error: 'Match time limit has expired.' };
  }

  const lockId = crypto.randomUUID();
  const statusField = isPlayer1 ? 'player1_status' : 'player2_status';
  const passedField = isPlayer1 ? 'player1_passed_count' : 'player2_passed_count';
  const totalField = isPlayer1 ? 'player1_total_tests' : 'player2_total_tests';
  const scoreField = isPlayer1 ? 'player1_score' : 'player2_score';
  const timeField = isPlayer1 ? 'player1_time_ms' : 'player2_time_ms';
  let attemptNumber;

  db.exec('BEGIN IMMEDIATE');
  try {
    const currentMatch = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
    const participant = db.prepare(`
      SELECT * FROM arena_match_participants WHERE match_id = ? AND user_id = ? AND active = 1
    `).get(matchId, userId);
    if (!currentMatch || !['ready', 'in_progress'].includes(currentMatch.status) || !participant) {
      db.exec('COMMIT');
      return { success: false, error: 'Match is no longer available for submissions.' };
    }
    if (Date.now() >= Date.parse(currentMatch.deadline_at)) {
      db.exec('COMMIT');
      expireArenaMatches();
      return { success: false, error: 'Match time limit has expired.' };
    }
    if (participant.state === 'completed') {
      db.exec('COMMIT');
      return { success: false, error: 'You have already finalized your submission for this match.' };
    }
    if (participant.attempts_count >= ARENA_MAX_SUBMISSION_ATTEMPTS) {
      db.exec('COMMIT');
      return { success: false, error: 'You have reached the submission attempt limit for this match.' };
    }

    const lockResult = db.prepare(`
      INSERT OR IGNORE INTO arena_submission_locks (match_id, user_id, lock_id, locked_at)
      VALUES (?, ?, ?, ?)
    `).run(matchId, userId, lockId, new Date().toISOString());
    if (lockResult.changes === 0) {
      db.exec('COMMIT');
      return { success: false, error: 'A submission is already being processed for this match.' };
    }
    attemptNumber = participant.attempts_count + 1;
    db.prepare(`
      UPDATE arena_match_participants
      SET state = 'submitting', attempts_count = ?, updated_at = ?
      WHERE match_id = ? AND user_id = ? AND active = 1
    `).run(attemptNumber, new Date().toISOString(), matchId, userId);
    db.prepare("UPDATE arena_matches SET status = 'in_progress' WHERE id = ? AND status = 'ready'").run(matchId);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error(`Failed to roll back arena submission reservation ${matchId}:`, rollbackError);
    }
    throw error;
  }

  const testCases = [
    ...challenge.sampleTests.map((t) => ({ ...t, isHidden: false })),
    ...challenge.hiddenTests.map((t) => ({ ...t, isHidden: true })),
  ];
  const startedAtMs = Date.now();
  let evalResult;
  try {
    const script = buildHarnessScript(code, challenge.functionName, testCases);
    evalResult = await executeInPythonProcess(script);
  } catch (error) {
    db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ? AND user_id = ? AND lock_id = ?')
      .run(matchId, userId, lockId);
    db.prepare(`
      UPDATE arena_match_participants SET state = 'ready', updated_at = ?
      WHERE match_id = ? AND user_id = ? AND state = 'submitting'
    `).run(new Date().toISOString(), matchId, userId);
    throw error;
  }

  const finishedAt = Date.now();
  if (finishedAt >= Date.parse(match.deadline_at)) {
    db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ? AND user_id = ? AND lock_id = ?')
      .run(matchId, userId, lockId);
    expireArenaMatches(finishedAt);
    return { success: false, error: 'Match time limit expired before the submission could be verified.' };
  }
  if (!evalResult || !Array.isArray(evalResult.results) || evalResult.results.length === 0) {
    db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ? AND user_id = ? AND lock_id = ?')
      .run(matchId, userId, lockId);
    db.prepare(`
      UPDATE arena_match_participants SET state = 'ready', updated_at = ?
      WHERE match_id = ? AND user_id = ? AND state = 'submitting'
    `).run(new Date().toISOString(), matchId, userId);
    throw new Error('Python challenge verification did not return valid test results.');
  }

  const passedCount = evalResult.results.filter((result) => result.passed).length;
  const totalCount = evalResult.results.length;
  const allPassed = evalResult.allPassed === true && passedCount === totalCount;
  const score = Math.round((passedCount / totalCount) * 100);
  const elapsedMs = Math.max(0, finishedAt - Date.parse(match.start_time));
  const nowIso = new Date(finishedAt).toISOString();
  let matchConcluded = false;

  db.exec('BEGIN IMMEDIATE');
  try {
    const lock = db.prepare(`
      SELECT lock_id FROM arena_submission_locks WHERE match_id = ? AND user_id = ?
    `).get(matchId, userId);
    const currentMatch = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
    if (!lock || lock.lock_id !== lockId || !currentMatch
      || !['ready', 'in_progress'].includes(currentMatch.status)
      || Date.now() >= Date.parse(currentMatch.deadline_at)) {
      db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ? AND user_id = ? AND lock_id = ?')
        .run(matchId, userId, lockId);
      db.exec('COMMIT');
      expireArenaMatches();
      return { success: false, error: 'Match is no longer accepting submissions.' };
    }
    db.prepare(`
      INSERT INTO arena_match_submissions
        (id, match_id, user_id, code, passed, passed_count, total_count, duration_ms, attempt_number, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `ams_${crypto.randomUUID()}`,
      matchId,
      userId,
      code,
      allPassed ? 1 : 0,
      passedCount,
      totalCount,
      elapsedMs,
      attemptNumber,
      nowIso
    );
    const isFinalized = allPassed || attemptNumber >= ARENA_MAX_SUBMISSION_ATTEMPTS;
    db.prepare(`
      UPDATE arena_matches
      SET ${statusField} = ?, ${scoreField} = ?, ${passedField} = ?,
          ${totalField} = ?, ${timeField} = ?
      WHERE id = ?
    `).run(isFinalized ? 'completed' : 'submitted', score, passedCount, totalCount, elapsedMs, matchId);
    db.prepare(`
      UPDATE arena_match_participants
      SET state = ?, updated_at = ?
      WHERE match_id = ? AND user_id = ?
    `).run(isFinalized ? 'completed' : 'submitted', nowIso, matchId, userId);
    db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ? AND user_id = ?')
      .run(matchId, userId);

    const updatedMatch = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
    if (updatedMatch.player1_status === 'completed' && updatedMatch.player2_status === 'completed') {
      matchConcluded = true;
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error(`Failed to roll back arena submission ${matchId}:`, rollbackError);
    }
    throw error;
  }

  if (matchConcluded) concludeMatch(matchId);
  cleanupArenaState();
  const finalMatch = getArenaMatch(matchId, userId);
  return {
    success: true,
    allPassed,
    passedCount,
    totalCount,
    score,
    elapsedMs,
    matchConcluded,
    match: finalMatch,
  };
}

function awardArenaMatchXp(userId, matchId, xpAmount, nowIso) {
  const questId = `arena_match_${matchId}`;
  const xpTransaction = db.prepare(`
    INSERT OR IGNORE INTO xp_transactions (id, user_id, quest_id, amount, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `xptx_${userId}_${questId}`,
    userId,
    questId,
    xpAmount,
    `Won ranked arena match ${matchId}`,
    nowIso
  );
  db.prepare(`
    INSERT OR IGNORE INTO arena_match_rewards
      (id, match_id, user_id, reward_type, xp_awarded, awarded_at)
    VALUES (?, ?, ?, 'winner_xp', ?, ?)
  `).run(`amr_${matchId}_${userId}_winner_xp`, matchId, userId, xpAmount, nowIso);

  if (xpTransaction.changes === 0) return;
  const profile = db.prepare('SELECT level, xp, xp_to_next_level FROM profiles WHERE user_id = ?').get(userId);
  if (!profile) throw new Error(`Missing progression profile for arena winner ${userId}.`);
  let level = profile.level;
  let xp = profile.xp + xpAmount;
  let xpNeeded = profile.xp_to_next_level;
  while (xp >= xpNeeded) {
    xp -= xpNeeded;
    level += 1;
    xpNeeded = getXpRequiredForLevel(level);
  }
  db.prepare(`
    UPDATE profiles SET level = ?, xp = ?, xp_to_next_level = ?, updated_at = ?
    WHERE user_id = ?
  `).run(level, xp, xpNeeded, nowIso, userId);
}

function recordArenaSeasonXp(userId, xpAmount, nowIso) {
  const season = db.prepare(`
    SELECT id FROM seasons
    WHERE status = 'active' AND start_date <= ? AND end_date > ?
    ORDER BY season_number DESC LIMIT 1
  `).get(nowIso, nowIso);
  if (!season) return;
  const profile = db.prepare(`
    SELECT rating, peak_rating, division FROM arena_profiles WHERE user_id = ?
  `).get(userId);
  db.prepare(`
    INSERT INTO season_participants
      (id, season_id, user_id, seasonal_xp, arena_rating, peak_rating, division, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(season_id, user_id) DO UPDATE SET
      seasonal_xp = seasonal_xp + excluded.seasonal_xp,
      arena_rating = excluded.arena_rating,
      peak_rating = MAX(peak_rating, excluded.peak_rating),
      division = excluded.division,
      updated_at = excluded.updated_at
  `).run(
    `sp_${season.id}_${userId}`,
    season.id,
    userId,
    xpAmount,
    profile.rating,
    profile.peak_rating,
    profile.division,
    nowIso,
    nowIso
  );
}

/**
 * Concludes a ranked or tournament match exactly once and persists both Elo
 * changes and the winner reward in the same SQLite transaction.
 */
export function concludeMatch(matchId, terminalStatus = 'completed') {
  if (!['completed', 'expired'].includes(terminalStatus)) {
    throw new TypeError('Invalid terminal status for an arena match.');
  }

  db.exec('BEGIN IMMEDIATE');
  let match;
  let winnerId;
  let p1ScoreFactor;
  let p2ScoreFactor;
  let p1RatingAfter = null;
  let p2RatingAfter = null;
  let p1Delta = 0;
  let p2Delta = 0;
  const nowIso = new Date().toISOString();

  try {
    match = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
    if (!match || !['waiting', 'ready', 'in_progress'].includes(match.status)) {
      db.exec('COMMIT');
      return;
    }

    const isTournament = match.match_type === 'tournament';

    if (match.player1_status === 'forfeited') winnerId = match.player2_id;
    else if (match.player2_status === 'forfeited') winnerId = match.player1_id;
    else if (match.player1_status === 'timed_out' && match.player2_status !== 'timed_out') winnerId = match.player2_id;
    else if (match.player2_status === 'timed_out' && match.player1_status !== 'timed_out') winnerId = match.player1_id;
    else if (match.player1_score > match.player2_score) winnerId = match.player1_id;
    else if (match.player2_score > match.player1_score) winnerId = match.player2_id;
    else if (match.player1_time_ms > 0 && match.player2_time_ms === 0) winnerId = match.player1_id;
    else if (match.player2_time_ms > 0 && match.player1_time_ms === 0) winnerId = match.player2_id;
    else if (match.player1_time_ms < match.player2_time_ms && match.player1_time_ms > 0) winnerId = match.player1_id;
    else if (match.player2_time_ms < match.player1_time_ms && match.player2_time_ms > 0) winnerId = match.player2_id;
    else winnerId = 'draw';

    // Deterministic, fair tournament tiebreaker resolution.
    // Tournament matches must NEVER conclude in a draw.
    // Tiebreaker priority order:
    // 1. Fewest submission attempts (efficiency: fewer attempts with equal score/time wins)
    // 2. Higher tournament seed (better seed value, e.g. Seed #1 beats Seed #2)
    // 3. Earlier tournament registration timestamp (seniority)
    // 4. Deterministic cryptographic hash coin flip: SHA-256(matchId + ':' + userId).
    //    The player whose individual match hash is lexicographically lower wins.
    //    This completely eliminates positional bias (neither slot 1 nor slot 2 is favored)
    //    while remaining 100% deterministic and reproducible across evaluations.
    if (isTournament && winnerId === 'draw') {
      const p1Part = db.prepare('SELECT attempts_count FROM arena_match_participants WHERE match_id = ? AND user_id = ?').get(matchId, match.player1_id);
      const p2Part = db.prepare('SELECT attempts_count FROM arena_match_participants WHERE match_id = ? AND user_id = ?').get(matchId, match.player2_id);
      const p1Attempts = p1Part?.attempts_count || 0;
      const p2Attempts = p2Part?.attempts_count || 0;

      if (p1Attempts > 0 && p2Attempts > 0 && p1Attempts !== p2Attempts) {
        winnerId = p1Attempts < p2Attempts ? match.player1_id : match.player2_id;
      } else {
        const tm = db.prepare('SELECT tournament_id FROM tournament_matches WHERE arena_match_id = ?').get(matchId);
        if (tm) {
          const p1SeedRow = db.prepare('SELECT seed, registered_at FROM tournament_participants WHERE tournament_id = ? AND user_id = ?').get(tm.tournament_id, match.player1_id);
          const p2SeedRow = db.prepare('SELECT seed, registered_at FROM tournament_participants WHERE tournament_id = ? AND user_id = ?').get(tm.tournament_id, match.player2_id);
          const p1Seed = p1SeedRow?.seed ?? 9999;
          const p2Seed = p2SeedRow?.seed ?? 9999;

          if (p1Seed !== p2Seed) {
            winnerId = p1Seed < p2Seed ? match.player1_id : match.player2_id;
          } else if (p1SeedRow?.registered_at && p2SeedRow?.registered_at && p1SeedRow.registered_at !== p2SeedRow.registered_at) {
            winnerId = p1SeedRow.registered_at < p2SeedRow.registered_at ? match.player1_id : match.player2_id;
          } else {
            // Fair, unbiased deterministic cryptographic coin flip
            const p1Hash = crypto.createHash('sha256').update(`${matchId}:${match.player1_id}`).digest('hex');
            const p2Hash = crypto.createHash('sha256').update(`${matchId}:${match.player2_id}`).digest('hex');
            winnerId = p1Hash < p2Hash ? match.player1_id : match.player2_id;
          }
        } else {
          // Unbiased deterministic fallback for unmapped tournament matches
          const p1Hash = crypto.createHash('sha256').update(`${matchId}:${match.player1_id}`).digest('hex');
          const p2Hash = crypto.createHash('sha256').update(`${matchId}:${match.player2_id}`).digest('hex');
          winnerId = p1Hash < p2Hash ? match.player1_id : match.player2_id;
        }
      }
    }

    const p1Profile = getArenaProfile(match.player1_id);
    const p2Profile = match.player2_id.startsWith('ai_shadow_')
      ? { rating: match.p2_rating_before, matchesPlayed: 10 }
      : getArenaProfile(match.player2_id);
    if (!p1Profile || !p2Profile) throw new Error(`Missing Arena profile while concluding match ${matchId}.`);

    p1ScoreFactor = winnerId === match.player1_id ? 1 : winnerId === 'draw' ? 0.5 : 0;
    p2ScoreFactor = winnerId === match.player2_id ? 1 : winnerId === 'draw' ? 0.5 : 0;

    // Step 2: Ranked Rating Isolation
    if (isTournament) {
      // Tournament matches NEVER modify normal Ranked Arena Elo
      p1Delta = 0;
      p2Delta = 0;
      p1RatingAfter = match.p1_rating_before;
      p2RatingAfter = match.p2_rating_before;
    } else {
      p1Delta = calculateEloChange(match.p1_rating_before, match.p2_rating_before, p1ScoreFactor, p1Profile.matchesPlayed);
      p2Delta = calculateEloChange(match.p2_rating_before, match.p1_rating_before, p2ScoreFactor, p2Profile.matchesPlayed);
      p1RatingAfter = Math.max(0, match.p1_rating_before + p1Delta);
      p2RatingAfter = Math.max(0, match.p2_rating_before + p2Delta);
    }

    db.prepare(`
      UPDATE arena_matches
      SET status = ?, winner_id = ?, p1_rating_after = ?, p2_rating_after = ?, end_time = ?
      WHERE id = ? AND status IN ('waiting', 'ready', 'in_progress')
    `).run(terminalStatus, winnerId, p1RatingAfter, p2RatingAfter, nowIso, matchId);

    // Only update ranked arena profile and rating history for ranked matches
    if (!isTournament) {
      updatePlayerArenaProfile(match.player1_id, p1RatingAfter, p1ScoreFactor, p1Delta, matchId);
      if (!match.player2_id.startsWith('ai_shadow_')) {
        updatePlayerArenaProfile(match.player2_id, p2RatingAfter, p2ScoreFactor, p2Delta, matchId);
      }
    }

    db.prepare('UPDATE arena_match_participants SET active = 0, updated_at = ? WHERE match_id = ?')
      .run(nowIso, matchId);
    db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ?').run(matchId);

    if (winnerId !== 'draw' && !winnerId.startsWith('ai_shadow_')) {
      awardArenaMatchXp(winnerId, matchId, isTournament ? 150 : 100, nowIso);
    }
    recordArenaSeasonXp(
      match.player1_id,
      p1ScoreFactor === 1 ? (isTournament ? 200 : 150) : p1ScoreFactor === 0.5 ? 80 : 50,
      nowIso
    );
    if (!match.player2_id.startsWith('ai_shadow_')) {
      recordArenaSeasonXp(
        match.player2_id,
        p2ScoreFactor === 1 ? (isTournament ? 200 : 150) : p2ScoreFactor === 0.5 ? 80 : 50,
        nowIso
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error(`Failed to roll back arena match conclusion ${matchId}:`, rollbackError);
    }
    throw error;
  }

  const tournamentMatch = db.prepare('SELECT * FROM tournament_matches WHERE arena_match_id = ?').get(matchId);
  if (tournamentMatch) handleTournamentMatchConclusion(tournamentMatch.id, winnerId);
}

/**
 * Updates player's arena profile, streak, and rating history.
 */
function updatePlayerArenaProfile(userId, newRating, scoreFactor, delta, matchId) {
  const profile = getArenaProfile(userId);
  const nowIso = new Date().toISOString();

  const isWin = scoreFactor === 1;
  const isLoss = scoreFactor === 0;
  const isDraw = scoreFactor === 0.5;

  const newWins = profile.wins + (isWin ? 1 : 0);
  const newLosses = profile.losses + (isLoss ? 1 : 0);
  const newDraws = profile.draws + (isDraw ? 1 : 0);
  const newStreak = isWin ? profile.streak + 1 : 0;
  const bestStreak = Math.max(profile.bestStreak, newStreak);
  const peakRating = Math.max(profile.peakRating, newRating);
  const division = getDivision(newRating);

  db.prepare(`
    UPDATE arena_profiles
    SET rating = ?,
        peak_rating = ?,
        division = ?,
        wins = ?,
        losses = ?,
        draws = ?,
        streak = ?,
        best_streak = ?,
        matches_played = matches_played + 1,
        updated_at = ?
    WHERE user_id = ?
  `).run(newRating, peakRating, division, newWins, newLosses, newDraws, newStreak, bestStreak, nowIso, userId);

  // Rating history log
  db.prepare(`
    INSERT INTO rating_history (id, user_id, match_id, rating_before, rating_after, change, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'ranked_match', ?)
  `).run(`rh_${crypto.randomUUID()}`, userId, matchId, profile.rating, newRating, delta, nowIso);

  // Also update season participant rating
  const activeSeason = db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY season_number DESC LIMIT 1").get();
  if (activeSeason) {
    db.prepare(`
      UPDATE season_participants
      SET arena_rating = ?,
          peak_rating = MAX(peak_rating, ?),
          division = ?,
          updated_at = ?
      WHERE season_id = ? AND user_id = ?
    `).run(newRating, newRating, division, nowIso, activeSeason.id, userId);
  }

  // Title unlock on division promotion
  if (division === 'Gold') unlockUserTitle(userId, 'Golden Hunter', 'ranked_arena');
  if (division === 'Monarch') unlockUserTitle(userId, 'Arena Monarch', 'ranked_arena');
}

/**
 * Cancels an untouched match. A match with an accepted submission must finish.
 */
export function cancelArenaMatch(userId, matchId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const match = db.prepare(`
      SELECT m.* FROM arena_matches m
      JOIN arena_match_participants p ON p.match_id = m.id
      WHERE m.id = ? AND p.user_id = ? AND p.active = 1
    `).get(matchId, userId);
    if (!match || !['ready', 'in_progress'].includes(match.status)) {
      db.exec('COMMIT');
      return { success: false, error: 'Active match not found.' };
    }
    const hasSubmission = db.prepare('SELECT 1 FROM arena_match_submissions WHERE match_id = ? LIMIT 1')
      .get(matchId);
    if (hasSubmission) {
      db.exec('COMMIT');
      return { success: false, error: 'A match cannot be cancelled after a submission has been accepted.' };
    }
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE arena_matches SET status = 'cancelled', end_time = ?
      WHERE id = ? AND status IN ('ready', 'in_progress')
    `).run(nowIso, matchId);
    db.prepare('UPDATE arena_match_participants SET active = 0, updated_at = ? WHERE match_id = ?')
      .run(nowIso, matchId);
    db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ?').run(matchId);
    db.exec('COMMIT');
    return { success: true, matchId, status: 'cancelled' };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error(`Failed to roll back arena match cancellation ${matchId}:`, rollbackError);
    }
    throw error;
  }
}

/**
 * Forfeits an active match.
 */
export function forfeitArenaMatch(userId, matchId) {
  const match = db.prepare(`
    SELECT m.* FROM arena_matches m
    JOIN arena_match_participants p ON p.match_id = m.id
    WHERE m.id = ? AND p.user_id = ? AND p.active = 1
  `).get(matchId, userId);
  if (!match || !['ready', 'in_progress'].includes(match.status)) {
    return { success: false, error: 'Match is not in progress.' };
  }

  const isPlayer1 = userId === match.player1_id;
  const currentStatus = isPlayer1 ? match.player1_status : match.player2_status;
  if (currentStatus === 'completed' || currentStatus === 'forfeited') {
    return { success: false, error: 'Your match submission is already finalized.' };
  }
  const forfeitField = isPlayer1 ? 'player1_status' : 'player2_status';
  const participantState = isPlayer1 ? 1 : 2;
  const winnerId = isPlayer1 ? match.player2_id : match.player1_id;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE arena_matches SET ${forfeitField} = 'forfeited', status = 'in_progress' WHERE id = ?`)
      .run(matchId);
    db.prepare(`
      UPDATE arena_match_participants SET state = 'forfeited', updated_at = ?
      WHERE match_id = ? AND slot = ?
    `).run(new Date().toISOString(), matchId, participantState);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      console.error(`Failed to roll back arena forfeit ${matchId}:`, rollbackError);
    }
    throw error;
  }

  concludeMatch(matchId);
  return { success: true, winnerId, match: getArenaMatch(matchId, userId) };
}

/**
 * Returns match history for a user.
 */
export function getUserMatchHistory(userId, limit = 10, offset = 0) {
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  const rows = db.prepare(`
    SELECT m.id, m.match_type as matchType, m.status, m.winner_id as winnerId,
           m.challenge_id as challengeId, m.start_time as startTime, m.end_time as endTime,
           m.player1_id as p1Id, m.p1_name as p1Name, m.p1_rating_before as p1RatingBefore, m.p1_rating_after as p1RatingAfter,
           m.player1_score as p1Score, m.player1_time_ms as p1TimeMs,
           m.player2_id as p2Id, m.p2_name as p2Name, m.p2_rating_before as p2RatingBefore, m.p2_rating_after as p2RatingAfter,
           m.player2_score as p2Score, m.player2_time_ms as p2TimeMs
    FROM arena_matches m
    WHERE (m.player1_id = ? OR m.player2_id = ?)
      AND m.status IN ('completed', 'expired') AND m.winner_id IS NOT NULL
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, userId, limitNum, offsetNum);

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM arena_matches
    WHERE (player1_id = ? OR player2_id = ?)
      AND status IN ('completed', 'expired') AND winner_id IS NOT NULL
  `).get(userId, userId).c;

  return {
    matches: rows.map((r) => {
      const isP1 = r.p1Id === userId;
      const isWinner = r.winnerId === userId;
      const isDraw = r.winnerId === 'draw';
      const myRatingBefore = isP1 ? r.p1RatingBefore : r.p2RatingBefore;
      const myRatingAfter = isP1 ? r.p1RatingAfter : r.p2RatingAfter;
      const oppName = isP1 ? r.p2Name : r.p1Name;

      return {
        id: r.id,
        challengeId: r.challengeId,
        matchType: r.matchType,
        status: r.status,
        result: isWinner ? 'win' : isDraw ? 'draw' : 'loss',
        opponentName: oppName,
        ratingBefore: myRatingBefore,
        ratingAfter: myRatingAfter,
        ratingChange: myRatingAfter ? myRatingAfter - myRatingBefore : 0,
        myScore: isP1 ? r.p1Score : r.p2Score,
        opponentScore: isP1 ? r.p2Score : r.p1Score,
        startTime: r.startTime,
        endTime: r.endTime,
      };
    }),
    total,
    page: Math.floor(offsetNum / limitNum) + 1,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

export function getUserRatingHistory(userId, limit = 25, offset = 0) {
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
  const offsetNum = Math.max(0, Number.parseInt(offset, 10) || 0);
  const rows = db.prepare(`
    SELECT rh.match_id as matchId, rh.rating_before as ratingBefore,
           rh.rating_after as ratingAfter, rh.change, rh.reason, rh.created_at as createdAt
    FROM rating_history rh
    WHERE rh.user_id = ?
    ORDER BY rh.created_at DESC, rh.id DESC
    LIMIT ? OFFSET ?
  `).all(userId, limitNum, offsetNum);
  const total = db.prepare('SELECT COUNT(*) as total FROM rating_history WHERE user_id = ?').get(userId).total;
  return {
    entries: rows,
    total,
    page: Math.floor(offsetNum / limitNum) + 1,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

/**
 * Returns competitive Ranked Arena leaderboard.
 */
export function getArenaLeaderboard(page = 1, limit = 25, division = 'all') {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT ap.user_id as userId, p.display_name as name, p.title,
           ap.rating, ap.peak_rating as peakRating, ap.division,
           ap.wins, ap.losses, ap.draws, ap.streak, ap.matches_played as matchesPlayed
    FROM arena_profiles ap
    JOIN profiles p ON p.user_id = ap.user_id
    WHERE ap.matches_played > 0
  `;
  let countQuery = 'SELECT COUNT(*) as total FROM arena_profiles ap WHERE ap.matches_played > 0';
  const params = [];
  const countParams = [];

  if (division && division !== 'all') {
    query += ' AND ap.division = ?';
    countQuery += ' AND ap.division = ?';
    params.push(division);
    countParams.push(division);
  }

  query += ' ORDER BY ap.rating DESC, ap.wins DESC LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const total = db.prepare(countQuery).get(...countParams).total;
  const rows = db.prepare(query).all(...params);

  return {
    entries: rows.map((r, i) => ({
      rank: offset + i + 1,
      ...r,
      winRate: r.matchesPlayed > 0 ? Math.round((r.wins / r.matchesPlayed) * 100) : 0,
    })),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

// ─── Single-Elimination Tournament Subsystem ────────────────────────────────

/**
 * Returns tournament list with participation status.
 */
export function getTournamentsList(userId = null) {
  const rows = db.prepare(`
    SELECT t.id, t.season_id as seasonId, t.title, t.description, t.format,
           t.max_participants as maxParticipants, t.current_participants as currentParticipants,
           t.status, t.created_by as createdBy, t.start_time as startTime, t.current_round as currentRound,
           t.total_rounds as totalRounds, t.rewards_json as rewardsJson, t.winner_id as winnerId,
           (SELECT display_name FROM profiles WHERE user_id = t.winner_id) as winnerName
    FROM tournaments t
    ORDER BY t.created_at DESC
  `).all();

  return rows.map((t) => {
    let isRegistered = false;
    if (userId) {
      const reg = db.prepare('SELECT 1 FROM tournament_participants WHERE tournament_id = ? AND user_id = ?').get(t.id, userId);
      isRegistered = !!reg;
    }

    return {
      ...t,
      rewards: JSON.parse(t.rewardsJson || '{}'),
      isRegistered,
      isCreator: userId ? t.createdBy === userId : false,
    };
  });
}

/**
 * Returns detailed tournament info with bracket visualization structure.
 */
export function getTournamentDetails(tournamentId, userId = null) {
  const t = db.prepare(`
    SELECT t.*, (SELECT display_name FROM profiles WHERE user_id = t.winner_id) as winnerName
    FROM tournaments t WHERE t.id = ?
  `).get(tournamentId);

  if (!t) return null;

  // Participants
  const participants = db.prepare(`
    SELECT tp.user_id as userId, tp.username, tp.seed, tp.eliminated,
           tp.eliminated_round as eliminatedRound, tp.final_rank as finalRank,
           tp.rewards_claimed as rewardsClaimed, ap.rating, ap.division
    FROM tournament_participants tp
    LEFT JOIN arena_profiles ap ON ap.user_id = tp.user_id
    WHERE tp.tournament_id = ?
    ORDER BY tp.seed ASC
  `).all(tournamentId);

  // Bracket matches
  const matches = db.prepare(`
    SELECT tm.id, tm.round, tm.match_index as matchIndex,
           tm.player1_id as p1Id, tm.p1_name as p1Name,
           tm.player2_id as p2Id, tm.p2_name as p2Name,
           tm.winner_id as winnerId, tm.challenge_id as challengeId,
           tm.status, tm.next_match_id as nextMatchId, tm.arena_match_id as arenaMatchId
    FROM tournament_matches tm
    WHERE tm.tournament_id = ?
    ORDER BY tm.round ASC, tm.match_index ASC
  `).all(tournamentId);

  // Group matches by round for bracket view
  const rounds = [];
  for (let r = 1; r <= t.total_rounds; r++) {
    rounds.push({
      roundNumber: r,
      title: getRoundTitle(r, t.total_rounds),
      matches: matches.filter((m) => m.round === r),
    });
  }

  let userContext = {
    isRegistered: false,
    isCreator: userId ? t.created_by === userId : false,
    participant: null,
    activeMatchId: null,
    canClaimReward: false,
    claimableReward: null,
  };

  if (userId) {
    const p = participants.find((part) => part.userId === userId);
    if (p) {
      userContext.isRegistered = true;
      userContext.participant = p;

      // Find user active match
      const userActiveMatch = matches.find(
        (m) => (m.p1Id === userId || m.p2Id === userId) && (m.status === 'in_progress' || m.status === 'scheduled')
      );
      if (userActiveMatch) {
        userContext.activeMatchId = userActiveMatch.id;
      }

      // Check reward claimability
      if (t.status === 'completed' && !p.rewardsClaimed && p.finalRank && p.finalRank <= 4) {
        const rewards = JSON.parse(t.rewards_json || '{}');
        let reward = null;
        if (p.finalRank === 1) reward = rewards.firstPlace;
        else if (p.finalRank === 2) reward = rewards.secondPlace;
        else if (p.finalRank <= 4) reward = rewards.semifinalist;

        if (reward) {
          userContext.canClaimReward = true;
          userContext.claimableReward = reward;
        }
      }
    }
  }

  return {
    id: t.id,
    seasonId: t.season_id,
    title: t.title,
    description: t.description,
    format: t.format,
    maxParticipants: t.max_participants,
    currentParticipants: t.current_participants,
    status: t.status,
    createdBy: t.created_by,
    startTime: t.start_time,
    endTime: t.end_time,
    currentRound: t.current_round,
    totalRounds: t.total_rounds,
    rewards: JSON.parse(t.rewards_json || '{}'),
    winnerId: t.winner_id,
    winnerName: t.winnerName,
    participants,
    bracket: rounds,
    userContext,
  };
}

/**
 * Helper to name bracket rounds.
 */
function getRoundTitle(round, totalRounds) {
  const diff = totalRounds - round;
  if (diff === 0) return 'Finals';
  if (diff === 1) return 'Semifinals';
  if (diff === 2) return 'Quarterfinals';
  return `Round ${round}`;
}

/**
 * Creates a tournament.
 */
export function createTournament(userId, data) {
  if (!data.title || data.title.trim().length < 3) {
    return { success: false, error: 'Tournament title must be at least 3 characters.' };
  }

  const maxParticipants = Math.min(32, Math.max(4, parseInt(data.maxParticipants || 8, 10)));
  const totalRounds = Math.ceil(Math.log2(maxParticipants));
  const nowIso = new Date().toISOString();
  const id = `tourn_${crypto.randomUUID()}`;

  const rewards = data.rewards || {
    firstPlace: { xp: 1500, title: 'Grandmaster of Shadows' },
    secondPlace: { xp: 800, title: 'Tournament Finalist' },
    semifinalist: { xp: 400, title: 'Tournament Contender' },
  };

  db.prepare(`
    INSERT INTO tournaments (
      id, season_id, title, description, format,
      max_participants, current_participants, status,
      start_time, total_rounds, rewards_json, created_by, created_at, updated_at
    )
    VALUES (?, 'season-1', ?, ?, 'single_elimination', ?, 0, 'registration', ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title.trim(),
    data.description || 'Single-elimination coding tournament.',
    maxParticipants,
    data.startTime || nowIso,
    totalRounds,
    JSON.stringify(rewards),
    userId || null,
    nowIso,
    nowIso
  );

  return { success: true, tournamentId: id };
}

/**
 * Registers user for an upcoming tournament.
 */
export function registerForTournament(userId, tournamentId) {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!t) return { success: false, error: 'Tournament not found.' };

  if (t.status !== 'registration') {
    return { success: false, error: 'Registration is closed for this tournament.' };
  }

  if (t.current_participants >= t.max_participants) {
    return { success: false, error: 'Tournament has reached maximum capacity.' };
  }

  const existing = db.prepare('SELECT 1 FROM tournament_participants WHERE tournament_id = ? AND user_id = ?').get(tournamentId, userId);
  if (existing) {
    return { success: false, error: 'You are already registered for this tournament.' };
  }

  const profile = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(userId);
  const nowIso = new Date().toISOString();
  const partId = `tp_${tournamentId}_${userId}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO tournament_participants (id, tournament_id, user_id, username, seed, registered_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(partId, tournamentId, userId, profile?.display_name || 'Hunter', t.current_participants + 1, nowIso);

    db.prepare(`
      UPDATE tournaments
      SET current_participants = current_participants + 1, updated_at = ?
      WHERE id = ?
    `).run(nowIso, tournamentId);

    db.exec('COMMIT');

    // Trigger tournament participation achievement check
    try {
      checkAndUnlockAchievements(userId);
    } catch {}

    return { success: true, currentParticipants: t.current_participants + 1 };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Withdraws user from a tournament before it starts.
 */
export function withdrawFromTournament(userId, tournamentId) {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!t) return { success: false, error: 'Tournament not found.' };

  if (t.status !== 'registration') {
    return { success: false, error: 'Cannot withdraw from an ongoing or completed tournament.' };
  }

  const existing = db.prepare('SELECT 1 FROM tournament_participants WHERE tournament_id = ? AND user_id = ?').get(tournamentId, userId);
  if (!existing) {
    return { success: false, error: 'You are not registered in this tournament.' };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM tournament_participants WHERE tournament_id = ? AND user_id = ?').run(tournamentId, userId);
    db.prepare(`
      UPDATE tournaments
      SET current_participants = MAX(0, current_participants - 1), updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), tournamentId);

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Starts tournament and generates single-elimination bracket.
 * Robustly handles odd participant counts with automatic byes!
 * Restricted to the tournament creator (or admin if no creator is set).
 */
export function startTournament(tournamentId, requestingUserId = null) {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!t) return { success: false, error: 'Tournament not found.' };

  // Step 1: Authorization
  if (t.created_by && requestingUserId && t.created_by !== requestingUserId) {
    return { success: false, unauthorized: true, error: 'Unauthorized: Only the tournament creator can start this tournament.' };
  }

  if (t.status !== 'registration') {
    return { success: false, error: 'Tournament has already started or completed.' };
  }

  const participants = db.prepare(`
    SELECT tp.*, COALESCE(ap.rating, 1000) as rating
    FROM tournament_participants tp
    LEFT JOIN arena_profiles ap ON ap.user_id = tp.user_id
    WHERE tp.tournament_id = ?
    ORDER BY rating DESC, tp.registered_at ASC
  `).all(tournamentId);

  if (participants.length < 2) {
    return { success: false, error: 'At least 2 hunters are required to start a tournament.' };
  }

  const nowIso = new Date().toISOString();

  // Determine power of 2 bracket size
  const N = participants.length;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(N)));
  const totalRounds = Math.log2(bracketSize);

  db.exec('BEGIN IMMEDIATE');
  try {
    // Update participant seeds
    participants.forEach((p, idx) => {
      db.prepare('UPDATE tournament_participants SET seed = ? WHERE id = ?').run(idx + 1, p.id);
    });

    // Generate bracket structure: create match nodes from round 1 to finals
    const matchMap = new Map(); // key: `${round}_${index}` -> matchId

    for (let r = 1; r <= totalRounds; r++) {
      const matchCountInRound = bracketSize / Math.pow(2, r);
      for (let m = 0; m < matchCountInRound; m++) {
        const matchId = `tm_${tournamentId}_r${r}_m${m}`;
        matchMap.set(`${r}_${m}`, matchId);

        const nextRound = r + 1;
        const nextIndex = Math.floor(m / 2);
        const nextMatchId = r < totalRounds ? `tm_${tournamentId}_r${nextRound}_m${nextIndex}` : null;

        // Select challenge for this round
        const challengePool = getChallengesForTournamentRound(r, totalRounds);
        const challengeId = challengePool[m % challengePool.length] || 'py-01';

        db.prepare(`
          INSERT INTO tournament_matches (
            id, tournament_id, round, match_index, challenge_id, status, next_match_id, created_at
          )
          VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)
        `).run(matchId, tournamentId, r, m, challengeId, nextMatchId, nowIso);
      }
    }

    // Populate Round 1 with participants & process Byes
    const round1MatchCount = bracketSize / 2;
    for (let m = 0; m < round1MatchCount; m++) {
      const matchId = matchMap.get(`1_${m}`);
      const p1Index = m;
      const p2Index = bracketSize - 1 - m;

      const p1 = participants[p1Index] || null;
      const p2 = participants[p2Index] || null;

      if (p1 && !p2) {
        // BYE: Player 1 advances automatically!
        db.prepare(`
          UPDATE tournament_matches
          SET player1_id = ?, p1_name = ?, winner_id = ?, status = 'bye'
          WHERE id = ?
        `).run(p1.user_id, p1.username, p1.user_id, matchId);

        // Advance P1 to Round 2
        advanceTournamentWinner(matchId, p1.user_id, p1.username);
      } else if (p1 && p2) {
        // Normal Match
        db.prepare(`
          UPDATE tournament_matches
          SET player1_id = ?, p1_name = ?, player2_id = ?, p2_name = ?, status = 'scheduled'
          WHERE id = ?
        `).run(p1.user_id, p1.username, p2.user_id, p2.username, matchId);
      }
    }

    // Update tournament status
    db.prepare(`
      UPDATE tournaments
      SET status = 'in_progress', total_rounds = ?, current_round = 1, updated_at = ?
      WHERE id = ?
    `).run(totalRounds, nowIso, tournamentId);

    db.exec('COMMIT');
    return { success: true, totalRounds, bracketSize, participantsCount: N };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Step 3: Cancels a tournament safely.
 * Only the creator can cancel. In-progress arena matches are terminated cleanly.
 */
export function cancelTournament(tournamentId, requestingUserId = null) {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!t) return { success: false, error: 'Tournament not found.' };

  // Authorization check
  if (t.created_by && requestingUserId && t.created_by !== requestingUserId) {
    return { success: false, unauthorized: true, error: 'Unauthorized: Only the tournament creator can cancel this tournament.' };
  }

  if (t.status === 'completed') {
    return { success: false, error: 'Cannot cancel a completed tournament.' };
  }

  if (t.status === 'cancelled') {
    return { success: false, error: 'Tournament is already cancelled.' };
  }

  const nowIso = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    // If in progress, cancel any active arena matches and participants
    const activeMatches = db.prepare(`
      SELECT arena_match_id FROM tournament_matches
      WHERE tournament_id = ? AND arena_match_id IS NOT NULL AND status IN ('scheduled', 'in_progress')
    `).all(tournamentId);

    for (const m of activeMatches) {
      db.prepare("UPDATE arena_matches SET status = 'cancelled', end_time = ? WHERE id = ? AND status IN ('waiting', 'ready', 'in_progress')")
        .run(nowIso, m.arena_match_id);
      db.prepare("UPDATE arena_match_participants SET active = 0, state = 'forfeited', updated_at = ? WHERE match_id = ?")
        .run(nowIso, m.arena_match_id);
      db.prepare('DELETE FROM arena_submission_locks WHERE match_id = ?').run(m.arena_match_id);
    }

    db.prepare("UPDATE tournament_matches SET status = 'cancelled' WHERE tournament_id = ? AND status != 'completed'")
      .run(tournamentId);

    db.prepare("UPDATE tournaments SET status = 'cancelled', updated_at = ? WHERE id = ?")
      .run(nowIso, tournamentId);

    db.exec('COMMIT');
    return { success: true, tournamentId, status: 'cancelled' };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Step 4: Starts an individual tournament match and initializes its backing arena match.
 * Ensures the match workspace (Phase 3) can cleanly mount and run duel tests.
 */
export function startTournamentMatch(tournamentMatchId, requestingUserId = null) {
  const tm = db.prepare('SELECT * FROM tournament_matches WHERE id = ?').get(tournamentMatchId);
  if (!tm) return { success: false, error: 'Tournament match not found.' };

  if (tm.status === 'completed' || tm.status === 'bye') {
    return { success: false, error: 'This tournament match is already completed.' };
  }

  if (tm.status === 'cancelled') {
    return { success: false, error: 'This tournament match is cancelled.' };
  }

  // If already backed by an arena match, return it
  if (tm.arena_match_id) {
    const existing = db.prepare('SELECT id, status FROM arena_matches WHERE id = ?').get(tm.arena_match_id);
    if (existing && ['waiting', 'ready', 'in_progress'].includes(existing.status)) {
      return { success: true, matchId: tm.arena_match_id, tournamentMatchId };
    }
  }

  // Both players must be present
  if (!tm.player1_id || !tm.player2_id) {
    return { success: false, error: 'Both players must be determined before starting the match.' };
  }

  // Authorization: must be player1, player2, or tournament creator
  const t = db.prepare('SELECT created_by FROM tournaments WHERE id = ?').get(tm.tournament_id);
  if (requestingUserId) {
    const isP1 = tm.player1_id === requestingUserId;
    const isP2 = tm.player2_id === requestingUserId;
    const isCreator = t?.created_by === requestingUserId;
    if (!isP1 && !isP2 && !isCreator) {
      return { success: false, unauthorized: true, error: 'Unauthorized: Only match participants or tournament creator can start this match.' };
    }
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const deadlineAt = new Date(now + ARENA_MATCH_DURATION_SEC * 1000).toISOString();
  const arenaMatchId = `tarena_${crypto.randomUUID()}`;

  const p1 = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(tm.player1_id);
  const p2 = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(tm.player2_id);
  const p1Profile = getArenaProfile(tm.player1_id);
  const p2Profile = getArenaProfile(tm.player2_id);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO arena_matches (
        id, season_id, challenge_id, match_type, player1_id, player2_id,
        p1_name, p2_name, p1_rating_before, p2_rating_before,
        status, duration_limit_sec, start_time, deadline_at, created_at
      )
      VALUES (?, 'season-1', ?, 'tournament', ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)
    `).run(
      arenaMatchId,
      tm.challenge_id,
      tm.player1_id,
      tm.player2_id,
      p1?.display_name || tm.p1_name || 'Hunter',
      p2?.display_name || tm.p2_name || 'Hunter',
      p1Profile?.rating || 1000,
      p2Profile?.rating || 1000,
      ARENA_MATCH_DURATION_SEC,
      nowIso,
      deadlineAt,
      nowIso
    );

    const addParticipant = db.prepare(`
      INSERT INTO arena_match_participants
        (id, match_id, user_id, slot, state, active, joined_at, updated_at)
      VALUES (?, ?, ?, ?, 'ready', 1, ?, ?)
    `);
    addParticipant.run(`amp_${arenaMatchId}_1`, arenaMatchId, tm.player1_id, 1, nowIso, nowIso);
    addParticipant.run(`amp_${arenaMatchId}_2`, arenaMatchId, tm.player2_id, 2, nowIso, nowIso);

    db.prepare("UPDATE tournament_matches SET arena_match_id = ?, status = 'in_progress' WHERE id = ?")
      .run(arenaMatchId, tournamentMatchId);

    db.exec('COMMIT');
    return { success: true, matchId: arenaMatchId, tournamentMatchId };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Advances a winner from a match node to the next match in the single-elimination bracket.
 */
function advanceTournamentWinner(matchId, winnerId, winnerName) {
  const match = db.prepare('SELECT next_match_id, match_index FROM tournament_matches WHERE id = ?').get(matchId);
  if (!match || !match.next_match_id) return;

  const nextMatch = db.prepare('SELECT * FROM tournament_matches WHERE id = ?').get(match.next_match_id);
  if (!nextMatch) return;

  // If match_index is even, winner is player1; if odd, winner is player2
  const isSlot1 = (match.match_index % 2) === 0;

  if (isSlot1) {
    db.prepare(`
      UPDATE tournament_matches
      SET player1_id = ?, p1_name = ?
      WHERE id = ?
    `).run(winnerId, winnerName, nextMatch.id);
  } else {
    db.prepare(`
      UPDATE tournament_matches
      SET player2_id = ?, p2_name = ?
      WHERE id = ?
    `).run(winnerId, winnerName, nextMatch.id);
  }
}

/**
 * Submits code for a tournament match.
 */
export async function submitTournamentMatch(userId, tournamentMatchId, code, executeInPythonProcess, buildHarnessScript) {
  const tm = db.prepare('SELECT * FROM tournament_matches WHERE id = ?').get(tournamentMatchId);
  if (!tm) return { success: false, error: 'Tournament match not found.' };

  if (tm.status === 'completed' || tm.status === 'bye') {
    return { success: false, error: 'This tournament match is already completed.' };
  }

  const isP1 = tm.player1_id === userId;
  const isP2 = tm.player2_id === userId;
  if (!isP1 && !isP2) {
    return { success: false, error: 'You are not a participant in this tournament match.' };
  }

  // Create or retrieve backing arena match
  let arenaMatchId = tm.arena_match_id;
  if (!arenaMatchId) {
    const startRes = startTournamentMatch(tournamentMatchId, userId);
    if (!startRes.success) return startRes;
    arenaMatchId = startRes.matchId;
  }

  // Submit via standard arena submission pipeline
  const submitResult = await submitArenaMatch(userId, arenaMatchId, code, executeInPythonProcess, buildHarnessScript);
  return submitResult;
}

/**
 * Handles tournament progression when an arena match concludes.
 */
function handleTournamentMatchConclusion(tournamentMatchId, winnerId) {
  const tm = db.prepare('SELECT * FROM tournament_matches WHERE id = ?').get(tournamentMatchId);
  if (!tm || tm.status === 'completed') return;

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tm.tournament_id);
  if (!tournament) return;

  const nowIso = new Date().toISOString();
  const loserId = winnerId === tm.player1_id ? tm.player2_id : tm.player1_id;
  const winnerName = winnerId === tm.player1_id ? tm.p1_name : tm.p2_name;

  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Mark tournament match completed
    db.prepare(`
      UPDATE tournament_matches
      SET status = 'completed', winner_id = ?
      WHERE id = ?
    `).run(winnerId, tm.id);

    // 2. Mark loser eliminated
    if (loserId && !loserId.startsWith('ai_shadow_')) {
      db.prepare(`
        UPDATE tournament_participants
        SET eliminated = 1, eliminated_round = ?
        WHERE tournament_id = ? AND user_id = ?
      `).run(tm.round, tm.tournament_id, loserId);
    }

    // 3. If finals round, conclude tournament
    if (tm.round === tournament.total_rounds) {
      db.prepare(`
        UPDATE tournaments
        SET status = 'completed', winner_id = ?, end_time = ?, updated_at = ?
        WHERE id = ?
      `).run(winnerId, nowIso, nowIso, tm.tournament_id);

      // Set final placements
      if (winnerId && !winnerId.startsWith('ai_shadow_')) {
        db.prepare(`
          UPDATE tournament_participants
          SET final_rank = 1
          WHERE tournament_id = ? AND user_id = ?
        `).run(tm.tournament_id, winnerId);

        unlockUserTitle(winnerId, 'Tournament Champion', 'tournament');

        // Trigger tournament winner achievements
        try {
          checkAndUnlockAchievements(winnerId);
        } catch {}
      }

      if (loserId && !loserId.startsWith('ai_shadow_')) {
        db.prepare(`
          UPDATE tournament_participants
          SET final_rank = 2
          WHERE tournament_id = ? AND user_id = ?
        `).run(tm.tournament_id, loserId);

        unlockUserTitle(loserId, 'Tournament Finalist', 'tournament');
      }
    } else {
      // Advance winner to next round match
      advanceTournamentWinner(tm.id, winnerId, winnerName);
    }

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('Error handling tournament match conclusion:', err);
  }
}

/**
 * Claims rewards for tournament placement.
 */
export function claimTournamentReward(userId, tournamentId) {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!t || t.status !== 'completed') {
    return { success: false, error: 'Tournament is not completed yet.' };
  }

  const p = db.prepare('SELECT * FROM tournament_participants WHERE tournament_id = ? AND user_id = ?').get(tournamentId, userId);
  if (!p) {
    return { success: false, error: 'You are not a participant in this tournament.' };
  }

  if (p.rewards_claimed === 1) {
    return { success: false, error: 'Tournament rewards have already been claimed.' };
  }

  const rank = p.final_rank || (p.eliminated_round === t.total_rounds - 1 ? 3 : 99);
  const rewards = JSON.parse(t.rewards_json || '{}');

  let reward = null;
  if (rank === 1) reward = rewards.firstPlace;
  else if (rank === 2) reward = rewards.secondPlace;
  else if (rank <= 4) reward = rewards.semifinalist;

  if (!reward) {
    return { success: false, error: 'No claimable rewards for your final tournament placement.' };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const updateRes = db.prepare('UPDATE tournament_participants SET rewards_claimed = 1 WHERE tournament_id = ? AND user_id = ? AND rewards_claimed = 0').run(tournamentId, userId);
    if (updateRes.changes === 0) {
      db.exec('ROLLBACK');
      return { success: false, error: 'Tournament rewards have already been claimed.' };
    }
    db.exec('COMMIT');

    // Award XP and title
    if (reward.xp > 0) {
      try {
        awardQuestCompletionAtomic(userId, `tournament_reward_${tournamentId}`, reward.xp);
      } catch {}
    }
    if (reward.title) {
      try {
        unlockUserTitle(userId, reward.title, 'tournament');
      } catch {}
    }

    return {
      success: true,
      rank,
      xpAwarded: reward.xp,
      titleAwarded: reward.title,
    };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Step 7: Returns safe, sanitized match data for spectators.
 * NEVER exposes hidden test cases, private submissions, or player auth/token information.
 */
export function getSpectatorMatch(matchId) {
  cleanupArenaState();
  const match = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
  if (!match) return null;

  const challenge = serverChallenges[match.challenge_id];
  if (!challenge) return null;

  const startTimeMs = new Date(match.start_time).getTime();
  const elapsedSec = Math.floor((Date.now() - startTimeMs) / 1000);
  const remainingSec = Math.max(0, match.duration_limit_sec - elapsedSec);

  const p1Participant = db.prepare('SELECT attempts_count FROM arena_match_participants WHERE match_id = ? AND user_id = ?').get(match.id, match.player1_id);
  const p2Participant = db.prepare('SELECT attempts_count FROM arena_match_participants WHERE match_id = ? AND user_id = ?').get(match.id, match.player2_id);

  // Tournament context if this is a tournament match
  const tm = db.prepare(`
    SELECT tm.id as tournamentMatchId, tm.round, tm.match_index as matchIndex,
           t.id as tournamentId, t.title as tournamentTitle, t.total_rounds as totalRounds
    FROM tournament_matches tm
    JOIN tournaments t ON t.id = tm.tournament_id
    WHERE tm.arena_match_id = ?
  `).get(match.id);

  return {
    id: match.id,
    seasonId: match.season_id,
    matchType: match.match_type,
    status: match.status,
    challenge: {
      id: challenge.id,
      title: challenge.title,
      functionName: challenge.functionName,
      lesson: challenge.lesson,
      sampleTests: challenge.sampleTests, // ONLY sample tests!
    },
    player1: {
      id: match.player1_id,
      name: match.p1_name,
      ratingBefore: match.p1_rating_before,
      ratingAfter: match.p1_rating_after,
      score: match.player1_score,
      passedCount: match.player1_passed_count,
      totalTests: match.player1_total_tests,
      timeMs: match.player1_time_ms,
      status: match.player1_status,
      attemptsCount: p1Participant?.attempts_count || 0,
    },
    player2: {
      id: match.player2_id,
      name: match.p2_name,
      ratingBefore: match.p2_rating_before,
      ratingAfter: match.p2_rating_after,
      score: match.player2_score,
      passedCount: match.player2_passed_count,
      totalTests: match.player2_total_tests,
      timeMs: match.player2_time_ms,
      status: match.player2_status,
      attemptsCount: p2Participant?.attempts_count || 0,
    },
    winnerId: match.winner_id,
    winnerName: match.winner_id === match.player1_id ? match.p1_name : match.winner_id === match.player2_id ? match.p2_name : null,
    durationLimitSec: match.duration_limit_sec,
    remainingSeconds: remainingSec,
    startTime: match.start_time,
    deadlineAt: match.deadline_at,
    endTime: match.end_time,
    tournamentContext: tm ? {
      tournamentId: tm.tournamentId,
      tournamentTitle: tm.tournamentTitle,
      tournamentMatchId: tm.tournamentMatchId,
      round: tm.round,
      totalRounds: tm.totalRounds,
      matchIndex: tm.matchIndex,
    } : null,
  };
}

/**
 * Returns all live matches for a given tournament.
 */
export function getTournamentLiveMatches(tournamentId) {
  const matches = db.prepare(`
    SELECT tm.id as tournamentMatchId, tm.round, tm.match_index as matchIndex,
           tm.player1_id as p1Id, tm.p1_name as p1Name,
           tm.player2_id as p2Id, tm.p2_name as p2Name,
           tm.challenge_id as challengeId, tm.status as tournamentMatchStatus,
           tm.arena_match_id as arenaMatchId,
           am.status as arenaMatchStatus, am.start_time as startTime,
           am.deadline_at as deadlineAt, am.duration_limit_sec as durationLimitSec
    FROM tournament_matches tm
    LEFT JOIN arena_matches am ON am.id = tm.arena_match_id
    WHERE tm.tournament_id = ?
      AND (tm.status = 'in_progress' OR (am.status IN ('ready', 'in_progress')))
    ORDER BY tm.round DESC, tm.match_index ASC
  `).all(tournamentId);

  return matches.map((m) => {
    let remainingSeconds = 0;
    if (m.startTime && m.durationLimitSec) {
      const elapsed = Math.floor((Date.now() - new Date(m.startTime).getTime()) / 1000);
      remainingSeconds = Math.max(0, m.durationLimitSec - elapsed);
    }
    return {
      tournamentMatchId: m.tournamentMatchId,
      arenaMatchId: m.arenaMatchId,
      round: m.round,
      matchIndex: m.matchIndex,
      challengeTitle: serverChallenges[m.challengeId]?.title || 'Coding Duel',
      player1: { id: m.p1Id, name: m.p1Name },
      player2: { id: m.p2Id, name: m.p2Name },
      status: m.arenaMatchStatus || m.tournamentMatchStatus,
      remainingSeconds,
    };
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getChallengesForRating(rating) {
  if (rating >= 1800) return ['py-09', 'py-10', 'py-08'];
  if (rating >= 1600) return ['py-07', 'py-08', 'py-09'];
  if (rating >= 1400) return ['py-05', 'py-06', 'py-07'];
  if (rating >= 1200) return ['py-03', 'py-04', 'py-05'];
  return ['py-01', 'py-02', 'py-03'];
}

function getChallengesForTournamentRound(round, totalRounds) {
  if (round === totalRounds) return ['py-09', 'py-10'];
  if (round === totalRounds - 1) return ['py-07', 'py-08'];
  if (round === totalRounds - 2) return ['py-05', 'py-06'];
  return ['py-02', 'py-03', 'py-04'];
}

function getAiShadowHunter(playerRating) {
  if (playerRating >= 1800) {
    return { id: 'ai_shadow_beru', name: 'Shadow General Beru', rating: playerRating + 25 };
  }
  if (playerRating >= 1600) {
    return { id: 'ai_shadow_tusk', name: 'Shadow Mage Tusk', rating: playerRating + 10 };
  }
  if (playerRating >= 1400) {
    return { id: 'ai_shadow_iron', name: 'Shadow Knight Iron', rating: playerRating };
  }
  if (playerRating >= 1200) {
    return { id: 'ai_shadow_igris', name: 'Shadow Commander Igris', rating: playerRating - 15 };
  }
  return { id: 'ai_shadow_soldier', name: 'Shadow Soldier', rating: Math.max(900, playerRating - 30) };
}
