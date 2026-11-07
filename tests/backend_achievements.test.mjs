/**
 * Backend Achievements, Titles & Hunter Collection Test Suite
 *
 * Covers:
 *  1. Server start & isolated temporary SQLite database
 *  2. Unauthenticated access enforcement across all achievement & title endpoints (401)
 *  3. Initial achievements and titles state for a newly registered hunter
 *  4. Rejection of premature / unearned achievement claims (400)
 *  5. Progress updates, percentage calculations, and remaining requirement text
 *  6. Server-side eligibility check, auto-unlocking, and title grant
 *  7. Exactly-once XP reward and duplicate claim protection
 *  8. Concurrent claim protection (single-winner idempotency)
 *  9. Title ownership verification and equipping
 * 10. Rejection of unowned titles and malformed title equip requests
 * 11. Title unequipping (reset to default Novice Hunter)
 * 12. Integration with dungeon rewards (Gate Clearer title & dungeon achievements)
 * 13. User isolation (separate progress, titles, and achievements)
 * 14. Direct SQLite database persistence verification across connections
 * 15. Clean shutdown & temporary database sidecar cleanup
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const TEST_DB_PATH = './data/test_backend_achievements.db';
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
  console.log('--- Starting Backend Achievements, Titles & Hunter Collection Test Suite ---\n');
  const server = await startTestServer();
  console.log('✓ Test server started with dedicated SQLite database\n');

  try {
    // ── Test 1: Authentication enforcement ───────────────────────────────────
    console.log('Test 1: Unauthenticated requests rejected (401)');
    const unauthAch = await get('/achievements');
    assert.equal(unauthAch.status, 401, 'GET /achievements requires auth');

    const unauthCheck = await post('/achievements/check', {});
    assert.equal(unauthCheck.status, 401, 'POST /achievements/check requires auth');

    const unauthClaim = await post('/achievements/ach_first_spell/claim', {});
    assert.equal(unauthClaim.status, 401, 'POST /achievements/:id/claim requires auth');

    const unauthTitles = await get('/titles');
    assert.equal(unauthTitles.status, 401, 'GET /titles requires auth');

    const unauthEquip = await post('/titles/equip', { title: 'Novice Hunter' });
    assert.equal(unauthEquip.status, 401, 'POST /titles/equip requires auth');

    const unauthUnequip = await post('/titles/unequip', {});
    assert.equal(unauthUnequip.status, 401, 'POST /titles/unequip requires auth');
    console.log('✓ Authentication verified across all achievement & title endpoints (401)\n');

    // ── Test 2: Register user and verify initial achievement catalog ────────
    console.log('Test 2: Register user and verify initial achievements & titles catalog');
    const userAName = `AchHunterA_${Date.now()}`;
    const regRes = await post('/auth/register', {
      username: userAName,
      email: `${userAName.toLowerCase()}@hunter.dev`,
      password: 'passwordHunter123!',
    });
    assert.equal(regRes.status, 201, 'User A registered successfully');
    const tokenA = regRes.data.token;
    const userIdA = regRes.data.user.id;

    const achRes = await get('/achievements', tokenA);
    assert.equal(achRes.status, 200, 'GET /achievements returns 200');
    assert.ok(Array.isArray(achRes.data.achievements), 'Achievements array returned');
    assert.equal(achRes.data.achievements.length, 20, 'Returns full catalog of 20 achievements');
    assert.equal(achRes.data.categories.length, 5, 'Returns 5 categories');
    assert.equal(achRes.data.stats.total, 20, 'Stats total is 20');
    assert.equal(achRes.data.stats.unlockedCount, 0, 'Initial unlocked count is 0');
    assert.equal(achRes.data.stats.totalXpEarned, 0, 'Initial achievement XP is 0');

    // Verify initial titles
    const titlesRes = await get('/titles', tokenA);
    assert.equal(titlesRes.status, 200, 'GET /titles returns 200');
    assert.ok(Array.isArray(titlesRes.data.titles), 'Titles array returned');
    assert.equal(titlesRes.data.titles.length, 1, 'Initial user has 1 title');
    assert.equal(titlesRes.data.titles[0].title, 'Novice Hunter', 'Default title is Novice Hunter');
    assert.equal(titlesRes.data.titles[0].isEquipped, true, 'Novice Hunter is equipped');
    assert.equal(titlesRes.data.equippedTitle, 'Novice Hunter', 'Equipped title is Novice Hunter');
    console.log('✓ Initial achievements & titles state verified (20 achievements, 1 default title)\n');

    // ── Test 3: Rejection of unearned achievement claims ─────────────────────
    console.log('Test 3: Rejection of unearned achievement claim');
    const prematureClaim = await post('/achievements/ach_tenacious_coder/claim', {}, tokenA);
    assert.equal(prematureClaim.status, 400, 'Premature claim rejected with 400');
    assert.match(prematureClaim.data.error, /requirements not met/i, 'Error message indicates requirements');
    assert.ok(prematureClaim.data.remainingRequirement, 'Returns remainingRequirement');

    const invalidClaim = await post('/achievements/ach_non_existent/claim', {}, tokenA);
    assert.equal(invalidClaim.status, 400, 'Unknown achievement claim rejected');
    console.log('✓ Server-side rejection of unearned achievement claims verified\n');

    // ── Test 4: Progress updates and locked achievements ────────────────────
    console.log('Test 4: Progress calculations and locked states');
    const firstSpell = achRes.data.achievements.find((a) => a.id === 'ach_first_spell');
    assert.equal(firstSpell.isUnlocked, false);
    assert.equal(firstSpell.progress, 0);
    assert.equal(firstSpell.target, 1);
    assert.equal(firstSpell.xpReward, 100);
    assert.equal(firstSpell.titleReward, 'Initiate');
    assert.match(firstSpell.remainingRequirement, /master 1 challenge/i);

    const level5Ach = achRes.data.achievements.find((a) => a.id === 'ach_level_5');
    assert.equal(level5Ach.isUnlocked, false);
    assert.equal(level5Ach.progress, 1); // User is level 1
    assert.equal(level5Ach.target, 5);
    assert.match(level5Ach.remainingRequirement, /reach level 5/i);
    console.log('✓ Progress calculations and locked state metadata verified\n');

    // ── Test 5: Server-side eligibility check, unlock, and title grant ─────
    console.log('Test 5: Completing a challenge unlocks achievement and awards title');
    const initialProg = await get('/player/progress', tokenA);
    const initialXp = initialProg.data.profile.xp;

    // Submit challenge py-01 (100 XP base reward)
    const subRes = await post(
      '/submit',
      { challengeId: 'py-01', code: getCode('py-01') },
      tokenA
    );
    assert.equal(subRes.status, 200);
    assert.equal(subRes.data.allPassed, true);
    const questXp = subRes.data.xpReward;
    assert.ok(questXp > 0, 'Challenge awarded quest XP');

    // Check achievements
    const achAfterSubmit = await get('/achievements', tokenA);
    assert.equal(achAfterSubmit.status, 200);
    const unlockedFirstSpell = achAfterSubmit.data.achievements.find((a) => a.id === 'ach_first_spell');
    assert.equal(unlockedFirstSpell.isUnlocked, true, 'First Spell is now unlocked');
    assert.equal(unlockedFirstSpell.progress, 1, 'Progress is 1/1');
    assert.equal(unlockedFirstSpell.progressPercent, 100, 'Progress percent is 100%');
    assert.equal(unlockedFirstSpell.remainingRequirement, 'Completed');

    // First challenge also unlocks first skill node (variables) -> ach_first_skill
    const unlockedFirstSkill = achAfterSubmit.data.achievements.find((a) => a.id === 'ach_first_skill');
    assert.equal(unlockedFirstSkill.isUnlocked, true, 'First Skill node is also unlocked');

    assert.ok(achAfterSubmit.data.stats.unlockedCount >= 2, 'Unlocked count incremented');
    const totalAchXp = achAfterSubmit.data.stats.totalXpEarned;
    assert.equal(totalAchXp, 200, 'Achievement XP earned is 200 (100 from first spell + 100 from first skill)');

    // Verify profile received achievement XP (+200 XP)
    const progAfterAch = await get('/player/progress', tokenA);
    const expectedXp = initialXp + questXp + totalAchXp;
    assert.equal(
      progAfterAch.data.profile.xp,
      expectedXp,
      `XP must be ${expectedXp} (initial ${initialXp} + quest ${questXp} + ach ${totalAchXp})`
    );

    // Verify 'Initiate' title was granted
    const titlesAfterUnlock = await get('/titles', tokenA);
    assert.ok(titlesAfterUnlock.data.titles.length >= 2, 'User owns at least 2 titles');
    const initiateTitle = titlesAfterUnlock.data.titles.find((t) => t.title === 'Initiate');
    assert.ok(initiateTitle, 'Initiate title is in owned titles list');
    assert.equal(initiateTitle.source, 'achievement');
    assert.equal(initiateTitle.isEquipped, false);
    console.log('✓ Achievement auto-unlocked on server, XP awarded, and "Initiate" title granted\n');

    // ── Test 6: Exactly-once XP reward and duplicate protection ────────────
    console.log('Test 6: Idempotent duplicate check grants 0 additional XP');
    const xpBeforeRepeat = (await get('/player/progress', tokenA)).data.profile.xp;

    // Repeated GET /achievements
    const repeatGet = await get('/achievements', tokenA);
    assert.equal(repeatGet.status, 200);
    assert.equal(repeatGet.data.newlyUnlocked.length, 0, 'No newly unlocked on repeat');

    // Repeated POST /achievements/check
    const repeatCheck = await post('/achievements/check', {}, tokenA);
    assert.equal(repeatCheck.status, 200);
    assert.equal(repeatCheck.data.unlocked.length, 0, 'No newly unlocked on repeat check');

    // Repeated explicit claim
    const repeatClaim = await post('/achievements/ach_first_spell/claim', {}, tokenA);
    assert.equal(repeatClaim.status, 200);
    assert.equal(repeatClaim.data.alreadyClaimed, true, 'alreadyClaimed is true');
    assert.equal(repeatClaim.data.xpAwarded, 0, '0 additional XP awarded');

    const xpAfterRepeat = (await get('/player/progress', tokenA)).data.profile.xp;
    assert.equal(xpAfterRepeat, xpBeforeRepeat, 'Total user XP remains strictly unchanged');
    console.log('✓ Exactly-once XP guarantee verified: repeat calls award 0 XP\n');

    // ── Test 7: Concurrent reward requests protection ───────────────────────
    console.log('Test 7: Concurrent reward request protection (single-winner idempotency)');
    const userCName = `ConcHunter_${Date.now()}`;
    const regC = await post('/auth/register', {
      username: userCName,
      email: `${userCName.toLowerCase()}@hunter.dev`,
      password: 'passwordConc99!',
    });
    assert.equal(regC.status, 201);
    const tokenC = regC.data.token;

    // Complete py-01
    await post('/submit', { challengeId: 'py-01', code: getCode('py-01') }, tokenC);

    // Fire 4 concurrent requests to claim/check ach_first_spell
    const concurrentResponses = await Promise.all([
      post('/achievements/ach_first_spell/claim', {}, tokenC),
      post('/achievements/ach_first_spell/claim', {}, tokenC),
      post('/achievements/check', {}, tokenC),
      get('/achievements', tokenC),
    ]);

    // Check that all requests succeeded (200)
    for (const res of concurrentResponses) {
      assert.equal(res.status, 200, 'Concurrent response status 200');
    }

    // Check that achievement was unlocked exactly once in the database
    const directDbConc = new DatabaseSync(TEST_DB_PATH);
    const uachRows = directDbConc
      .prepare('SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?')
      .all(regC.data.user.id, 'ach_first_spell');
    assert.equal(uachRows.length, 1, 'Exactly one user_achievements row persisted');

    // Check that exactly one transaction was recorded in xp_transactions
    const xpTxRows = directDbConc
      .prepare("SELECT * FROM xp_transactions WHERE user_id = ? AND quest_id = 'ach_ach_first_spell'")
      .all(regC.data.user.id);
    assert.equal(xpTxRows.length, 1, 'Exactly one xp_transactions record created');
    assert.equal(xpTxRows[0].amount, 100, 'Transaction amount is 100');
    directDbConc.close();
    console.log('✓ Concurrent reward requests handled safely: single winner\n');

    // ── Test 8: Title ownership and equipping ───────────────────────────────
    console.log('Test 8: Title equipping and ownership');
    const equipRes = await post('/titles/equip', { title: 'Initiate' }, tokenA);
    assert.equal(equipRes.status, 200, 'POST /titles/equip returns 200');
    assert.equal(equipRes.data.success, true);
    assert.equal(equipRes.data.title, 'Initiate');
    assert.equal(equipRes.data.profile.title, 'Initiate');

    // Verify with GET /titles
    const titlesAfterEquip = await get('/titles', tokenA);
    assert.equal(titlesAfterEquip.data.equippedTitle, 'Initiate');
    const initiateRow = titlesAfterEquip.data.titles.find((t) => t.title === 'Initiate');
    const noviceRow = titlesAfterEquip.data.titles.find((t) => t.title === 'Novice Hunter');
    assert.equal(initiateRow.isEquipped, true, 'Initiate is now marked equipped');
    assert.equal(noviceRow.isEquipped, false, 'Novice Hunter is no longer equipped');

    // Verify with GET /player/progress
    const progAfterEquip = await get('/player/progress', tokenA);
    assert.equal(progAfterEquip.data.profile.title, 'Initiate');
    console.log('✓ Title successfully equipped and updated across profile and title endpoints\n');

    // ── Test 9: Rejection of unowned titles and malformed requests ──────────
    console.log('Test 9: Rejection of unowned titles and malformed equip requests');
    const unownedEquip1 = await post('/titles/equip', { title: 'Shadow Monarch' }, tokenA);
    assert.equal(unownedEquip1.status, 400, 'Equipping unowned title returns 400');
    assert.match(unownedEquip1.data.error, /do not own/i);

    const unownedEquip2 = await post('/titles/equip', { title: 'Grand Arcanist' }, tokenA);
    assert.equal(unownedEquip2.status, 400);

    const emptyEquip = await post('/titles/equip', {}, tokenA);
    assert.equal(emptyEquip.status, 400, 'Empty title returns 400');

    // Verify title remains unchanged
    const progAfterRejection = await get('/player/progress', tokenA);
    assert.equal(progAfterRejection.data.profile.title, 'Initiate', 'Title remains unchanged');
    console.log('✓ Rejection of unowned titles and malformed equip requests verified\n');

    // ── Test 10: Title unequipping (reset to Novice Hunter) ──────────────────
    console.log('Test 10: Title unequipping');
    const unequipRes = await post('/titles/unequip', {}, tokenA);
    assert.equal(unequipRes.status, 200);
    assert.equal(unequipRes.data.success, true);
    assert.equal(unequipRes.data.title, 'Novice Hunter');
    assert.equal(unequipRes.data.profile.title, 'Novice Hunter');

    const titlesAfterUnequip = await get('/titles', tokenA);
    assert.equal(titlesAfterUnequip.data.equippedTitle, 'Novice Hunter');
    console.log('✓ Title unequipped and reset to Novice Hunter\n');

    // ── Test 11: Integration with dungeon rewards & "Gate Clearer" ──────────
    console.log('Test 11: Dungeon completion unlocks "Gate Clearer" title and dungeon achievements');
    // Start dungeon-001
    const startDungeonRes = await post('/dungeons/dungeon-001/start', {}, tokenA);
    assert.equal(startDungeonRes.status, 200);

    // Verify ach_gate_explorer is unlocked
    const achAfterDungeonStart = await get('/achievements', tokenA);
    const gateExplorer = achAfterDungeonStart.data.achievements.find((a) => a.id === 'ach_gate_explorer');
    assert.equal(gateExplorer.isUnlocked, true, 'ach_gate_explorer is unlocked after starting dungeon');

    // Submit stage 1 in dungeon (py-01)
    const stage1Res = await post(
      '/dungeons/dungeon-001/challenge/py-01/submit',
      { code: getCode('py-01') },
      tokenA
    );
    assert.equal(stage1Res.status, 200);
    assert.equal(stage1Res.data.allPassed, true);

    // Submit stage 2 in dungeon (py-02)
    const stage2Res = await post(
      '/dungeons/dungeon-001/challenge/py-02/submit',
      { code: getCode('py-02') },
      tokenA
    );
    assert.equal(stage2Res.status, 200);
    assert.equal(stage2Res.data.allPassed, true);

    // Defeat boss py-03 in dungeon-001 -> completes dungeon and awards bonusTitle 'Gate Clearer'
    const bossRes = await post(
      '/dungeons/dungeon-001/challenge/py-03/submit',
      { code: getCode('py-03') },
      tokenA
    );
    assert.equal(bossRes.status, 200);
    assert.equal(bossRes.data.dungeonComplete, true);
    assert.equal(bossRes.data.bonusTitle, 'Gate Clearer');

    // Check achievements after dungeon complete
    const achAfterDungeonClear = await get('/achievements', tokenA);
    const firstBoss = achAfterDungeonClear.data.achievements.find((a) => a.id === 'ach_first_boss');
    const awakeningGate = achAfterDungeonClear.data.achievements.find((a) => a.id === 'ach_awakening_gate');
    assert.equal(firstBoss.isUnlocked, true, 'ach_first_boss unlocked');
    assert.equal(awakeningGate.isUnlocked, true, 'ach_awakening_gate unlocked');

    // Check titles after dungeon complete -> 'Gate Clearer' must be in owned titles
    const titlesAfterDungeon = await get('/titles', tokenA);
    const gateClearerTitle = titlesAfterDungeon.data.titles.find((t) => t.title === 'Gate Clearer');
    assert.ok(gateClearerTitle, '"Gate Clearer" is present in owned titles');
    assert.equal(gateClearerTitle.source, 'dungeon');

    // User A can equip 'Gate Clearer'
    const equipGateClearer = await post('/titles/equip', { title: 'Gate Clearer' }, tokenA);
    assert.equal(equipGateClearer.status, 200);
    assert.equal(equipGateClearer.data.profile.title, 'Gate Clearer');
    console.log('✓ Dungeon integration verified: "Gate Clearer" title and dungeon achievements unlocked and equipable\n');

    // ── Test 12: User isolation ─────────────────────────────────────────────
    console.log('Test 12: User isolation (User B starts with 0 achievements and cannot equip User A titles)');
    const userBName = `AchHunterB_${Date.now()}`;
    const regB = await post('/auth/register', {
      username: userBName,
      email: `${userBName.toLowerCase()}@hunter.dev`,
      password: 'passwordHunterB99!',
    });
    assert.equal(regB.status, 201);
    const tokenB = regB.data.token;

    const achB = await get('/achievements', tokenB);
    assert.equal(achB.data.stats.unlockedCount, 0, 'User B has 0 unlocked achievements');

    const titlesB = await get('/titles', tokenB);
    assert.equal(titlesB.data.titles.length, 1, 'User B owns only default title');
    assert.equal(titlesB.data.titles[0].title, 'Novice Hunter');

    // User B attempts to equip User A's earned titles
    const bEquipInitiate = await post('/titles/equip', { title: 'Initiate' }, tokenB);
    assert.equal(bEquipInitiate.status, 400, 'User B cannot equip User A Initiate title');

    const bEquipGateClearer = await post('/titles/equip', { title: 'Gate Clearer' }, tokenB);
    assert.equal(bEquipGateClearer.status, 400, 'User B cannot equip User A Gate Clearer title');
    console.log('✓ User isolation verified: titles and achievement progression strictly isolated\n');

    // ── Test 13: Direct SQLite database persistence verification ───────────
    console.log('Test 13: Direct SQLite database verification');
    const directDb = new DatabaseSync(TEST_DB_PATH);

    // Verify user_achievements table
    const persistedUachRows = directDb
      .prepare('SELECT achievement_id, xp_awarded FROM user_achievements WHERE user_id = ?')
      .all(userIdA);
    assert.ok(persistedUachRows.length >= 3, 'Persisted user_achievements rows exist for User A');
    const firstSpellRow = persistedUachRows.find((r) => r.achievement_id === 'ach_first_spell');
    assert.ok(firstSpellRow, 'ach_first_spell row persisted');
    assert.equal(firstSpellRow.xp_awarded, 100, 'xp_awarded persisted as 100');

    // Verify user_titles table
    const utRows = directDb
      .prepare('SELECT title, source FROM user_titles WHERE user_id = ?')
      .all(userIdA);
    assert.ok(utRows.length >= 3, 'Persisted user_titles rows exist for User A');
    assert.ok(utRows.some((r) => r.title === 'Novice Hunter'));
    assert.ok(utRows.some((r) => r.title === 'Initiate'));
    assert.ok(utRows.some((r) => r.title === 'Gate Clearer'));

    // Verify profiles table
    const profileRow = directDb
      .prepare('SELECT title FROM profiles WHERE user_id = ?')
      .get(userIdA);
    assert.equal(profileRow.title, 'Gate Clearer', 'Persisted profile title is Gate Clearer');

    directDb.close();
    console.log('✓ SQLite database persistence verified across independent connections\n');

    console.log('=================================================================');
    console.log('ALL BACKEND ACHIEVEMENTS, TITLES & HUNTER COLLECTION TESTS PASSED!');
    console.log('=================================================================\n');
  } finally {
    if (server) {
      server.kill();
      await new Promise((r) => setTimeout(r, 300));
    }
    cleanupTestDbFiles();
  }
}

runTests().catch((err) => {
  console.error('\n[FAIL] Test failed:', err.message || err);
  cleanupTestDbFiles();
  process.exit(1);
});
