import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { db } from '../server/db.mjs';

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

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function runTests() {
  console.log('--- Starting Backend Auth & Progression Test Suite ---');

  // Test 1: Health check
  console.log('Test 1: Health check');
  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.status, 'ok');
  console.log('✓ Health check passed');

  // Test 2: Invalid registration inputs
  console.log('Test 2: Invalid registration inputs');
  const shortPass = await post('/auth/register', { username: 'testuser', email: 'test@example.com', password: '123' });
  assert.equal(shortPass.status, 400);
  assert.match(shortPass.data.error, /at least 6 characters/);

  const badEmail = await post('/auth/register', { username: 'testuser', email: 'invalid-email', password: 'password123' });
  assert.equal(badEmail.status, 400);
  assert.match(badEmail.data.error, /valid email/);
  console.log('✓ Registration validation passed');

  // Test 3: Successful registration & password hashing
  console.log('Test 3: Successful registration and secure password hashing');
  const uniqueName = `Hunter_${Date.now()}`;
  const regRes = await post('/auth/register', {
    username: uniqueName,
    email: `${uniqueName.toLowerCase()}@hunter.dev`,
    password: 'securePassword99!',
  });
  assert.equal(regRes.status, 201);
  assert.ok(regRes.data.token, 'Session token should be returned');
  assert.equal(regRes.data.user.username, uniqueName);
  assert.equal(regRes.data.profile.level, 1);
  assert.equal(regRes.data.profile.xp, 0);

  // Security verify: Database must NEVER store plaintext password
  const userRow = db.prepare('SELECT password_hash, salt FROM users WHERE username = ?').get(uniqueName);
  assert.notEqual(userRow.password_hash, 'securePassword99!');
  assert.equal(userRow.password_hash.length, 128, 'scrypt 64-byte hex hash should be 128 characters');
  assert.ok(userRow.salt, 'Salt must be present');
  console.log('✓ Secure password hashing verified');

  // Test 4: Duplicate registration rejection
  console.log('Test 4: Duplicate registration rejection');
  const dupRes = await post('/auth/register', {
    username: uniqueName,
    email: `${uniqueName.toLowerCase()}@hunter.dev`,
    password: 'anotherPassword',
  });
  assert.equal(dupRes.status, 400);
  assert.match(dupRes.data.error, /already taken|already exists/);
  console.log('✓ Duplicate registration rejected');

  // Test 5: Login with correct & incorrect credentials
  console.log('Test 5: Login flows');
  const wrongPass = await post('/auth/login', {
    usernameOrEmail: uniqueName,
    password: 'wrongPassword',
  });
  assert.equal(wrongPass.status, 401);

  const goodLogin = await post('/auth/login', {
    usernameOrEmail: uniqueName,
    password: 'securePassword99!',
  });
  assert.equal(goodLogin.status, 200);
  assert.ok(goodLogin.data.token);
  const token = goodLogin.data.token;
  console.log('✓ Login verification passed');

  // Test 6: Protected route authorization checks
  console.log('Test 6: Protected route authorization checks');
  const noToken = await get('/auth/me');
  assert.equal(noToken.status, 401);

  const badToken = await get('/auth/me', 'invalid_token_12345');
  assert.equal(badToken.status, 401);

  const withToken = await get('/auth/me', token);
  assert.equal(withToken.status, 200);
  assert.equal(withToken.data.user.username, uniqueName);
  console.log('✓ Protected route checks passed');

  // Test 7: Run Code does NOT award XP
  console.log('Test 7: Run Code does NOT award XP');
  const runRes = await post('/run', {
    challengeId: 'py-01',
    code: 'def calculate_mana(base_mana, intellect):\n    return base_mana + intellect * 10',
  });
  assert.equal(runRes.status, 200);
  assert.equal(runRes.data.allPassed, true);
  assert.equal(runRes.data.xpReward, 0);

  // Verify XP on profile is still 0
  const profBefore = await get('/player/progress', token);
  assert.equal(profBefore.data.profile.xp, 0);
  console.log('✓ Run Code did not award XP');

  // Test 8: Submit Solution requires auth and awards XP on pass
  console.log('Test 8: Submit Solution requires auth and awards XP on pass');
  const unauthSubmit = await post('/submit', {
    challengeId: 'py-01',
    code: 'def calculate_mana(base_mana, intellect):\n    return base_mana + intellect * 10',
  });
  assert.equal(unauthSubmit.status, 401);

  const authSubmit = await post('/submit', {
    challengeId: 'py-01',
    code: 'def calculate_mana(base_mana, intellect):\n    return base_mana + intellect * 10',
  }, token);

  assert.equal(authSubmit.status, 200);
  assert.equal(authSubmit.data.allPassed, true);
  assert.equal(authSubmit.data.xpReward, 100);
  assert.equal(authSubmit.data.isDuplicate, false);
  assert.equal(authSubmit.data.player.xp, 100);

  // Verify hidden tests secrecy in response
  const hiddenTestResult = authSubmit.data.results.find((r) => r.isHidden);
  assert.ok(hiddenTestResult);
  assert.equal(hiddenTestResult.expected, '🔒 Hidden');
  assert.equal(hiddenTestResult.actual, '🔒 Passed');
  console.log('✓ Submission evaluation and XP awarded; hidden tests masked');

  // Test 9: Duplicate submission protection (Single-claim rule)
  console.log('Test 9: Duplicate submission protection');
  const dupSubmit = await post('/submit', {
    challengeId: 'py-01',
    code: 'def calculate_mana(base_mana, intellect):\n    return base_mana + intellect * 10',
  }, token);

  assert.equal(dupSubmit.status, 200);
  assert.equal(dupSubmit.data.allPassed, true);
  assert.equal(dupSubmit.data.isDuplicate, true, 'isDuplicate should be true');
  assert.equal(dupSubmit.data.xpReward, 0, 'No additional XP should be awarded');
  assert.equal(dupSubmit.data.player.xp, 100, 'XP should remain 100');
  console.log('✓ Duplicate submission prevented double XP');

  // Test 10: Concurrent submission race condition protection
  console.log('Test 10: Concurrent submissions race condition protection');
  // Attempt concurrent submissions on py-02
  const codePy02 = `def identify_rank(power_level):
    if power_level < 100: return 'E'
    elif power_level <= 249: return 'D'
    elif power_level <= 499: return 'C'
    elif power_level <= 999: return 'B'
    elif power_level <= 1999: return 'A'
    return 'S'`;

  const concurrentResults = await Promise.all([
    post('/submit', { challengeId: 'py-02', code: codePy02 }, token),
    post('/submit', { challengeId: 'py-02', code: codePy02 }, token),
    post('/submit', { challengeId: 'py-02', code: codePy02 }, token),
  ]);

  const nonDupClaims = concurrentResults.filter((r) => r.data.isDuplicate === false && r.data.xpReward > 0);
  assert.equal(nonDupClaims.length, 1, 'Exactly one concurrent submission must grant XP');

  const profAfter = await get('/player/progress', token);
  assert.equal(profAfter.data.profile.xp, 220, '100 (py-01) + 120 (py-02) = 220 XP');
  console.log('✓ Concurrent race condition handled atomically by database');

  // Test 11: Demo user seed verification
  console.log('Test 11: Demo user seed verification');
  const demoLogin = await post('/auth/login', {
    usernameOrEmail: 'ShadowMonarch',
    password: 'hunter123',
  });
  assert.equal(demoLogin.status, 200);
  assert.equal(demoLogin.data.user.username, 'ShadowMonarch');
  assert.equal(demoLogin.data.profile.rank, 'D-Rank');
  console.log('✓ Pre-seeded demo user verified');

  // Test 12: Logout invalidates the session
  console.log('Test 12: Logout invalidates session');
  const logoutRes = await post('/auth/logout', {}, token);
  assert.equal(logoutRes.status, 200);
  const afterLogout = await get('/auth/me', token);
  assert.equal(afterLogout.status, 401);
  const reLogin = await post('/auth/login', {
    usernameOrEmail: uniqueName,
    password: 'securePassword99!',
  });
  assert.equal(reLogin.status, 200);
  const token2 = reLogin.data.token;
  console.log('✓ Logout and session restoration passed');

  // Test 13: User isolation — another account cannot read this hunter's progress
  console.log('Test 13: User isolation');
  const otherName = `HunterB_${Date.now()}`;
  const otherReg = await post('/auth/register', {
    username: otherName,
    email: `${otherName.toLowerCase()}@hunter.dev`,
    password: 'otherPass99',
  });
  assert.equal(otherReg.status, 201);
  const otherToken = otherReg.data.token;
  const otherProgress = await get('/player/progress', otherToken);
  assert.equal(otherProgress.status, 200);
  assert.equal(otherProgress.data.profile.xp, 0);
  assert.equal(otherProgress.data.profile.user_id, otherReg.data.user.id);
  assert.notEqual(otherProgress.data.profile.user_id, reLogin.data.user.id);
  const originalProgress = await get('/player/progress', token2);
  assert.equal(originalProgress.data.profile.xp, 220);
  assert.equal(originalProgress.data.profile.user_id, reLogin.data.user.id);
  console.log('✓ Accounts cannot read each other\'s progression');

  // Test 14: Client-supplied XP/rank is ignored; server uses challenge registry
  console.log('Test 14: Client-supplied XP is ignored');
  const spoof = await post('/submit', {
    challengeId: 'py-03',
    code: `def format_item(name, rarity, quantity):
    return f"[{rarity.upper()}] {name.title()} x{quantity}"`,
    xp: 99999,
    xpReward: 99999,
    rank: 'Monarch',
    level: 100,
  }, otherToken);
  assert.equal(spoof.status, 200);
  assert.equal(spoof.data.allPassed, true);
  assert.equal(spoof.data.xpReward, 150);
  assert.equal(spoof.data.player.xp, 150);
  assert.notEqual(spoof.data.player.rank, 'Monarch');
  console.log('✓ Client-provided XP/rank ignored');

  // Test 15: Persistence via a fresh SQLite connection (simulates process restart)
  console.log('Test 15: Database persistence after reconnect');
  const dbPath = process.env.DATABASE_PATH || './data/shadow_code.db';
  const disk = new DatabaseSync(dbPath);
  const persisted = disk.prepare('SELECT xp, rank, quests_completed FROM profiles WHERE user_id = ?')
    .get(reLogin.data.user.id);
  assert.equal(persisted.xp, 220);
  assert.equal(persisted.quests_completed, 2);
  const pw = disk.prepare('SELECT password_hash FROM users WHERE id = ?').get(reLogin.data.user.id);
  assert.notEqual(pw.password_hash, 'securePassword99!');
  disk.close();
  console.log('✓ Progress persisted on disk and passwords remain hashed');

  // Test 16: Unauthorized progression endpoints
  console.log('Test 16: Unauthorized progression endpoints');
  const unauthProgress = await get('/player/progress');
  assert.equal(unauthProgress.status, 401);
  const unauthStart = await post('/player/quest/start', { questId: 'quest-001' });
  assert.equal(unauthStart.status, 401);
  console.log('✓ Unauthorized progression requests rejected');

  console.log('\n========================================');
  console.log('ALL BACKEND AUTH & PROGRESSION TESTS PASSED!');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
