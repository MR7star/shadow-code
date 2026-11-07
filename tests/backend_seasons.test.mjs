/**
 * Seasonal events integration tests.
 *
 * Covers lifecycle transitions, seasonal XP idempotency, seasonal-XP rankings,
 * historical placements, reward eligibility, and exactly-once reward claims.
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const TEST_DB_PATH = './data/test_backend_seasons.db';
const BASE_URL = 'http://localhost:3001/api';

async function post(path, body, token) {
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

function cleanupTestDbFiles() {
  for (const file of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

function startTestServer() {
  return new Promise((resolve, reject) => {
    cleanupTestDbFiles();
    const process = spawn('node', ['server/runner.mjs'], {
      env: {
        ...globalThis.process.env,
        DATABASE_PATH: TEST_DB_PATH,
        PORT: '3001',
        HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let started = false;
    process.stdout.on('data', (data) => {
      if (!started && data.toString().includes('Backend listening')) {
        started = true;
        setTimeout(() => resolve(process), 300);
      }
    });
    process.stderr.on('data', (data) => console.error('[SERVER ERR]', data.toString().trim()));
    process.on('error', (error) => {
      if (!started) reject(error);
    });
    process.on('close', (code) => {
      if (!started) reject(new Error(`Server exited with code ${code}`));
    });
    setTimeout(() => {
      if (!started) {
        process.kill();
        reject(new Error('Server startup timed out.'));
      }
    }, 10000);
  });
}

async function registerHunter(username) {
  const response = await post('/auth/register', {
    username,
    email: `${username}@test.com`,
    password: 'Password123!',
  });
  assert.equal(response.status, 201, `Registration failed: ${JSON.stringify(response.data)}`);
  return response.data;
}

function getPy01Code() {
  return [
    'def calculate_mana(base_mana, intellect):',
    '    return base_mana + intellect * 10',
  ].join('\n');
}

async function runTests() {
  console.log('\n======================================');
  console.log('SHADOW CODE: SEASON SYSTEM TEST SUITE');
  console.log('======================================\n');

  let server = null;
  let testDb = null;
  try {
    console.log('[Setup] Starting isolated season test server…');
    server = await startTestServer();
    testDb = new DatabaseSync(TEST_DB_PATH);

    const seasons = await get('/seasons');
    assert.equal(seasons.status, 200);
    assert.equal(seasons.data.seasons[0].id, 'season-1');
    assert.equal(seasons.data.seasons[0].status, 'active');
    assert.ok(seasons.data.seasons[0].rewards.Bronze);

    const active = await get('/seasons/active');
    assert.equal(active.status, 200);
    assert.equal(active.data.id, 'season-1');
    assert.equal(active.data.status, 'active');
    assert.equal((await get('/seasons/missing-season')).status, 404);
    assert.equal((await post('/seasons/season-1/claim', {})).status, 401);

    const hunterA = await registerHunter('season_hunter_a');
    const hunterB = await registerHunter('season_hunter_b');
    const nonParticipant = await registerHunter('season_hunter_c');

    console.log('[Test] Seasonal XP is recorded once for successful challenge XP…');
    const submitA = await post('/submit', { challengeId: 'py-01', code: getPy01Code() }, hunterA.token);
    assert.equal(submitA.status, 200);
    assert.equal(submitA.data.xpReward, 100);
    const duplicateA = await post('/submit', { challengeId: 'py-01', code: getPy01Code() }, hunterA.token);
    assert.equal(duplicateA.status, 200);
    assert.equal(duplicateA.data.isDuplicate, true);

    const submitB = await post('/submit', { challengeId: 'py-01', code: getPy01Code() }, hunterB.token);
    assert.equal(submitB.status, 200);
    const participantA = testDb.prepare(`
      SELECT seasonal_xp FROM season_participants WHERE season_id = 'season-1' AND user_id = ?
    `).get(hunterA.user.id);
    assert.equal(participantA.seasonal_xp, 100);

    testDb.prepare(`
      UPDATE season_participants SET seasonal_xp = 200, arena_rating = 900
      WHERE season_id = 'season-1' AND user_id = ?
    `).run(hunterA.user.id);
    testDb.prepare(`
      UPDATE season_participants SET arena_rating = 2200
      WHERE season_id = 'season-1' AND user_id = ?
    `).run(hunterB.user.id);

    console.log('[Test] Active standings rank by seasonal XP and expose user rank…');
    const activeDetails = await get('/seasons/season-1', hunterA.token);
    assert.equal(activeDetails.status, 200);
    assert.equal(activeDetails.data.topRankers[0].userId, hunterA.user.id);
    assert.equal(activeDetails.data.userStanding.finalPlacement, 1);
    assert.equal(activeDetails.data.canClaimReward, false);

    console.log('[Test] Expired season archives final seasonal-XP placements…');
    const now = new Date();
    const earlier = new Date(now.getTime() - 86400000).toISOString();
    testDb.prepare("UPDATE seasons SET end_date = ? WHERE id = 'season-1'").run(earlier);
    const archiveResponse = await get('/seasons/season-1', hunterA.token);
    assert.equal(archiveResponse.status, 200);
    assert.equal(archiveResponse.data.status, 'completed');
    assert.equal(archiveResponse.data.topRankers[0].userId, hunterA.user.id);
    assert.equal(archiveResponse.data.topRankers[0].placement, 1);
    assert.equal(archiveResponse.data.userStanding.finalPlacement, 1);
    assert.equal(archiveResponse.data.canClaimReward, true);
    assert.equal((await post('/seasons/season-1/claim', {}, nonParticipant.token)).status, 400);

    console.log('[Test] Reward grant is atomic and duplicate claims are rejected…');
    const before = testDb.prepare('SELECT xp, quests_completed FROM profiles WHERE user_id = ?').get(hunterA.user.id);
    const claimResponses = await Promise.all([
      post('/seasons/season-1/claim', {}, hunterA.token),
      post('/seasons/season-1/claim', {}, hunterA.token),
    ]);
    assert.equal(claimResponses.filter((response) => response.status === 200).length, 1);
    assert.equal(claimResponses.filter((response) => response.status === 400).length, 1);
    const claim = claimResponses.find((response) => response.status === 200);
    assert.equal(claim.data.xpAwarded, 150);
    const after = testDb.prepare('SELECT xp, quests_completed FROM profiles WHERE user_id = ?').get(hunterA.user.id);
    assert.equal(after.xp, before.xp + 150);
    assert.equal(after.quests_completed, before.quests_completed);
    assert.equal(testDb.prepare(`
      SELECT COUNT(*) as count FROM season_reward_claims WHERE season_id = 'season-1' AND user_id = ?
    `).get(hunterA.user.id).count, 1);
    assert.equal(testDb.prepare(`
      SELECT COUNT(*) as count FROM xp_transactions
      WHERE user_id = ? AND quest_id = 'season_reward_season-1'
    `).get(hunterA.user.id).count, 1);
    assert.equal(testDb.prepare(`
      SELECT COUNT(*) as count FROM user_titles WHERE user_id = ? AND title = 'Novice Duelist'
    `).get(hunterA.user.id).count, 1);

    console.log('[Test] Upcoming season date activates it and preserves archive…');
    const future = new Date(Date.now() + 86400000).toISOString();
    const later = new Date(Date.now() + 2 * 86400000).toISOString();
    const rewards = JSON.stringify({ Bronze: { xp: 50, title: 'Season Explorer' } });
    testDb.prepare(`
      INSERT INTO seasons (
        id, season_number, name, description, start_date, end_date, status,
        rewards_json, created_at, updated_at
      ) VALUES ('season-2', 2, 'Season 2', 'Next seasonal event', ?, ?, 'upcoming', ?, ?, ?)
    `).run(future, later, rewards, now.toISOString(), now.toISOString());

    const upcoming = await get('/seasons/season-2');
    assert.equal(upcoming.status, 200);
    assert.equal(upcoming.data.status, 'upcoming');
    testDb.prepare("UPDATE seasons SET start_date = ? WHERE id = 'season-2'").run(earlier);
    const nextActive = await get('/seasons/active');
    assert.equal(nextActive.status, 200);
    assert.equal(nextActive.data.id, 'season-2');
    assert.equal(nextActive.data.status, 'active');
    assert.equal(nextActive.data.participantCount, 0);
    assert.equal((await get('/seasons')).data.seasons[1].status, 'completed');

    console.log('\n✓ Season lifecycle, XP tracking, rankings, reward claims, and archives passed.');
  } finally {
    testDb?.close();
    if (server) {
      server.kill();
      await new Promise((resolve) => server.once('close', resolve));
    }
    cleanupTestDbFiles();
  }
}

runTests().catch((error) => {
  console.error('\n✗ Season tests failed:', error);
  process.exitCode = 1;
});
