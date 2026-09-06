/**
 * Step 12.10 read-only + video + auth smoke.
 * Synthetic production-like env. No paid provider calls.
 * Does not read or print user .env secrets.
 */
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = path.join(repoRoot, 'apps', 'backend');
const apiPort = 3111;
const fePort = 3010;
const databaseUrl = 'postgresql://acf:acf@127.0.0.1:55432/acf_dev?schema=public';
const redisUrl = 'redis://127.0.0.1:6379/14';
const storageRoot = path.join(repoRoot, 'apps', 'backend', 'storage');

const logRoot = path.join(repoRoot, '.local', 'rc-smoke', 'logs');
mkdirSync(logRoot, { recursive: true });
const ACCEPTANCE_EMAIL = 'rpa-2ad45b2d@example.test';
const ACCEPTANCE_PASSWORD = 'Acceptance12';

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

function apiEnv() {
  return {
    ...baseWindowsEnv(),
    NODE_ENV: 'production',
    PORT: String(apiPort),
    JWT_ACCESS_SECRET: 'rc-smoke-jwt-secret-not-for-production',
    DATABASE_URL: databaseUrl,
    CORS_ORIGIN: `http://127.0.0.1:${fePort}`,
    REDIS_URL: redisUrl,
    MEDIA_STORAGE_ROOT: storageRoot,
    COOKIE_SECURE: 'false',
    MODEL_PROVIDER: 'real',
    MODEL_API_KEY: 'rc-placeholder-key',
    MODEL_BASE_URL: 'https://api.router.one/v1',
    MODEL_NAME: 'rc-placeholder-model',
    MEDIA_IMAGE_PROVIDER: 'color-background',
    MEDIA_TTS_PROVIDER: 'minimax-tts',
    MINIMAX_TTS_API_KEY: 'rc-placeholder-key',
    MINIMAX_TTS_VOICE: 'rc-placeholder-voice',
    MINIMAX_TTS_BASE_URL: 'https://api.minimax.chat',
    MINIMAX_TTS_MODEL: 'speech-2.8-turbo',
    MEDIA_COMPOSE_PROVIDER: 'ffmpeg',
    FFMPEG_PATH: 'ffmpeg',
    FFPROBE_PATH: 'ffprobe',
    AGENT_DEBUG_PROMPTS: 'false',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
  };
}

function spawnNode(entry, env, logName) {
  const child = spawn(process.execPath, [entry], {
    cwd: backendRoot,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (c) => {
    output += c.toString('utf8');
  });
  child.stderr?.on('data', (c) => {
    output += c.toString('utf8');
  });
  return {
    child,
    flush() {
      writeFileSync(path.join(logRoot, logName), output, 'utf8');
    },
    getOutput: () => output,
  };
}

async function waitListen(port, session, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (session.child.exitCode !== null) return false;
    if (await canConnect('127.0.0.1', port, 200)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function stop(session) {
  if (session.child.exitCode !== null) return;
  session.child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 2000));
  if (session.child.exitCode === null) session.child.kill('SIGKILL');
  session.flush();
}

async function http(pathname, opts = {}) {
  const res = await fetch(`http://127.0.0.1:${apiPort}${pathname}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(opts.json ? { 'content-type': 'application/json' } : {}),
    },
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
  });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: res.status, headers: res.headers, body, text };
}

async function main() {
  const report = {
    paidProviderCalls: 0,
    backendHealth: null,
    auth: {},
    readonly: {},
    video: {},
    frontend: {},
    legacy404: {},
  };

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.$connect();
  const completedVideo = await prisma.video.findFirst({
    where: { status: 'COMPLETED' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, projectId: true },
  });
  const project = completedVideo
    ? await prisma.project.findUnique({ where: { id: completedVideo.projectId }, select: { id: true, name: true } })
    : await prisma.project.findFirst({ select: { id: true, name: true } });
  await prisma.$disconnect();

  if (!project) throw new Error('no project in DB for read-only smoke');

  const api = spawnNode(path.join(backendRoot, 'dist', 'main.js'), apiEnv(), 'api.log');
  const listened = await waitListen(apiPort, api);
  if (!listened) {
    api.flush();
    throw new Error(`API failed to listen: ${api.getOutput().slice(-500)}`);
  }

  const health = await http('/health');
  report.backendHealth = { status: health.status, ok: health.status === 200 };

  const unauth = await http(`/projects/${project.id}`);
  report.auth.unauthenticatedProtected = {
    status: unauth.status,
    blocked: unauth.status === 401 || unauth.status === 403,
  };

  const login = await http('/auth/login', {
    method: 'POST',
    json: { email: ACCEPTANCE_EMAIL, password: ACCEPTANCE_PASSWORD },
  });
  const setCookie = login.headers.getSetCookie?.() || [];
  const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ');
  const accessToken =
    (login.body && typeof login.body === 'object' && (login.body.accessToken || login.body.access_token)) ||
    null;
  report.auth.login = {
    status: login.status,
    ok: login.status === 200 || login.status === 201,
    cookiePresent: setCookie.length > 0,
    accessTokenPresent: Boolean(accessToken),
  };

  const authHeaders = {
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };

  const logoutProbe = await http('/auth/logout', { method: 'POST', headers: authHeaders });
  report.auth.logoutRoute = { status: logoutProbe.status, reachable: logoutProbe.status < 500 };

  // re-login after logout for remaining reads
  const login2 = await http('/auth/login', {
    method: 'POST',
    json: { email: ACCEPTANCE_EMAIL, password: ACCEPTANCE_PASSWORD },
  });
  const setCookie2 = login2.headers.getSetCookie?.() || [];
  const cookie2 = setCookie2.map((c) => c.split(';')[0]).join('; ');
  const token2 =
    (login2.body && typeof login2.body === 'object' && (login2.body.accessToken || login2.body.access_token)) ||
    null;
  const auth2 = {
    ...(token2 ? { authorization: `Bearer ${token2}` } : {}),
    ...(cookie2 ? { cookie: cookie2 } : {}),
  };

  const reads = {};
  for (const [name, pathName] of [
    ['project', `/projects/${project.id}`],
    ['projects', '/projects'],
  ]) {
    const r = await http(pathName, { headers: auth2 });
    reads[name] = { status: r.status, ok: r.status === 200 };
  }

  // Best-effort related collections (ignore missing routes)
  for (const [name, pathName] of [
    ['productBriefs', `/projects/${project.id}/product-briefs`],
    ['positioning', `/projects/${project.id}/account-positionings`],
    ['marketResearch', `/projects/${project.id}/market-researches`],
    ['insights', `/projects/${project.id}/market-insights`],
    ['strategies', `/projects/${project.id}/campaign-strategies`],
    ['plans', `/projects/${project.id}/content-plans`],
    ['scripts', `/projects/${project.id}/scripts`],
    ['videos', `/projects/${project.id}/videos`],
  ]) {
    const r = await http(pathName, { headers: auth2 });
    reads[name] = { status: r.status, ok: r.status === 200 || r.status === 404 };
  }
  report.readonly = reads;

  if (completedVideo) {
    const detail = await http(`/videos/${completedVideo.id}`, { headers: auth2 });
    const contentPath =
      detail.body &&
      typeof detail.body === 'object' &&
      detail.body.outputAsset &&
      typeof detail.body.outputAsset === 'object'
        ? detail.body.outputAsset.contentPath
        : null;
    let preview = { status: 0, contentType: null, length: 0, path: contentPath };
    if (typeof contentPath === 'string' && contentPath.length > 0) {
      const r = await fetch(`http://127.0.0.1:${apiPort}${contentPath}`, { headers: auth2 });
      const buf = Buffer.from(await r.arrayBuffer());
      preview = {
        path: contentPath,
        status: r.status,
        contentType: r.headers.get('content-type'),
        length: buf.byteLength,
      };
    }
    const expRes = await fetch(`http://127.0.0.1:${apiPort}/videos/${completedVideo.id}/export`, {
      headers: auth2,
    });
    const expBuf = Buffer.from(await expRes.arrayBuffer());
    const exp = {
      path: `/videos/${completedVideo.id}/export`,
      status: expRes.status,
      contentType: expRes.headers.get('content-type'),
      length: expBuf.byteLength,
    };
    report.video = {
      idPresent: true,
      detailStatus: detail.status,
      preview,
      export: exp,
      previewPass:
        preview.status === 200 &&
        preview.length > 0 &&
        String(preview.contentType || '').includes('video'),
      exportPass:
        exp.status === 200 && exp.length > 0 && String(exp.contentType || '').includes('video'),
    };
  } else {
    report.video = { idPresent: false, previewPass: false, exportPass: false };
  }

  // Frontend production start
  const fe = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'start', '-p', String(fePort)],
    {
      cwd: path.join(repoRoot, 'apps', 'frontend'),
      env: {
        ...baseWindowsEnv(),
        NODE_ENV: 'production',
        PORT: String(fePort),
        BACKEND_URL: `http://127.0.0.1:${apiPort}`,
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    },
  );
  let feOut = '';
  fe.stdout?.on('data', (c) => {
    feOut += c.toString('utf8');
  });
  fe.stderr?.on('data', (c) => {
    feOut += c.toString('utf8');
  });
  const feUp = await (async () => {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (fe.exitCode !== null) return false;
      if (await canConnect('127.0.0.1', fePort, 200)) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  })();

  if (feUp) {
    const loginPage = await fetch(`http://127.0.0.1:${fePort}/login`);
    const dash = await fetch(`http://127.0.0.1:${fePort}/dashboard`, { redirect: 'manual' });
    const legacy = await fetch(`http://127.0.0.1:${fePort}/dashboard/agents`, { redirect: 'manual' });
    const asset = await fetch(`http://127.0.0.1:${fePort}/_next/static/chunks/webpack.js`).catch(() => null);
    report.frontend = {
      up: true,
      login: loginPage.status,
      dashboard: dash.status,
      nextAsset: asset ? asset.status : null,
    };
    report.legacy404 = {
      path: '/dashboard/agents',
      status: legacy.status,
      pass: legacy.status === 404,
    };
  } else {
    report.frontend = { up: false, logTail: feOut.slice(-400) };
    report.legacy404 = { pass: false };
  }

  fe.kill('SIGTERM');
  await stop(api);

  const pass =
    report.backendHealth?.ok &&
    report.auth.login?.ok &&
    report.auth.unauthenticatedProtected?.blocked &&
    report.frontend.up &&
    report.legacy404.pass &&
    (report.video.previewPass || !report.video.idPresent === false ? report.video.previewPass : false);

  console.log(JSON.stringify({ pass, ...report }, null, 2));
  if (!report.backendHealth?.ok || !report.frontend.up || !report.legacy404.pass) process.exit(1);
  if (report.video.idPresent && (!report.video.previewPass || !report.video.exportPass)) process.exit(1);
}

main().catch((err) => {
  console.error(String(err?.stack || err).slice(0, 1200));
  process.exit(1);
});
