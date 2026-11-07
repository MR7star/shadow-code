import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { initDatabase, db, hasMasteredPrerequisites, updateConceptMastery, recordChallengeMastery, getUserConceptMastery, getUserMasteredChallenges, getUserMasteryRecords, syncSkillLevelsFromMastery, SKILL_CONCEPT_MAP, SKILL_PREREQS, getOrGenerateDailyQuests, getRewardChest, claimRewardChest, getStreakData, getDailyQuestData, updateDailyQuestProgress } from './db.mjs';
import {
  registerUser,
  loginUser,
  verifySession,
  deleteSession,
  getUserFullProgression,
  startQuestForUser,
  awardQuestCompletionAtomic,
  getLeaderboard,
  getDailyQuests,
  claimDailyChest,
  recordLearningActivity,
  checkPromotionEligibility,
  getUserPromotionState,
  attemptPromotion,
  getAllPromotionTrials,
} from './auth.mjs';
import { serverChallenges } from './challenges.mjs';
import {
  initDungeonTables,
  getDungeonsForUser,
  getDungeonForUser,
  startDungeon,
  recordDungeonChallengeCompletion,
  recordDungeonChallengeAttempt,
  validateDungeonChallengeAccess,
  DUNGEON_MAP,
} from './dungeons.mjs';
import {
  initAchievementTables,
  checkAndUnlockAchievements,
  claimAchievement,
  getUserTitles,
  equipTitle,
  unequipTitle,
} from './achievements.mjs';
import {
  initGuildTables,
  createGuild,
  getGuildsList,
  getGuildDetails,
  getUserGuildProfile,
  joinGuild,
  leaveGuild,
  kickMember,
  transferLeadership,
  updateMemberRole,
  invitePlayer,
  respondToInvite,
  recordGuildActivity,
  claimGuildQuestReward,
  getCompetitiveLeaderboard,
} from './guilds.mjs';
import {
  initSeasonTables,
  getSeasonsList,
  getActiveSeason,
  getSeasonDetails,
  claimSeasonReward,
  getArenaProfile,
  joinArenaQueue,
  leaveArenaQueue,
  getQueueStatus,
  getArenaMatch,
  submitArenaMatch,
  forfeitArenaMatch,
  getUserMatchHistory,
  getArenaLeaderboard,
  getTournamentsList,
  getTournamentDetails,
  createTournament,
  registerForTournament,
  withdrawFromTournament,
  startTournament,
  submitTournamentMatch,
  claimTournamentReward,
  recordSeasonalXp,
} from './seasons.mjs';

// Initialize SQLite database & seed demo user
initDatabase();
// Initialize dungeon tables (idempotent)
initDungeonTables();
// Initialize achievement & title tables (idempotent)
initAchievementTables();
// Initialize guild tables (idempotent)
initGuildTables();
// Initialize seasons, arena & tournament tables (idempotent)
initSeasonTables();

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const TIMEOUT_MS = parseInt(process.env.RUNNER_TIMEOUT_MS || '3000', 10);
const MAX_OUTPUT_LENGTH = 10000;
const MAX_CODE_LENGTH = 80000;

// Error categorization helper
function categorizeError(evalResult) {
  if (!evalResult.success) {
    if (evalResult.error && evalResult.error.includes('Time Limit Exceeded')) {
      return { type: 'timeout', message: 'Time Limit Exceeded: Your code took too long to execute. Check for infinite loops or inefficient algorithms.' };
    }
    if (evalResult.error && (evalResult.error.includes('SyntaxError') || evalResult.error.includes('IndentationError'))) {
      return { type: 'syntax', message: `Syntax Error: ${evalResult.error.split('\n')[0]}` };
    }
    return { type: 'runtime', message: `Runtime Error: ${evalResult.error?.split('\n')[0] || 'Unknown error'}` };
  }
  
  if (!evalResult.allPassed) {
    const failedTest = evalResult.results.find(r => !r.passed);
    if (failedTest?.error) {
      return { type: 'runtime', message: `Runtime Error on test "${failedTest.description}": ${failedTest.error.split('\n')[0]}` };
    }
    return { type: 'incorrect_output', message: `Incorrect Output: Test "${failedTest?.description || 'unknown'}" failed. Expected ${JSON.stringify(failedTest?.expected)}, got ${JSON.stringify(failedTest?.actual)}.` };
  }
  
  return { type: 'success', message: 'All tests passed!' };
}

// Security module restrictions list
const RESTRICTED_MODULES = [
  'socket',
  'http',
  'urllib',
  'requests',
  'subprocess',
  'shutil',
  'ctypes',
  'multiprocessing',
  'pty',
];

/**
 * Builds the Python test harness script with isolation restrictions and test evaluator.
 */
function buildHarnessScript(userCode, functionName, testCases) {
  const testsJson = JSON.stringify(testCases);
  const blockedModulesJson = JSON.stringify(RESTRICTED_MODULES);

  return `
import sys
import json
import time
import io
import traceback

# ─── Security Sandbox Restrictions ──────────────────────────
blocked_modules = ${blockedModulesJson}

class RestrictedImporter:
    def find_spec(self, fullname, path, target=None):
        root = fullname.split('.')[0]
        if root in blocked_modules:
            raise ImportError(f"Security restriction: import of '{fullname}' is disabled in the isolated sandbox.")
        return None

sys.meta_path.insert(0, RestrictedImporter())

# Restrict dangerous builtins and write operations
import builtins
orig_open = builtins.open
def safe_open(file, mode='r', *args, **kwargs):
    if any(m in mode for m in ['w', 'a', 'x', '+']):
        raise PermissionError("Security restriction: file system write operations are disabled in the sandbox.")
    return orig_open(file, mode, *args, **kwargs)
builtins.open = safe_open

# ─── Execute User Code ───────────────────────────────────────
user_stdout = io.StringIO()
old_stdout = sys.stdout
sys.stdout = user_stdout

runtime_error = None
user_scope = {}

try:
    exec(${JSON.stringify(userCode)}, user_scope)
except Exception as e:
    runtime_error = f"{type(e).__name__}: {str(e)}\\n{traceback.format_exc()}"

sys.stdout = old_stdout
captured_stdout = user_stdout.getvalue()

# ─── Evaluate Test Cases ─────────────────────────────────────
test_cases = json.loads('''${testsJson}''')
results = []
all_passed = True

if runtime_error:
    all_passed = False
    for i, tc in enumerate(test_cases):
        results.append({
            "index": i + 1,
            "description": tc.get("description", f"Test case #{i + 1}"),
            "expected": tc.get("expected"),
            "actual": None,
            "passed": False,
            "error": "Failed during user code execution",
            "isHidden": tc.get("isHidden", False),
            "executionTimeMs": 0
        })
else:
    target_fn = user_scope.get(${JSON.stringify(functionName)})
    if not callable(target_fn):
        all_passed = False
        err_msg = f"Function '${functionName}' was not defined or is not callable."
        runtime_error = err_msg
        for i, tc in enumerate(test_cases):
            results.append({
                "index": i + 1,
                "description": tc.get("description", f"Test case #{i + 1}"),
                "expected": tc.get("expected"),
                "actual": None,
                "passed": False,
                "error": err_msg,
                "isHidden": tc.get("isHidden", False),
                "executionTimeMs": 0
            })
    else:
        for i, tc in enumerate(test_cases):
            args = tc.get("args", [])
            expected = tc.get("expected")
            call_arg = tc.get("callArg")
            t_start = time.perf_counter()
            tc_passed = False
            actual_val = None
            tc_error = None

            try:
                import copy
                cloned_args = copy.deepcopy(args)
                result = target_fn(*cloned_args)

                if call_arg is not None:
                    if callable(result):
                        result = result(call_arg)
                    else:
                        raise TypeError(f"Expected a callable return value, got {type(result).__name__}")

                actual_val = result
                tc_passed = (result == expected)
            except Exception as e:
                tc_passed = False
                tc_error = f"{type(e).__name__}: {str(e)}"
                actual_val = f"Error: {type(e).__name__}"

            t_elapsed_ms = round((time.perf_counter() - t_start) * 1000, 2)
            if not tc_passed:
                all_passed = False

            results.append({
                "index": i + 1,
                "description": tc.get("description", f"Test case #{i + 1}"),
                "expected": expected,
                "actual": actual_val,
                "passed": tc_passed,
                "error": tc_error,
                "isHidden": tc.get("isHidden", False),
                "executionTimeMs": t_elapsed_ms
            })

output_data = {
    "allPassed": all_passed,
    "results": results,
    "stdout": captured_stdout[:${MAX_OUTPUT_LENGTH}],
    "error": runtime_error
}

print("===SHADOW_EVAL_START===")
print(json.dumps(output_data))
print("===SHADOW_EVAL_END===")
`;
}

/**
 * Runs Python execution in a separate, isolated child process with timeout.
 */
function executeInPythonProcess(script) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const py = spawn('python', ['-u', '-c', script], {
      timeout: TIMEOUT_MS,
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        PATH: process.env.PATH,
      },
    });

    py.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    py.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    py.on('error', (err) => {
      resolve({
        success: false,
        allPassed: false,
        error: `Failed to spawn Python process: ${err.message}`,
        results: [],
        stdout: '',
        durationMs: Date.now() - startTime,
      });
    });

    py.on('close', (code, signal) => {
      const durationMs = Date.now() - startTime;

      if (signal === 'SIGTERM' || durationMs >= TIMEOUT_MS - 50) {
        timedOut = true;
      }

      if (timedOut) {
        return resolve({
          success: false,
          allPassed: false,
          error: `Time Limit Exceeded: Execution took longer than ${TIMEOUT_MS / 1000}s. Check for infinite loops or expensive recursion.`,
          results: [],
          stdout: stdout.slice(0, MAX_OUTPUT_LENGTH),
          stderr: stderr.slice(0, MAX_OUTPUT_LENGTH),
          durationMs,
        });
      }

      const match = stdout.match(/===SHADOW_EVAL_START===([\s\S]*?)===SHADOW_EVAL_END===/);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1].trim());
          return resolve({
            success: true,
            allPassed: parsed.allPassed,
            results: parsed.results,
            stdout: parsed.stdout,
            error: parsed.error,
            durationMs,
          });
        } catch (err) {
          return resolve({
            success: false,
            allPassed: false,
            error: `Failed to parse evaluation output: ${err.message}`,
            stdout: stdout.slice(0, 1000),
            stderr: stderr.slice(0, 1000),
            durationMs,
          });
        }
      }

      return resolve({
        success: false,
        allPassed: false,
        error: stderr || `Process exited with code ${code}`,
        results: [],
        stdout: stdout.slice(0, MAX_OUTPUT_LENGTH),
        stderr: stderr.slice(0, MAX_OUTPUT_LENGTH),
        durationMs,
      });
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function getBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.substring(7).trim();
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Health check
  if (req.method === 'GET' && (url.pathname === '/api/health' || url.pathname === '/health')) {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'shadow-code-backend',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      timeoutLimitMs: TIMEOUT_MS,
    });
  }

  // ─── Leaderboard ───────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
    const type = url.searchParams.get('type');
    const page = url.searchParams.get('page');
    const rank = url.searchParams.get('rank') || '';
    const limit = url.searchParams.get('limit') || 25;
    const search = url.searchParams.get('search') || '';
    const guildId = url.searchParams.get('guildId') || null;

    const result = getCompetitiveLeaderboard({
      type: type || 'players',
      rank,
      page: page || 1,
      limit,
      search,
      guildId,
    });

    if (type || page || url.searchParams.has('format') || url.searchParams.has('search') || url.searchParams.has('rank')) {
      return sendJson(res, 200, result);
    }

    return sendJson(res, 200, result.entries);
  }

  // ─── Learning: Get Challenge Lesson Content ───────────────────────
  if (req.method === 'GET' && url.pathname === '/api/learning/lesson') {
    const challengeId = url.searchParams.get('challengeId');
    if (!challengeId) {
      return sendJson(res, 400, { error: 'Missing challengeId parameter.' });
    }
    const challenge = serverChallenges[challengeId];
    if (!challenge) {
      return sendJson(res, 404, { error: `Challenge '${challengeId}' not found.` });
    }
    // Return lesson content without hidden tests
    return sendJson(res, 200, {
      id: challenge.id,
      questId: challenge.questId,
      title: challenge.title,
      conceptId: challenge.conceptId,
      prerequisiteIds: challenge.prerequisiteIds,
      lesson: challenge.lesson,
    });
  }

  // ─── Learning: Get User Concept Mastery ───────────────────────
  if (req.method === 'GET' && url.pathname === '/api/learning/mastery') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const mastery = getUserConceptMastery(session.id);
    return sendJson(res, 200, { concepts: mastery });
  }

  // ─── Learning: Check Prerequisites ────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/learning/prerequisites') {
    const challengeId = url.searchParams.get('challengeId');
    const token = getBearerToken(req);
    const session = verifySession(token);
    
    if (!challengeId) {
      return sendJson(res, 400, { error: 'Missing challengeId parameter.' });
    }
    const challenge = serverChallenges[challengeId];
    if (!challenge) {
      return sendJson(res, 404, { error: `Challenge '${challengeId}' not found.` });
    }
    
    const hasPrereqs = session 
      ? hasMasteredPrerequisites(session.id, challengeId, challenge.prerequisiteIds)
      : true; // Allow unauthenticated users to view
    
    return sendJson(res, 200, {
      hasPrerequisites: hasPrereqs,
      prerequisiteIds: challenge.prerequisiteIds,
    });
  }

  // ─── Daily Quests: Get Today's Quests, Chest, and Streak ──────────
  if (req.method === 'GET' && url.pathname === '/api/daily') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const dailyData = getDailyQuests(session.id);
    return sendJson(res, 200, dailyData);
  }

  // ─── Daily Quests: Claim Reward Chest ────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/daily/claim') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const result = claimDailyChest(session.id);
    if (!result.success) {
      return sendJson(res, 400, { error: result.reason, ...result });
    }
    // Record guild activity for daily chest claim
    recordGuildActivity(session.id, 'daily_chest', `daily_${new Date().toISOString().slice(0, 10)}`, result.xpAwarded || 0);

    // Refresh full progression after claiming
    const full = getUserFullProgression(session.id);
    return sendJson(res, 200, { ...result, profile: full.profile });
  }

  // ─── Read Body Helper ──────────────────────────────────────────
  const readJsonBody = () => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 500000) {
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (e) {
          reject(new Error('Invalid JSON format'));
        }
      });
    });
  };

  // ─── Auth: Register ────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const payload = await readJsonBody();
      const result = registerUser(payload);
      return sendJson(res, 201, result);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // ─── Auth: Login ───────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const payload = await readJsonBody();
      const result = loginUser(payload);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 401, { error: err.message });
    }
  }

  // ─── Auth: Logout ──────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = getBearerToken(req);
    if (token) {
      deleteSession(token);
    }
    return sendJson(res, 200, { message: 'Logged out successfully.' });
  }

  // ─── Auth: Me (Verify session & get current profile) ────────────
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized or session expired.' });
    }
    const full = getUserFullProgression(session.id);
    const guildProfile = getUserGuildProfile(session.id);
    const arenaProfile = getArenaProfile(session.id);
    return sendJson(res, 200, {
      user: { id: session.id, username: session.username, email: session.email },
      ...full,
      guild: guildProfile?.inGuild ? {
        id: guildProfile.guild.id,
        name: guildProfile.guild.name,
        emblem: guildProfile.guild.emblem,
        rank: guildProfile.guild.rank,
        role: guildProfile.membership.role,
      } : null,
      arena: arenaProfile,
    });
  }

  // ─── Player: Get Progress ──────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/player/progress') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const full = getUserFullProgression(session.id);
    const guildProfile = getUserGuildProfile(session.id);
    const arenaProfile = getArenaProfile(session.id);
    return sendJson(res, 200, {
      ...full,
      guild: guildProfile?.inGuild ? {
        id: guildProfile.guild.id,
        name: guildProfile.guild.name,
        emblem: guildProfile.guild.emblem,
        rank: guildProfile.guild.rank,
        role: guildProfile.membership.role,
      } : null,
      arena: arenaProfile,
    });
  }

  // ─── Player: Start Quest ───────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/player/quest/start') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    try {
      const { questId } = await readJsonBody();
      if (!questId) {
        return sendJson(res, 400, { error: 'Missing questId.' });
      }
      const started = startQuestForUser(session.id, questId);
      return sendJson(res, 200, { success: started });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // ─── Run Code (Sample tests only) ──────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/run') {
    try {
      const payload = await readJsonBody();
      const { challengeId, code } = payload;

      if (!challengeId || typeof code !== 'string') {
        return sendJson(res, 400, { error: 'Missing challengeId or code.' });
      }
      if (code.length > MAX_CODE_LENGTH) {
        return sendJson(res, 400, { error: 'Source code exceeds the maximum allowed length.' });
      }

      const challenge = serverChallenges[challengeId];
      if (!challenge) {
        return sendJson(res, 404, { error: `Challenge '${challengeId}' not found.` });
      }

      const script = buildHarnessScript(code, challenge.functionName, challenge.sampleTests);
      const evalResult = await executeInPythonProcess(script);

      return sendJson(res, 200, {
        success: evalResult.success,
        allPassed: evalResult.allPassed,
        passedCount: evalResult.results.filter((r) => r.passed).length,
        totalCount: evalResult.results.length,
        results: evalResult.results,
        stdout: evalResult.stdout,
        error: evalResult.error,
        durationMs: evalResult.durationMs,
        isSubmission: false,
        xpReward: 0,
      });
    } catch (err) {
      return sendJson(res, 500, { error: `Runner error: ${err.message}` });
    }
  }

  // ─── Submit Solution (Protected: Sample + Hidden tests + Atomic XP) ──
  if (req.method === 'POST' && url.pathname === '/api/submit') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required. Please sign in to submit challenges.' });
    }

    try {
      const payload = await readJsonBody();
      const { challengeId, code } = payload;

      if (!challengeId || typeof code !== 'string') {
        return sendJson(res, 400, { error: 'Missing challengeId or code.' });
      }
      if (code.length > MAX_CODE_LENGTH) {
        return sendJson(res, 400, { error: 'Source code exceeds the maximum allowed length.' });
      }

      const challenge = serverChallenges[challengeId];
      if (!challenge) {
        return sendJson(res, 404, { error: `Challenge '${challengeId}' not found.` });
      }

      // Check prerequisites for main challenges (not practice)
      if (!challenge.isPractice && challenge.prerequisiteIds && challenge.prerequisiteIds.length > 0) {
        const hasPrereqs = hasMasteredPrerequisites(session.id, challengeId, challenge.prerequisiteIds);
        if (!hasPrereqs) {
          const unmet = challenge.prerequisiteIds.filter(pid => 
            !db.prepare('SELECT 1 FROM challenge_mastery WHERE user_id = ? AND challenge_id = ?').get(session.id, pid)
          );
          return sendJson(res, 403, { 
            error: 'Prerequisites not met. Complete previous challenges first.',
            unmetPrerequisites: unmet,
            code: 'PREREQUISITES_NOT_MET'
          });
        }
      }

      // Combine sample tests and secret hidden tests
      const testCasesToRun = [
        ...challenge.sampleTests.map((t) => ({ ...t, isHidden: false })),
        ...challenge.hiddenTests.map((t) => ({ ...t, isHidden: true })),
      ];

      const script = buildHarnessScript(code, challenge.functionName, testCasesToRun);
      const evalResult = await executeInPythonProcess(script);

      // Categorize error for better feedback
      const errorInfo = categorizeError(evalResult);

      // Sanitize hidden test details for response
      const sanitizedResults = evalResult.results.map((r) => {
        if (r.isHidden) {
          return {
            index: r.index,
            description: `Hidden Test Case #${r.index}`,
            passed: r.passed,
            isHidden: true,
            executionTimeMs: r.executionTimeMs,
            error: r.error ? (r.error.split('\n')[0] || 'Error') : null,
            expected: '🔒 Hidden',
            actual: r.passed ? '🔒 Passed' : '🔒 Did not match',
          };
        }
        return r;
      });

      const passedCount = sanitizedResults.filter((r) => r.passed).length;
      const totalCount = sanitizedResults.length;
      const allPassed = evalResult.allPassed && passedCount === totalCount;

      let xpAwardResult = {
        isDuplicate: false,
        xpAwarded: 0,
        profile: session.profile,
        leveledUp: false,
        rankChanged: false,
      };

      // If all tests passed, perform authoritative atomic XP award and level calculation
      if (allPassed) {
        // Only award XP for main challenges, not practice challenges
        const xpReward = challenge.isPractice ? 0 : challenge.xpReward;
        xpAwardResult = awardQuestCompletionAtomic(session.id, challenge.questId, xpReward);
        
        // Track concept mastery and challenge mastery
        // For main challenges: only on first completion (not duplicates)
        // For practice challenges: always update concept mastery on successful completion
        const isMainChallengeDuplicate = !challenge.isPractice && xpAwardResult.isDuplicate;
        if (!isMainChallengeDuplicate) {
          // Track concept mastery - increase level on successful completion
          if (challenge.conceptId) {
            // For main challenges, increase mastery level up to 3
            // For practice challenges, increase up to 5
            const targetLevel = challenge.isPractice ? 5 : 3;
            updateConceptMastery(session.id, challenge.conceptId, targetLevel);
          }
          
          // Record challenge mastery (only for main challenges)
          if (!challenge.isPractice) {
            recordChallengeMastery(session.id, challengeId, challenge.questId);
          }
        }
      }

      // Record submission in database audit log
      const subId = `sub_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO submissions (
          id, user_id, challenge_id, quest_id, code, passed, passed_count,
          total_count, results_json, stdout, error, duration_ms, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        subId,
        session.id,
        challengeId,
        challenge.questId,
        code,
        allPassed ? 1 : 0,
        passedCount,
        totalCount,
        JSON.stringify(sanitizedResults),
        evalResult.stdout,
        evalResult.error,
        evalResult.durationMs,
        new Date().toISOString()
      );

      // Record learning activity for streak and daily quest progress
      if (allPassed) {
        const activityType = challenge.isPractice ? 'practice_challenge' : 'main_challenge';
        recordLearningActivity(session.id, activityType, challengeId);
        
        // Also record concept mastery activity if conceptId exists
        if (challenge.conceptId) {
          recordLearningActivity(session.id, 'concept_mastery', challenge.conceptId);
        }

        // Record guild progression activity (challenges, concepts, XP)
        if (!challenge.isPractice) {
          recordGuildActivity(session.id, 'challenge', challenge.questId, xpAwardResult.xpAwarded, { challenges: 1 });
          recordSeasonalXp(session.id, xpAwardResult.xpAwarded);
        }
        if (challenge.conceptId && !xpAwardResult.isDuplicate) {
          recordGuildActivity(session.id, 'concept', challenge.conceptId, 0, { concepts: 1 });
        }
      }

      return sendJson(res, 200, {
        success: evalResult.success,
        allPassed,
        passedCount,
        totalCount,
        results: sanitizedResults,
        stdout: evalResult.stdout,
        error: allPassed ? null : errorInfo.message,
        errorType: allPassed ? null : errorInfo.type,
        durationMs: evalResult.durationMs,
        isSubmission: true,
        isPractice: challenge.isPractice || false,
        xpReward: xpAwardResult.xpAwarded,
        isDuplicate: xpAwardResult.isDuplicate,
        leveledUp: xpAwardResult.leveledUp,
        rankChanged: xpAwardResult.rankChanged,
        player: xpAwardResult.profile,
        // If practice challenge passed, suggest next steps
        ...(allPassed && challenge.isPractice ? {
          masteryMessage: `Practice challenge mastered! Your ${challenge.conceptId} mastery has increased.`
        } : {}),
      });
    } catch (err) {
      return sendJson(res, 500, { error: `Submission evaluation error: ${err.message}` });
    }
  }

  // ─── Get User Skills with State ────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/skills') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }

    const skillRows = getUserMasteryRecords(session.id);
    const conceptRows = getUserConceptMastery(session.id);
    const conceptMap = {};
    for (const row of conceptRows) {
      conceptMap[row.concept_id] = row.mastery_level;
    }
    const masteredChallenges = getUserMasteredChallenges(session.id).map(r => r.challenge_id);

    // Build skill state for each skill
    const skills = skillRows.map(s => {
      const skillId = s.skill_id;
      const prereqs = SKILL_PREREQS[skillId] || [];
      const prereqsMet = prereqs.length === 0 || prereqs.every(p => {
        const prereqSkill = skillRows.find(sr => sr.skill_id === p);
        return prereqSkill && prereqSkill.level > 0;
      });

      let state = 'locked';
      let unlockReason = null;

      if (!prereqsMet) {
        state = 'locked';
        const unmet = prereqs.filter(p => {
          const ps = skillRows.find(sr => sr.skill_id === p);
          return !ps || ps.level === 0;
        });
        unlockReason = `Requires: ${unmet.join(', ')}`;
      } else if (s.level === 0) {
        state = 'available';
      } else if (s.level >= 5) {
        state = 'mastered';
      } else {
        state = 'in-progress';
      }

      const conceptId = SKILL_CONCEPT_MAP[skillId];
      let conceptMasteryLevel = 0;
      if (conceptId && conceptMap[conceptId]) {
        conceptMasteryLevel = conceptMap[conceptId];
      }

      return {
        id: skillId,
        level: s.level,
        maxLevel: 5,
        state,
        unlockReason,
        conceptId: conceptId || null,
        conceptMasteryLevel,
        prerequisiteIds: prereqs,
      };
    });

    return sendJson(res, 200, { skills });
  }

  // ─── Get Promotion Trials ────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/promotion/trials') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }

    const trials = getUserPromotionState(session.id);
    return sendJson(res, 200, { trials });
  }

  // ─── Attempt Promotion Trial ─────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/promotion/trial/attempt') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }

    try {
      const payload = await readJsonBody();
      const { trialId, code } = payload;

      if (!trialId || typeof code !== 'string') {
        return sendJson(res, 400, { error: 'Missing trialId or code.' });
      }
      if (code.length > MAX_CODE_LENGTH) {
        return sendJson(res, 400, { error: 'Source code exceeds the maximum allowed length.' });
      }

      const result = await attemptPromotion(
        session.id,
        trialId,
        code,
        executeInPythonProcess,
        buildHarnessScript
      );
      
      // If promotion succeeded, refresh profile
      if (result.success && result.profile) {
        recordGuildActivity(session.id, 'promotion_trial', trialId, result.xpAwarded || 0);
        const full = getUserFullProgression(session.id);
        return sendJson(res, 200, { ...result, profile: full.profile });
      }

      const isClientError = result.errorType === 'requirements_not_met' ||
                            result.errorType === 'not_eligible' ||
                            result.errorType === 'invalid_trial' ||
                            result.errorType === 'challenge_not_found';
      return sendJson(res, isClientError ? 400 : 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Promotion trial error: ${err.message}` });
    }
  }

  // ─── Dungeons: List All Dungeons for User ───────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/dungeons') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const dungeons = getDungeonsForUser(session.id);
    return sendJson(res, 200, { dungeons });
  }

  // ─── Dungeons: Get Single Dungeon ────────────────────────────────────────
  const dungeonDetailMatch = url.pathname.match(/^\/api\/dungeons\/([a-z0-9-]+)$/);
  if (req.method === 'GET' && dungeonDetailMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const dungeonId = dungeonDetailMatch[1];
    const dungeon = getDungeonForUser(session.id, dungeonId);
    if (!dungeon) return sendJson(res, 404, { error: 'Dungeon not found.' });
    return sendJson(res, 200, { dungeon });
  }

  // ─── Dungeons: Start a Dungeon ────────────────────────────────────────────
  const dungeonStartMatch = url.pathname.match(/^\/api\/dungeons\/([a-z0-9-]+)\/start$/);
  if (req.method === 'POST' && dungeonStartMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const dungeonId = dungeonStartMatch[1];
    const result = startDungeon(session.id, dungeonId);
    if (!result.success) return sendJson(res, 400, { error: result.error });
    const dungeon = getDungeonForUser(session.id, dungeonId);
    return sendJson(res, 200, { ...result, dungeon });
  }

  // ─── Dungeons: Run Code (Sample Tests, No XP) ────────────────────────────
  const dungeonRunMatch = url.pathname.match(/^\/api\/dungeons\/([a-z0-9-]+)\/challenge\/([a-z0-9-]+)\/run$/);
  if (req.method === 'POST' && dungeonRunMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const [, dungeonId, challengeId] = dungeonRunMatch;
      const payload = await readJsonBody();
      const { code } = payload;
      if (typeof code !== 'string') return sendJson(res, 400, { error: 'Missing code.' });
      if (code.length > MAX_CODE_LENGTH) return sendJson(res, 400, { error: 'Code too long.' });

      // Validate access
      const access = validateDungeonChallengeAccess(session.id, dungeonId, challengeId);
      if (!access.allowed) return sendJson(res, 403, { error: access.reason });

      const challenge = serverChallenges[challengeId];
      if (!challenge) return sendJson(res, 404, { error: 'Challenge not found.' });

      const script = buildHarnessScript(code, challenge.functionName, challenge.sampleTests);
      const evalResult = await executeInPythonProcess(script);

      return sendJson(res, 200, {
        success: evalResult.success,
        allPassed: evalResult.allPassed,
        passedCount: evalResult.results.filter((r) => r.passed).length,
        totalCount: evalResult.results.length,
        results: evalResult.results,
        stdout: evalResult.stdout,
        error: evalResult.error,
        durationMs: evalResult.durationMs,
        isSubmission: false,
        xpReward: 0,
      });
    } catch (err) {
      return sendJson(res, 500, { error: `Runner error: ${err.message}` });
    }
  }

  // ─── Dungeons: Submit Solution (Hidden Tests + Atomic XP if passes) ──────
  const dungeonSubmitMatch = url.pathname.match(/^\/api\/dungeons\/([a-z0-9-]+)\/challenge\/([a-z0-9-]+)\/submit$/);
  if (req.method === 'POST' && dungeonSubmitMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }

    try {
      const [, dungeonId, challengeId] = dungeonSubmitMatch;
      const payload = await readJsonBody();
      const { code } = payload;
      if (typeof code !== 'string') return sendJson(res, 400, { error: 'Missing code.' });
      if (code.length > MAX_CODE_LENGTH) return sendJson(res, 400, { error: 'Code too long.' });

      // Server-side access validation — prerequisites, rank, challenge unlock order
      const access = validateDungeonChallengeAccess(session.id, dungeonId, challengeId);
      if (!access.allowed) return sendJson(res, 403, { error: access.reason });

      const challenge = serverChallenges[challengeId];
      if (!challenge) return sendJson(res, 404, { error: 'Challenge not found.' });

      // Run sample + hidden tests
      const testCasesToRun = [
        ...challenge.sampleTests.map((t) => ({ ...t, isHidden: false })),
        ...challenge.hiddenTests.map((t) => ({ ...t, isHidden: true })),
      ];
      const script = buildHarnessScript(code, challenge.functionName, testCasesToRun);
      const evalResult = await executeInPythonProcess(script);

      // Sanitize hidden test results
      const sanitizedResults = evalResult.results.map((r) => {
        if (r.isHidden) {
          return {
            index: r.index,
            description: `Hidden Test #${r.index}`,
            passed: r.passed,
            isHidden: true,
            executionTimeMs: r.executionTimeMs,
            error: r.error ? (r.error.split('\n')[0] || 'Error') : null,
            expected: '🔒 Hidden',
            actual: r.passed ? '🔒 Passed' : '🔒 Did not match',
          };
        }
        return r;
      });

      const passedCount = evalResult.results.filter((r) => r.passed).length;
      const totalCount = evalResult.results.length;
      const allPassed = evalResult.allPassed && passedCount === totalCount;
      const errorInfo = categorizeError(evalResult);

      // Record submission in submissions table
      db.prepare(`
        INSERT INTO submissions
          (id, user_id, challenge_id, quest_id, code, passed, passed_count, total_count, results_json, stdout, error, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `sub_${crypto.randomUUID()}`,
        session.id,
        challengeId,
        `dungeon-${dungeonId}`,
        code,
        allPassed ? 1 : 0,
        passedCount,
        totalCount,
        JSON.stringify(sanitizedResults),
        evalResult.stdout,
        evalResult.error,
        evalResult.durationMs,
        new Date().toISOString()
      );

      if (allPassed) {
        // Server-side: record completion, unlock next challenge, award XP
        const completionResult = recordDungeonChallengeCompletion(
          session.id,
          dungeonId,
          challengeId,
          { allPassed: true, results: evalResult.results }
        );

        // Also track concept mastery for the main quest system
        if (challenge.conceptId) {
          updateConceptMastery(session.id, challenge.conceptId, 3);
        }
        // Record challenge mastery (first completion)
        recordChallengeMastery(session.id, challengeId, `dungeon-${dungeonId}`);
        // Record learning activity for streak/daily
        recordLearningActivity(session.id, 'main_challenge', challengeId);
        if (challenge.conceptId) {
          recordLearningActivity(session.id, 'concept_mastery', challenge.conceptId);
        }

        // Record guild progression activity for dungeon encounters and stages
        if (completionResult.dungeonComplete) {
          recordGuildActivity(session.id, 'dungeon', dungeonId, completionResult.xpAwarded || 0, { dungeons: 1, challenges: 1 });
        } else {
          recordGuildActivity(session.id, 'dungeon_stage', `${dungeonId}_${challengeId}`, completionResult.xpAwarded || 0, { challenges: 1 });
        }
        if (challenge.conceptId) {
          recordGuildActivity(session.id, 'concept', challenge.conceptId, 0, { concepts: 1 });
        }

        const updatedDungeon = getDungeonForUser(session.id, dungeonId);
        const fullProgression = getUserFullProgression(session.id);

        return sendJson(res, 200, {
          success: true,
          allPassed: true,
          passedCount,
          totalCount,
          results: sanitizedResults,
          stdout: evalResult.stdout,
          error: null,
          errorType: null,
          durationMs: evalResult.durationMs,
          isSubmission: true,
          xpReward: completionResult.xpAwarded || 0,
          isDuplicate: completionResult.isDuplicate,
          dungeonComplete: completionResult.dungeonComplete,
          dungeonXpAwarded: completionResult.xpAwarded || 0,
          nextUnlocked: completionResult.nextUnlocked,
          isBoss: completionResult.isBoss,
          bonusTitle: completionResult.bonusTitle,
          dungeon: updatedDungeon,
          player: fullProgression.profile,
        });
      }

      // Failed attempt — record attempt count, return feedback
      recordDungeonChallengeAttempt(session.id, dungeonId, challengeId, passedCount, totalCount);
      const updatedDungeon = getDungeonForUser(session.id, dungeonId);

      return sendJson(res, 200, {
        success: false,
        allPassed: false,
        passedCount,
        totalCount,
        results: sanitizedResults,
        stdout: evalResult.stdout,
        error: errorInfo.message,
        errorType: errorInfo.type,
        durationMs: evalResult.durationMs,
        isSubmission: true,
        xpReward: 0,
        dungeon: updatedDungeon,
      });
    } catch (err) {
      return sendJson(res, 500, { error: `Dungeon submission error: ${err.message}` });
    }
  }

  // ─── Achievements: Get Hunter Collection & Evaluate Progress ─────────────
  if (req.method === 'GET' && url.pathname === '/api/achievements') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const data = checkAndUnlockAchievements(session.id);
    return sendJson(res, 200, data);
  }

  // ─── Achievements: Check & Unlock Newly Completed ─────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/achievements/check') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const data = checkAndUnlockAchievements(session.id);
    return sendJson(res, 200, { ...data, unlocked: data.newlyUnlocked });
  }

  // ─── Achievements: Explicit Claim Achievement ────────────────────────────
  const claimAchMatch = url.pathname.match(/^\/api\/achievements\/([a-z0-9_-]+)\/claim$/);
  if (req.method === 'POST' && claimAchMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const achievementId = claimAchMatch[1];
    const result = claimAchievement(session.id, achievementId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error, remainingRequirement: result.remainingRequirement });
    }
    return sendJson(res, 200, result);
  }

  // ─── Titles: Get Owned & Equipped Titles ─────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/titles') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const data = getUserTitles(session.id);
    return sendJson(res, 200, data);
  }

  // ─── Titles: Equip Title ─────────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/titles/equip') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    try {
      const payload = await readJsonBody();
      const { title } = payload;
      if (!title || typeof title !== 'string') {
        return sendJson(res, 400, { error: 'Missing title parameter.' });
      }
      const result = equipTitle(session.id, title);
      if (!result.success) {
        return sendJson(res, 400, { error: result.error });
      }
      const full = getUserFullProgression(session.id);
      return sendJson(res, 200, { ...result, profile: full.profile });
    } catch (err) {
      return sendJson(res, 500, { error: `Equip title error: ${err.message}` });
    }
  }

  // ─── Titles: Unequip Title ───────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/titles/unequip') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized.' });
    }
    const result = unequipTitle(session.id);
    const full = getUserFullProgression(session.id);
    return sendJson(res, 200, { ...result, profile: full.profile });
  }

  // ─── Guilds: List / Discover Guilds ───────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/guilds') {
    const search = url.searchParams.get('search') || '';
    const rank = url.searchParams.get('rank') || '';
    const page = url.searchParams.get('page') || 1;
    const limit = url.searchParams.get('limit') || 20;
    const data = getGuildsList({ search, rank, page, limit });
    return sendJson(res, 200, data);
  }

  // ─── Guilds: Create Guild ────────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/guilds') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const payload = await readJsonBody();
      const result = createGuild(session.id, payload);
      if (!result.success) {
        return sendJson(res, 400, { error: result.error });
      }
      return sendJson(res, 201, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Create guild error: ${err.message}` });
    }
  }

  // ─── Guilds: Current User Guild Profile & Invites ─────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/guilds/me') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const profile = getUserGuildProfile(session.id);
    return sendJson(res, 200, profile);
  }

  // ─── Guilds: Join Guild ──────────────────────────────────────────────────
  const guildJoinMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)\/join$/);
  if (req.method === 'POST' && guildJoinMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const guildId = guildJoinMatch[1];
    const result = joinGuild(session.id, guildId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, result);
  }

  // ─── Guilds: Leave Guild ─────────────────────────────────────────────────
  const guildLeaveMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)\/leave$/);
  if (req.method === 'POST' && guildLeaveMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const guildId = guildLeaveMatch[1];
    const result = leaveGuild(session.id, guildId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, result);
  }

  // ─── Guilds: Invite Hunter ───────────────────────────────────────────────
  const guildInviteMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)\/invite$/);
  if (req.method === 'POST' && guildInviteMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const guildId = guildInviteMatch[1];
      const payload = await readJsonBody();
      const target = payload.targetUsername || payload.targetUserId || payload.username;
      const result = invitePlayer(session.id, guildId, target);
      if (!result.success) {
        return sendJson(res, 400, { error: result.error });
      }
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Invite player error: ${err.message}` });
    }
  }

  // ─── Guilds: Accept Invitation ───────────────────────────────────────────
  const guildAcceptInviteMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)\/invites\/([a-zA-Z0-9_-]+)\/accept$/);
  if (req.method === 'POST' && guildAcceptInviteMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const [, guildId, inviteId] = guildAcceptInviteMatch;
    const result = respondToInvite(session.id, inviteId, true);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, result);
  }

  // ─── Guilds: Reject Invitation ───────────────────────────────────────────
  const guildRejectInviteMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)\/invites\/([a-zA-Z0-9_-]+)\/reject$/);
  if (req.method === 'POST' && guildRejectInviteMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const [, guildId, inviteId] = guildRejectInviteMatch;
    const result = respondToInvite(session.id, inviteId, false);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, result);
  }

  // ─── Guilds: Kick Member ─────────────────────────────────────────────────
  const guildKickMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)\/kick$/);
  if (req.method === 'POST' && guildKickMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const guildId = guildKickMatch[1];
      const payload = await readJsonBody();
      const result = kickMember(session.id, guildId, payload.targetUserId);
      if (!result.success) {
        return sendJson(res, 400, { error: result.error });
      }
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Kick member error: ${err.message}` });
    }
  }

  // ─── Guilds: Transfer Leadership ─────────────────────────────────────────
  const guildTransferMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)\/transfer-leadership$/);
  if (req.method === 'POST' && guildTransferMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const guildId = guildTransferMatch[1];
      const payload = await readJsonBody();
      const result = transferLeadership(session.id, guildId, payload.newLeaderId);
      if (!result.success) {
        return sendJson(res, 400, { error: result.error });
      }
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Transfer leadership error: ${err.message}` });
    }
  }

  // ─── Guilds: Update Member Role (Promote / Demote Officer) ────────────────
  const guildRoleMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)\/role$/);
  if (req.method === 'POST' && guildRoleMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const guildId = guildRoleMatch[1];
      const payload = await readJsonBody();
      const result = updateMemberRole(session.id, guildId, payload.targetUserId, payload.role);
      if (!result.success) {
        return sendJson(res, 400, { error: result.error });
      }
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Update member role error: ${err.message}` });
    }
  }

  // ─── Guilds: Claim Guild Quest Reward ────────────────────────────────────
  const guildQuestClaimMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)\/quests\/([a-zA-Z0-9_-]+)\/claim$/);
  if (req.method === 'POST' && guildQuestClaimMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const [, guildId, questId] = guildQuestClaimMatch;
    const result = claimGuildQuestReward(session.id, guildId, questId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, result);
  }

  // ─── Guilds: Get Guild Details ───────────────────────────────────────────
  const guildDetailMatch = url.pathname.match(/^\/api\/guilds\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && guildDetailMatch) {
    const guildId = guildDetailMatch[1];
    const token = getBearerToken(req);
    const session = verifySession(token);
    const details = getGuildDetails(guildId, session ? session.id : null);
    if (!details) {
      return sendJson(res, 404, { error: 'Guild not found.' });
    }
    return sendJson(res, 200, details);
  }

  // ─── Seasons: Get Seasons List ───────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/seasons') {
    const seasons = getSeasonsList();
    return sendJson(res, 200, { seasons });
  }

  // ─── Seasons: Get Active Season ──────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/seasons/active') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    const season = getActiveSeason(session ? session.id : null);
    if (!season) {
      return sendJson(res, 404, { error: 'No season found.' });
    }
    return sendJson(res, 200, season);
  }

  // ─── Seasons: Claim Season Rewards ───────────────────────────────────────
  const seasonClaimMatch = url.pathname.match(/^\/api\/seasons\/([a-zA-Z0-9_-]+)\/claim$/);
  if (req.method === 'POST' && seasonClaimMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const seasonId = seasonClaimMatch[1];
    const result = claimSeasonReward(session.id, seasonId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    const full = getUserFullProgression(session.id);
    return sendJson(res, 200, { ...result, profile: full.profile });
  }

  // ─── Seasons: Get Season Details ─────────────────────────────────────────
  const seasonDetailMatch = url.pathname.match(/^\/api\/seasons\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && seasonDetailMatch) {
    const seasonId = seasonDetailMatch[1];
    const token = getBearerToken(req);
    const session = verifySession(token);
    const season = getSeasonDetails(seasonId, session ? session.id : null);
    if (!season) {
      return sendJson(res, 404, { error: 'Season not found.' });
    }
    return sendJson(res, 200, season);
  }

  // ─── Arena: Get Profile ──────────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/arena/profile') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    const targetUserId = url.searchParams.get('userId') || (session ? session.id : null);
    if (!targetUserId) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const profile = getArenaProfile(targetUserId);
    return sendJson(res, 200, profile);
  }

  // ─── Arena: Join Queue ───────────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/arena/queue') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const payload = await readJsonBody().catch(() => ({}));
      const result = joinArenaQueue(session.id, { allowAi: !!payload.allowAi });
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Queue error: ${err.message}` });
    }
  }

  // ─── Arena: Leave Queue ──────────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/arena/queue/leave') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const result = leaveArenaQueue(session.id);
    return sendJson(res, 200, result);
  }

  // ─── Arena: Queue Status ─────────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/arena/queue/status') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const status = getQueueStatus(session.id);
    return sendJson(res, 200, status);
  }

  // ─── Arena: Match History ────────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/arena/history') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const limit = url.searchParams.get('limit') || 10;
    const page = url.searchParams.get('page') || 1;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const history = getUserMatchHistory(session.id, limit, offset);
    return sendJson(res, 200, history);
  }

  // ─── Arena: Leaderboard ──────────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/arena/leaderboard') {
    const page = url.searchParams.get('page') || 1;
    const limit = url.searchParams.get('limit') || 25;
    const division = url.searchParams.get('division') || 'all';
    const lb = getArenaLeaderboard(page, limit, division);
    return sendJson(res, 200, lb);
  }

  // ─── Arena: Run Sample Code In Match ─────────────────────────────────────
  const arenaRunMatch = url.pathname.match(/^\/api\/arena\/matches\/([a-zA-Z0-9_-]+)\/run$/);
  if (req.method === 'POST' && arenaRunMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const matchId = arenaRunMatch[1];
      const match = getArenaMatch(matchId, session.id);
      if (!match) return sendJson(res, 404, { error: 'Match not found.' });

      const payload = await readJsonBody();
      const { code } = payload;
      if (!code || typeof code !== 'string') return sendJson(res, 400, { error: 'Missing code.' });
      if (code.length > MAX_CODE_LENGTH) return sendJson(res, 400, { error: 'Code too long.' });

      const script = buildHarnessScript(code, match.challenge.functionName, match.challenge.sampleTests);
      const evalResult = await executeInPythonProcess(script);

      return sendJson(res, 200, {
        success: evalResult.success,
        allPassed: evalResult.allPassed,
        passedCount: evalResult.results.filter((r) => r.passed).length,
        totalCount: evalResult.results.length,
        results: evalResult.results,
        stdout: evalResult.stdout,
        error: evalResult.error,
        durationMs: evalResult.durationMs,
      });
    } catch (err) {
      return sendJson(res, 500, { error: `Arena test error: ${err.message}` });
    }
  }

  // ─── Arena: Submit Solution ──────────────────────────────────────────────
  const arenaSubmitMatch = url.pathname.match(/^\/api\/arena\/matches\/([a-zA-Z0-9_-]+)\/submit$/);
  if (req.method === 'POST' && arenaSubmitMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const matchId = arenaSubmitMatch[1];
      const payload = await readJsonBody();
      const { code } = payload;
      if (!code || typeof code !== 'string') return sendJson(res, 400, { error: 'Missing code.' });
      if (code.length > MAX_CODE_LENGTH) return sendJson(res, 400, { error: 'Code too long.' });

      const result = await submitArenaMatch(
        session.id,
        matchId,
        code,
        executeInPythonProcess,
        buildHarnessScript
      );

      if (!result.success) {
        return sendJson(res, 400, { error: result.error });
      }

      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Arena submit error: ${err.message}` });
    }
  }

  // ─── Arena: Forfeit Match ────────────────────────────────────────────────
  const arenaForfeitMatch = url.pathname.match(/^\/api\/arena\/matches\/([a-zA-Z0-9_-]+)\/forfeit$/);
  if (req.method === 'POST' && arenaForfeitMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const matchId = arenaForfeitMatch[1];
    const result = forfeitArenaMatch(session.id, matchId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, result);
  }

  // ─── Arena: Get Match Details ────────────────────────────────────────────
  const arenaGetMatch = url.pathname.match(/^\/api\/arena\/matches\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && arenaGetMatch) {
    const matchId = arenaGetMatch[1];
    const token = getBearerToken(req);
    const session = verifySession(token);
    const match = getArenaMatch(matchId, session ? session.id : null);
    if (!match) {
      return sendJson(res, 404, { error: 'Match not found.' });
    }
    return sendJson(res, 200, match);
  }

  // ─── Tournaments: List Tournaments ───────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/tournaments') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    const list = getTournamentsList(session ? session.id : null);
    return sendJson(res, 200, { tournaments: list });
  }

  // ─── Tournaments: Create Tournament ──────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/tournaments') {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const payload = await readJsonBody();
      const result = createTournament(session.id, payload);
      if (!result.success) {
        return sendJson(res, 400, { error: result.error });
      }
      return sendJson(res, 201, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Create tournament error: ${err.message}` });
    }
  }

  // ─── Tournaments: Register ───────────────────────────────────────────────
  const tournRegisterMatch = url.pathname.match(/^\/api\/tournaments\/([a-zA-Z0-9_-]+)\/register$/);
  if (req.method === 'POST' && tournRegisterMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const tournamentId = tournRegisterMatch[1];
    const result = registerForTournament(session.id, tournamentId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, result);
  }

  // ─── Tournaments: Withdraw ───────────────────────────────────────────────
  const tournWithdrawMatch = url.pathname.match(/^\/api\/tournaments\/([a-zA-Z0-9_-]+)\/withdraw$/);
  if (req.method === 'POST' && tournWithdrawMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const tournamentId = tournWithdrawMatch[1];
    const result = withdrawFromTournament(session.id, tournamentId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, result);
  }

  // ─── Tournaments: Start Tournament ───────────────────────────────────────
  const tournStartMatch = url.pathname.match(/^\/api\/tournaments\/([a-zA-Z0-9_-]+)\/start$/);
  if (req.method === 'POST' && tournStartMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const tournamentId = tournStartMatch[1];
    const result = startTournament(tournamentId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, result);
  }

  // ─── Tournaments: Submit Match Solution ──────────────────────────────────
  const tournSubmitMatch = url.pathname.match(/^\/api\/tournaments\/([a-zA-Z0-9_-]+)\/matches\/([a-zA-Z0-9_-]+)\/submit$/);
  if (req.method === 'POST' && tournSubmitMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    try {
      const [, , matchId] = tournSubmitMatch;
      const payload = await readJsonBody();
      const { code } = payload;
      if (!code || typeof code !== 'string') return sendJson(res, 400, { error: 'Missing code.' });

      const result = await submitTournamentMatch(
        session.id,
        matchId,
        code,
        executeInPythonProcess,
        buildHarnessScript
      );

      if (!result.success) {
        return sendJson(res, 400, { error: result.error });
      }
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: `Tournament match submit error: ${err.message}` });
    }
  }

  // ─── Tournaments: Claim Placement Rewards ────────────────────────────────
  const tournClaimMatch = url.pathname.match(/^\/api\/tournaments\/([a-zA-Z0-9_-]+)\/claim$/);
  if (req.method === 'POST' && tournClaimMatch) {
    const token = getBearerToken(req);
    const session = verifySession(token);
    if (!session) {
      return sendJson(res, 401, { error: 'Authentication required.' });
    }
    const tournamentId = tournClaimMatch[1];
    const result = claimTournamentReward(session.id, tournamentId);
    if (!result.success) {
      return sendJson(res, 400, { error: result.error });
    }
    const full = getUserFullProgression(session.id);
    return sendJson(res, 200, { ...result, profile: full.profile });
  }

  // ─── Tournaments: Get Details & Bracket ──────────────────────────────────
  const tournDetailMatch = url.pathname.match(/^\/api\/tournaments\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && tournDetailMatch) {
    const tournamentId = tournDetailMatch[1];
    const token = getBearerToken(req);
    const session = verifySession(token);
    const details = getTournamentDetails(tournamentId, session ? session.id : null);
    if (!details) {
      return sendJson(res, 404, { error: 'Tournament not found.' });
    }
    return sendJson(res, 200, details);
  }

  // 404
  return sendJson(res, 404, { error: 'Endpoint not found.' });
});

server.listen(PORT, HOST, () => {
  console.log(`[Shadow Code] Backend listening on http://${HOST}:${PORT} (loopback by default; not a production sandbox)`);
});
