/**
 * Backend Mastery & Prerequisites Test Suite
 *
 * Covers:
 *  1. Prerequisite enforcement blocks submission before mastery
 *  2. /learning/prerequisites reflects per-user state
 *  3. Successful challenge submission records challenge_mastery
 *  4. Concept mastery updated on challenge completion
 *  5. Prerequisites met after mastering required challenge
 *  6. Subsequent challenge unlocked and awards XP
 *  7. Duplicate-XP protection (no double rewards)
 *  8. /learning/mastery returns authenticated per-user concepts
 *  9. /learning/mastery requires authentication
 * 10. /learning/lesson returns lesson without hidden/sample tests
 * 11. Practice challenge prereqs met after main challenge
 * 12. Practice challenge awards 0 XP, returns masteryMessage
 * 13. Concept mastery level increases after practice
 * 14. Mastery persists across fresh DB connections
 * 15. Second-tier challenge accessible after first-tier mastered
 * 16. Total XP integrity
 * 17. /learning/lesson 404 for unknown challenge
 * 18. Error type categorization from run endpoint
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

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

// Solution code objects — avoids complex inline escaping
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

    'py-01-practice': [
      'def calculate_mana_surge(base_mana, intellect_bonus, surge_multiplier):',
      '    return base_mana + (intellect_bonus * surge_multiplier * 10)',
    ].join('\n'),

    'py-02-practice': [
      'def identify_elite_rank(power_level):',
      "    if power_level < 100: return 'E'",
      "    elif power_level < 250: return 'D'",
      "    elif power_level < 500: return 'C'",
      "    elif power_level < 750: return 'B'",
      "    elif power_level < 1000: return 'A'",
      "    elif power_level < 2000: return 'S'",
      "    return 'SS'",
    ].join('\n'),
  };
  return codes[challengeId] || '';
}

async function runTests() {
  console.log('--- Starting Backend Mastery & Prerequisites Test Suite ---\n');

  // ── Register a fresh test hunter ──────────────────────────────
  const uniqueName = `MasteryHunter_${Date.now()}`;
  const regRes = await post('/auth/register', {
    username: uniqueName,
    email: `${uniqueName.toLowerCase()}@mastery.dev`,
    password: 'masteryPass99!',
  });
  assert.equal(regRes.status, 201, 'Registration should succeed');
  const token = regRes.data.token;
  const userId = regRes.data.user.id;
  console.log(`Registered test user: ${uniqueName} (${userId})\n`);

  // ── Test 1: Prerequisites block py-02 before py-01 is mastered ─
  console.log('Test 1: Prerequisites block submission before prereqs mastered');
  const blockedSubmit = await post('/submit', {
    challengeId: 'py-02',
    code: getCode('py-02'),
  }, token);
  assert.equal(blockedSubmit.status, 403, 'Should be 403 Forbidden');
  assert.equal(blockedSubmit.data.code, 'PREREQUISITES_NOT_MET');
  assert.ok(Array.isArray(blockedSubmit.data.unmetPrerequisites));
  assert.ok(blockedSubmit.data.unmetPrerequisites.includes('py-01'));
  console.log('✓ Prerequisites enforcement blocks py-02 before py-01 mastered\n');

  // ── Test 2: /learning/prerequisites reflects unmastered state ──
  console.log('Test 2: /api/learning/prerequisites reflects unmet state');
  const prereqCheck = await get('/learning/prerequisites?challengeId=py-02', token);
  assert.equal(prereqCheck.status, 200);
  assert.equal(prereqCheck.data.hasPrerequisites, false, 'Should not be met yet');
  assert.deepEqual(prereqCheck.data.prerequisiteIds, ['py-01']);
  console.log('✓ /api/learning/prerequisites correctly shows unmet prerequisites\n');

  // ── Test 3: Submit py-01 — records challenge mastery ──────────
  console.log('Test 3: Submitting py-01 records challenge mastery');
  const py01Submit = await post('/submit', {
    challengeId: 'py-01',
    code: getCode('py-01'),
  }, token);
  assert.equal(py01Submit.status, 200);
  assert.equal(py01Submit.data.allPassed, true);
  assert.equal(py01Submit.data.xpReward, 100, 'py-01 should award 100 XP');
  assert.equal(py01Submit.data.isDuplicate, false);

  const dbPath = process.env.DATABASE_PATH || './data/shadow_code.db';
  const disk = new DatabaseSync(dbPath);
  const cmRow = disk.prepare(
    'SELECT * FROM challenge_mastery WHERE user_id = ? AND challenge_id = ?'
  ).get(userId, 'py-01');
  assert.ok(cmRow, 'challenge_mastery row should exist for py-01');
  assert.ok(cmRow.mastered_at, 'mastered_at should be set');
  console.log('✓ challenge_mastery row created for py-01\n');

  // ── Test 4: Concept mastery updated on completion ─────────────
  console.log('Test 4: Concept mastery updated on challenge completion');
  const concRow = disk.prepare(
    'SELECT * FROM concept_mastery WHERE user_id = ? AND concept_id = ?'
  ).get(userId, 'variables');
  assert.ok(concRow, 'concept_mastery row should exist for "variables"');
  assert.ok(concRow.mastery_level >= 1, `Expected mastery_level >= 1, got ${concRow.mastery_level}`);
  assert.equal(concRow.practice_count, 1, 'practice_count should be 1 after first completion');
  console.log(`✓ Concept mastery "variables" at level ${concRow.mastery_level}\n`);

  // ── Test 5: Prerequisites now met for py-02 ───────────────────
  console.log('Test 5: /api/learning/prerequisites shows py-02 prereqs met after py-01');
  const prereqAfter = await get('/learning/prerequisites?challengeId=py-02', token);
  assert.equal(prereqAfter.status, 200);
  assert.equal(prereqAfter.data.hasPrerequisites, true, 'Should be met now');
  console.log('✓ /api/learning/prerequisites correctly reports met prerequisites\n');

  // ── Test 6: py-02 now succeeds ────────────────────────────────
  console.log('Test 6: py-02 submission succeeds after py-01 mastered');
  const py02Submit = await post('/submit', {
    challengeId: 'py-02',
    code: getCode('py-02'),
  }, token);
  assert.equal(py02Submit.status, 200);
  assert.equal(py02Submit.data.allPassed, true);
  assert.equal(py02Submit.data.xpReward, 120, 'py-02 should award 120 XP');
  const progressAfterPy02 = await get('/player/progress', token);
  assert.equal(progressAfterPy02.data.profile.xp, 220, 'Total XP should be 220');
  console.log('✓ py-02 submission succeeds, XP = 220\n');

  // ── Test 7: Duplicate XP protection ──────────────────────────
  console.log('Test 7: Duplicate submission does NOT award XP again');
  const py01Dup = await post('/submit', {
    challengeId: 'py-01',
    code: getCode('py-01'),
  }, token);
  assert.equal(py01Dup.data.isDuplicate, true, 'Second submission should be duplicate');
  assert.equal(py01Dup.data.xpReward, 0, 'Duplicate awards 0 XP');
  const progressAfterDup = await get('/player/progress', token);
  assert.equal(progressAfterDup.data.profile.xp, 220, 'XP unchanged at 220');
  console.log('✓ Duplicate submission prevented, XP remains 220\n');

  // ── Test 8: /learning/mastery returns per-user concepts ───────
  console.log('Test 8: /api/learning/mastery returns authenticated concept mastery');
  const masteryRes = await get('/learning/mastery', token);
  assert.equal(masteryRes.status, 200);
  assert.ok(Array.isArray(masteryRes.data.concepts), 'Should return concepts array');
  const varsMastery = masteryRes.data.concepts.find((c) => c.concept_id === 'variables');
  assert.ok(varsMastery, '"variables" should be in mastery list');
  assert.ok(varsMastery.mastery_level >= 1);
  const condMastery = masteryRes.data.concepts.find((c) => c.concept_id === 'conditionals');
  assert.ok(condMastery, '"conditionals" should be in mastery list');
  console.log(`✓ /api/learning/mastery returned ${masteryRes.data.concepts.length} concepts\n`);

  // ── Test 9: /learning/mastery requires authentication ─────────
  console.log('Test 9: /api/learning/mastery requires authentication');
  const unauthMastery = await get('/learning/mastery');
  assert.equal(unauthMastery.status, 401);
  console.log('✓ /api/learning/mastery properly requires authentication\n');

  // ── Test 10: /learning/lesson — no hidden/sample tests exposed ─
  console.log('Test 10: /api/learning/lesson returns lesson without hidden tests');
  const lessonRes = await get('/learning/lesson?challengeId=py-01');
  assert.equal(lessonRes.status, 200);
  assert.ok(lessonRes.data.lesson, 'lesson field should be present');
  assert.ok(lessonRes.data.lesson.conceptExplanation);
  assert.ok(lessonRes.data.lesson.codeExample);
  assert.ok(lessonRes.data.lesson.workedExample);
  assert.ok(Array.isArray(lessonRes.data.lesson.commonMistakes));
  assert.ok(Array.isArray(lessonRes.data.lesson.progressiveHints));
  assert.equal(lessonRes.data.hiddenTests, undefined, 'Hidden tests must NOT be in response');
  assert.equal(lessonRes.data.sampleTests, undefined, 'Sample tests must NOT be in response');
  console.log('✓ /api/learning/lesson returns lesson with no test exposure\n');

  // ── Test 11: Practice prereqs met after main challenge ────────
  console.log('Test 11: Practice challenge prereqs met after main challenge mastered');
  const practPrereq = await get('/learning/prerequisites?challengeId=py-01-practice', token);
  assert.equal(practPrereq.status, 200);
  assert.equal(practPrereq.data.hasPrerequisites, true);
  console.log('✓ py-01-practice prerequisites met after py-01\n');

  // ── Test 12: Practice awards 0 XP, returns masteryMessage ─────
  console.log('Test 12: Practice challenge awards 0 XP and returns masteryMessage');
  const practSubmit = await post('/submit', {
    challengeId: 'py-01-practice',
    code: getCode('py-01-practice'),
  }, token);
  assert.equal(practSubmit.status, 200);
  assert.equal(practSubmit.data.allPassed, true);
  assert.equal(practSubmit.data.xpReward, 0, 'Practice awards 0 XP');
  assert.equal(practSubmit.data.isPractice, true);
  assert.ok(practSubmit.data.masteryMessage, 'masteryMessage should be present');
  const progAfterPractice = await get('/player/progress', token);
  assert.equal(progAfterPractice.data.profile.xp, 220, 'XP unchanged after practice');
  console.log('✓ Practice: 0 XP, masteryMessage present, XP still 220\n');

  // ── Test 13: Concept mastery level increases after practice ───
  console.log('Test 13: Concept mastery level increases to target after practice');
  const concAfter = disk.prepare(
    'SELECT * FROM concept_mastery WHERE user_id = ? AND concept_id = ?'
  ).get(userId, 'variables');
  assert.ok(concAfter.mastery_level >= 3,
    `Expected mastery_level >= 3 after practice, got ${concAfter.mastery_level}`);
  assert.ok(concAfter.practice_count >= 2,
    `Expected practice_count >= 2, got ${concAfter.practice_count}`);
  console.log(`✓ Concept "variables" mastery_level=${concAfter.mastery_level}, practice_count=${concAfter.practice_count}\n`);

  // ── Test 14: Mastery persists across fresh DB connection ───────
  console.log('Test 14: Concept mastery persists across fresh DB connections');
  const disk2 = new DatabaseSync(dbPath);
  const persisted = disk2.prepare(
    'SELECT concept_id, mastery_level, practice_count FROM concept_mastery WHERE user_id = ?'
  ).all(userId);
  assert.ok(persisted.length >= 2, 'Should have at least 2 concept mastery records');
  const pv = persisted.find((c) => c.concept_id === 'variables');
  assert.ok(pv && pv.mastery_level >= 3, 'variables mastery should persist at >= 3');
  disk2.close();
  console.log('✓ Concept mastery persists across independent DB connections\n');

  // ── Test 15: py-03 accessible after py-01 mastered ────────────
  console.log('Test 15: py-03 accessible after py-01 mastered (prerequisite chain)');
  const py03Pre = await get('/learning/prerequisites?challengeId=py-03', token);
  assert.equal(py03Pre.data.hasPrerequisites, true);
  const py03Submit = await post('/submit', {
    challengeId: 'py-03',
    code: getCode('py-03'),
  }, token);
  assert.equal(py03Submit.status, 200);
  assert.equal(py03Submit.data.allPassed, true);
  assert.equal(py03Submit.data.xpReward, 150);
  console.log('✓ py-03 accessible and awards 150 XP\n');

  // ── Test 16: Total XP integrity ───────────────────────────────
  console.log('Test 16: Total XP integrity');
  const finalProg = await get('/player/progress', token);
  assert.equal(finalProg.data.profile.xp, 370, 'Expected 100+120+150=370 XP');
  assert.equal(finalProg.data.profile.quests_completed, 3);
  console.log(`✓ Total XP = ${finalProg.data.profile.xp} (100+120+150=370), quests_completed=3\n`);

  // ── Test 17: /learning/lesson 404 for unknown challenge ───────
  console.log('Test 17: /api/learning/lesson returns 404 for unknown challenge');
  const notFound = await get('/learning/lesson?challengeId=py-999');
  assert.equal(notFound.status, 404);
  assert.ok(notFound.data.error);
  console.log('✓ /api/learning/lesson returns 404 for unknown challenge\n');

  // ── Test 18: Error type categorization from run endpoint ──────
  console.log('Test 18: Error type categorization from /run endpoint');
  const wrongOutputRun = await post('/run', {
    challengeId: 'py-01',
    code: ['def calculate_mana(base_mana, intellect):', '    return 0'].join('\n'),
  });
  assert.equal(wrongOutputRun.status, 200);
  assert.equal(wrongOutputRun.data.allPassed, false);
  // Verify it reports as failed (not crashed)
  assert.equal(wrongOutputRun.data.success, true, 'Run should succeed but tests fail');
  console.log('✓ Error type categorization: wrong output detected without crash\n');

  disk.close();

  console.log('========================================');
  console.log('ALL MASTERY & PREREQUISITES TESTS PASSED!');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('\n[FAIL] Test failed:', err.message || err);
  process.exit(1);
});
