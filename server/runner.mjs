import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { initDatabase, db, hasMasteredPrerequisites, updateConceptMastery, recordChallengeMastery, getUserConceptMastery, getUserMasteredChallenges, getOrGenerateDailyQuests, getRewardChest, claimRewardChest, getStreakData, getDailyQuestData, updateDailyQuestProgress } from './db.mjs';
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
} from './auth.mjs';
import { serverChallenges } from './challenges.mjs';

// Initialize SQLite database & seed demo user
initDatabase();

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
    const list = getLeaderboard();
    return sendJson(res, 200, list);
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
    return sendJson(res, 200, {
      user: { id: session.id, username: session.username, email: session.email },
      ...full,
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
    return sendJson(res, 200, full);
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

  // 404
  return sendJson(res, 404, { error: 'Endpoint not found.' });
});

server.listen(PORT, HOST, () => {
  console.log(`[Shadow Code] Backend listening on http://${HOST}:${PORT} (loopback by default; not a production sandbox)`);
});
