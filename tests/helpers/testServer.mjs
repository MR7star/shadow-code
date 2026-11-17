import { spawn } from 'node:child_process';

const STARTUP_TIMEOUT_MS = 10000;

export function startTestServer({ databasePath, env = {}, logPrefix = '[SERVER]' }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server/runner.mjs'], {
      env: {
        ...process.env,
        ...env,
        DATABASE_PATH: databasePath,
        PORT: '0',
        HOST: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    let outputBuffer = '';
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimeout);
      callback(value);
    };
    const startupTimeout = setTimeout(() => {
      child.kill();
      finish(reject, new Error(`Test backend did not start within ${STARTUP_TIMEOUT_MS}ms.`));
    }, STARTUP_TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      const output = data.toString();
      for (const line of output.trimEnd().split(/\r?\n/)) {
        if (line) console.log(logPrefix, line);
      }
      outputBuffer += output;
      const portMatch = outputBuffer.match(/Backend listening on http:\/\/[^:\s]+:(\d+)/);
      if (portMatch) {
        const port = Number(portMatch[1]);
        finish(resolve, { process: child, baseUrl: `http://127.0.0.1:${port}/api` });
      }
    });

    child.stderr.on('data', (data) => {
      console.error(`${logPrefix} ERR`, data.toString().trim());
    });
    child.once('error', (error) => finish(reject, error));
    child.once('close', (code) => {
      if (!settled) finish(reject, new Error(`Test backend exited before startup (code ${code}).`));
    });
  });
}

export async function stopTestServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    child.once('close', resolve);
    child.kill();
  });
}
