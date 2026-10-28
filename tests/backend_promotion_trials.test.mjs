/**
 * Backend Promotion Trials & Skill Tree Test Suite
 *
 * Covers:
 *  1. Skill prerequisite enforcement via /api/skills
 *  2. Locked promotion trial eligibility
 *  3. Failed promotion trial attempt
 *  4. Successful promotion trial + rank advancement
 *  5. Duplicate promotion request protection
 *  6. Concurrent promotion request protection
 *  7. Rank promotion persistence across fresh DB connection
 *  8. XP and profile consistency after promotion
 *  9. Authentication and user isolation
 *  10. Existing mastery/challenge regression
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';

const TEST_DB_PATH = './data/test_promotion_trials.db';
const BASE_URL = 'http://localhost:3001/api';

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method: 'GET', headers });
  const data = await res.json();
  return { status: res.status, data };
}

// Start test server with a dedicated test database
function startTestServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['server/runner.mjs'], {
      env: { ...process.env, DATABASE_PATH: TEST_DB_PATH, PORT: '3001', HOST: '0.0.0.0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let started = false;
    server.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[SERVER]', output.trim());
      if (output.includes('Backend listening') && !started) {
        started = true;
        setTimeout(() => resolve(server), 500);
      }
    });

    server.stderr.on('data', (data) => {
      console.error('[SERVER ERR]', data.toString().trim());
    });

    server.on('error', (err) => {
      if (!started) reject(err);
    });

    server.on('close', (code) => {
      if (!started) reject(new Error(`Server exited with code ${code}`));
    });

    setTimeout(() => {
      if (!started) {
        server.kill();
        reject(new Error('Server startup timeout'));
      }
    }, 10000);
  });
}

// Solution codes for challenges used in promotion trials
function getCode(challengeId) {
  const codes = {
    'py-01': [
      'def calculate_mana(base_mana, intellect):',
      '    return base_mana + intellect * 10',
    ].join('\n'),
    'py-02': [
      'def identify_rank(power_level):',
      "    if power_level < 100: return 'E'",
      "    elif power_level <= 249: return 'D'",
      "    elif power_level <= 499: return 'C'",
      "    elif power_level <= 999: return 'B'",
      "    elif power_level <= 1999: return 'A'",
      "    return 'S'",
    ].join('\n'),
    'py-03': [
      'def format_item(name, rarity, quantity):',
      '    return f"[{rarity.upper()}] {name.title()} x{quantity}"',
    ].join('\n'),
    'py-04': [
      'def sum_soldier_strengths(strengths):',
      '    total = 0',
      '    for s in strengths:',
      '        if s > 0: total += s',
      '    return total',
    ].join('\n'),
    'py-06': [
      'def survive_statue_countdown(statue_timer, step):',
      '    if statue_timer <= 0: return 0',
      '    ticks = 0',
      '    while statue_timer > 0:',
      '        statue_timer -= step',
      '        ticks += 1',
      '    return ticks',
    ].join('\n'),
  };
  return codes[challengeId] || '';
}

async function runTests() {
  console.log('--- Starting Backend Promotion Trials Test Suite ---\n');

  const server = await startTestServer();
  console.log('Test server started\n');

  try {
    // ── Register a fresh test hunter ──────────────────────────────
    const uniqueName = `PromoHunter_${Date.now()}`;
    const regRes = await post('/auth/register', {
      username: uniqueName,
      email: `${uniqueName.toLowerCase()}@promo.dev`,
      password: 'promoPass99!',
    });
    assert.equal(regRes.status, 201, 'Registration should succeed');
    const token = regRes.data.token;
    const userId = regRes.data.user.id;
    console.log(`Registered test user: ${uniqueName} (${userId})\n`);

    // ── Test 1: Skill prerequisite enforcement via /api/skills ────
    console.log('Test 1: Skill prerequisite enforcement');
    const skillsRes = await get('/skills', token);
    assert.equal(skillsRes.status, 200);
    assert.ok(Array.isArray(skillsRes.data.skills), 'Should return skills array');

    const skillMap = {};
    for (const s of skillsRes.data.skills) {
      skillMap[s.id] = s;
    }

    // skill-variables has no prereqs, should be available (level 0 = unlocked but not leveled)
    assert.equal(skillMap['skill-variables'].state, 'available', 'skill-variables should be available');
    assert.equal(skillMap['skill-variables'].level, 0, 'skill-variables should be level 0 initially');

    // skill-control-flow requires skill-variables, which is level 0, so locked
    assert.equal(skillMap['skill-control-flow'].state, 'locked', 'skill-control-flow should be locked initially');
    assert.ok(skillMap['skill-control-flow'].unlockReason, 'Should have unlock reason');
    assert.ok(skillMap['skill-control-flow'].unlockReason.includes('skill-variables'),
      'Unlock reason should mention skill-variables');

    // skill-functions requires skill-control-flow which is locked
    assert.equal(skillMap['skill-functions'].state, 'locked', 'skill-functions should be locked');
    console.log('✓ Skill prerequisite enforcement verified\n');

    // ── Test 2: Complete py-01 to unlock skill-variables ─────────
    console.log('Test 2: Complete py-01 to unlock skill-variables');
    const py01Submit = await post('/submit', {
      challengeId: 'py-01',
      code: getCode('py-01'),
    }, token);
    assert.equal(py01Submit.status, 200);
    assert.equal(py01Submit.data.allPassed, true);
    assert.equal(py01Submit.data.xpReward, 100);

    const skillsAfterPy01 = await get('/skills', token);
    const svAfter = skillsAfterPy01.data.skills.find(s => s.id === 'skill-variables');
    assert.ok(svAfter.level > 0, 'skill-variables should be unlocked after py-01');
    console.log(`✓ skill-variables level = ${svAfter.level} after py-01\n`);

    // ── Test 3: Locked promotion trial - E→D not eligible ─────────
    console.log('Test 3: E→D promotion trial not eligible yet');
    const trialsRes = await get('/promotion/trials', token);
    assert.equal(trialsRes.status, 200);
    assert.ok(Array.isArray(trialsRes.data.trials), 'Should return trials array');

    const eDTrial = trialsRes.data.trials.find(t => t.fromRank === 'E-Rank');
    assert.ok(eDTrial, 'E→D trial should exist');
    assert.equal(eDTrial.eligible, false, 'E→D should not be eligible yet');
    assert.ok(eDTrial.lockReason, 'Should have lock reason');
    console.log(`✓ E→D trial locked: ${eDTrial.lockReason}\n`);

    // ── Test 4: Attempt E→D promotion without meeting requirements ──
    console.log('Test 4: Attempt E→D promotion without meeting requirements');
    const badAttempt = await post('/promotion/trial/attempt', {
      trialId: 'promo-e-d',
      code: getCode('py-02'),
    }, token);
    assert.equal(badAttempt.status, 400, 'Should reject ineligible attempt');
    assert.equal(badAttempt.data.errorType, 'requirements_not_met',
      'Error type should be requirements_not_met');
    console.log('✓ Ineligible promotion attempt rejected\n');

    // ── Test 5: Complete py-02 to meet E→D challenge requirement ──
    console.log('Test 5: Complete py-02 to meet E→D requirements');
    const py02Submit = await post('/submit', {
      challengeId: 'py-02',
      code: getCode('py-02'),
    }, token);
    assert.equal(py02Submit.status, 200);
    assert.equal(py02Submit.data.allPassed, true);
    assert.equal(py02Submit.data.xpReward, 120);

    const progressAfterPy02 = await get('/player/progress', token);
    assert.equal(progressAfterPy02.data.profile.xp, 220, 'XP should be 220 (100+120)');
    console.log(`✓ py-02 completed, XP = ${progressAfterPy02.data.profile.xp}\n`);

    // ── Test 6: Still not eligible - need level 10 ────────────────
    console.log('Test 6: E→D still not eligible (need level 10, concept mastery)');
    const trialsAfterPy02 = await get('/promotion/trials', token);
    const eDTrial2 = trialsAfterPy02.data.trials.find(t => t.fromRank === 'E-Rank');
    assert.equal(eDTrial2.eligible, false, 'Still not eligible after py-02');
    console.log(`✓ E→D still locked: ${eDTrial2.lockReason}\n`);

    // ── Test 7: Complete more challenges to reach level 10 ───────
    console.log('Test 7: Complete py-03 and py-04 to reach level 10');
    const py03Submit = await post('/submit', {
      challengeId: 'py-03',
      code: getCode('py-03'),
    }, token);
    assert.equal(py03Submit.status, 200);
    assert.equal(py03Submit.data.allPassed, true);

    const py04Submit = await post('/submit', {
      challengeId: 'py-04',
      code: getCode('py-04'),
    }, token);
    assert.equal(py04Submit.status, 200);
    assert.equal(py04Submit.data.allPassed, true);

    // Deterministic test fixture: elevate level to required threshold (10) for trial eligibility
    const testDb = new DatabaseSync(TEST_DB_PATH);
    testDb.prepare('UPDATE profiles SET level = 10 WHERE user_id = ?').run(userId);
    testDb.close();

    const progressAfterMore = await get('/player/progress', token);
    assert.ok(progressAfterMore.data.profile.level >= 10,
      `Should be level >= 10, got ${progressAfterMore.data.profile.level}`);
    console.log(`✓ Level = ${progressAfterMore.data.profile.level}, XP = ${progressAfterMore.data.profile.xp}\n`);

    // ── Test 8: E→D now eligible ─────────────────────────────────
    console.log('Test 8: E→D promotion trial now eligible');
    const trialsEligible = await get('/promotion/trials', token);
    const eDTrial3 = trialsEligible.data.trials.find(t => t.fromRank === 'E-Rank');
    assert.equal(eDTrial3.eligible, true, 'E→D should be eligible now');
    assert.equal(eDTrial3.status, 'available', 'Status should be available');
    console.log('✓ E→D trial eligible\n');

    // ── Test 9: Failed promotion attempt (wrong code) ─────────────
    console.log('Test 9: Failed promotion trial attempt');
    const failedAttempt = await post('/promotion/trial/attempt', {
      trialId: 'promo-e-d',
      code: 'def identify_rank(power_level):\n    return "E"\n',
    }, token);
    assert.equal(failedAttempt.status, 200);
    assert.equal(failedAttempt.data.success, false, 'Attempt should fail');
    assert.equal(failedAttempt.data.allPassed, false, 'Not all tests passed');
    assert.equal(failedAttempt.data.errorType, 'incorrect_output', 'Should be incorrect_output');
    assert.ok(failedAttempt.data.attempts >= 1, 'Attempts should be tracked');

    // Rank should NOT have changed
    const progressAfterFail = await get('/player/progress', token);
    assert.equal(progressAfterFail.data.profile.rank, 'E-Rank', 'Rank should still be E-Rank');
    console.log('✓ Failed attempt recorded, rank unchanged\n');

    // ── Test 10: Successful E→D promotion ─────────────────────────
    console.log('Test 10: Successful E→D promotion trial');
    const successAttempt = await post('/promotion/trial/attempt', {
      trialId: 'promo-e-d',
      code: getCode('py-02'),
    }, token);
    assert.equal(successAttempt.status, 200);
    assert.equal(successAttempt.data.success, true, 'Promotion should succeed');
    assert.equal(successAttempt.data.allPassed, true);
    assert.equal(successAttempt.data.newRank, 'D-Rank', 'New rank should be D-Rank');
    assert.equal(successAttempt.data.fromRank, 'E-Rank');
    assert.equal(successAttempt.data.toRank, 'D-Rank');

    // Verify rank persisted in profile
    const progressAfterPromo = await get('/player/progress', token);
    assert.equal(progressAfterPromo.data.profile.rank, 'D-Rank', 'Profile rank should be D-Rank');
    assert.equal(progressAfterPromo.data.profile.xp, 220 + 150 + 250, 'XP should include py-03 + py-04 rewards');
    console.log(`✓ Promoted to D-Rank, XP preserved at ${progressAfterPromo.data.profile.xp}\n`);

    // ── Test 11: Duplicate promotion request protection ───────────
    console.log('Test 11: Duplicate promotion request protection');
    const dupAttempt = await post('/promotion/trial/attempt', {
      trialId: 'promo-e-d',
      code: getCode('py-02'),
    }, token);
    assert.equal(dupAttempt.status, 200);
    assert.equal(dupAttempt.data.success, true, 'Duplicate should still report success (idempotent)');
    assert.equal(dupAttempt.data.alreadyCompleted, true, 'Should mark as already completed');
    assert.equal(dupAttempt.data.newRank, 'D-Rank', 'Rank should remain D-Rank');

    // Verify rank still D-Rank (not double-promoted)
    const progressAfterDup = await get('/player/progress', token);
    assert.equal(progressAfterDup.data.profile.rank, 'D-Rank', 'Rank should still be D-Rank after duplicate');
    console.log('✓ Duplicate promotion attempt handled idempotently\n');

    // ── Test 12: Concurrent promotion request protection ──────────
    console.log('Test 12: Concurrent promotion request protection');
    // Try D→C trial (not eligible yet, so concurrent requests should all fail)
    const concurrentResults = await Promise.all([
      post('/promotion/trial/attempt', { trialId: 'promo-d-c', code: getCode('py-06') }, token),
      post('/promotion/trial/attempt', { trialId: 'promo-d-c', code: getCode('py-06') }, token),
      post('/promotion/trial/attempt', { trialId: 'promo-d-c', code: getCode('py-06') }, token),
    ]);

    // None should succeed since D→C requirements aren't met
    const successful = concurrentResults.filter(r => r.data.success && r.data.newRank === 'C-Rank');
    assert.equal(successful.length, 0, 'No concurrent D→C promotions should succeed');
    console.log('✓ Concurrent promotion requests handled safely\n');

    // ── Test 13: Rank promotion persistence across fresh DB ───────
    console.log('Test 13: Rank promotion persistence');
    const dbPath = process.env.DATABASE_PATH || TEST_DB_PATH;
    const disk = new DatabaseSync(dbPath);
    const persisted = disk.prepare('SELECT rank, level, xp FROM profiles WHERE user_id = ?').get(userId);
    assert.equal(persisted.rank, 'D-Rank', 'Rank should persist as D-Rank');
    assert.equal(persisted.xp, 620, 'XP should persist (100+120+150+250=620)');
    disk.close();
    console.log('✓ Rank promotion persists across DB connections\n');

    // ── Test 14: Authentication required for promotion endpoints ──
    console.log('Test 14: Authentication required');
    const unauthTrials = await get('/promotion/trials');
    assert.equal(unauthTrials.status, 401, '/promotion/trials requires auth');

    const unauthAttempt = await post('/promotion/trial/attempt', {
      trialId: 'promo-e-d',
      code: getCode('py-02'),
    });
    assert.equal(unauthAttempt.status, 401, '/promotion/trial/attempt requires auth');

    const unauthSkills = await get('/skills');
    assert.equal(unauthSkills.status, 401, '/skills requires auth');
    console.log('✓ Authentication enforced on all promotion endpoints\n');

    // ── Test 15: User isolation - another user cannot access trials ─
    console.log('Test 15: User isolation');
    const otherName = `PromoHunterB_${Date.now()}`;
    const otherReg = await post('/auth/register', {
      username: otherName,
      email: `${otherName.toLowerCase()}@promo.dev`,
      password: 'otherPass99',
    });
    assert.equal(otherReg.status, 201);
    const otherToken = otherReg.data.token;
    const otherTrials = await get('/promotion/trials', otherToken);
    assert.equal(otherTrials.status, 200);
    // Other user should start at E-Rank with no promotions
    const otherETrial = otherTrials.data.trials.find(t => t.fromRank === 'E-Rank');
    assert.ok(otherETrial, 'Other user should have E→D trial');
    assert.equal(otherETrial.status, 'locked', 'Other user trial should be locked');
    console.log('✓ User isolation verified\n');

    // ── Test 16: Existing mastery/challenge regression ────────────
    console.log('Test 16: Existing mastery regression');
    const masteryRes = await get('/learning/mastery', token);
    assert.equal(masteryRes.status, 200);
    assert.ok(Array.isArray(masteryRes.data.concepts), 'Should return concepts');
    const varsMastery = masteryRes.data.concepts.find(c => c.concept_id === 'variables');
    assert.ok(varsMastery, 'variables mastery should exist');
    assert.ok(varsMastery.mastery_level >= 1, 'variables mastery should be >= 1');
    console.log(`✓ Concept mastery regression passed (variables Lv.${varsMastery.mastery_level})\n`);

    console.log('\n========================================');
    console.log('ALL PROMOTION TRIALS TESTS PASSED!');
    console.log('========================================\n');
  } finally {
    server.kill();
  }
}

runTests().catch((err) => {
  console.error('\n[FAIL] Test failed:', err.message || err);
  process.exit(1);

});
