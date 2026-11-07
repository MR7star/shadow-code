/**
 * Shadow Code — Guilds, Social Features & Cooperative Progression System
 *
 * Provides:
 *  - Player-created guilds with ranks, emblems, levels, and membership limits
 *  - Safe, transactional membership management (create, join, leave, invite, kick, transfer leadership)
 *  - Server-authoritative guild XP progression and weekly XP resets
 *  - Cooperative guild quests with contribution tracking and reward claiming
 *  - Guild achievement milestones
 *  - Full competitive leaderboard rankings (global, weekly, guilds, contributions)
 */

import crypto from 'node:crypto';
import { db } from './db.mjs';
import { awardQuestCompletionAtomic } from './auth.mjs';

// ─── Guild Rank & Level Thresholds ──────────────────────────────────────────

export const GUILD_RANK_THRESHOLDS = [
  { level: 1, minXp: 0, rank: 'E-Rank', maxMembers: 20 },
  { level: 2, minXp: 2000, rank: 'E-Rank', maxMembers: 22 },
  { level: 3, minXp: 5000, rank: 'D-Rank', maxMembers: 24 },
  { level: 4, minXp: 10000, rank: 'D-Rank', maxMembers: 26 },
  { level: 5, minXp: 20000, rank: 'C-Rank', maxMembers: 30 },
  { level: 6, minXp: 35000, rank: 'C-Rank', maxMembers: 34 },
  { level: 7, minXp: 55000, rank: 'B-Rank', maxMembers: 38 },
  { level: 8, minXp: 80000, rank: 'B-Rank', maxMembers: 42 },
  { level: 9, minXp: 120000, rank: 'A-Rank', maxMembers: 46 },
  { level: 10, minXp: 175000, rank: 'S-Rank', maxMembers: 50 },
  { level: 15, minXp: 300000, rank: 'Monarch', maxMembers: 60 },
];

export function calculateGuildLevelAndRank(totalXp) {
  let matched = GUILD_RANK_THRESHOLDS[0];
  for (const t of GUILD_RANK_THRESHOLDS) {
    if (totalXp >= t.minXp) {
      matched = t;
    } else {
      break;
    }
  }
  return {
    level: matched.level,
    rank: matched.rank,
    maxMembers: matched.maxMembers,
  };
}

export function getCurrentUtcWeekString() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ─── Database Initialization ────────────────────────────────────────────────

export function initGuildTables() {
  db.exec(`
    -- Guilds core table
    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      description TEXT NOT NULL,
      emblem TEXT NOT NULL DEFAULT '⚡',
      leader_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      rank TEXT NOT NULL DEFAULT 'E-Rank',
      level INTEGER NOT NULL DEFAULT 1,
      total_xp INTEGER NOT NULL DEFAULT 0,
      weekly_xp INTEGER NOT NULL DEFAULT 0,
      weekly_reset_week TEXT NOT NULL,
      member_count INTEGER NOT NULL DEFAULT 1,
      max_members INTEGER NOT NULL DEFAULT 20,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Guild members table (UNIQUE user_id enforces 1 guild per player)
    CREATE TABLE IF NOT EXISTS guild_members (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('leader', 'officer', 'member')),
      contributed_xp INTEGER NOT NULL DEFAULT 0,
      weekly_contributed_xp INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Guild invitations & join requests
    CREATE TABLE IF NOT EXISTS guild_invites (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('invite', 'request')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected', 'cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Guild activity & XP transaction logs (prevents duplicate guild XP rewards)
    CREATE TABLE IF NOT EXISTS guild_xp_logs (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      xp_amount INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(guild_id, user_id, activity_type, reference_id)
    );

    -- Cooperative guild quests
    CREATE TABLE IF NOT EXISTS guild_quests (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      quest_key TEXT NOT NULL,
      quest_type TEXT NOT NULL CHECK(quest_type IN ('challenges_completed', 'xp_earned', 'concepts_mastered', 'dungeons_completed')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      target_value INTEGER NOT NULL,
      current_value INTEGER NOT NULL DEFAULT 0,
      xp_reward INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('in-progress', 'completed', 'claimed')),
      created_at TEXT NOT NULL,
      completed_at TEXT,
      claimed_at TEXT,
      UNIQUE(guild_id, quest_key)
    );

    -- Guild quest individual member contributions
    CREATE TABLE IF NOT EXISTS guild_quest_contributions (
      id TEXT PRIMARY KEY,
      guild_quest_id TEXT NOT NULL REFERENCES guild_quests(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contribution_value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(guild_quest_id, user_id)
    );

    -- Guild achievement milestones
    CREATE TABLE IF NOT EXISTS guild_achievements (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      xp_reward INTEGER NOT NULL DEFAULT 0,
      unlocked_at TEXT NOT NULL,
      UNIQUE(guild_id, achievement_id)
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);
    CREATE INDEX IF NOT EXISTS idx_guild_members_user ON guild_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_guild_invites_guild ON guild_invites(guild_id);
    CREATE INDEX IF NOT EXISTS idx_guild_invites_user ON guild_invites(user_id);
    CREATE INDEX IF NOT EXISTS idx_guild_xp_logs_guild ON guild_xp_logs(guild_id);
    CREATE INDEX IF NOT EXISTS idx_guild_quests_guild ON guild_quests(guild_id);
    CREATE INDEX IF NOT EXISTS idx_guild_achievements_guild ON guild_achievements(guild_id);
  `);
}

// ─── Default Cooperative Guild Quests Blueprint ─────────────────────────────

export const DEFAULT_GUILD_QUESTS = [
  {
    quest_key: 'gq_challenges',
    quest_type: 'challenges_completed',
    title: 'Trial of the Shadow Legion',
    description: 'Complete 15 programming challenges collectively as a guild.',
    target_value: 15,
    xp_reward: 600,
  },
  {
    quest_key: 'gq_xp',
    quest_type: 'xp_earned',
    title: 'Mana Resonance',
    description: 'Earn a combined total of 2,000 XP through hunter activities.',
    target_value: 2000,
    xp_reward: 800,
  },
  {
    quest_key: 'gq_concepts',
    quest_type: 'concepts_mastered',
    title: 'Arcane Mastery',
    description: 'Advance 6 programming concepts to new mastery thresholds collectively.',
    target_value: 6,
    xp_reward: 500,
  },
  {
    quest_key: 'gq_dungeons',
    quest_type: 'dungeons_completed',
    title: 'Gate Conquerors',
    description: 'Clear 3 programming dungeons as a guild team.',
    target_value: 3,
    xp_reward: 1000,
  },
];

function initializeGuildQuests(guildId, now) {
  const insertQuest = db.prepare(`
    INSERT OR IGNORE INTO guild_quests
      (id, guild_id, quest_key, quest_type, title, description, target_value, current_value, xp_reward, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'in-progress', ?)
  `);

  for (const q of DEFAULT_GUILD_QUESTS) {
    const qid = `gq_${guildId}_${q.quest_key}`;
    insertQuest.run(qid, guildId, q.quest_key, q.quest_type, q.title, q.description, q.target_value, q.xp_reward, now);
  }
}

// ─── Guild Weekly XP Reset ──────────────────────────────────────────────────

export function ensureGuildWeeklyReset(guildId) {
  const currentWeek = getCurrentUtcWeekString();
  const guild = db.prepare('SELECT weekly_reset_week FROM guilds WHERE id = ?').get(guildId);
  if (guild && guild.weekly_reset_week !== currentWeek) {
    db.prepare(`
      UPDATE guilds
      SET weekly_xp = 0, weekly_reset_week = ?, updated_at = ?
      WHERE id = ?
    `).run(currentWeek, new Date().toISOString(), guildId);

    db.prepare(`
      UPDATE guild_members
      SET weekly_contributed_xp = 0, updated_at = ?
      WHERE guild_id = ?
    `).run(new Date().toISOString(), guildId);
  }
}

// ─── Guild Milestones & Achievements Evaluator ──────────────────────────────

export function checkGuildAchievements(guildId) {
  const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  if (!guild) return;

  const now = new Date().toISOString();
  const milestones = [
    {
      id: 'gach_founded',
      title: 'Guild Founded',
      description: 'Establish a new guild in Shadow Code.',
      icon: '🏛️',
      xp_reward: 100,
      condition: () => true,
    },
    {
      id: 'gach_members_3',
      title: 'Band of Hunters',
      description: 'Reach 3 active guild members.',
      icon: '🛡️',
      xp_reward: 250,
      condition: () => guild.member_count >= 3,
    },
    {
      id: 'gach_members_5',
      title: 'Shadow Vanguard',
      description: 'Reach 5 active guild members.',
      icon: '⚔️',
      xp_reward: 500,
      condition: () => guild.member_count >= 5,
    },
    {
      id: 'gach_level_3',
      title: 'Ascending Order',
      description: 'Advance guild to Level 3 / D-Rank.',
      icon: '⚡',
      xp_reward: 400,
      condition: () => guild.level >= 3,
    },
    {
      id: 'gach_xp_5k',
      title: 'Mana Font',
      description: 'Accumulate 5,000 total guild XP.',
      icon: '🔮',
      xp_reward: 500,
      condition: () => guild.total_xp >= 5000,
    },
  ];

  const insertAch = db.prepare(`
    INSERT OR IGNORE INTO guild_achievements
      (id, guild_id, achievement_id, title, description, icon, xp_reward, unlocked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const m of milestones) {
    if (m.condition()) {
      const achId = `gach_${guildId}_${m.id}`;
      insertAch.run(achId, guildId, m.id, m.title, m.description, m.icon, m.xp_reward, now);
    }
  }
}

// ─── Guild Management API ───────────────────────────────────────────────────

/**
 * Creates a new guild.
 * Enforces:
 *  - Player must not already belong to any guild.
 *  - Unique, non-empty, sanitized guild name (3-30 chars).
 *  - Atomic creation of guild and leader membership.
 */
export function createGuild(userId, { name, description, emblem }) {
  if (!userId) {
    return { success: false, error: 'Unauthorized.' };
  }

  // Check if player is already in a guild
  const existingMembership = db.prepare(
    'SELECT guild_id FROM guild_members WHERE user_id = ?'
  ).get(userId);

  if (existingMembership) {
    return { success: false, error: 'You already belong to a guild. Leave your current guild first.' };
  }

  // Validate guild name
  if (!name || typeof name !== 'string') {
    return { success: false, error: 'Guild name is required.' };
  }
  const cleanName = name.trim();
  if (cleanName.length < 3 || cleanName.length > 30) {
    return { success: false, error: 'Guild name must be between 3 and 30 characters.' };
  }
  if (!/^[a-zA-Z0-9 _-]+$/.test(cleanName)) {
    return { success: false, error: 'Guild name can only contain letters, numbers, spaces, underscores, and hyphens.' };
  }

  // Check unique name
  const existingName = db.prepare('SELECT id FROM guilds WHERE name = ? COLLATE NOCASE').get(cleanName);
  if (existingName) {
    return { success: false, error: `Guild name "${cleanName}" is already taken.` };
  }

  const cleanDescription = (description || '').trim().slice(0, 300) || 'A guild of dedicated shadow hunters.';
  const cleanEmblem = (emblem || '⚡').trim().slice(0, 10);
  const now = new Date().toISOString();
  const guildId = `gld_${crypto.randomUUID()}`;
  const memberId = `gm_${guildId}_${userId}`;
  const currentWeek = getCurrentUtcWeekString();

  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Insert guild
    db.prepare(`
      INSERT INTO guilds (
        id, name, description, emblem, leader_id, rank, level, total_xp,
        weekly_xp, weekly_reset_week, member_count, max_members, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'E-Rank', 1, 0, 0, ?, 1, 20, ?, ?)
    `).run(guildId, cleanName, cleanDescription, cleanEmblem, userId, currentWeek, now, now);

    // 2. Insert creator as leader
    db.prepare(`
      INSERT INTO guild_members (
        id, guild_id, user_id, role, contributed_xp, weekly_contributed_xp, joined_at, created_at, updated_at
      )
      VALUES (?, ?, ?, 'leader', 0, 0, ?, ?, ?)
    `).run(memberId, guildId, userId, now, now, now);

    // 3. Initialize default cooperative guild quests
    initializeGuildQuests(guildId, now);

    // 4. Unlock initial guild founded achievement
    checkGuildAchievements(guildId);

    db.exec('COMMIT');

    const createdGuild = getGuildDetails(guildId, userId);
    return { success: true, guild: createdGuild.guild };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    if (err.message && err.message.includes('UNIQUE')) {
      return { success: false, error: 'Guild name is already taken or membership conflict occurred.' };
    }
    throw err;
  }
}

/**
 * Returns a paginated list of guilds with search and filter capabilities.
 */
export function getGuildsList({ search = '', rank = '', sort = 'total_xp', page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  let query = 'SELECT g.*, p.display_name as leader_name FROM guilds g JOIN profiles p ON p.user_id = g.leader_id WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as total FROM guilds g WHERE 1=1';
  const params = [];
  const countParams = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ' AND (g.name LIKE ? OR g.description LIKE ?)';
    countQuery += ' AND (g.name LIKE ? OR g.description LIKE ?)';
    params.push(term, term);
    countParams.push(term, term);
  }

  if (rank && rank.trim() && rank !== 'all') {
    query += ' AND g.rank = ?';
    countQuery += ' AND g.rank = ?';
    params.push(rank.trim());
    countParams.push(rank.trim());
  }

  // Sort
  if (sort === 'weekly_xp') {
    query += ' ORDER BY g.weekly_xp DESC, g.total_xp DESC';
  } else if (sort === 'member_count') {
    query += ' ORDER BY g.member_count DESC, g.total_xp DESC';
  } else if (sort === 'level') {
    query += ' ORDER BY g.level DESC, g.total_xp DESC';
  } else {
    query += ' ORDER BY g.total_xp DESC, g.level DESC';
  }

  query += ' LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const total = db.prepare(countQuery).get(...countParams).total;
  const rows = db.prepare(query).all(...params);

  return {
    guilds: rows.map((r, i) => ({
      rankNum: offset + i + 1,
      id: r.id,
      name: r.name,
      description: r.description,
      emblem: r.emblem,
      leaderId: r.leader_id,
      leaderName: r.leader_name,
      rank: r.rank,
      level: r.level,
      totalXp: r.total_xp,
      weeklyXp: r.weekly_xp,
      memberCount: r.member_count,
      maxMembers: r.max_members,
      createdAt: r.created_at,
    })),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

/**
 * Returns full details of a guild, including members list, guild quests,
 * achievements, and caller's permissions.
 */
export function getGuildDetails(guildId, currentUserId = null) {
  ensureGuildWeeklyReset(guildId);

  const guild = db.prepare(`
    SELECT g.*, p.display_name as leader_name, p.title as leader_title, p.rank as leader_rank
    FROM guilds g
    JOIN profiles p ON p.user_id = g.leader_id
    WHERE g.id = ?
  `).get(guildId);

  if (!guild) {
    return null;
  }

  // Check achievements & level sync
  checkGuildAchievements(guildId);

  // Members list
  const members = db.prepare(`
    SELECT gm.id as membershipId, gm.user_id as userId, gm.role, gm.contributed_xp as contributedXp,
           gm.weekly_contributed_xp as weeklyContributedXp, gm.joined_at as joinedAt,
           p.display_name as username, p.title, p.rank as playerRank, p.level, p.xp
    FROM guild_members gm
    JOIN profiles p ON p.user_id = gm.user_id
    WHERE gm.guild_id = ?
    ORDER BY CASE gm.role WHEN 'leader' THEN 1 WHEN 'officer' THEN 2 ELSE 3 END,
             gm.contributed_xp DESC
  `).all(guildId);

  // Quests with user contribution
  const quests = db.prepare(`
    SELECT gq.*, COALESCE(gqc.contribution_value, 0) as userContribution
    FROM guild_quests gq
    LEFT JOIN guild_quest_contributions gqc
      ON gqc.guild_quest_id = gq.id AND gqc.user_id = ?
    WHERE gq.guild_id = ?
    ORDER BY gq.created_at ASC
  `).all(currentUserId || '', guildId);

  // Achievements
  const achievements = db.prepare(`
    SELECT achievement_id as id, title, description, icon, xp_reward as xpReward, unlocked_at as unlockedAt
    FROM guild_achievements
    WHERE guild_id = ?
    ORDER BY unlocked_at ASC
  `).all(guildId);

  // User's relationship to this guild
  let currentUserRole = null;
  let isMember = false;
  let hasPendingInvite = false;
  let hasPendingRequest = false;

  if (currentUserId) {
    const myMembership = members.find((m) => m.userId === currentUserId);
    if (myMembership) {
      isMember = true;
      currentUserRole = myMembership.role;
    } else {
      const invite = db.prepare(`
        SELECT type FROM guild_invites
        WHERE guild_id = ? AND user_id = ? AND status = 'pending'
      `).get(guildId, currentUserId);
      if (invite) {
        if (invite.type === 'invite') hasPendingInvite = true;
        if (invite.type === 'request') hasPendingRequest = true;
      }
    }
  }

  return {
    guild: {
      id: guild.id,
      name: guild.name,
      description: guild.description,
      emblem: guild.emblem,
      leaderId: guild.leader_id,
      leaderName: guild.leader_name,
      leaderTitle: guild.leader_title,
      leaderRank: guild.leader_rank,
      rank: guild.rank,
      level: guild.level,
      totalXp: guild.total_xp,
      weeklyXp: guild.weekly_xp,
      memberCount: guild.member_count,
      maxMembers: guild.max_members,
      createdAt: guild.created_at,
    },
    members,
    quests: quests.map((q) => ({
      id: q.id,
      questKey: q.quest_key,
      questType: q.quest_type,
      title: q.title,
      description: q.description,
      targetValue: q.target_value,
      currentValue: q.current_value,
      progressPercent: Math.min(100, Math.round((q.current_value / q.target_value) * 100)),
      xpReward: q.xp_reward,
      status: q.status,
      userContribution: q.userContribution,
      completedAt: q.completed_at,
      claimedAt: q.claimed_at,
    })),
    achievements,
    userContext: {
      isMember,
      role: currentUserRole,
      isLeader: currentUserRole === 'leader',
      isOfficer: currentUserRole === 'officer' || currentUserRole === 'leader',
      hasPendingInvite,
      hasPendingRequest,
    },
  };
}

/**
 * Returns current player's guild profile, membership details, and pending invites.
 */
export function getUserGuildProfile(userId) {
  if (!userId) return null;

  const membership = db.prepare(`
    SELECT gm.guild_id, gm.role, gm.contributed_xp, gm.weekly_contributed_xp, gm.joined_at
    FROM guild_members gm
    WHERE gm.user_id = ?
  `).get(userId);

  // Pending invitations received
  const pendingInvites = db.prepare(`
    SELECT gi.id as inviteId, gi.guild_id, gi.type, gi.created_at,
           g.name as guildName, g.emblem as guildEmblem, g.rank as guildRank,
           g.level as guildLevel, g.member_count as memberCount, g.max_members as maxMembers,
           p.display_name as inviterName
    FROM guild_invites gi
    JOIN guilds g ON g.id = gi.guild_id
    JOIN profiles p ON p.user_id = gi.inviter_id
    WHERE gi.user_id = ? AND gi.status = 'pending'
    ORDER BY gi.created_at DESC
  `).all(userId);

  if (!membership) {
    return {
      inGuild: false,
      guild: null,
      membership: null,
      pendingInvites,
    };
  }

  const details = getGuildDetails(membership.guild_id, userId);
  return {
    inGuild: true,
    guild: details.guild,
    membership: {
      role: membership.role,
      contributedXp: membership.contributed_xp,
      weeklyContributedXp: membership.weekly_contributed_xp,
      joinedAt: membership.joined_at,
    },
    details,
    pendingInvites,
  };
}

/**
 * Joining a guild.
 * Supports direct join / join request / accepting invite.
 * Guards against:
 *  - Player already in a guild
 *  - Guild member limit reached
 *  - Concurrent race condition
 */
export function joinGuild(userId, guildId) {
  if (!userId || !guildId) {
    return { success: false, error: 'User and Guild ID required.' };
  }

  // Pre-check membership
  const existingMembership = db.prepare(
    'SELECT guild_id FROM guild_members WHERE user_id = ?'
  ).get(userId);
  if (existingMembership) {
    return { success: false, error: 'You already belong to a guild. Leave your current guild first.' };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    // Re-verify inside transaction
    const inGuild = db.prepare('SELECT 1 FROM guild_members WHERE user_id = ?').get(userId);
    if (inGuild) {
      db.exec('COMMIT');
      return { success: false, error: 'You already belong to a guild.' };
    }

    const guild = db.prepare('SELECT member_count, max_members FROM guilds WHERE id = ?').get(guildId);
    if (!guild) {
      db.exec('COMMIT');
      return { success: false, error: 'Guild not found.' };
    }

    if (guild.member_count >= guild.max_members) {
      db.exec('COMMIT');
      return { success: false, error: 'Guild has reached maximum membership capacity.' };
    }

    const now = new Date().toISOString();
    const memberId = `gm_${guildId}_${userId}`;

    // Insert membership (UNIQUE user_id acts as secondary barrier)
    db.prepare(`
      INSERT INTO guild_members
        (id, guild_id, user_id, role, contributed_xp, weekly_contributed_xp, joined_at, created_at, updated_at)
      VALUES (?, ?, ?, 'member', 0, 0, ?, ?, ?)
    `).run(memberId, guildId, userId, now, now, now);

    // Increment member count
    db.prepare(`
      UPDATE guilds
      SET member_count = member_count + 1, updated_at = ?
      WHERE id = ?
    `).run(now, guildId);

    // Mark any pending invites accepted
    db.prepare(`
      UPDATE guild_invites
      SET status = 'accepted', updated_at = ?
      WHERE guild_id = ? AND user_id = ? AND status = 'pending'
    `).run(now, guildId, userId);

    // Cancel pending invites to other guilds
    db.prepare(`
      UPDATE guild_invites
      SET status = 'cancelled', updated_at = ?
      WHERE user_id = ? AND guild_id != ? AND status = 'pending'
    `).run(now, userId, guildId);

    // Check membership milestones
    checkGuildAchievements(guildId);

    db.exec('COMMIT');
    return { success: true, guildId };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    if (err.message && err.message.includes('UNIQUE')) {
      return { success: false, error: 'You already belong to a guild or member slot conflict.' };
    }
    throw err;
  }
}

/**
 * Leaving a guild.
 * Rules:
 *  - Non-leader members can leave freely.
 *  - If leader:
 *    - If sole member: guild is disbanded.
 *    - If other members exist: leadership must be transferred before leaving.
 */
export function leaveGuild(userId, guildId) {
  if (!userId || !guildId) {
    return { success: false, error: 'Invalid parameters.' };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const member = db.prepare(`
      SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    if (!member) {
      db.exec('COMMIT');
      return { success: false, error: 'You are not a member of this guild.' };
    }

    const guild = db.prepare('SELECT member_count FROM guilds WHERE id = ?').get(guildId);
    if (!guild) {
      db.exec('COMMIT');
      return { success: false, error: 'Guild not found.' };
    }

    const now = new Date().toISOString();

    if (member.role === 'leader') {
      if (guild.member_count > 1) {
        db.exec('COMMIT');
        return {
          success: false,
          error: 'You are the Guild Leader. You must transfer leadership to another member before leaving.',
        };
      } else {
        // Disband guild
        db.prepare('DELETE FROM guilds WHERE id = ?').run(guildId);
        db.exec('COMMIT');
        return { success: true, disbanded: true };
      }
    }

    // Normal member removal
    db.prepare('DELETE FROM guild_members WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
    db.prepare('UPDATE guilds SET member_count = MAX(0, member_count - 1), updated_at = ? WHERE id = ?').run(now, guildId);

    db.exec('COMMIT');
    return { success: true, disbanded: false };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Kicking a member.
 * Permissions:
 *  - Leader can kick anyone except themselves.
 *  - Officer can only kick 'member' (cannot kick leader or fellow officers).
 */
export function kickMember(callerId, guildId, targetUserId) {
  if (callerId === targetUserId) {
    return { success: false, error: 'You cannot kick yourself. Use leave guild instead.' };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const callerMember = db.prepare('SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?').get(guildId, callerId);
    if (!callerMember || (callerMember.role !== 'leader' && callerMember.role !== 'officer')) {
      db.exec('COMMIT');
      return { success: false, error: 'Permission denied. Only leaders and officers can remove members.' };
    }

    const targetMember = db.prepare('SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?').get(guildId, targetUserId);
    if (!targetMember) {
      db.exec('COMMIT');
      return { success: false, error: 'Target user is not a member of this guild.' };
    }

    if (targetMember.role === 'leader') {
      db.exec('COMMIT');
      return { success: false, error: 'The Guild Leader cannot be kicked.' };
    }

    if (callerMember.role === 'officer' && targetMember.role === 'officer') {
      db.exec('COMMIT');
      return { success: false, error: 'Officers cannot remove fellow officers.' };
    }

    const now = new Date().toISOString();
    db.prepare('DELETE FROM guild_members WHERE guild_id = ? AND user_id = ?').run(guildId, targetUserId);
    db.prepare('UPDATE guilds SET member_count = MAX(0, member_count - 1), updated_at = ? WHERE id = ?').run(now, guildId);

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Transferring leadership.
 * Permissions:
 *  - Only current leader can transfer.
 *  - Target must be a member of the guild.
 */
export function transferLeadership(callerId, guildId, newLeaderId) {
  if (callerId === newLeaderId) {
    return { success: false, error: 'You are already the Guild Leader.' };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const caller = db.prepare('SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?').get(guildId, callerId);
    if (!caller || caller.role !== 'leader') {
      db.exec('COMMIT');
      return { success: false, error: 'Only the current Guild Leader can transfer leadership.' };
    }

    const target = db.prepare('SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?').get(guildId, newLeaderId);
    if (!target) {
      db.exec('COMMIT');
      return { success: false, error: 'New leader must be an active member of this guild.' };
    }

    const now = new Date().toISOString();

    // Demote caller to officer
    db.prepare('UPDATE guild_members SET role = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run('officer', now, guildId, callerId);

    // Promote target to leader
    db.prepare('UPDATE guild_members SET role = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run('leader', now, guildId, newLeaderId);

    // Update guild leader_id
    db.prepare('UPDATE guilds SET leader_id = ?, updated_at = ? WHERE id = ?').run(newLeaderId, now, guildId);

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Promoting / Demoting an officer.
 * Permissions:
 *  - Only leader can promote or demote officers.
 */
export function updateMemberRole(callerId, guildId, targetUserId, newRole) {
  if (callerId === targetUserId) {
    return { success: false, error: 'Cannot modify your own leadership role directly.' };
  }
  if (newRole !== 'officer' && newRole !== 'member') {
    return { success: false, error: 'Role must be officer or member.' };
  }

  const caller = db.prepare('SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?').get(guildId, callerId);
  if (!caller || caller.role !== 'leader') {
    return { success: false, error: 'Only the Guild Leader can promote or demote officers.' };
  }

  const target = db.prepare('SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?').get(guildId, targetUserId);
  if (!target) {
    return { success: false, error: 'Target user is not in this guild.' };
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE guild_members SET role = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?').run(newRole, now, guildId, targetUserId);
  return { success: true, role: newRole };
}

/**
 * Sending an invitation to a player.
 * Permissions:
 *  - Leader or Officer.
 *  - Target must not already belong to a guild.
 *  - Avoids duplicate pending invites.
 */
export function invitePlayer(callerId, guildId, targetUsernameOrId) {
  if (!targetUsernameOrId || typeof targetUsernameOrId !== 'string') {
    return { success: false, error: 'Target hunter username or ID is required.' };
  }

  const caller = db.prepare('SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?').get(guildId, callerId);
  if (!caller || (caller.role !== 'leader' && caller.role !== 'officer')) {
    return { success: false, error: 'Only leaders and officers can invite members.' };
  }

  // Find target user
  const cleanTarget = targetUsernameOrId.trim();
  const targetUser = db.prepare(`
    SELECT u.id, u.username
    FROM users u
    WHERE u.id = ? OR u.username = ? COLLATE NOCASE
  `).get(cleanTarget, cleanTarget);

  if (!targetUser) {
    return { success: false, error: `Hunter "${cleanTarget}" not found.` };
  }

  if (targetUser.id === callerId) {
    return { success: false, error: 'You cannot invite yourself.' };
  }

  // Check if target is already in a guild
  const existingMembership = db.prepare('SELECT guild_id FROM guild_members WHERE user_id = ?').get(targetUser.id);
  if (existingMembership) {
    return { success: false, error: `Hunter "${targetUser.username}" already belongs to a guild.` };
  }

  // Check if already invited
  const existingInvite = db.prepare(`
    SELECT id FROM guild_invites
    WHERE guild_id = ? AND user_id = ? AND status = 'pending'
  `).get(guildId, targetUser.id);

  if (existingInvite) {
    return { success: false, error: `An invitation has already been sent to ${targetUser.username}.` };
  }

  const now = new Date().toISOString();
  const inviteId = `ginv_${crypto.randomUUID()}`;

  db.prepare(`
    INSERT INTO guild_invites (id, guild_id, user_id, inviter_id, type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'invite', 'pending', ?, ?)
  `).run(inviteId, guildId, targetUser.id, callerId, now, now);

  return { success: true, inviteId, targetUsername: targetUser.username };
}

/**
 * Responding to a guild invitation (accept or reject).
 */
export function respondToInvite(userId, inviteId, accept = true) {
  const invite = db.prepare('SELECT * FROM guild_invites WHERE id = ? AND user_id = ?').get(inviteId, userId);
  if (!invite) {
    return { success: false, error: 'Invitation not found.' };
  }
  if (invite.status !== 'pending') {
    return { success: false, error: `Invitation is already ${invite.status}.` };
  }

  if (!accept) {
    db.prepare("UPDATE guild_invites SET status = 'rejected', updated_at = ? WHERE id = ?").run(new Date().toISOString(), inviteId);
    return { success: true, accepted: false };
  }

  // Accept -> joins guild
  const joinRes = joinGuild(userId, invite.guild_id);
  return { ...joinRes, accepted: joinRes.success };
}

// ─── Guild Progression & Activity Recording ─────────────────────────────────

/**
 * Recalculates guild level, rank, and max members based on total XP.
 */
function recalculateGuildLevelAndRank(guildId) {
  const guild = db.prepare('SELECT total_xp FROM guilds WHERE id = ?').get(guildId);
  if (!guild) return;

  const { level, rank, maxMembers } = calculateGuildLevelAndRank(guild.total_xp);
  db.prepare(`
    UPDATE guilds
    SET level = ?, rank = ?, max_members = ?, updated_at = ?
    WHERE id = ?
  `).run(level, rank, maxMembers, new Date().toISOString(), guildId);
}

/**
 * Updates cooperative guild quest progress for the active guild.
 */
function updateGuildQuestsProgress(guildId, userId, xpAmount, statsDelta, now) {
  const quests = db.prepare(`
    SELECT id, quest_key, quest_type, target_value, current_value, status
    FROM guild_quests
    WHERE guild_id = ? AND status = 'in-progress'
  `).all(guildId);

  for (const q of quests) {
    let increment = 0;
    if (q.quest_type === 'challenges_completed' && statsDelta.challenges) {
      increment = statsDelta.challenges;
    } else if (q.quest_type === 'xp_earned' && xpAmount > 0) {
      increment = xpAmount;
    } else if (q.quest_type === 'concepts_mastered' && statsDelta.concepts) {
      increment = statsDelta.concepts;
    } else if (q.quest_type === 'dungeons_completed' && statsDelta.dungeons) {
      increment = statsDelta.dungeons;
    }

    if (increment > 0) {
      const newTotal = q.current_value + increment;
      const isComplete = newTotal >= q.target_value;

      db.prepare(`
        UPDATE guild_quests
        SET current_value = ?,
            status = CASE WHEN ? >= target_value THEN 'completed' ELSE status END,
            completed_at = CASE WHEN ? >= target_value AND completed_at IS NULL THEN ? ELSE completed_at END
        WHERE id = ?
      `).run(newTotal, newTotal, newTotal, now, q.id);

      // Track individual member contribution
      db.prepare(`
        INSERT INTO guild_quest_contributions (id, guild_quest_id, user_id, contribution_value, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guild_quest_id, user_id) DO UPDATE SET
          contribution_value = contribution_value + ?,
          updated_at = ?
      `).run(`gqc_${q.id}_${userId}`, q.id, userId, increment, now, increment, now);
    }
  }
}

/**
 * Records player activity into guild XP and cooperative quest progress.
 * Authoritative:
 *  - Checks membership
 *  - Idempotent via UNIQUE(guild_id, user_id, activity_type, reference_id)
 *  - Re-evaluates guild level & milestones
 */
export function recordGuildActivity(userId, activityType, referenceId, xpAmount, statsDelta = {}) {
  if (!userId || !activityType || !referenceId) return null;

  const member = db.prepare('SELECT guild_id FROM guild_members WHERE user_id = ?').get(userId);
  if (!member) return null;

  const guildId = member.guild_id;
  const now = new Date().toISOString();
  const safeXp = Math.max(0, parseInt(xpAmount || 0, 10));

  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Idempotency guard: insert into guild_xp_logs
    const logId = `gxpl_${guildId}_${userId}_${activityType}_${referenceId}`;
    const logRes = db.prepare(`
      INSERT OR IGNORE INTO guild_xp_logs
        (id, guild_id, user_id, activity_type, reference_id, xp_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(logId, guildId, userId, activityType, referenceId, safeXp, now);

    if (logRes.changes === 0) {
      // Already recorded this activity for this guild
      db.exec('COMMIT');
      return { recorded: false, isDuplicate: true };
    }

    // Weekly reset check
    ensureGuildWeeklyReset(guildId);

    // 2. Update guild total_xp and weekly_xp
    db.prepare(`
      UPDATE guilds
      SET total_xp = total_xp + ?,
          weekly_xp = weekly_xp + ?,
          updated_at = ?
      WHERE id = ?
    `).run(safeXp, safeXp, now, guildId);

    // 3. Update member contributed_xp and weekly_contributed_xp
    db.prepare(`
      UPDATE guild_members
      SET contributed_xp = contributed_xp + ?,
          weekly_contributed_xp = weekly_contributed_xp + ?,
          updated_at = ?
      WHERE guild_id = ? AND user_id = ?
    `).run(safeXp, safeXp, now, guildId, userId);

    // 4. Update guild quests progress
    updateGuildQuestsProgress(guildId, userId, safeXp, statsDelta, now);

    // 5. Update guild level, rank, max_members
    recalculateGuildLevelAndRank(guildId);

    // 6. Check guild achievements
    checkGuildAchievements(guildId);

    db.exec('COMMIT');
    return { recorded: true, guildId, xpAwarded: safeXp };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('Failed to record guild activity:', err);
    return null;
  }
}

/**
 * Claims reward for a completed guild quest.
 * Verifies on the server:
 *  - Quest must have status = 'completed'
 *  - Distributes guild XP and reward share to contributing members
 *  - Single-winner transaction guard
 */
export function claimGuildQuestReward(userId, guildId, questId) {
  if (!userId || !guildId || !questId) {
    return { success: false, error: 'Invalid parameters.' };
  }

  const member = db.prepare('SELECT role FROM guild_members WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!member) {
    return { success: false, error: 'You are not a member of this guild.' };
  }

  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    const quest = db.prepare('SELECT * FROM guild_quests WHERE id = ? AND guild_id = ?').get(questId, guildId);
    if (!quest) {
      db.exec('COMMIT');
      return { success: false, error: 'Guild quest not found.' };
    }

    if (quest.status === 'claimed') {
      db.exec('COMMIT');
      return { success: false, error: 'This guild quest reward has already been claimed.' };
    }

    if (quest.status !== 'completed' && quest.current_value < quest.target_value) {
      db.exec('COMMIT');
      return { success: false, error: 'Quest objectives have not been completed yet.' };
    }

    // Mark claimed
    db.prepare(`
      UPDATE guild_quests
      SET status = 'claimed', claimed_at = ?
      WHERE id = ?
    `).run(now, quest.id);

    // Award bonus XP to guild
    db.prepare(`
      UPDATE guilds
      SET total_xp = total_xp + ?,
          weekly_xp = weekly_xp + ?,
          updated_at = ?
      WHERE id = ?
    `).run(quest.xp_reward, quest.xp_reward, now, guildId);

    recalculateGuildLevelAndRank(guildId);
    checkGuildAchievements(guildId);

    db.exec('COMMIT');

    // Distribute individual bonus reward to contributing members (outside main tx)
    const contributors = db.prepare(`
      SELECT user_id, contribution_value
      FROM guild_quest_contributions
      WHERE guild_quest_id = ? AND contribution_value > 0
    `).all(quest.id);

    const bonusPerMember = Math.min(250, Math.max(50, Math.floor(quest.xp_reward / Math.max(1, contributors.length))));
    for (const c of contributors) {
      try {
        awardQuestCompletionAtomic(c.user_id, `gq_reward_${quest.id}`, bonusPerMember);
      } catch {}
    }

    return {
      success: true,
      xpAwarded: quest.xp_reward,
      quest: {
        ...quest,
        status: 'claimed',
        claimed_at: now,
      },
    };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

// ─── Competitive Leaderboard System ─────────────────────────────────────────

/**
 * Extended competitive leaderboard with pagination, filtering, and multiple views:
 *  - 'players' (Global Level & Total XP)
 *  - 'weekly' (Top weekly XP earners from authoritative records)
 *  - 'guilds' (Top guilds by level, total XP, and weekly XP)
 *  - 'contributions' (Top guild contributors)
 */
export function getCompetitiveLeaderboard({
  type = 'players',
  rank = '',
  page = 1,
  limit = 25,
  search = '',
  guildId = null,
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  // ── 1. Guilds Rankings ──
  if (type === 'guilds') {
    let query = `
      SELECT g.id, g.name, g.description, g.emblem, g.rank as guildRank, g.level,
             g.total_xp as totalXp, g.weekly_xp as weeklyXp, g.member_count as memberCount,
             g.max_members as maxMembers, p.display_name as leaderName
      FROM guilds g
      JOIN profiles p ON p.user_id = g.leader_id
      WHERE 1=1
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM guilds g WHERE 1=1';
    const params = [];
    const countParams = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ' AND g.name LIKE ?';
      countQuery += ' AND g.name LIKE ?';
      params.push(term);
      countParams.push(term);
    }

    if (rank && rank.trim() && rank !== 'all') {
      query += ' AND g.rank = ?';
      countQuery += ' AND g.rank = ?';
      params.push(rank.trim());
      countParams.push(rank.trim());
    }

    query += ' ORDER BY g.level DESC, g.total_xp DESC, g.weekly_xp DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const total = db.prepare(countQuery).get(...countParams).total;
    const rows = db.prepare(query).all(...params);

    return {
      type: 'guilds',
      entries: rows.map((r, i) => ({
        rank: offset + i + 1,
        ...r,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  // ── 2. Weekly Hunter Rankings ──
  if (type === 'weekly') {
    // 7 days ago timestamp
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let query = `
      SELECT p.user_id as playerId, p.display_name as name, p.rank as playerRank,
             p.level, p.title, p.quests_completed as questsCompleted,
             COALESCE(SUM(xt.amount), 0) as weeklyXp,
             g.name as guildName, g.emblem as guildEmblem
      FROM profiles p
      LEFT JOIN xp_transactions xt ON xt.user_id = p.user_id AND xt.created_at >= ?
      LEFT JOIN guild_members gm ON gm.user_id = p.user_id
      LEFT JOIN guilds g ON g.id = gm.guild_id
      WHERE 1=1
    `;
    let countQuery = 'SELECT COUNT(DISTINCT p.user_id) as total FROM profiles p WHERE 1=1';
    const params = [sevenDaysAgo];
    const countParams = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ' AND p.display_name LIKE ?';
      countQuery += ' AND p.display_name LIKE ?';
      params.push(term);
      countParams.push(term);
    }

    if (rank && rank.trim() && rank !== 'all') {
      query += ' AND p.rank = ?';
      countQuery += ' AND p.rank = ?';
      params.push(rank.trim());
      countParams.push(rank.trim());
    }

    query += ' GROUP BY p.user_id ORDER BY weeklyXp DESC, p.level DESC, p.xp DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const total = db.prepare(countQuery).get(...countParams).total;
    const rows = db.prepare(query).all(...params);

    return {
      type: 'weekly',
      entries: rows.map((r, i) => ({
        rank: offset + i + 1,
        ...r,
        avatar: '',
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  // ── 3. Individual Guild Contributions Rankings ──
  if (type === 'contributions') {
    let query = `
      SELECT gm.user_id as playerId, p.display_name as name, p.rank as playerRank,
             p.level, p.title, gm.role, gm.contributed_xp as contributedXp,
             gm.weekly_contributed_xp as weeklyContributedXp,
             g.id as guildId, g.name as guildName, g.emblem as guildEmblem
      FROM guild_members gm
      JOIN guilds g ON g.id = gm.guild_id
      JOIN profiles p ON p.user_id = gm.user_id
      WHERE 1=1
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM guild_members gm WHERE 1=1';
    const params = [];
    const countParams = [];

    if (guildId) {
      query += ' AND gm.guild_id = ?';
      countQuery += ' AND gm.guild_id = ?';
      params.push(guildId);
      countParams.push(guildId);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ' AND p.display_name LIKE ?';
      countQuery += ' AND p.display_name LIKE ?';
      params.push(term);
      countParams.push(term);
    }

    query += ' ORDER BY gm.contributed_xp DESC, gm.weekly_contributed_xp DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const total = db.prepare(countQuery).get(...countParams).total;
    const rows = db.prepare(query).all(...params);

    return {
      type: 'contributions',
      entries: rows.map((r, i) => ({
        rank: offset + i + 1,
        ...r,
        avatar: '',
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  // ── 4. Global Players Rankings (Default) ──
  let query = `
    SELECT p.user_id as playerId, p.display_name as name, p.rank as playerRank,
           p.level, p.xp, p.title, p.quests_completed as questsCompleted,
           g.name as guildName, g.emblem as guildEmblem
    FROM profiles p
    LEFT JOIN guild_members gm ON gm.user_id = p.user_id
    LEFT JOIN guilds g ON g.id = gm.guild_id
    WHERE 1=1
  `;
  let countQuery = 'SELECT COUNT(*) as total FROM profiles p WHERE 1=1';
  const params = [];
  const countParams = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ' AND p.display_name LIKE ?';
    countQuery += ' AND p.display_name LIKE ?';
    params.push(term);
    countParams.push(term);
  }

  if (rank && rank.trim() && rank !== 'all') {
    query += ' AND p.rank = ?';
    countQuery += ' AND p.rank = ?';
    params.push(rank.trim());
    countParams.push(rank.trim());
  }

  query += ' ORDER BY p.level DESC, p.xp DESC LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const total = db.prepare(countQuery).get(...countParams).total;
  const rows = db.prepare(query).all(...params);

  return {
    type: 'players',
    entries: rows.map((r, i) => ({
      rank: offset + i + 1,
      ...r,
      avatar: '',
    })),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

