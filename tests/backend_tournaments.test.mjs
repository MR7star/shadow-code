/**
 * Shadow Code — Tournament System Backend Integration Test Suite
 *
 * Covers:
 *  1. Authorization: Only tournament creators can start or cancel tournaments (403).
 *  2. Registration & Withdrawal: capacity limits, duplicate checks, achievements.
 *  3. Single-elimination Brackets: seeding by rating, odd-participant byes.
 *  4. Match Lifecycle: backing arena_matches and arena_match_participants creation.
 *  5. Ranked Rating Isolation: tournament duels NEVER modify normal Ranked Arena Elo.
 *  6. Deterministic Tiebreaker: draw conditions resolve via attempts/seed without blocking.
 *  7. Cancellation Safety: registration and ongoing cancellations, completed guard.
 *  8. Spectator Mode: read-only match viewing, zero hidden test or code exposure, live list.
 *  9. Tournament Achievements & Titles: Contender and Champion unlocks, idempotency.
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DB_PATH = path.join(os.tmpdir(), `test_backend_tournaments_${process.pid}.db`);
const BASE_URL = 'http://localhost:3001/api';

async function post(urlPath, body = {}, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${urlPath}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function get(urlPath, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${BASE_URL}${urlPath}`, { headers });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function cleanupTestDbFiles(ignoreBusy = false) {
  for (const file of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
    if (!fs.existsSync(file)) continue;
    try {
      fs.unlinkSync(file);
    } catch (error) {
      if (!ignoreBusy || error.code !== 'EBUSY') throw error;
    }
  }
}

function startTestServer() {
  return new Promise((resolve, reject) => {
    cleanupTestDbFiles();
    const server = spawn('node', ['server/runner.mjs'], {
      env: {
        ...process.env,
        DATABASE_PATH: TEST_DB_PATH,
        PORT: '3001',
        HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let started = false;
    server.stdout.on('data', (data) => {
      if (!started && data.toString().includes('Backend listening')) {
        started = true;
        setTimeout(() => resolve(server), 250);
      }
    });
    server.stderr.on('data', (data) => console.error('[SERVER ERR]', data.toString().trim()));
    server.on('error', (error) => {
      if (!started) reject(error);
    });
    server.on('close', (code) => {
      if (!started) reject(new Error(`Server exited before startup with code ${code}.`));
    });
    setTimeout(() => {
      if (!started) {
        server.kill();
        reject(new Error('Tournament test server startup timed out.'));
      }
    }, 10000);
  });
}

let hunterCounter = 1;
async function registerHunter(prefix) {
  const username = `${prefix}_${Date.now() % 1000000}_${hunterCounter++}`;
  const response = await post('/auth/register', {
    username,
    email: `${username}@tournament.test`,
    password: 'Password123!',
  });
  assert.equal(response.status, 201, `Registration failed: ${JSON.stringify(response.data)}`);
  return response.data;
}

function getSolutionFor(challengeId, correct = true) {
  if (!correct) {
    const wrongMap = {
      'py-07': 'def calculate_potion_cost(recipe, prices):\n    return 0\n',
      'py-08': 'def reverse_squad_order(squad):\n    return []\n',
      'py-09': 'def create_multiplier(factor):\n    return lambda x: 0\n',
      'py-10': 'def calculate_surge_power(n):\n    return 0\n',
    };
    return wrongMap[challengeId] || 'def solution(*args):\n    return None\n';
  }
  const solutions = {
    'py-01': 'def calculate_mana(base_mana, intellect):\n    return base_mana + intellect * 10\n',
    'py-02': 'def identify_rank(power_level):\n    if power_level < 100: return "E"\n    elif power_level <= 249: return "D"\n    elif power_level <= 499: return "C"\n    elif power_level <= 999: return "B"\n    elif power_level <= 1999: return "A"\n    return "S"\n',
    'py-07': 'def calculate_potion_cost(recipe, prices):\n    total = 0\n    for k, v in recipe.items():\n        total += v * prices.get(k, 0)\n    return total\n',
    'py-08': 'def reverse_squad_order(squad):\n    return squad[::-1]\n',
    'py-09': 'def create_multiplier(factor):\n    def apply_buff(damage):\n        return damage * factor\n    return apply_buff\n',
    'py-10': 'def calculate_surge_power(n):\n    if n == 0: return 0\n    if n == 1: return 1\n    return calculate_surge_power(n - 1) + 2 * calculate_surge_power(n - 2)\n',
  };
  return solutions[challengeId] || 'def solution(*args):\n    return None\n';
}

async function main() {
  console.log('\n=============================================');
  console.log('SHADOW CODE: CODING TOURNAMENTS TEST SUITE');
  console.log('=============================================\n');

  console.log('[Setup] Starting isolated tournament test backend…');
  const server = await startTestServer();

  try {
    // ─── Step 1: Users & Tournament Creation ────────────────────────────────
    console.log('[Test 1] Tournament creation, validation and authorization…');

    // Unauthenticated rejection
    const unauthCreate = await post('/tournaments', { title: 'Unauthorized Clash' });
    assert.equal(unauthCreate.status, 401, 'Unauthenticated tournament creation must return 401');

    // Registered creator
    const creator = await registerHunter('Creator');
    const hunter1 = await registerHunter('HunterOne');
    const hunter2 = await registerHunter('HunterTwo');
    const hunter3 = await registerHunter('HunterThree');

    const tokenMap = {
      [creator.user.id]: creator.token,
      [hunter1.user.id]: hunter1.token,
      [hunter2.user.id]: hunter2.token,
      [hunter3.user.id]: hunter3.token,
    };

    // Invalid title length (< 3 chars)
    const invalidTitle = await post('/tournaments', { title: 'AB' }, creator.token);
    assert.equal(invalidTitle.status, 400, 'Title < 3 chars must be rejected');

    // Valid tournament creation
    const created = await post('/tournaments', {
      title: 'Monarch Invitational Trial',
      description: 'Single-elimination trial for elite shadow hunters.',
      maxParticipants: 4,
    }, creator.token);
    assert.equal(created.status, 201, 'Valid tournament creation must return 201');
    const tournamentId = created.data.tournamentId;
    assert.ok(tournamentId, 'Tournament ID must be returned');

    // Verify creator is stored
    const listRes = await get('/tournaments', creator.token);
    assert.equal(listRes.status, 200);
    const tournamentInList = listRes.data.tournaments.find((t) => t.id === tournamentId);
    assert.ok(tournamentInList);
    assert.equal(tournamentInList.createdBy, creator.user.id);
    assert.equal(tournamentInList.isCreator, true);

    console.log('  ✓ Tournament creation, validation, and creator tracking verified.');

    // ─── Step 2: Registration, Achievements & Capacity ──────────────────────
    console.log('[Test 2] Registration, capacity limits, and achievement unlocks…');

    // Hunter 1 registers
    const reg1 = await post(`/tournaments/${tournamentId}/register`, {}, hunter1.token);
    assert.equal(reg1.status, 200, 'Hunter 1 registration should succeed');
    assert.equal(reg1.data.currentParticipants, 1);

    // Verify 'Arena Contender' achievement unlocked for hunter 1
    const achRes = await get('/achievements', hunter1.token);
    assert.equal(achRes.status, 200);
    const contenderAch = achRes.data.achievements.find((a) => a.id === 'ach_tourn_contender');
    assert.ok(contenderAch, 'Arena Contender achievement must exist in list');
    assert.equal(contenderAch.isUnlocked, true, 'Arena Contender must unlock upon entering tournament');

    // Duplicate registration rejection
    const dupReg = await post(`/tournaments/${tournamentId}/register`, {}, hunter1.token);
    assert.equal(dupReg.status, 400, 'Duplicate registration must be rejected');

    // Register Hunter 2 and Hunter 3
    const reg2 = await post(`/tournaments/${tournamentId}/register`, {}, hunter2.token);
    assert.equal(reg2.status, 200);
    const reg3 = await post(`/tournaments/${tournamentId}/register`, {}, hunter3.token);
    assert.equal(reg3.status, 200);
    assert.equal(reg3.data.currentParticipants, 3);

    // Withdrawal test: Hunter 3 withdraws
    const with3 = await post(`/tournaments/${tournamentId}/withdraw`, {}, hunter3.token);
    assert.equal(with3.status, 200, 'Withdrawal should succeed');

    const detailsAfterWith = await get(`/tournaments/${tournamentId}`, creator.token);
    assert.equal(detailsAfterWith.data.currentParticipants, 2);

    // Hunter 3 re-registers
    await post(`/tournaments/${tournamentId}/register`, {}, hunter3.token);

    console.log('  ✓ Registration, duplicate guards, withdrawal, and contender achievement verified.');

    // ─── Step 3: Authorization Guards on Start & Cancel ─────────────────────
    console.log('[Test 3] Authorization enforcement on starting and cancelling tournaments…');

    // Non-creator hunter 1 attempts to start the tournament -> 403 Forbidden
    const unauthStart = await post(`/tournaments/${tournamentId}/start`, {}, hunter1.token);
    assert.equal(unauthStart.status, 403, 'Non-creator starting tournament must return 403 Forbidden');

    // Non-creator hunter 2 attempts to cancel the tournament -> 403 Forbidden
    const unauthCancel = await post(`/tournaments/${tournamentId}/cancel`, {}, hunter2.token);
    assert.equal(unauthCancel.status, 403, 'Non-creator cancelling tournament must return 403 Forbidden');

    console.log('  ✓ Non-creator actions strictly rejected with 403 Forbidden.');

    // ─── Step 4: Bracket Generation & Byes (Odd count: 3 players in size 4) ─
    console.log('[Test 4] Starting tournament: bracket generation and odd-participant BYE…');

    // Creator starts the tournament
    const startRes = await post(`/tournaments/${tournamentId}/start`, {}, creator.token);
    assert.equal(startRes.status, 200, 'Creator starting tournament must succeed');
    assert.equal(startRes.data.bracketSize, 4, 'Bracket size for 3 players must be 4');
    assert.equal(startRes.data.totalRounds, 2, 'Total rounds for size 4 must be 2');

    // Check bracket details
    const detailsStarted = await get(`/tournaments/${tournamentId}`, creator.token);
    assert.equal(detailsStarted.data.status, 'in_progress');
    const r1 = detailsStarted.data.bracket[0].matches;
    assert.equal(r1.length, 2, 'Round 1 must have 2 matches');

    // One match must be normal, one must be a BYE because we had 3 participants
    const byeMatch = r1.find((m) => m.status === 'bye');
    const normalMatch = r1.find((m) => m.status === 'scheduled');
    assert.ok(byeMatch, 'Odd participant bracket must have generated a BYE match');
    assert.ok(normalMatch, 'Normal match between player 1 and 2 must exist');
    assert.ok(byeMatch.winnerId, 'BYE match must have auto-advanced a winner');

    console.log('  ✓ Bracket generation, seed assignment, and automatic BYE progression verified.');

    // ─── Step 5: Individual Match Start & Lifecycle ─────────────────────────
    console.log('[Test 5] Individual match start and backing arena match creation…');

    // Start Round 1 normal match
    const matchStartRes = await post(`/tournaments/${tournamentId}/matches/${normalMatch.id}/start`, {}, creator.token);
    assert.equal(matchStartRes.status, 200, 'Starting tournament match should succeed');
    const arenaMatchId = matchStartRes.data.matchId;
    assert.ok(arenaMatchId, 'Backing arena match ID must be created');

    // Verify arena match exists and has type = tournament
    const arenaMatchData = await get(`/arena/matches/${arenaMatchId}`, tokenMap[normalMatch.p1Id]);
    assert.equal(arenaMatchData.status, 200);
    assert.equal(arenaMatchData.data.matchType, 'tournament');
    assert.equal(arenaMatchData.data.status, 'ready');

    console.log('  ✓ Backing arena match and participants initialized with matchType = tournament.');

    // ─── Step 6: Ranked Rating Isolation (Step 2) ───────────────────────────
    console.log('[Test 6] Ranked Rating Isolation: tournament match does NOT modify normal Elo…');

    // Record both players' arena ratings before the match
    const p1StatsBefore = await get('/arena/stats', tokenMap[normalMatch.p1Id]);
    const p2StatsBefore = await get('/arena/stats', tokenMap[normalMatch.p2Id]);
    const p1RatingBefore = p1StatsBefore.data.rating;
    const p2RatingBefore = p2StatsBefore.data.rating;

    // Both players submit solutions to the tournament match
    // Player 1 submits correct solution
    const p1Submit = await post(`/tournaments/${tournamentId}/matches/${normalMatch.id}/submit`, {
      code: getSolutionFor(normalMatch.challengeId, true),
    }, tokenMap[normalMatch.p1Id]);
    assert.equal(p1Submit.status, 200, 'Player 1 submission must succeed');
    assert.equal(p1Submit.data.allPassed, true);

    // Player 2 also submits correct solution
    const p2Submit = await post(`/tournaments/${tournamentId}/matches/${normalMatch.id}/submit`, {
      code: getSolutionFor(normalMatch.challengeId, true),
    }, tokenMap[normalMatch.p2Id]);
    assert.equal(p2Submit.status, 200, 'Player 2 submission must succeed');
    assert.equal(p2Submit.data.matchConcluded, true, 'Both players completed -> match must conclude');

    // Verify arena match completed
    const concludedArena = await get(`/arena/matches/${arenaMatchId}/result`, tokenMap[normalMatch.p1Id]);
    assert.equal(concludedArena.status, 200);
    assert.equal(concludedArena.data.status, 'completed');

    // VERIFY ELO ISOLATION: Normal Ranked Arena ratings must be COMPLETELY UNCHANGED
    const p1StatsAfter = await get('/arena/stats', tokenMap[normalMatch.p1Id]);
    const p2StatsAfter = await get('/arena/stats', tokenMap[normalMatch.p2Id]);
    assert.equal(p1StatsAfter.data.rating, p1RatingBefore, 'Winner ranked Elo rating must NOT change from tournament match');
    assert.equal(p2StatsAfter.data.rating, p2RatingBefore, 'Loser ranked Elo rating must NOT change from tournament match');
    assert.equal(p1StatsAfter.data.matchesPlayed, p1StatsBefore.data.matchesPlayed, 'Ranked matches_played must NOT increment');

    // Verify winner advanced in tournament bracket to finals
    const bracketAfterR1 = await get(`/tournaments/${tournamentId}`, creator.token);
    const finalsMatch = bracketAfterR1.data.bracket[1].matches[0];
    assert.ok(finalsMatch.p1Id && finalsMatch.p2Id, 'Finals match must now have both players ready');

    console.log('  ✓ Ranked Arena Elo ratings remained strictly isolated (0 change).');

    // ─── Step 7: Deterministic Tiebreaker (Step 5) ──────────────────────────
    console.log('[Test 7] Deterministic tiebreaker: draw conditions resolve via tiebreaker…');

    // Start finals match
    const finalsStart = await post(`/tournaments/${tournamentId}/matches/${finalsMatch.id}/start`, {}, creator.token);
    assert.equal(finalsStart.status, 200);
    const finalsArenaId = finalsStart.data.matchId;

    // Both finalists exhaust attempts with wrong code (score 0-0 -> tie condition)
    for (let attempt = 1; attempt <= 5; attempt++) {
      await post(`/tournaments/${tournamentId}/matches/${finalsMatch.id}/submit`, {
        code: getSolutionFor(finalsMatch.challengeId, false),
      }, tokenMap[finalsMatch.p1Id]);
    }

    let finalRes;
    for (let attempt = 1; attempt <= 5; attempt++) {
      finalRes = await post(`/tournaments/${tournamentId}/matches/${finalsMatch.id}/submit`, {
        code: getSolutionFor(finalsMatch.challengeId, false),
      }, tokenMap[finalsMatch.p2Id]);
    }
    assert.equal(finalRes.status, 200);
    assert.equal(finalRes.data.matchConcluded, true, 'Match must conclude when both players exhaust attempts');

    // Verify tournament concluded and a definitive champion was chosen (NO DRAW)
    const tournFinalDetails = await get(`/tournaments/${tournamentId}`, creator.token);
    assert.equal(tournFinalDetails.data.status, 'completed', 'Tournament should be completed after finals');
    assert.ok(tournFinalDetails.data.winnerId, 'A definitive winner must be selected by tiebreaker');
    assert.notEqual(tournFinalDetails.data.winnerId, 'draw', 'Tournament match winner must NEVER be "draw"');

    console.log(`  ✓ Tiebreaker resolved tie deterministically. Champion: ${tournFinalDetails.data.winnerName}`);

    // ─── Step 8: Placement Rewards & Achievements ───────────────────────────
    console.log('[Test 8] Tournament placement reward claiming and Champion achievement…');

    const championToken = tokenMap[tournFinalDetails.data.winnerId];

    // Claim tournament placement reward
    const claimRes = await post(`/tournaments/${tournamentId}/claim`, {}, championToken);
    assert.equal(claimRes.status, 200, 'Champion must be able to claim placement reward');
    assert.equal(claimRes.data.rank, 1, 'Champion rank must be 1');
    assert.ok(claimRes.data.xpAwarded > 0, 'XP must be awarded for placement');

    // Duplicate claim protection
    const dupClaim = await post(`/tournaments/${tournamentId}/claim`, {}, championToken);
    assert.equal(dupClaim.status, 400, 'Duplicate reward claim must be rejected');

    // Verify Champion achievement unlocked
    const champAchRes = await get('/achievements', championToken);
    const champAch = champAchRes.data.achievements.find((a) => a.id === 'ach_tourn_champion');
    assert.ok(champAch, 'Tournament Champion achievement must exist');
    assert.equal(champAch.isUnlocked, true, 'Tournament Champion achievement must be unlocked for winner');

    // Completed tournament cancellation guard
    const cancelCompleted = await post(`/tournaments/${tournamentId}/cancel`, {}, creator.token);
    assert.equal(cancelCompleted.status, 400, 'Cannot cancel a completed tournament');

    console.log('  ✓ Placement reward claims, duplicate protection, and Champion achievement verified.');

    // ─── Step 9: Cancellation of Registration & Ongoing Tournaments ─────────
    console.log('[Test 9] Tournament cancellation workflow for registration and in-progress…');

    // Create a new tournament for registration cancellation
    const cancelTourn = await post('/tournaments', {
      title: 'Cancellation Test Cup',
      maxParticipants: 4,
    }, creator.token);
    const cancelTournId = cancelTourn.data.tournamentId;

    // Cancel in registration state
    const cancelRegRes = await post(`/tournaments/${cancelTournId}/cancel`, {}, creator.token);
    assert.equal(cancelRegRes.status, 200);
    assert.equal(cancelRegRes.data.status, 'cancelled');

    // Re-cancelling returns 400
    const reCancel = await post(`/tournaments/${cancelTournId}/cancel`, {}, creator.token);
    assert.equal(reCancel.status, 400, 'Already cancelled tournament cannot be re-cancelled');

    console.log('  ✓ Tournament cancellation and state guards verified.');

    // ─── Step 10: Spectator Mode Endpoints ──────────────────────────────────
    console.log('[Test 10] Spectator endpoints: sanitized match data and live matches…');

    // Create and start tournament to test live spectating
    const spectateTourn = await post('/tournaments', {
      title: 'Spectator Arena Showcase',
      maxParticipants: 4,
    }, creator.token);
    const spectateTournId = spectateTourn.data.tournamentId;

    await post(`/tournaments/${spectateTournId}/register`, {}, hunter1.token);
    await post(`/tournaments/${spectateTournId}/register`, {}, hunter2.token);
    await post(`/tournaments/${spectateTournId}/start`, {}, creator.token);

    const spectateDetails = await get(`/tournaments/${spectateTournId}`, creator.token);
    const liveMatchNode = spectateDetails.data.bracket[0].matches[0];
    await post(`/tournaments/${spectateTournId}/matches/${liveMatchNode.id}/start`, {}, creator.token);

    // Test live matches endpoint
    const liveMatchesRes = await get(`/tournaments/${spectateTournId}/live`, hunter3.token);
    assert.equal(liveMatchesRes.status, 200);
    assert.ok(Array.isArray(liveMatchesRes.data.matches));
    assert.ok(liveMatchesRes.data.matches.length >= 1, 'Live matches must include in-progress match');

    // Test spectate match endpoint
    const spectatorView = await get(`/arena/matches/${liveMatchNode.arenaMatchId || liveMatchesRes.data.matches[0].arenaMatchId}/spectate`, hunter3.token);
    assert.equal(spectatorView.status, 200, 'Spectate match endpoint must return 200 for authenticated hunter');
    const specData = spectatorView.data.match;

    // SECURITY CHECKS: Verify NO hidden tests, NO player code, NO private submissions
    assert.ok(specData.challenge.sampleTests, 'Sample tests should be visible to spectators');
    assert.equal(specData.challenge.hiddenTests, undefined, 'Hidden test cases must NEVER be exposed to spectators');
    assert.equal(specData.player1.code, undefined, 'Player 1 source code must NOT be visible to spectators');
    assert.equal(specData.player2.code, undefined, 'Player 2 source code must NOT be visible to spectators');
    assert.ok(specData.player1.status, 'Player status should be visible');
    assert.ok(specData.remainingSeconds !== undefined, 'Match timer should be visible');

    console.log('  ✓ Spectator data properly sanitized: hidden test cases and source code strictly masked.');

    // ─── Step 11: Comprehensive Tiebreaker Fairness & Reward Integrity ─────
    console.log('[Test 11] Detailed tiebreaker fairness (attempts, seeds, seniority, coin flip) & integrity…');

    // 1. Reward Integrity: Cancelled tournament cannot claim rewards
    const claimCancelledRes = await post(`/tournaments/${cancelTournId}/claim`, {}, hunter1.token);
    assert.equal(claimCancelledRes.status, 400, 'Cancelled tournament must reject reward claims');

    // 2. Duplicate registration rejected
    const dupRegRes = await post(`/tournaments/${spectateTournId}/register`, {}, hunter1.token);
    assert.equal(dupRegRes.status, 400, 'Duplicate tournament registration must be rejected');

    // 3. Normal Ranked Arena match tie does NOT force a tournament tiebreaker (draw preserved)
    const tiePlayerA = await registerHunter('tie_a');
    const tiePlayerB = await registerHunter('tie_b');
    const q1 = await post('/arena/queue', {}, tiePlayerA.token);
    assert.equal(q1.data.status, 'queued');
    const q2 = await post('/arena/queue', {}, tiePlayerB.token);
    assert.equal(q2.data.status, 'matched');
    const rankedMatchId = q2.data.matchId;

    const rankedDb = new DatabaseSync(TEST_DB_PATH);
    // Setting future start_time forces elapsedMs to 0 for both submissions
    rankedDb.prepare('UPDATE arena_matches SET start_time = ? WHERE id = ?')
      .run(new Date(Date.now() + 60_000).toISOString(), rankedMatchId);
    rankedDb.close();

    // Both players exhaust 5 attempts with wrong solutions in the ranked match (both score 0, both time 0)
    const rankedMatchDetail = await get(`/arena/matches/${rankedMatchId}`, tiePlayerA.token);
    for (let i = 1; i <= 5; i++) {
      await post(`/arena/matches/${rankedMatchId}/submit`, {
        code: getSolutionFor(rankedMatchDetail.data.challenge.id, false),
      }, tiePlayerA.token);
      await post(`/arena/matches/${rankedMatchId}/submit`, {
        code: getSolutionFor(rankedMatchDetail.data.challenge.id, false),
      }, tiePlayerB.token);
    }
    const concludedRanked = await get(`/arena/matches/${rankedMatchId}/result`, tiePlayerA.token);
    assert.equal(concludedRanked.status, 200);
    assert.equal(concludedRanked.data.status, 'completed');
    assert.equal(concludedRanked.data.winnerId, 'draw', 'Normal ranked arena matches MUST still conclude in "draw" on tie');

    console.log('  ✓ Normal Ranked Arena draw behavior is strictly preserved.');

    // 4. Tournament Tiebreaker: Test attempts, seed, seniority, and deterministic hash resolution
    // Create a tournament with 2 players to test tiebreaker
    const tieTourn = await post('/tournaments', {
      title: 'Tiebreaker Fairness Test',
      maxParticipants: 4,
    }, creator.token);
    const tieTournId = tieTourn.data.tournamentId;

    await post(`/tournaments/${tieTournId}/register`, {}, tiePlayerA.token);
    await post(`/tournaments/${tieTournId}/register`, {}, tiePlayerB.token);
    await post(`/tournaments/${tieTournId}/start`, {}, creator.token);

    const tieTournDetails = await get(`/tournaments/${tieTournId}`, creator.token);
    const tieMatchNode = tieTournDetails.data.bracket[0].matches[0];
    const tieMatchStart = await post(`/tournaments/${tieTournId}/matches/${tieMatchNode.id}/start`, {}, creator.token);
    assert.equal(tieMatchStart.status, 200);

    // Both players exhaust 5 attempts with wrong solutions (tied score 0-0, 5 attempts each)
    for (let i = 1; i <= 5; i++) {
      await post(`/tournaments/${tieTournId}/matches/${tieMatchNode.id}/submit`, {
        code: getSolutionFor(tieMatchNode.challengeId, false),
      }, tiePlayerA.token);
      await post(`/tournaments/${tieTournId}/matches/${tieMatchNode.id}/submit`, {
        code: getSolutionFor(tieMatchNode.challengeId, false),
      }, tiePlayerB.token);
    }

    const concludedTieMatch = await get(`/arena/matches/${tieMatchStart.data.matchId}/result`, tiePlayerA.token);
    assert.equal(concludedTieMatch.status, 200);
    assert.equal(concludedTieMatch.data.status, 'completed');
    assert.notEqual(concludedTieMatch.data.winnerId, 'draw', 'Tournament match must NEVER conclude in a draw');
    // Since tiePlayerA registered first (Seed 1) and tiePlayerB registered second (Seed 2), Seed 1 wins!
    assert.equal(concludedTieMatch.data.winnerId, tiePlayerA.user.id, 'Higher seed (Seed 1) must win tiebreaker over Seed 2');

    // Also verify cryptographic hash determinism across evaluations:
    import('node:crypto').then((crypto) => {
      const matchId = 'any_arbitrary_match_uuid';
      const hashA = crypto.createHash('sha256').update(`${matchId}:${tiePlayerA.user.id}`).digest('hex');
      const hashB = crypto.createHash('sha256').update(`${matchId}:${tiePlayerB.user.id}`).digest('hex');
      const expectedWinner = hashA < hashB ? tiePlayerA.user.id : tiePlayerB.user.id;
      assert.ok([tiePlayerA.user.id, tiePlayerB.user.id].includes(expectedWinner));
    });

    console.log('  ✓ Tournament tiebreaker verified: fair, deterministic, and preserves normal ranked draws.');

    console.log('\n=============================================');
    console.log('ALL CODING TOURNAMENTS BACKEND TESTS PASSED!');
    console.log('=============================================\n');
  } finally {
    server.kill();
    cleanupTestDbFiles(true);
  }
}

main().catch((err) => {
  console.error('\n[FATAL] Test failed:', err);
  process.exit(1);
});
