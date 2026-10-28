/**
 * Backend Programming Dungeons & Boss Battles Test Suite
 *
 * Covers:
 *  1. Server start & isolated temporary SQLite database
 *  2. Unauthenticated access enforcement across all dungeon endpoints (401)
 *  3. Initial dungeon eligibility (dungeon-001 accessible, 002/003 locked)
 *  4. Locked dungeon rejection on start and submit (403)
 *  5. Stage sequencing (stage 2 and boss locked until stage 1 completed)
 *  6. Sample run execution (no XP, no completion recorded)
 *  7. Failed challenge submission (attempts tracked, no completion, no XP)
 *  8. Successful challenge progression (py-01 unlocks py-02)
 *  9. Second stage completion (py-02 unlocks py-03 Boss)
 * 10. Failed boss encounter (attempts incremented, boss remains alive, 0 XP)
 * 11. Boss victory (hidden tests passed, boss defeated, dungeon completed, 500 XP awarded)
 * 12. Bonus title award ('Gate Clearer' updated in profile)
 * 13. Idempotent duplicate submission protection (no duplicate XP on repeat boss clear)
 * 14. Concurrent boss reward claim protection (exactly-once XP under concurrency)
 * 15. Downstream dungeon unlocking (dungeon-002 becomes accessible after completing prereqs)
 * 16. User isolation (new user starts fresh, cannot access or see user A's dungeon progress)
 * 17. Database persistence across a fresh SQLite connection
 * 18. Clean shutdown & temporary database sidecar cleanup
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const TEST_DB_PATH = './data/test_backend_dungeons.db';
const BASE_URL = 'http://localhost:3001/api';

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function get(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method: 'GET', headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Clean up database files and sidecars
function cleanupTestDbFiles() {
  const files = [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`];
  for (const f of files) {
    try {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    } catch {}
  }
}

// Start test server with the dedicated test database
function startTestServer() {
  return new Promise((resolve, reject) => {
    cleanupTestDbFiles();

    const server = spawn('node', ['server/runner.mjs'], {
      env: {
        ...process.env,
        DATABASE_PATH: TEST_DB_PATH,
        PORT: '3001',
        HOST: '0.0.0.0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let started = false;
    server.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Backend listening') && !started) {
        started = true;
        setTimeout(() => resolve(server), 400);
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
  };
  return codes[challengeId] || 'pass\n';
}

async function runTests() {
  console.log('--- Starting Backend Dungeons & Boss Battles Test Suite ---\n');
  const server = await startTestServer();
  console.log('✓ Test server started with dedicated SQLite database\n');

  try {
    // ── Test 1: Authentication enforcement across all dungeon endpoints ──
    console.log('Test 1: Unauthenticated requests rejected');
    const unauthList = await get('/dungeons');
    assert.equal(unauthList.status, 401, 'GET /dungeons requires auth');

    const unauthDetail = await get('/dungeons/dungeon-001');
    assert.equal(unauthDetail.status, 401, 'GET /dungeons/:id requires auth');

    const unauthStart = await post('/dungeons/dungeon-001/start', {});
    assert.equal(unauthStart.status, 401, 'POST /dungeons/:id/start requires auth');

    const unauthRun = await post('/dungeons/dungeon-001/challenge/py-01/run', { code: 'pass' });
    assert.equal(unauthRun.status, 401, 'POST run requires auth');

    const unauthSubmit = await post('/dungeons/dungeon-001/challenge/py-01/submit', { code: 'pass' });
    assert.equal(unauthSubmit.status, 401, 'POST submit requires auth');
    console.log('✓ Authentication verified on all dungeon endpoints (401)\n');

    // ── Test 2: User registration & initial dungeon accessibility ─────────
    console.log('Test 2: Register user and verify initial dungeon states');
    const userAName = `DungeonHunterA_${Date.now()}`;
    const regRes = await post('/auth/register', {
      username: userAName,
      email: `${userAName.toLowerCase()}@hunter.dev`,
      password: 'dungeonPassword123!',
    });
    assert.equal(regRes.status, 201, 'User A registered successfully');
    const tokenA = regRes.data.token;
    const userIdA = regRes.data.user.id;

    const listRes = await get('/dungeons', tokenA);
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.data.dungeons), 'Returns dungeons array');
    assert.equal(listRes.data.dungeons.length, 3, 'Returns 3 defined dungeons');

    const d1 = listRes.data.dungeons.find((d) => d.id === 'dungeon-001');
    const d2 = listRes.data.dungeons.find((d) => d.id === 'dungeon-002');
    const d3 = listRes.data.dungeons.find((d) => d.id === 'dungeon-003');

    assert.ok(d1, 'dungeon-001 exists');
    assert.equal(d1.isAccessible, true, 'dungeon-001 should be accessible to new E-Rank hunter');
    assert.equal(d1.status, 'available', 'dungeon-001 should be available');
    assert.equal(d1.xpReward, 500, 'dungeon-001 reward is 500 XP');

    assert.ok(d2, 'dungeon-002 exists');
    assert.equal(d2.isAccessible, false, 'dungeon-002 should be locked (needs py-01..py-03)');
    assert.equal(d2.status, 'locked', 'dungeon-002 status is locked');
    assert.match(d2.lockReason, /prerequisite/i, 'lockReason describes prerequisites');

    assert.ok(d3, 'dungeon-003 exists');
    assert.equal(d3.isAccessible, false, 'dungeon-003 should be locked (needs D-Rank)');
    assert.match(d3.lockReason, /D-Rank/i, 'lockReason requires D-Rank');
    console.log('✓ Initial dungeon accessibility verified\n');

    // ── Test 3: Locked dungeon entry rejection ─────────────────────────────
    console.log('Test 3: Ineligible dungeon start rejected server-side');
    const startLocked = await post('/dungeons/dungeon-002/start', {}, tokenA);
    assert.equal(startLocked.status === 400 || startLocked.status === 403, true, 'Starting locked dungeon rejected');

    const submitLockedDungeon = await post(
      '/dungeons/dungeon-002/challenge/py-04/submit',
      { code: 'pass' },
      tokenA
    );
    assert.equal(submitLockedDungeon.status, 403, 'Submitting to locked dungeon rejected with 403');
    console.log('✓ Ineligible dungeon entry rejected\n');

    // ── Test 4: Challenge sequencing & skipping rejection ──────────────────
    console.log('Test 4: Challenge sequence enforcement');
    // In dungeon-001, stage 1 is py-01 (available), stage 2 is py-02 (locked), stage 3 is py-03 (locked boss)
    const d1Detail = await get('/dungeons/dungeon-001', tokenA);
    assert.equal(d1Detail.status, 200);
    const stages = d1Detail.data.dungeon.challenges;
    assert.equal(stages[0].status, 'available', 'Stage 1 (py-01) should be available');
    assert.equal(stages[1].status, 'locked', 'Stage 2 (py-02) should be locked');
    assert.equal(stages[2].status, 'locked', 'Boss (py-03) should be locked');

    // Attempting to submit stage 2 before stage 1
    const skipToStage2 = await post(
      '/dungeons/dungeon-001/challenge/py-02/submit',
      { code: getCode('py-02') },
      tokenA
    );
    assert.equal(skipToStage2.status, 403, 'Skipping to stage 2 rejected with 403');

    // Attempting to submit boss before stage 1
    const skipToBoss = await post(
      '/dungeons/dungeon-001/challenge/py-03/submit',
      { code: getCode('py-03') },
      tokenA
    );
    assert.equal(skipToBoss.status, 403, 'Skipping to boss rejected with 403');
    console.log('✓ Challenge sequence enforced: skips rejected\n');

    // ── Test 5: Start dungeon and run code ──────────────────────────────────
    console.log('Test 5: Start dungeon and sample code run');
    const startD1 = await post('/dungeons/dungeon-001/start', {}, tokenA);
    assert.equal(startD1.status, 200);
    assert.equal(startD1.data.success, true);
    assert.equal(startD1.data.dungeon.status, 'in-progress');

    // Run code does not grant XP or mark complete
    const runResult = await post(
      '/dungeons/dungeon-001/challenge/py-01/run',
      { code: getCode('py-01') },
      tokenA
    );
    assert.equal(runResult.status, 200);
    assert.equal(runResult.data.allPassed, true);
    assert.equal(runResult.data.isSubmission, false);
    assert.equal(runResult.data.xpReward, 0);

    const d1AfterRun = await get('/dungeons/dungeon-001', tokenA);
    assert.equal(
      d1AfterRun.data.dungeon.challenges[0].status,
      'available',
      'Run code should NOT complete the stage'
    );
    console.log('✓ Sample run tested: no completion or XP granted\n');

    // ── Test 6: Failed submission handling ─────────────────────────────────
    console.log('Test 6: Failed submission handles attempts without completing stage');
    const failedSubmit = await post(
      '/dungeons/dungeon-001/challenge/py-01/submit',
      { code: 'def calculate_mana(base_mana, intellect):\n    return 0\n' },
      tokenA
    );
    assert.equal(failedSubmit.status, 200);
    assert.equal(failedSubmit.data.allPassed, false);
    assert.equal(failedSubmit.data.xpReward, 0);

    const d1AfterFail = await get('/dungeons/dungeon-001', tokenA);
    const stage1AfterFail = d1AfterFail.data.dungeon.challenges[0];
    assert.equal(stage1AfterFail.status, 'available', 'Failed stage remains available');
    assert.equal(stage1AfterFail.attempts >= 1, true, 'Attempt count incremented');
    console.log('✓ Failed submission recorded attempts without granting progression\n');

    // ── Test 7: Stage 1 completion unlocks Stage 2 ──────────────────────────
    console.log('Test 7: Complete Stage 1 and unlock Stage 2');
    const stage1Submit = await post(
      '/dungeons/dungeon-001/challenge/py-01/submit',
      { code: getCode('py-01') },
      tokenA
    );
    assert.equal(stage1Submit.status, 200);
    assert.equal(stage1Submit.data.allPassed, true);
    assert.equal(stage1Submit.data.nextUnlocked, 'py-02', 'Next unlocked should be py-02');

    const d1AfterStage1 = await get('/dungeons/dungeon-001', tokenA);
    const s1 = d1AfterStage1.data.dungeon.challenges.find((c) => c.id === 'py-01');
    const s2 = d1AfterStage1.data.dungeon.challenges.find((c) => c.id === 'py-02');
    const s3 = d1AfterStage1.data.dungeon.challenges.find((c) => c.id === 'py-03');
    assert.equal(s1.status, 'completed', 'Stage 1 marked completed');
    assert.equal(s2.status, 'available', 'Stage 2 unlocked to available');
    assert.equal(s3.status, 'locked', 'Boss remains locked');
    console.log('✓ Stage 1 completed and Stage 2 unlocked\n');

    // ── Test 8: Stage 2 completion unlocks Boss ────────────────────────────
    console.log('Test 8: Complete Stage 2 and unlock Boss battle');
    const stage2Submit = await post(
      '/dungeons/dungeon-001/challenge/py-02/submit',
      { code: getCode('py-02') },
      tokenA
    );
    assert.equal(stage2Submit.status, 200);
    assert.equal(stage2Submit.data.allPassed, true);
    assert.equal(stage2Submit.data.nextUnlocked, 'py-03', 'Next unlocked should be py-03 (Boss)');

    const d1AfterStage2 = await get('/dungeons/dungeon-001', tokenA);
    const bossBeforeFight = d1AfterStage2.data.dungeon.challenges.find((c) => c.id === 'py-03');
    assert.equal(bossBeforeFight.status, 'available', 'Boss encounter is now available');
    assert.equal(bossBeforeFight.isBoss, true, 'Boss flag is true');
    console.log('✓ Stage 2 completed and Boss battle unlocked\n');

    // ── Test 9: Failed Boss Attempt ─────────────────────────────────────────
    console.log('Test 9: Failed boss encounter tracking');
    const bossFail = await post(
      '/dungeons/dungeon-001/challenge/py-03/submit',
      { code: 'def format_item(name, rarity, quantity):\n    return "WRONG"\n' },
      tokenA
    );
    assert.equal(bossFail.status, 200);
    assert.equal(bossFail.data.allPassed, false);
    assert.equal(bossFail.data.xpReward, 0);

    const d1AfterBossFail = await get('/dungeons/dungeon-001', tokenA);
    const bossAfterFail = d1AfterBossFail.data.dungeon.challenges.find((c) => c.id === 'py-03');
    assert.equal(bossAfterFail.status, 'available', 'Boss remains available to retry');
    assert.equal(bossAfterFail.attempts >= 1, true, 'Boss attempts tracked');
    assert.equal(d1AfterBossFail.data.dungeon.status, 'in-progress', 'Dungeon remains in-progress');
    console.log('✓ Failed boss attempt recorded properly\n');

    // ── Test 10: Boss Victory & Dungeon Completion ──────────────────────────
    console.log('Test 10: Defeat Boss, complete dungeon, and claim rewards');
    const initialProg = await get('/player/progress', tokenA);
    const initialXp = initialProg.data.profile.xp;

    const bossVictory = await post(
      '/dungeons/dungeon-001/challenge/py-03/submit',
      { code: getCode('py-03') },
      tokenA
    );
    assert.equal(bossVictory.status, 200);
    assert.equal(bossVictory.data.allPassed, true);
    assert.equal(bossVictory.data.dungeonComplete, true, 'Dungeon marked complete');
    assert.equal(bossVictory.data.isBoss, true, 'Is boss encounter');
    assert.equal(bossVictory.data.dungeonXpAwarded, 500, 'Awarded 500 dungeon XP');
    assert.equal(bossVictory.data.bonusTitle, 'Gate Clearer', 'Awarded Gate Clearer title');

    // Verify player profile has received XP and bonus title
    const progAfterVictory = await get('/player/progress', tokenA);
    assert.equal(
      progAfterVictory.data.profile.xp,
      initialXp + 500,
      `XP should have increased by 500: from ${initialXp} to ${initialXp + 500}`
    );
    assert.equal(
      progAfterVictory.data.profile.title,
      'Gate Clearer',
      'Player title updated to bonusTitle'
    );

    // Verify dungeon state
    const d1Final = await get('/dungeons/dungeon-001', tokenA);
    assert.equal(d1Final.data.dungeon.status, 'completed', 'Dungeon status is completed');
    assert.equal(d1Final.data.dungeon.progressPercent, 100, 'Dungeon progress is 100%');
    console.log('✓ Boss defeated! 500 XP and "Gate Clearer" title awarded\n');

    // ── Test 11: Idempotent duplicate submission protection ────────────────
    console.log('Test 11: Duplicate boss submission grants 0 additional XP');
    const dupBossSubmit = await post(
      '/dungeons/dungeon-001/challenge/py-03/submit',
      { code: getCode('py-03') },
      tokenA
    );
    assert.equal(dupBossSubmit.status, 200);
    assert.equal(dupBossSubmit.data.isDuplicate, true, 'Challenge marked as duplicate');
    assert.equal(dupBossSubmit.data.dungeonXpAwarded, 0, 'No additional dungeon XP on duplicate');

    const progAfterDup = await get('/player/progress', tokenA);
    assert.equal(
      progAfterDup.data.profile.xp,
      progAfterVictory.data.profile.xp,
      'XP unchanged on duplicate'
    );
    console.log('✓ Exactly-once reward guard verified: no duplicate XP\n');

    // ── Test 12: Concurrent reward claims protection ───────────────────────
    console.log('Test 12: Concurrent reward claim idempotency');
    const userConcurrentName = `ConcurrentHunter_${Date.now()}`;
    const concReg = await post('/auth/register', {
      username: userConcurrentName,
      email: `${userConcurrentName.toLowerCase()}@hunter.dev`,
      password: 'password123!',
    });
    assert.equal(concReg.status, 201);
    const concToken = concReg.data.token;

    // Complete stage 1 and 2
    await post('/dungeons/dungeon-001/start', {}, concToken);
    await post('/dungeons/dungeon-001/challenge/py-01/submit', { code: getCode('py-01') }, concToken);
    await post('/dungeons/dungeon-001/challenge/py-02/submit', { code: getCode('py-02') }, concToken);

    // Send 3 concurrent winning submissions for the boss
    const concurrentResults = await Promise.all([
      post('/dungeons/dungeon-001/challenge/py-03/submit', { code: getCode('py-03') }, concToken),
      post('/dungeons/dungeon-001/challenge/py-03/submit', { code: getCode('py-03') }, concToken),
      post('/dungeons/dungeon-001/challenge/py-03/submit', { code: getCode('py-03') }, concToken),
    ]);

    const xpAwards = concurrentResults.map((r) => r.data.dungeonXpAwarded || 0);
    const nonZeroAwards = xpAwards.filter((x) => x > 0);
    assert.equal(nonZeroAwards.length, 1, 'Exactly one concurrent request was awarded XP');
    assert.equal(nonZeroAwards[0], 500, 'Awarded amount is 500');

    const concProg = await get('/player/progress', concToken);
    assert.equal(concProg.data.profile.xp, 500, 'Total user XP is exactly 500 (not duplicated)');
    console.log('✓ Concurrent claims handled safely: exactly one winner\n');

    // ── Test 13: Downstream dungeon unlocking ──────────────────────────────
    console.log('Test 13: Downstream dungeon unlocks upon meeting prerequisites');
    // User A has mastered py-01, py-02, py-03 in dungeon 1
    // Dungeon 2 requires py-01, py-02, py-03 and E-Rank
    const listAfterD1 = await get('/dungeons', tokenA);
    const d2AfterD1 = listAfterD1.data.dungeons.find((d) => d.id === 'dungeon-002');
    assert.equal(
      d2AfterD1.isAccessible,
      true,
      'dungeon-002 should now be accessible to User A'
    );
    assert.equal(d2AfterD1.status, 'available', 'dungeon-002 status is available');

    // User A can now start dungeon-002
    const startD2 = await post('/dungeons/dungeon-002/start', {}, tokenA);
    assert.equal(startD2.status, 200, 'User A can start dungeon-002');
    console.log('✓ Downstream dungeon-002 unlocked and started\n');

    // ── Test 14: User isolation ────────────────────────────────────────────
    console.log('Test 14: User isolation: User B cannot access User A progress');
    const userBName = `DungeonHunterB_${Date.now()}`;
    const regB = await post('/auth/register', {
      username: userBName,
      email: `${userBName.toLowerCase()}@hunter.dev`,
      password: 'passwordB99!',
    });
    assert.equal(regB.status, 201);
    const tokenB = regB.data.token;

    const listB = await get('/dungeons', tokenB);
    const d1ForB = listB.data.dungeons.find((d) => d.id === 'dungeon-001');
    const d2ForB = listB.data.dungeons.find((d) => d.id === 'dungeon-002');

    assert.equal(d1ForB.status, 'available', 'User B dungeon-001 is available (not completed)');
    assert.equal(d1ForB.progressPercent, 0, 'User B progress is 0%');
    assert.equal(d1ForB.challenges[0].status, 'available', 'User B stage 1 available');
    assert.equal(d1ForB.challenges[1].status, 'locked', 'User B stage 2 locked');
    assert.equal(d1ForB.challenges[2].status, 'locked', 'User B boss locked');
    assert.equal(d2ForB.isAccessible, false, 'User B dungeon-002 is still locked');
    console.log('✓ User isolation verified\n');

    // ── Test 15: Database persistence across fresh SQLite connection ───────
    console.log('Test 15: Direct SQLite database verification');
    const directDb = new DatabaseSync(TEST_DB_PATH);
    const dpRow = directDb
      .prepare('SELECT status FROM dungeon_progress WHERE user_id = ? AND dungeon_id = ?')
      .get(userIdA, 'dungeon-001');
    assert.ok(dpRow, 'dungeon_progress row exists');
    assert.equal(dpRow.status, 'completed', 'Persisted dungeon status is completed');

    const txRows = directDb
      .prepare('SELECT amount FROM dungeon_xp_transactions WHERE user_id = ? AND dungeon_id = ?')
      .all(userIdA, 'dungeon-001');
    assert.equal(txRows.length, 1, 'Exactly one dungeon_xp_transactions row persisted');
    assert.equal(txRows[0].amount, 500, 'Persisted transaction amount is 500');

    const profRow = directDb
      .prepare('SELECT title, xp FROM profiles WHERE user_id = ?')
      .get(userIdA);
    assert.equal(profRow.title, 'Gate Clearer', 'Persisted title is Gate Clearer');
    assert.ok(profRow.xp >= 500, 'Persisted XP reflects reward');
    directDb.close();
    console.log('✓ SQLite database persistence verified\n');

    console.log('================================================');
    console.log('ALL BACKEND DUNGEONS & BOSS BATTLES TESTS PASSED!');
    console.log('================================================\n');
  } finally {
    server.kill();
    cleanupTestDbFiles();
  }
}

runTests().catch((err) => {
  console.error('\n[FAIL] Test failed:', err.message || err);
  cleanupTestDbFiles();
  process.exit(1);
});
