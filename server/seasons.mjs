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
import { unlockUserTitle } from './achievements.mjs';
import { serverChallenges } from './challenges.mjs';

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
      season_id TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'ranked', -- 'ranked', 'tournament', 'practice'
      player1_id TEXT NOT NULL,
      player2_id TEXT NOT NULL,
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
      player1_status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'submitted', 'completed', 'timed_out', 'forfeited'
      player2_status TEXT NOT NULL DEFAULT 'waiting',
      winner_id TEXT, -- player1_id, player2_id, or 'draw'
      status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
      duration_limit_sec INTEGER NOT NULL DEFAULT 600,
      start_time TEXT NOT NULL,
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
      submitted_at TEXT NOT NULL
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

    -- Tournaments Table
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      format TEXT NOT NULL DEFAULT 'single_elimination',
      max_participants INTEGER NOT NULL DEFAULT 8,
      current_participants INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'registration', -- 'upcoming', 'registration', 'in_progress', 'completed'
      start_time TEXT,
      end_time TEXT,
      current_round INTEGER NOT NULL DEFAULT 1,
      total_rounds INTEGER NOT NULL DEFAULT 3,
      rewards_json TEXT NOT NULL,
      winner_id TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_tourn_matches_tourn ON tournament_matches(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tourn_parts_tourn ON tournament_participants(tournament_id);
  `);

  seedDefaultSeasonAndTournaments();
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
  const r = Math.max(0, parseInt(rating || 1000, 10));
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
export function calculateEloChange(ratingA, ratingB, scoreA, matchesPlayedA = 0) {
  const rA = Math.max(500, ratingA);
  const rB = Math.max(500, ratingB);
  const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));

  // Dynamic K-factor: higher for new/provisional players, lower for established masters
  let k = 24;
  if (matchesPlayedA < 10) {
    k = 32;
  } else if (rA >= 1800) {
    k = 16;
  }

  let delta = Math.round(k * (scoreA - expectedA));

  // Ensure minimum feedback: at least +12 for win, at least -10 for loss unless near bottom
  if (scoreA === 1 && delta < 12) delta = 12;
  if (scoreA === 0 && delta > -10 && rA > 510) delta = -10;

  return delta;
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
    db.prepare('UPDATE arena_profiles SET division = ? WHERE user_id = ?').run(currentDiv, userId);
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

/**
 * Enters user into the Ranked Arena queue.
 * Matches against waiting opponents or Shadow Hunter AI.
 */
export function joinArenaQueue(userId, options = {}) {
  const profile = getArenaProfile(userId);
  const nowIso = new Date().toISOString();

  // 1. Check if user already has an active, unfinished match
  const activeMatch = db.prepare(`
    SELECT id FROM arena_matches
    WHERE (player1_id = ? OR player2_id = ?) AND status = 'in_progress'
    ORDER BY created_at DESC LIMIT 1
  `).get(userId, userId);

  if (activeMatch) {
    return {
      status: 'matched',
      matchId: activeMatch.id,
      message: 'Reconnected to your active match in progress.',
    };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    // 2. Check for an eligible waiting opponent in queue (not self)
    const opponent = db.prepare(`
      SELECT user_id, rating, division, queued_at
      FROM arena_queue
      WHERE user_id != ?
      ORDER BY queued_at ASC LIMIT 1
    `).get(userId);

    const activeSeason = db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY season_number DESC LIMIT 1").get() || { id: 'season-1' };

    // Select challenge calibrated to rating
    const challengePool = getChallengesForRating(profile.rating);
    const selectedChallengeId = challengePool[Math.floor(Math.random() * challengePool.length)] || 'py-01';

    if (opponent) {
      // MATCH FOUND with another real player!
      db.prepare('DELETE FROM arena_queue WHERE user_id IN (?, ?)').run(userId, opponent.user_id);

      const p1Profile = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(userId);
      const p2Profile = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(opponent.user_id);

      const matchId = `match_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO arena_matches (
          id, season_id, challenge_id, match_type,
          player1_id, player2_id, p1_name, p2_name,
          p1_rating_before, p2_rating_before,
          status, duration_limit_sec, start_time, created_at
        )
        VALUES (?, ?, ?, 'ranked', ?, ?, ?, ?, ?, ?, 'in_progress', 600, ?, ?)
      `).run(
        matchId,
        activeSeason.id,
        selectedChallengeId,
        userId,
        opponent.user_id,
        p1Profile?.display_name || 'Hunter',
        p2Profile?.display_name || 'Hunter',
        profile.rating,
        opponent.rating,
        nowIso,
        nowIso
      );

      db.exec('COMMIT');
      return { status: 'matched', matchId, opponentName: p2Profile?.display_name || 'Opponent' };
    }

    // If options.allowAi is requested or in testing, match immediately with Shadow Hunter AI
    if (options.allowAi) {
      db.prepare('DELETE FROM arena_queue WHERE user_id = ?').run(userId);

      const p1Profile = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(userId);
      const aiShadow = getAiShadowHunter(profile.rating);

      const matchId = `match_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO arena_matches (
          id, season_id, challenge_id, match_type,
          player1_id, player2_id, p1_name, p2_name,
          p1_rating_before, p2_rating_before,
          status, duration_limit_sec, start_time, created_at
        )
        VALUES (?, ?, ?, 'ranked', ?, ?, ?, ?, ?, ?, 'in_progress', 600, ?, ?)
      `).run(
        matchId,
        activeSeason.id,
        selectedChallengeId,
        userId,
        aiShadow.id,
        p1Profile?.display_name || 'Hunter',
        aiShadow.name,
        profile.rating,
        aiShadow.rating,
        nowIso,
        nowIso
      );

      db.exec('COMMIT');
      return { status: 'matched', matchId, opponentName: aiShadow.name };
    }

    // Otherwise, place in queue
    db.prepare(`
      INSERT OR REPLACE INTO arena_queue (user_id, rating, division, queued_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, profile.rating, profile.division, nowIso);

    db.exec('COMMIT');
    return { status: 'queued', message: 'Searching for an evenly matched opponent...' };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Removes user from arena queue.
 */
export function leaveArenaQueue(userId) {
  db.prepare('DELETE FROM arena_queue WHERE user_id = ?').run(userId);
  return { success: true };
}

/**
 * Returns current queue status for user.
 */
export function getQueueStatus(userId) {
  const queued = db.prepare('SELECT * FROM arena_queue WHERE user_id = ?').get(userId);
  const activeMatch = db.prepare(`
    SELECT id FROM arena_matches
    WHERE (player1_id = ? OR player2_id = ?) AND status = 'in_progress'
    LIMIT 1
  `).get(userId, userId);

  return {
    inQueue: !!queued,
    queuedAt: queued?.queued_at || null,
    hasActiveMatch: !!activeMatch,
    matchId: activeMatch?.id || null,
  };
}

/**
 * Returns details of an arena match.
 */
export function getArenaMatch(matchId, userId = null) {
  const match = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
  if (!match) return null;

  const challenge = serverChallenges[match.challenge_id];
  if (!challenge) return null;

  const isPlayer1 = userId === match.player1_id;
  const isPlayer2 = userId === match.player2_id;
  const isParticipant = isPlayer1 || isPlayer2;

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
    endTime: match.end_time,
  };
}

/**
 * Submits player solution for an active arena match.
 * Server-side evaluation, Elo rating calculation, division updates, and idempotency guards.
 */
export async function submitArenaMatch(userId, matchId, code, executeInPythonProcess, buildHarnessScript) {
  const match = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
  if (!match) {
    return { success: false, error: 'Match not found.' };
  }

  if (match.status !== 'in_progress') {
    return { success: false, error: 'Match is already concluded.' };
  }

  const isPlayer1 = userId === match.player1_id;
  const isPlayer2 = userId === match.player2_id;
  if (!isPlayer1 && !isPlayer2) {
    return { success: false, error: 'You are not a participant in this duel.' };
  }

  // Check if player already completed their submission
  const currentStatus = isPlayer1 ? match.player1_status : match.player2_status;
  if (currentStatus === 'completed') {
    return { success: false, error: 'You have already finalized your submission for this match.' };
  }

  // Check time limit
  const startTimeMs = new Date(match.start_time).getTime();
  const elapsedMs = Date.now() - startTimeMs;
  if (elapsedMs > match.duration_limit_sec * 1000 + 5000) {
    db.prepare(`
      UPDATE arena_matches
      SET ${isPlayer1 ? 'player1_status' : 'player2_status'} = 'timed_out'
      WHERE id = ?
    `).run(matchId);
    return { success: false, error: 'Match time limit has expired.' };
  }

  const challenge = serverChallenges[match.challenge_id];
  if (!challenge) {
    return { success: false, error: 'Challenge definition not found.' };
  }

  // Run full evaluation with sample + secret hidden tests
  const testCases = [
    ...challenge.sampleTests.map((t) => ({ ...t, isHidden: false })),
    ...challenge.hiddenTests.map((t) => ({ ...t, isHidden: true })),
  ];

  const script = buildHarnessScript(code, challenge.functionName, testCases);
  const evalResult = await executeInPythonProcess(script);

  const passedCount = evalResult.results.filter((r) => r.passed).length;
  const totalCount = evalResult.results.length;
  const allPassed = evalResult.allPassed && passedCount === totalCount;
  const score = Math.round((passedCount / totalCount) * 100);

  const nowIso = new Date().toISOString();

  // Record submission log
  db.prepare(`
    INSERT INTO arena_match_submissions (id, match_id, user_id, code, passed, passed_count, total_count, duration_ms, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`ams_${crypto.randomUUID()}`, matchId, userId, code, allPassed ? 1 : 0, passedCount, totalCount, elapsedMs, nowIso);

  // Update player status on match
  const statusField = isPlayer1 ? 'player1_status' : 'player2_status';
  const scoreField = isPlayer1 ? 'player1_score' : 'player2_score';
  const passedField = isPlayer1 ? 'player1_passed_count' : 'player2_passed_count';
  const totalField = isPlayer1 ? 'player1_total_tests' : 'player2_total_tests';
  const timeField = isPlayer1 ? 'player1_time_ms' : 'player2_time_ms';

  const newStatus = allPassed ? 'completed' : 'submitted';

  db.prepare(`
    UPDATE arena_matches
    SET ${statusField} = ?,
        ${scoreField} = ?,
        ${passedField} = ?,
        ${totalField} = ?,
        ${timeField} = ?
    WHERE id = ?
  `).run(newStatus, score, passedCount, totalCount, elapsedMs, matchId);

  // If opponent is AI Shadow Hunter, simulate AI submission
  const opponentId = isPlayer1 ? match.player2_id : match.player1_id;
  if (opponentId.startsWith('ai_shadow_')) {
    simulateAiOpponentSubmission(matchId, opponentId, isPlayer1 ? 2 : 1, elapsedMs);
  }

  // Check if match should conclude
  const updatedMatch = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
  const p1Done = updatedMatch.player1_status === 'completed' || updatedMatch.player1_status === 'timed_out';
  const p2Done = updatedMatch.player2_status === 'completed' || updatedMatch.player2_status === 'timed_out';

  let matchConcluded = false;
  if (p1Done && p2Done) {
    matchConcluded = true;
    concludeMatch(matchId);
  } else if (allPassed && updatedMatch.player2_id.startsWith('ai_shadow_')) {
    // Player passed 100%, conclude match against bot
    matchConcluded = true;
    concludeMatch(matchId);
  }

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

/**
 * Concludes an arena match: calculates winner, updates Elo ratings, records history.
 */
function concludeMatch(matchId) {
  const match = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
  if (!match || match.status === 'completed') return;

  const nowIso = new Date().toISOString();

  // Determine winner
  let winnerId = null;
  const p1Score = match.player1_score;
  const p2Score = match.player2_score;
  const p1Time = match.player1_time_ms;
  const p2Time = match.player2_time_ms;

  if (p1Score > p2Score) {
    winnerId = match.player1_id;
  } else if (p2Score > p1Score) {
    winnerId = match.player2_id;
  } else {
    // Tie-breaker: faster submission time
    if (p1Time > 0 && p2Time > 0) {
      if (p1Time < p2Time) winnerId = match.player1_id;
      else if (p2Time < p1Time) winnerId = match.player2_id;
      else winnerId = 'draw';
    } else {
      winnerId = 'draw';
    }
  }

  // Calculate Elo change
  const p1ScoreFactor = winnerId === match.player1_id ? 1 : winnerId === 'draw' ? 0.5 : 0;
  const p2ScoreFactor = winnerId === match.player2_id ? 1 : winnerId === 'draw' ? 0.5 : 0;

  const p1Profile = getArenaProfile(match.player1_id);
  const p2Profile = match.player2_id.startsWith('ai_shadow_')
    ? { rating: match.p2_rating_before, matchesPlayed: 20 }
    : getArenaProfile(match.player2_id);

  const p1Delta = calculateEloChange(match.p1_rating_before, match.p2_rating_before, p1ScoreFactor, p1Profile.matchesPlayed);
  const p2Delta = calculateEloChange(match.p2_rating_before, match.p1_rating_before, p2ScoreFactor, p2Profile.matchesPlayed);

  const p1RatingAfter = Math.max(500, match.p1_rating_before + p1Delta);
  const p2RatingAfter = Math.max(500, match.p2_rating_before + p2Delta);

  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Update match record
    db.prepare(`
      UPDATE arena_matches
      SET status = 'completed',
          winner_id = ?,
          p1_rating_after = ?,
          p2_rating_after = ?,
          end_time = ?
      WHERE id = ?
    `).run(winnerId, p1RatingAfter, p2RatingAfter, nowIso, matchId);

    // 2. Update Player 1 profile
    updatePlayerArenaProfile(match.player1_id, p1RatingAfter, p1ScoreFactor, p1Delta, matchId);

    // 3. Update Player 2 profile (if real player)
    if (!match.player2_id.startsWith('ai_shadow_')) {
      updatePlayerArenaProfile(match.player2_id, p2RatingAfter, p2ScoreFactor, p2Delta, matchId);
    }

    // 4. Update seasonal XP
    const p1SeasonXp = p1ScoreFactor === 1 ? 150 : p1ScoreFactor === 0.5 ? 80 : 50;
    recordSeasonalXp(match.player1_id, p1SeasonXp);

    if (!match.player2_id.startsWith('ai_shadow_')) {
      const p2SeasonXp = p2ScoreFactor === 1 ? 150 : p2ScoreFactor === 0.5 ? 80 : 50;
      recordSeasonalXp(match.player2_id, p2SeasonXp);
    }

    db.exec('COMMIT');

    // 5. Award progression XP to winner (outside transaction)
    if (winnerId && winnerId !== 'draw' && !winnerId.startsWith('ai_shadow_')) {
      try {
        awardQuestCompletionAtomic(winnerId, `arena_match_${matchId}`, 100);
      } catch {}
    }

    // 6. If match is tied to a tournament match, advance tournament bracket
    const tm = db.prepare('SELECT * FROM tournament_matches WHERE arena_match_id = ?').get(matchId);
    if (tm) {
      handleTournamentMatchConclusion(tm.id, winnerId);
    }
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('Error concluding arena match:', err);
  }
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
 * Simulates AI shadow opponent submission.
 */
function simulateAiOpponentSubmission(matchId, aiId, playerSlot, playerElapsedMs) {
  const statusField = playerSlot === 1 ? 'player1_status' : 'player2_status';
  const scoreField = playerSlot === 1 ? 'player1_score' : 'player2_score';
  const passedField = playerSlot === 1 ? 'player1_passed_count' : 'player2_passed_count';
  const totalField = playerSlot === 1 ? 'player1_total_tests' : 'player2_total_tests';
  const timeField = playerSlot === 1 ? 'player1_time_ms' : 'player2_time_ms';

  // AI timing calibrated to ~playerElapsedMs + 10s or 75s
  const aiTime = Math.max(20000, Math.min(180000, playerElapsedMs + 8000));
  const aiScore = 100;
  const passed = 7;
  const total = 7;

  db.prepare(`
    UPDATE arena_matches
    SET ${statusField} = 'completed',
        ${scoreField} = ?,
        ${passedField} = ?,
        ${totalField} = ?,
        ${timeField} = ?
    WHERE id = ?
  `).run(aiScore, passed, total, aiTime, matchId);
}

/**
 * Forfeits an active match.
 */
export function forfeitArenaMatch(userId, matchId) {
  const match = db.prepare('SELECT * FROM arena_matches WHERE id = ?').get(matchId);
  if (!match || match.status !== 'in_progress') {
    return { success: false, error: 'Match is not in progress.' };
  }

  const isPlayer1 = userId === match.player1_id;
  const isPlayer2 = userId === match.player2_id;
  if (!isPlayer1 && !isPlayer2) {
    return { success: false, error: 'You are not a participant in this duel.' };
  }

  const forfeitField = isPlayer1 ? 'player1_status' : 'player2_status';
  const winnerId = isPlayer1 ? match.player2_id : match.player1_id;

  db.prepare(`
    UPDATE arena_matches
    SET ${forfeitField} = 'forfeited'
    WHERE id = ?
  `).run(matchId);

  concludeMatch(matchId);
  return { success: true, winnerId };
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
    WHERE (m.player1_id = ? OR m.player2_id = ?) AND m.status = 'completed'
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, userId, limitNum, offsetNum);

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM arena_matches
    WHERE (player1_id = ? OR player2_id = ?) AND status = 'completed'
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
           t.status, t.start_time as startTime, t.current_round as currentRound,
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
      start_time, total_rounds, rewards_json, created_at, updated_at
    )
    VALUES (?, 'season-1', ?, ?, 'single_elimination', ?, 0, 'registration', ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title.trim(),
    data.description || 'Single-elimination coding tournament.',
    maxParticipants,
    data.startTime || nowIso,
    totalRounds,
    JSON.stringify(rewards),
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
 */
export function startTournament(tournamentId) {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!t) return { success: false, error: 'Tournament not found.' };

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
    const nowIso = new Date().toISOString();
    arenaMatchId = `tarena_${crypto.randomUUID()}`;
    const p1 = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(tm.player1_id);
    const p2 = tm.player2_id ? db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(tm.player2_id) : { display_name: 'Shadow Challenger' };

    db.prepare(`
      INSERT INTO arena_matches (
        id, season_id, challenge_id, match_type, player1_id, player2_id,
        p1_name, p2_name, p1_rating_before, p2_rating_before, status, duration_limit_sec, start_time, created_at
      )
      VALUES (?, 'season-1', ?, 'tournament', ?, ?, ?, ?, 1000, 1000, 'in_progress', 600, ?, ?)
    `).run(
      arenaMatchId,
      tm.challenge_id,
      tm.player1_id,
      tm.player2_id || 'ai_shadow_challenger',
      p1?.display_name || 'Hunter',
      p2?.display_name || 'Hunter',
      nowIso,
      nowIso
    );

    db.prepare('UPDATE tournament_matches SET arena_match_id = ?, status = \'in_progress\' WHERE id = ?').run(arenaMatchId, tournamentMatchId);
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
    db.prepare('UPDATE tournament_participants SET rewards_claimed = 1 WHERE tournament_id = ? AND user_id = ?').run(tournamentId, userId);
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
