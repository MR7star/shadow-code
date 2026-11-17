/**
 * Ranked Arena backend integration suite.
 *
 * Covers Elo and divisions, authenticated APIs, queue matching and concurrency,
 * active-match constraints, submissions, deadlines, rewards, and rating history.
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestServer as startBackendTestServer, stopTestServer } from './helpers/testServer.mjs';

const TEST_DB_PATH = path.join(os.tmpdir(), `test_backend_ranked_arena_${process.pid}.db`);
let BASE_URL;

async function post(path, body = {}, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${BASE_URL}${path}`, { headers });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function cleanupTestDbFiles(ignoreBusy = false) {
  for (const file of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
    if (!fs.existsSync(file)) continue;
    try {
      fs.unlinkSync(file);
    } catch (error) {
      if (!ignoreBusy || error.code !== 'EBUSY') throw error;
      console.warn(`[Cleanup] Database file is still in use: ${file}`);
    }
  }
}

function startTestServer() {
  cleanupTestDbFiles();
  return startBackendTestServer({
    databasePath: TEST_DB_PATH,
    env: { ARENA_K_FACTOR: '24', ARENA_PROVISIONAL_K_FACTOR: '40' },
    logPrefix: '[SERVER]',
  });
}

async function registerHunter(prefix) {
  const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const response = await post('/auth/register', {
    username,
    email: `${username}@arena.test`,
    password: 'ArenaPassword123!',
  });
  assert.equal(response.status, 201, `Registration failed: ${JSON.stringify(response.data)}`);
  return response.data;
}

function solutionFor(challengeId, correct = true) {
  if (!correct) {
    const functions = {
      'py-01': 'calculate_mana',
      'py-02': 'identify_rank',
      'py-03': 'format_item',
    };
    return `def ${functions[challengeId]}(*args):\n    return None`;
  }
  const solutions = {
    'py-01': 'def calculate_mana(base_mana, intellect):\n    return base_mana + intellect * 10',
    'py-02': [
      'def identify_rank(power_level):',
      "    if power_level < 100: return 'E'",
      "    elif power_level <= 249: return 'D'",
      "    elif power_level <= 499: return 'C'",
      "    elif power_level <= 999: return 'B'",
      "    elif power_level <= 1999: return 'A'",
      "    return 'S'",
    ].join('\n'),
    'py-03': 'def format_item(name, rarity, quantity):\n    return f"[{rarity.upper()}] {name.title()} x{quantity}"',
  };
  return solutions[challengeId] || '';
}

async function joinQueue(hunter) {
  return post('/arena/queue', {}, hunter.token);
}

async function runTests() {
  console.log('\n======================================');
  console.log('SHADOW CODE: RANKED ARENA TEST SUITE');
  console.log('======================================\n');
  let server = null;
  let database = null;
  let arenaDatabase = null;
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousKFactor = process.env.ARENA_K_FACTOR;
  const previousProvisionalKFactor = process.env.ARENA_PROVISIONAL_K_FACTOR;
  try {
    console.log('[Setup] Starting isolated Ranked Arena backend…');
    server = await startTestServer();
    BASE_URL = server.baseUrl;
    database = new DatabaseSync(TEST_DB_PATH);
    database.exec('PRAGMA foreign_keys = ON');
    process.env.DATABASE_PATH = TEST_DB_PATH;
    process.env.ARENA_K_FACTOR = '24';
    process.env.ARENA_PROVISIONAL_K_FACTOR = '40';
    const arenaModule = await import('../server/seasons.mjs');
    const databaseModule = await import('../server/db.mjs');
    arenaDatabase = databaseModule.db;
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    if (previousKFactor === undefined) delete process.env.ARENA_K_FACTOR;
    else process.env.ARENA_K_FACTOR = previousKFactor;
    if (previousProvisionalKFactor === undefined) delete process.env.ARENA_PROVISIONAL_K_FACTOR;
    else process.env.ARENA_PROVISIONAL_K_FACTOR = previousProvisionalKFactor;

    console.log('[Test] Elo formulas and division boundaries…');
    assert.equal(arenaModule.calculateEloChange(1000, 1000, 1, 0), 20);
    assert.equal(arenaModule.calculateEloChange(1000, 1000, 0, 0), -20);
    assert.equal(arenaModule.calculateEloChange(1000, 1000, 0.5, 0), 0);
    assert.equal(arenaModule.calculateEloChange(1000, 1000, 1, 10), 12);
    assert.equal(arenaModule.calculateEloChange(1000, 1000, 1, 10, 16), 8);
    assert.throws(() => arenaModule.calculateEloChange(1000, 1000, 2), TypeError);
    assert.deepEqual(
      [1199, 1200, 1400, 1600, 1800, 2000].map(arenaModule.getDivision),
      ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Monarch']
    );

    console.log('[Test] Protected Arena API endpoints…');
    for (const path of [
      '/arena/profile',
      '/arena/queue/status',
      '/arena/history',
      '/arena/rating-history',
      '/arena/leaderboard',
      '/arena/matches/missing',
      '/arena/matches/missing/result',
    ]) {
      assert.equal((await get(path)).status, 401, `${path} must require authentication.`);
    }
    assert.equal((await post('/arena/queue')).status, 401);
    assert.equal((await post('/arena/queue/leave')).status, 401);
    assert.equal((await post('/arena/matches/missing/submit', { code: 'x' })).status, 401);
    assert.equal((await post('/arena/matches/missing/forfeit')).status, 401);

    const playerA = await registerHunter('arena_a');
    const playerB = await registerHunter('arena_b');
    const playerC = await registerHunter('arena_c');
    const playerD = await registerHunter('arena_d');
    const playerE = await registerHunter('arena_e');
    const playerF = await registerHunter('arena_f');
    const playerG = await registerHunter('arena_g');
    const playerH = await registerHunter('arena_h');
    const playerI = await registerHunter('arena_i');
    const playerJ = await registerHunter('arena_j');

    console.log('[Test] Initial profile and duplicate queue requests…');
    const initialProfile = await get('/arena/profile', playerA.token);
    assert.equal(initialProfile.status, 200);
    assert.equal(initialProfile.data.rating, 1000);
    assert.equal(initialProfile.data.division, 'Bronze');
    assert.equal((await get('/arena/profile', playerA.token)).data.userId, playerA.user.id);

    console.log('[Test] Rating-compatible opponent selection and widening window…');
    assert.equal((await joinQueue(playerC)).data.status, 'queued');
    await get('/arena/profile', playerD.token);
    const playerDId = playerD.user.id;
    database.prepare('UPDATE arena_profiles SET rating = 1600, peak_rating = 1600, division = ? WHERE user_id = ?')
      .run('Diamond', playerDId);
    assert.equal((await joinQueue(playerD)).data.status, 'queued');
    const firstQueueStatus = await get('/arena/queue/status', playerD.token);
    assert.equal(firstQueueStatus.data.inQueue, true);
    const repeatedQueue = await joinQueue(playerD);
    assert.equal(repeatedQueue.data.status, 'queued');
    assert.equal((await get('/arena/queue/status', playerD.token)).data.queuedAt, firstQueueStatus.data.queuedAt);

    const compatible = await joinQueue(playerE);
    assert.equal(compatible.data.status, 'matched');
    const compatibleMatch = database.prepare('SELECT * FROM arena_matches WHERE id = ?').get(compatible.data.matchId);
    assert.deepEqual(new Set([compatibleMatch.player1_id, compatibleMatch.player2_id]), new Set([playerC.user.id, playerE.user.id]));
    assert.equal(compatible.data.ratingDifference, 0);
    assert.equal((await get('/arena/queue/status', playerD.token)).data.inQueue, true);
    assert.equal((await post('/arena/queue/leave', {}, playerD.token)).data.removed, true);
    assert.equal((await post('/arena/queue/leave', {}, playerD.token)).data.removed, false);
    assert.equal((await post(`/arena/matches/${compatible.data.matchId}/cancel`, {}, playerC.token)).status, 200);

    assert.equal((await joinQueue(playerI)).data.status, 'queued');
    database.prepare('UPDATE arena_queue SET queued_at = ? WHERE user_id = ?')
      .run(new Date(Date.now() - 31_000).toISOString(), playerI.user.id);
    await get('/arena/profile', playerJ.token);
    database.prepare('UPDATE arena_profiles SET rating = 1200, peak_rating = 1200, division = ? WHERE user_id = ?')
      .run('Silver', playerJ.user.id);
    assert.equal((await joinQueue(playerJ)).data.status, 'queued');
    const agedQueueTime = new Date(Date.now() - 31_000).toISOString();
    database.prepare('UPDATE arena_queue SET queued_at = ? WHERE user_id IN (?, ?)')
      .run(agedQueueTime, playerI.user.id, playerJ.user.id);
    const widened = await joinQueue(playerJ);
    assert.equal(widened.data.status, 'matched');
    assert.equal(widened.data.ratingDifference, 200);
    assert.equal((await post(`/arena/matches/${widened.data.matchId}/cancel`, {}, playerI.token)).status, 200);

    console.log('[Test] Verified draw result updates both ratings and match records…');
    database.prepare('UPDATE arena_profiles SET rating = 1000, peak_rating = 1000, division = ? WHERE user_id IN (?, ?)')
      .run('Bronze', playerI.user.id, playerJ.user.id);
    assert.equal((await joinQueue(playerI)).data.status, 'queued');
    const drawPair = await joinQueue(playerJ);
    assert.equal(drawPair.data.status, 'matched');
    database.prepare('UPDATE arena_matches SET start_time = ? WHERE id = ?')
      .run(new Date(Date.now() + 60_000).toISOString(), drawPair.data.matchId);
    const verifiedEval = async () => ({ allPassed: true, results: [{ passed: true }] });
    const harnessBuilder = () => 'server-controlled-test-harness';
    await arenaModule.submitArenaMatch(
      playerI.user.id, drawPair.data.matchId, 'solution-a', verifiedEval, harnessBuilder
    );
    const drawSubmission = await arenaModule.submitArenaMatch(
      playerJ.user.id, drawPair.data.matchId, 'solution-b', verifiedEval, harnessBuilder
    );
    assert.equal(drawSubmission.match.status, 'completed');
    assert.equal(drawSubmission.match.winnerId, 'draw');
    assert.equal((await get('/arena/profile', playerI.token)).data.draws, 1);
    assert.equal((await get('/arena/profile', playerJ.token)).data.draws, 1);
    assert.equal(database.prepare('SELECT change FROM rating_history WHERE match_id = ? AND user_id = ?')
      .get(drawPair.data.matchId, playerI.user.id).change, 0);

    console.log('[Test] Concurrent matchmaking and active-match uniqueness…');
    const [queuedOrMatchedF, queuedOrMatchedG] = await Promise.all([joinQueue(playerF), joinQueue(playerG)]);
    assert.equal([queuedOrMatchedF, queuedOrMatchedG].filter((result) => result.data.status === 'matched').length, 1);
    const fStatus = await get('/arena/queue/status', playerF.token);
    const gStatus = await get('/arena/queue/status', playerG.token);
    assert.equal(Number(fStatus.data.hasActiveMatch) + Number(gStatus.data.hasActiveMatch), 2);
    const activeMatchId = fStatus.data.matchId || gStatus.data.matchId;
    assert.ok(activeMatchId);
    assert.equal((await joinQueue(playerF)).data.matchId, fStatus.data.matchId || activeMatchId);

    const duplicateActiveMatchId = 'arena-duplicate-active-match';
    const nowIso = new Date().toISOString();
    database.prepare(`
      INSERT INTO arena_matches (
        id, season_id, challenge_id, match_type, player1_id, player2_id, p1_name, p2_name,
        p1_rating_before, p2_rating_before, status, duration_limit_sec, start_time, deadline_at, created_at
      ) VALUES (?, 'season-1', 'py-01', 'ranked', ?, ?, 'A', 'B', 1000, 1000, 'ready', 600, ?, ?, ?)
    `).run(
      duplicateActiveMatchId,
      playerF.user.id,
      playerG.user.id,
      nowIso,
      new Date(Date.now() + 600000).toISOString(),
      nowIso
    );
    assert.throws(() => database.prepare(`
      INSERT INTO arena_match_participants
        (id, match_id, user_id, slot, state, active, joined_at, updated_at)
      VALUES ('duplicate-active-participant', ?, ?, 1, 'ready', 1, ?, ?)
    `).run(duplicateActiveMatchId, playerF.user.id, nowIso, nowIso), /UNIQUE constraint failed/);
    assert.throws(() => database.prepare(`
      INSERT INTO arena_matches (
        id, season_id, challenge_id, match_type, player1_id, player2_id, p1_name, p2_name,
        p1_rating_before, p2_rating_before, status, duration_limit_sec, start_time, deadline_at, created_at
      ) VALUES ('arena-invalid-player-match', 'season-1', 'py-01', 'ranked', 'missing-user', ?, 'A', 'B',
        1000, 1000, 'ready', 600, ?, ?, ?)
    `).run(playerF.user.id, nowIso, new Date(Date.now() + 600000).toISOString(), nowIso),
    /Unknown arena match player|FOREIGN KEY constraint failed/);
    database.prepare('DELETE FROM arena_matches WHERE id = ?').run(duplicateActiveMatchId);
    assert.equal((await post(`/arena/matches/${activeMatchId}/cancel`, {}, playerF.token)).status, 200);
    assert.equal((await get(`/arena/matches/${activeMatchId}`, playerF.token)).data.status, 'cancelled');

    console.log('[Test] Queue expiry and untouched match expiration…');
    assert.equal((await joinQueue(playerD)).data.status, 'queued');
    database.prepare('UPDATE arena_queue SET queued_at = ? WHERE user_id = ?')
      .run(new Date(Date.now() - 6 * 60 * 1000).toISOString(), playerD.user.id);
    assert.equal((await get('/arena/queue/status', playerD.token)).data.inQueue, false);
    const noShowMatch = await joinQueue(playerC);
    assert.equal(noShowMatch.data.status, 'queued');
    const noShowOpponent = await joinQueue(playerE);
    assert.equal(noShowOpponent.data.status, 'matched');
    database.prepare('UPDATE arena_matches SET deadline_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), noShowOpponent.data.matchId);
    const noShowStatus = await get('/arena/queue/status', playerC.token);
    assert.equal(noShowStatus.data.hasActiveMatch, false);
    assert.equal(database.prepare('SELECT status, winner_id FROM arena_matches WHERE id = ?')
      .get(noShowOpponent.data.matchId).status, 'expired');
    assert.equal(database.prepare('SELECT COUNT(*) as count FROM rating_history WHERE match_id = ?')
      .get(noShowOpponent.data.matchId).count, 0);

    console.log('[Test] Verified submissions, duplicate processing, deadline, Elo and rewards…');
    await get('/arena/profile', playerA.token);
    await get('/arena/profile', playerB.token);
    database.prepare('UPDATE arena_profiles SET rating = 1190, peak_rating = 1190, division = ? WHERE user_id = ?')
      .run('Bronze', playerA.user.id);
    database.prepare('UPDATE arena_profiles SET rating = 1100, peak_rating = 1100, division = ? WHERE user_id = ?')
      .run('Bronze', playerB.user.id);
    assert.equal((await joinQueue(playerA)).data.status, 'queued');
    const mainMatch = await joinQueue(playerB);
    assert.equal(mainMatch.data.status, 'matched');
    const matchDetails = await get(`/arena/matches/${mainMatch.data.matchId}`, playerA.token);
    assert.equal(matchDetails.status, 200);
    assert.equal(matchDetails.data.status, 'ready');
    assert.equal((await get(`/arena/matches/${mainMatch.data.matchId}`, playerH.token)).status, 404);
    assert.equal((await get(`/arena/matches/${mainMatch.data.matchId}/result`, playerA.token)).status, 409);

    const challengeId = matchDetails.data.challenge.id;
    const badCode = solutionFor(challengeId, false);
    const parallelSubmissions = await Promise.all([
      post(`/arena/matches/${mainMatch.data.matchId}/submit`, { code: badCode }, playerA.token),
      post(`/arena/matches/${mainMatch.data.matchId}/submit`, { code: badCode }, playerA.token),
    ]);
    assert.equal(parallelSubmissions.filter((result) => result.status === 200).length, 1);
    assert.equal(parallelSubmissions.filter((result) => result.status === 400).length, 1);
    const attempts = database.prepare(`
      SELECT COUNT(*) as count FROM arena_match_submissions WHERE match_id = ? AND user_id = ?
    `).get(mainMatch.data.matchId, playerA.user.id).count;
    assert.equal(attempts, 1);
    assert.equal(parallelSubmissions.find((result) => result.status === 200).data.allPassed, false);
    assert.equal((await post(`/arena/matches/${mainMatch.data.matchId}/cancel`, {}, playerA.token)).status, 400);

    const validSubmission = await post(`/arena/matches/${mainMatch.data.matchId}/submit`, {
      code: solutionFor(challengeId),
    }, playerA.token);
    assert.equal(validSubmission.status, 200);
    assert.equal(validSubmission.data.allPassed, true);
    assert.equal((await post(`/arena/matches/${mainMatch.data.matchId}/submit`, {
      code: solutionFor(challengeId),
    }, playerA.token)).status, 400);

    database.prepare('UPDATE arena_matches SET deadline_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), mainMatch.data.matchId);
    const lateSubmission = await post(`/arena/matches/${mainMatch.data.matchId}/submit`, {
      code: solutionFor(challengeId),
    }, playerB.token);
    assert.equal(lateSubmission.status, 400);
    assert.match(lateSubmission.data.error, /expired|concluded/i);

    const matchResult = await get(`/arena/matches/${mainMatch.data.matchId}/result`, playerA.token);
    assert.equal(matchResult.status, 200);
    assert.equal(matchResult.data.status, 'expired');
    assert.equal(matchResult.data.winnerId, playerA.user.id);
    const profileA = (await get('/arena/profile', playerA.token)).data;
    const profileB = (await get('/arena/profile', playerB.token)).data;
    assert.equal(profileA.rating, 1205);
    assert.equal(profileA.division, 'Silver');
    assert.equal(profileB.rating, 1085);
    assert.equal(profileA.wins, 1);
    assert.equal(profileB.losses, 1);

    const reward = database.prepare(`
      SELECT reward_type, xp_awarded FROM arena_match_rewards WHERE match_id = ? AND user_id = ?
    `).get(mainMatch.data.matchId, playerA.user.id);
    assert.equal(reward.reward_type, 'winner_xp');
    assert.equal(reward.xp_awarded, 100);
    const progression = database.prepare('SELECT xp, quests_completed FROM profiles WHERE user_id = ?')
      .get(playerA.user.id);
    assert.equal(progression.xp, 100);
    assert.equal(progression.quests_completed, 0);
    assert.equal(database.prepare('SELECT COUNT(*) as count FROM rating_history WHERE match_id = ?')
      .get(mainMatch.data.matchId).count, 2);

    const history = await get('/arena/history', playerA.token);
    assert.equal(history.status, 200);
    assert.equal(history.data.total, 1);
    assert.equal(history.data.matches[0].result, 'win');
    const ratingHistory = await get('/arena/rating-history', playerA.token);
    assert.equal(ratingHistory.status, 200);
    assert.equal(ratingHistory.data.total, 1);
    assert.equal(ratingHistory.data.entries[0].change, 15);
    const leaderboard = await get('/arena/leaderboard', playerA.token);
    assert.equal(leaderboard.status, 200);
    assert.ok(leaderboard.data.entries.some((entry) => entry.userId === playerA.user.id));

    console.log('[Test] Division/status constraints and result privacy…');
    assert.throws(() => database.prepare('UPDATE arena_matches SET status = ? WHERE id = ?')
      .run('invalid', mainMatch.data.matchId), /Invalid arena match status|CHECK constraint failed/);
    assert.throws(() => database.prepare('UPDATE arena_matches SET player1_status = ? WHERE id = ?')
      .run('invalid', mainMatch.data.matchId), /Invalid arena player status|CHECK constraint failed/);
    assert.equal((await get(`/arena/matches/${mainMatch.data.matchId}/result`, playerH.token)).status, 404);
    assert.equal(database.prepare('SELECT COUNT(*) as count FROM arena_match_participants WHERE match_id = ? AND active = 1')
      .get(mainMatch.data.matchId).count, 0);

    console.log('\n✓ Ranked Arena Elo, matchmaking, lifecycle, authorization, submissions, rewards and history passed.');
  } finally {
    database?.close();
    arenaDatabase?.close();
    if (server) {
      await stopTestServer(server.process);
    }
    cleanupTestDbFiles(true);
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    if (previousKFactor === undefined) delete process.env.ARENA_K_FACTOR;
    else process.env.ARENA_K_FACTOR = previousKFactor;
    if (previousProvisionalKFactor === undefined) delete process.env.ARENA_PROVISIONAL_K_FACTOR;
    else process.env.ARENA_PROVISIONAL_K_FACTOR = previousProvisionalKFactor;
  }
}

runTests().catch((error) => {
  console.error('\n✗ Ranked Arena tests failed:', error);
  process.exitCode = 1;
});
