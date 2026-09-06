/**
 * Step 12.5 production bootstrap acceptance harness.
 * Uses synthetic process env only. Does not read, write, or print user .env.
 */
import { createConnection } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Redis } = require('ioredis');
const { PrismaClient } = require('@prisma/client');

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(backendRoot, '../..');
const runtimeRoot = path.join(repoRoot, '.local', 'acceptance-bootstrap');
const storageRoot = path.join(runtimeRoot, 'storage');
const logRoot = path.join(runtimeRoot, 'logs');
const apiPort = 3101;
const invalidPorts = { missingModel: 3102, mockCompose: 3103 };
const redisUrl = 'redis://127.0.0.1:6379/15';
const databaseUrl = 'postgresql://acf:acf@127.0.0.1:55432/acf_dev?schema=public';

const PLACEHOLDERS = [
  'acceptance-jwt-secret-not-for-production',
  'acceptance-placeholder-key',
  'acceptance-placeholder-model',
  'acceptance-placeholder-voice',
  databaseUrl,
];

const SECRET_PATTERNS = [
  /authorization/i,
  /bearer\s+\S+/i,
  /postgresql:\/\//i,
  /postgres:\/\//i,
  /MODEL_API_KEY\s*=/i,
  /WANX_API_KEY\s*=/i,
  /MINIMAX_TTS_API_KEY\s*=/i,
  /JWT_ACCESS_SECRET\s*=/i,
  /COOKIE_SECURE\s*=/i,
];

mkdirSync(storageRoot, { recursive: true });
mkdirSync(logRoot, { recursive: true });

function canConnect(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function commandVersion(bin) {
  const result = spawnSync(bin, ['-version'], { windowsHide: true, shell: false, encoding: 'utf8', timeout: 8_000 });
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const line = text.split(/\r?\n/).find((item) => item.trim()) || '';
  return { ok: result.status === 0, summary: line.replace(/\s+/g, ' ').slice(0, 80) };
}

function baseWindowsEnv() {
  return {
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    SYSTEMROOT: process.env.SYSTEMROOT,
    WINDIR: process.env.WINDIR,
    COMSPEC: process.env.COMSPEC,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    SYSTEMDRIVE: process.env.SYSTEMDRIVE,
    USERPROFILE: process.env.USERPROFILE,
    HOMEDRIVE: process.env.HOMEDRIVE,
    HOMEPATH: process.env.HOMEPATH,
  };
}

function syntheticEnv(overrides = {}) {
  return {
    ...baseWindowsEnv(),
    NODE_ENV: 'production',
    PORT: String(apiPort),
    JWT_ACCESS_SECRET: 'acceptance-jwt-secret-not-for-production',
    DATABASE_URL: databaseUrl,
    CORS_ORIGIN: 'https://acceptance.local',
    REDIS_URL: redisUrl,
    MEDIA_STORAGE_ROOT: storageRoot,
    COOKIE_SECURE: 'true',
    MODEL_PROVIDER: 'real',
    MODEL_API_KEY: 'acceptance-placeholder-key',
    MODEL_BASE_URL: 'https://api.router.one/v1',
    MODEL_NAME: 'acceptance-placeholder-model',
    MEDIA_IMAGE_PROVIDER: 'color-background',
    MEDIA_TTS_PROVIDER: 'minimax-tts',
    MINIMAX_TTS_API_KEY: 'acceptance-placeholder-key',
    MINIMAX_TTS_VOICE: 'acceptance-placeholder-voice',
    MINIMAX_TTS_BASE_URL: 'https://api.minimax.chat',
    MINIMAX_TTS_MODEL: 'speech-2.8-turbo',
    MEDIA_COMPOSE_PROVIDER: 'ffmpeg',
    FFMPEG_PATH: 'ffmpeg',
    FFPROBE_PATH: 'ffprobe',
    WANX_API_KEY: '',
    WANX_BASE_URL: '',
    TTS_API_KEY: '',
    TTS_BASE_URL: '',
    TTS_MODEL: '',
    DOUYIN_CLIENT_KEY: '',
    DOUYIN_CLIENT_SECRET: '',
    DOUYIN_REDIRECT_URI: '',
    AI_ENGINE_URL: '',
    AI_ENGINE_SECRET: '',
    AGENT_DEBUG_PROMPTS: 'false',
    PLATFORM_SECRET_MASTER_KEY: '',
    RUN_REAL_TTS_TESTS: 'false',
    RUN_REAL_VISUAL_TESTS: 'false',
    RUN_FFMPEG_TESTS: 'false',
    RUN_REDIS_TESTS: 'false',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
    ...overrides,
  };
}

function scanSecrets(text) {
  const hits = [];
  for (const value of PLACEHOLDERS) {
    if (text.includes(value)) {
      hits.push('synthetic-placeholder');
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      hits.push(pattern.source);
    }
  }
  return [...new Set(hits)];
}

function spawnNode(entry, env, logName) {
  const child = spawn(process.execPath, [entry], {
    cwd: backendRoot,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const append = (chunk) => {
    output += chunk.toString('utf8');
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  const done = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return {
    child,
    done,
    getOutput: () => output,
    flush() {
      writeFileSync(path.join(logRoot, logName), output, 'utf8');
    },
  };
}

async function waitForExit(session, timeoutMs) {
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve({ code: null, signal: 'harness-timeout' }), timeoutMs);
  });
  return Promise.race([session.done, timeout]);
}

async function pollPortOpened(port, session, intervalMs = 50) {
  let opened = false;
  while (session.child.exitCode === null && session.child.signalCode === null) {
    if (await canConnect('127.0.0.1', port, 150)) {
      opened = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return opened;
}

async function waitUntil(predicate, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function gracefulStop(session, label) {
  if (session.child.exitCode !== null || session.child.signalCode !== null) {
    session.flush();
    return { status: 'PARTIAL', reason: `${label} already exited before shutdown signal` };
  }
  session.child.kill('SIGTERM');
  let result = await waitForExit(session, 12_000);
  if (result.signal === 'harness-timeout') {
    session.child.kill('SIGINT');
    result = await waitForExit(session, 8_000);
  }
  if (result.signal === 'harness-timeout') {
    session.child.kill('SIGKILL');
    await waitForExit(session, 3_000);
    session.flush();
    return { status: 'PARTIAL', reason: `${label} required SIGKILL` };
  }
  session.flush();
  const secrets = scanSecrets(session.getOutput());
  return {
    status: secrets.length > 0 ? 'PARTIAL' : 'PASS',
    code: result.code,
    signal: result.signal,
    secretHits: secrets,
  };
}

async function runInvalidCase(name, port, env, expectIssue) {
  const session = spawnNode(path.join(backendRoot, 'dist', 'main.js'), env, `invalid-${name}.log`);
  const opened = await pollPortOpened(port, session);
  const exit = await waitForExit(session, 15_000);
  session.flush();
  const output = session.getOutput();
  const secrets = scanSecrets(output);
  const listenedAfter = await canConnect('127.0.0.1', port, 200);
  return {
    name,
    exited: exit.signal !== 'harness-timeout',
    exitCode: exit.code,
    portOpenedDuring: opened,
    portOpenAfter: listenedAfter,
    expectedIssueSeen: output.includes(expectIssue),
    secretHits: secrets,
    safeError: /Configuration invalid|MODEL_PROVIDER is required|not allowed in production/i.test(output),
  };
}

async function preflight() {
  const pgOpen = await canConnect('127.0.0.1', 55432);
  const redisOpen = await canConnect('127.0.0.1', 6379);
  const ffmpeg = commandVersion('ffmpeg');
  const ffprobe = commandVersion('ffprobe');
  const port3101 = await canConnect('127.0.0.1', apiPort);

  let dbConnect = { ok: false, reason: 'skipped' };
  if (pgOpen) {
    const prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: [],
    });
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbConnect = { ok: true, reason: 'select-1' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'db connect failed';
      dbConnect = {
        ok: false,
        reason: /auth|password|P1000|P1010/i.test(message) ? 'auth-or-role-unavailable' : 'connect-failed',
      };
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  } else {
    dbConnect = { ok: false, reason: 'port-closed' };
  }

  let redisConnect = { ok: false, db15Pending: 0, isolated: false };
  if (redisOpen) {
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3_000, lazyConnect: true });
    try {
      await redis.connect();
      await redis.ping();
      const waiting = Number(await redis.llen('bull:acf-jobs:wait')) || 0;
      const paused = Number(await redis.llen('bull:acf-jobs:paused')) || 0;
      const active = Number(await redis.llen('bull:acf-jobs:active')) || 0;
      redisConnect = {
        ok: true,
        db15Pending: waiting + paused + active,
        isolated: true,
      };
    } catch {
      redisConnect = { ok: false, db15Pending: 0, isolated: false };
    } finally {
      redis.disconnect();
    }
  }

  return {
    postgres: pgOpen,
    redis: redisOpen,
    ffmpeg,
    ffprobe,
    port3101Free: !port3101,
    dbConnect,
    redisConnect,
  };
}

async function bootApi(deps) {
  const session = spawnNode(path.join(backendRoot, 'dist', 'main.js'), syntheticEnv(), 'api-production.log');
  const ready = await waitUntil(async () => canConnect('127.0.0.1', apiPort, 200), 25_000);
  if (!ready) {
    const exit = await waitForExit(session, 2_000);
    session.flush();
    return {
      ok: false,
      reason: exit.signal === 'harness-timeout' ? 'listen-timeout' : `exited-before-listen:${exit.code}`,
      outputHasConfigError: /Configuration invalid/i.test(session.getOutput()),
      secretHits: scanSecrets(session.getOutput()),
    };
  }

  const health = await fetch(`http://127.0.0.1:${apiPort}/health`);
  const body = await health.json();
  const output = session.getOutput();
  const secretHits = scanSecrets(output);
  const shutdown = await gracefulStop(session, 'api');
  const portLeftOpen = await canConnect('127.0.0.1', apiPort, 200);

  return {
    ok: health.status === 200 && body.status === 'ok' && body.service === 'backend' && !portLeftOpen,
    healthStatus: health.status,
    healthBody: body,
    dbConnected: deps.dbConnect.ok,
    redisConnected: deps.redisConnect.ok,
    ffmpegProbed: deps.ffmpeg.ok && deps.ffprobe.ok,
    secretHits,
    startupLooksSafe: secretHits.length === 0 && !/authorization|bearer /i.test(output),
    listened: true,
    shutdown,
    portLeftOpen,
    sawNestListen: /Nest application successfully started|listening/i.test(output),
  };
}

async function bootWorker(deps) {
  if (deps.redisConnect.db15Pending > 0) {
    return { ok: false, reason: 'isolated-queue-not-empty', skipped: true };
  }
  const session = spawnNode(
    path.join(backendRoot, 'dist', 'worker.js'),
    syntheticEnv({ PORT: '3104' }),
    'worker-production.log',
  );
  const started = await waitUntil(async () => /Job worker started/i.test(session.getOutput()), 25_000, 150);
  if (!started) {
    const exit = await waitForExit(session, 2_000);
    session.flush();
    return {
      ok: false,
      reason: exit.signal === 'harness-timeout' ? 'start-timeout' : `exited-before-start:${exit.code}`,
      secretHits: scanSecrets(session.getOutput()),
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 4_000));
  const idleOutput = session.getOutput();
  const idleUnsafe = /generate|compose|wanx|minimax|router\.one|chat\/completions|orphan/i.test(idleOutput)
    && /Video generation|TTS request|image generate|provider HTTP/i.test(idleOutput);
  const generated = /POST \/|creating media|FFmpeg compose started|synthesiz/i.test(idleOutput);
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  let pendingAfterIdle = 0;
  try {
    await redis.connect();
    pendingAfterIdle =
      (Number(await redis.llen('bull:acf-jobs:wait')) || 0) +
      (Number(await redis.llen('bull:acf-jobs:active')) || 0);
  } finally {
    redis.disconnect();
  }

  const secretHits = scanSecrets(idleOutput);
  const shutdown = await gracefulStop(session, 'worker');
  return {
    ok: started && !generated && pendingAfterIdle === 0,
    started,
    idleUnsafe,
    generated,
    pendingAfterIdle,
    secretHits,
    shutdown,
    dbConnected: deps.dbConnect.ok,
    redisConnected: deps.redisConnect.ok,
  };
}

function printReport(obj) {
  const json = JSON.stringify(obj, null, 2);
  writeFileSync(path.join(logRoot, 'acceptance-summary.json'), json, 'utf8');
  console.log(json);
}

const deps = await preflight();
if (!deps.postgres || !deps.redis || !deps.ffmpeg.ok || !deps.ffprobe.ok || !deps.dbConnect.ok || !deps.redisConnect.ok) {
  printReport({
    blocked: true,
    reason: 'local-dependency-unavailable',
    deps: {
      postgres: deps.postgres,
      redis: deps.redis,
      ffmpeg: deps.ffmpeg.ok,
      ffprobe: deps.ffprobe.ok,
      dbConnect: deps.dbConnect.ok,
      dbReason: deps.dbConnect.reason,
      redisConnect: deps.redisConnect.ok,
      port3101Free: deps.port3101Free,
    },
  });
  process.exit(2);
}

const invalidMissing = await runInvalidCase(
  'missing-model-provider',
  invalidPorts.missingModel,
  syntheticEnv({ PORT: String(invalidPorts.missingModel), MODEL_PROVIDER: '' }),
  'MODEL_PROVIDER is required',
);
const invalidMockCompose = await runInvalidCase(
  'mock-compose',
  invalidPorts.mockCompose,
  syntheticEnv({ PORT: String(invalidPorts.mockCompose), MEDIA_COMPOSE_PROVIDER: 'mock' }),
  'MEDIA_COMPOSE_PROVIDER=mock is not allowed in production',
);

const api = await bootApi(deps);
const worker = await bootWorker(deps);

printReport({
  blocked: false,
  deps: {
    postgres: true,
    redis: true,
    ffmpeg: deps.ffmpeg.summary,
    ffprobe: deps.ffprobe.summary,
    dbConnect: deps.dbConnect.ok,
    redisConnect: deps.redisConnect.ok,
    redisIsolation: 'db-index-15',
    db15PendingBefore: deps.redisConnect.db15Pending,
    port3101Free: deps.port3101Free,
    storageRoot: 'repo/.local/acceptance-bootstrap/storage',
  },
  invalid: { missingModel: invalidMissing, mockCompose: invalidMockCompose },
  api,
  worker,
});
