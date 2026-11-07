import { spawn } from 'node:child_process';
import fs from 'node:fs';

const authTestDatabase = './data/test_backend_auth_mastery.db';
const authTests = [
  'tests/backend_auth_progression.test.mjs',
  'tests/backend_mastery_prerequisites.test.mjs',
];
const selfStartingTests = [
  'tests/backend_promotion_trials.test.mjs',
  'tests/backend_daily_quests.test.mjs',
  'tests/backend_dungeons.test.mjs',
  'tests/backend_achievements.test.mjs',
  'tests/backend_guilds.test.mjs',
  'tests/backend_seasons.test.mjs',
];

function runNodeScript(script, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.on('error', (error) => resolve({ code: 1, error }));
    child.on('close', (code) => resolve({ code: code ?? 1 }));
  });
}

function startBackend(databasePath) {
  return new Promise((resolve, reject) => {
    const backend = spawn(process.execPath, ['server/runner.mjs'], {
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        PORT: '3001',
        HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let startupOutput = '';
    const timeout = setTimeout(() => {
      backend.kill();
      reject(new Error('Timed out while starting the backend test server.'));
    }, 10000);

    backend.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(output);
      startupOutput += output;
      if (startupOutput.includes('Backend listening')) {
        clearTimeout(timeout);
        resolve(backend);
      }
    });
    backend.stderr.on('data', (data) => process.stderr.write(data.toString()));
    backend.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    backend.on('close', (code) => {
      if (!startupOutput.includes('Backend listening')) {
        clearTimeout(timeout);
        reject(new Error(`Backend test server exited before startup (code ${code}).`));
      }
    });
  });
}

async function stopBackend(backend) {
  if (backend.exitCode !== null) return;
  await new Promise((resolve) => {
    backend.once('close', resolve);
    backend.kill();
  });
}

function cleanAuthDatabase() {
  for (const file of [authTestDatabase, `${authTestDatabase}-wal`, `${authTestDatabase}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

async function runTests() {
  cleanAuthDatabase();
  let backend = null;
  try {
    console.log('\nStarting shared isolated backend for auth and mastery suites…');
    const testEnv = { ...process.env, DATABASE_PATH: authTestDatabase };
    backend = await startBackend(authTestDatabase);

    for (const script of authTests) {
      console.log(`\nRunning ${script}…`);
      const result = await runNodeScript(script, testEnv);
      if (result.code !== 0) throw result.error || new Error(`${script} exited with code ${result.code}.`);
    }

    await stopBackend(backend);
    backend = null;
    cleanAuthDatabase();

    for (const script of selfStartingTests) {
      console.log(`\nRunning ${script}…`);
      const result = await runNodeScript(script);
      if (result.code !== 0) throw result.error || new Error(`${script} exited with code ${result.code}.`);
    }

    console.log('\nAll backend test suites passed.');
  } finally {
    if (backend) await stopBackend(backend);
    cleanAuthDatabase();
  }
}

runTests().catch((error) => {
  console.error('\nBackend test run failed:', error);
  process.exitCode = 1;
});
