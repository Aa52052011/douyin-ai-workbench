import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIR = path.join(
  repoRoot,
  'database',
  'node_modules',
  '@embedded-postgres',
  'windows-x64',
  'native',
  'bin',
);
const DATA_DIR = path.join(repoRoot, '.local', 'postgres', 'data');
const LOG_DIR = path.join(repoRoot, '.local', 'postgres', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'postgres.log');
const HOST = '127.0.0.1';
const PORT = 55432;
const ROLE = 'acf';
const DEV_DATABASE = 'acf_dev';
const ADMIN_DATABASE = 'postgres';

const POSTGRES = path.join(BIN_DIR, 'postgres.exe');
const PG_CTL = path.join(BIN_DIR, 'pg_ctl.exe');
const INITDB = path.join(BIN_DIR, 'initdb.exe');

const ENV_FILES = [path.join(repoRoot, 'database', '.env'), path.join(repoRoot, '.env')];

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

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

function startDetached(file, args, stdio = 'ignore') {
  const child = spawn(file, args, {
    cwd: BIN_DIR,
    windowsHide: true,
    detached: true,
    shell: false,
    stdio,
    env: {
      ...process.env,
      PATH: `${BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
    },
  });
  child.unref();
}

function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: BIN_DIR,
      windowsHide: true,
      detached: false,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: `${BIN_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
      },
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (status) => {
      if (status === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${path.basename(file)} failed (exit ${status}). ${stderr || stdout}`.trim()));
    });
  });
}

function parseDatabaseUrl(raw) {
  const u = new URL(raw.replace(/^postgresql:/, 'http:'));
  return {
    host: u.hostname,
    port: u.port || '5432',
    database: (u.pathname || '').replace(/^\//, '').split('?')[0],
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    schema: new URLSearchParams(u.search).get('schema') || 'public',
    encoded: raw,
  };
}

function readEnvDatabaseUrl(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^DATABASE_URL=(?:"([^"]+)"|'([^']+)'|(\S+))/m);
  if (!match) {
    return null;
  }
  return parseDatabaseUrl((match[1] || match[2] || match[3]).trim());
}

function developmentCredentials() {
  if (process.env.DATABASE_URL?.trim()) {
    return parseDatabaseUrl(process.env.DATABASE_URL.trim());
  }
  for (const file of ENV_FILES) {
    const parsed = readEnvDatabaseUrl(file);
    if (parsed) {
      return parsed;
    }
  }
  fail('DATABASE_URL is missing. Set it in database/.env or the repository root .env.');
}

function assertRole(parsed) {
  if (parsed.user !== ROLE) {
    fail(`Development DATABASE_URL user must be ${ROLE}.`);
  }
  if (!parsed.password) {
    fail('Development DATABASE_URL has no password. Refusing to invent one.');
  }
}

function assertBinaries() {
  for (const file of [POSTGRES, PG_CTL, INITDB]) {
    if (!fs.existsSync(file)) {
      fail(`LOCAL_POSTGRES_BINARIES_INCOMPLETE: missing ${file}`);
    }
  }
  const native = path.join(BIN_DIR, '..');
  for (const rel of ['share', 'share/locale', 'share/timezone', 'lib']) {
    const target = path.join(native, ...rel.split('/'));
    if (!fs.existsSync(target)) {
      fail(`LOCAL_POSTGRES_BINARIES_INCOMPLETE: missing ${rel}`);
    }
  }
}

async function assertVersions() {
  const postgres = await run(POSTGRES, ['-V']);
  const pgCtl = await run(PG_CTL, ['--version']);
  const initdb = await run(INITDB, ['-V']);
  const versions = [postgres.stdout, pgCtl.stdout, initdb.stdout].join('\n');
  if (!versions.includes('16.14')) {
    fail(`Unexpected PostgreSQL version:\n${versions}`);
  }
}

function dataDirState() {
  if (!fs.existsSync(DATA_DIR)) {
    return 'missing';
  }
  const entries = fs.readdirSync(DATA_DIR);
  if (entries.length === 0) {
    return 'empty';
  }
  if (fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    return 'initialized';
  }
  return 'foreign';
}

function writePgHba() {
  const conf = `# AI Content Factory local development. Do not expose the network.
# TYPE  DATABASE        USER            ADDRESS                 METHOD
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
`;
  fs.writeFileSync(path.join(DATA_DIR, 'pg_hba.conf'), conf, 'utf8');
}

function patchPostgresqlConf() {
  const file = path.join(DATA_DIR, 'postgresql.conf');
  let text = fs.readFileSync(file, 'utf8');
  const overlay = `

# AI Content Factory Windows local development
listen_addresses = '127.0.0.1'
port = ${PORT}
password_encryption = scram-sha-256
`;
  if (!text.includes("listen_addresses = '127.0.0.1'")) {
    text += overlay;
  }
  fs.writeFileSync(file, text, 'utf8');
}

async function initCluster() {
  assertBinaries();
  await assertVersions();
  const creds = developmentCredentials();
  assertRole(creds);
  const state = dataDirState();
  if (state === 'initialized' || state === 'foreign') {
    fail(`Refusing to initdb: data directory already exists (${DATA_DIR}).`);
  }
  if (await canConnect(HOST, PORT)) {
    fail(`Port ${PORT} is already in use. Not killing the process.`);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const pwfile = path.join(os.tmpdir(), `acf-pg-pw-${randomBytes(8).toString('hex')}`);
  try {
    fs.writeFileSync(pwfile, `${creds.password}\n`, { encoding: 'utf8', mode: 0o600 });
    await run(INITDB, [
      `--pgdata=${DATA_DIR}`,
      `--username=${ROLE}`,
      `--pwfile=${pwfile}`,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
      '--lc-collate=C',
      '--lc-ctype=C',
      '--lc-messages=C',
    ]);
  } finally {
    fs.rmSync(pwfile, { force: true });
  }
  writePgHba();
  patchPostgresqlConf();
  console.log(`Initialized persistent cluster at ${DATA_DIR}`);
}

async function pgCtl(args) {
  return run(PG_CTL, ['-D', DATA_DIR, ...args]);
}

async function waitForReady(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not ready';
  while (Date.now() < deadline) {
    if (!(await canConnect(HOST, PORT, 400))) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    const client = adminClient(ADMIN_DATABASE);
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      try {
        await client.end();
      } catch {
        // ignore
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  fail(`PostgreSQL did not become ready: ${lastError.split('\n')[0]}`);
}

async function startCluster() {
  assertBinaries();
  if (dataDirState() !== 'initialized') {
    fail('Local cluster is not initialized. Run: npm run db:local:init');
  }
  if (await canConnect(HOST, PORT)) {
    console.log(`PostgreSQL already listening on ${HOST}:${PORT}`);
    await waitForReady();
    await ensureDevDatabase();
    return;
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');
  try {
    startDetached(POSTGRES, ['-D', DATA_DIR], ['ignore', logFd, logFd]);
  } finally {
    fs.closeSync(logFd);
  }
  await waitForReady();
  await ensureDevDatabase();
  console.log(`PostgreSQL listening on ${HOST}:${PORT}`);
}

async function stopCluster() {
  if (dataDirState() !== 'initialized') {
    console.log('Local cluster is not initialized.');
    return;
  }
  try {
    await pgCtl(['stop', '-m', 'fast']);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not running|No such process|PID file/i.test(message) && !(await canConnect(HOST, PORT))) {
      console.log('PostgreSQL is not running.');
      return;
    }
    throw error;
  }
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (!(await canConnect(HOST, PORT))) {
      console.log('PostgreSQL stopped.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail('pg_ctl stop finished but the port is still listening.');
}

async function statusCluster() {
  const listening = await canConnect(HOST, PORT);
  console.log(`port ${HOST}:${PORT} listening=${listening}`);
  if (dataDirState() !== 'initialized') {
    console.log('data directory: not initialized');
    return;
  }
  try {
    const result = await pgCtl(['status']);
    process.stdout.write(result.stdout || result.stderr);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(message.split('\n')[0]);
  }
}

function adminClient(database) {
  const creds = developmentCredentials();
  assertRole(creds);
  return new Client({
    host: HOST,
    port: PORT,
    user: ROLE,
    password: creds.password,
    database,
  });
}

async function ensureDevDatabase() {
  const client = adminClient(ADMIN_DATABASE);
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DEV_DATABASE]);
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE ${DEV_DATABASE} OWNER ${ROLE} ENCODING 'UTF8'`);
      console.log(`Created database ${DEV_DATABASE}`);
    }
    const owner = await client.query(
      `SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1`,
      [DEV_DATABASE],
    );
    if (owner.rows[0]?.owner !== ROLE) {
      fail(`Database ${DEV_DATABASE} owner is not ${ROLE}.`);
    }
  } finally {
    await client.end();
  }
}

async function inspectCluster() {
  const admin = adminClient(ADMIN_DATABASE);
  await admin.connect();
  try {
    const dbs = await admin.query(
      `SELECT datname FROM pg_database WHERE datname IN ('acf_dev', 'acf_test') ORDER BY datname`,
    );
    console.log(`databases=${dbs.rows.map((row) => row.datname).join(',') || '(none)'}`);
  } finally {
    await admin.end();
  }
  const client = adminClient(DEV_DATABASE);
  await client.connect();
  try {
    const version = await client.query('SHOW server_version');
    const listen = await client.query('SHOW listen_addresses');
    const port = await client.query('SHOW port');
    console.log(`database=${DEV_DATABASE} version=${version.rows[0].server_version}`);
    console.log(`listen_addresses=${listen.rows[0].listen_addresses} port=${port.rows[0].port}`);
    const tables = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('publication_metric_snapshots', '_prisma_migrations')
      ORDER BY tablename
    `);
    console.log(`tables=${tables.rows.map((row) => row.tablename).join(',') || '(none)'}`);
    const enums = await client.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('MetricSource', 'JobKind')
      ORDER BY t.typname, e.enumsortorder
    `);
    const labels = enums.rows.map((row) => `${row.typname}:${row.enumlabel}`);
    console.log(`enums=${labels.join(',') || '(none)'}`);
    const migrations = await client.query(`
      SELECT migration_name FROM _prisma_migrations ORDER BY started_at
    `).catch(() => ({ rows: [] }));
    console.log(`migrations=${migrations.rows.map((row) => row.migration_name).join(',') || '(none)'}`);
  } finally {
    await client.end();
  }
}

function rewriteDatabaseUrl(raw) {
  const http = new URL(raw.replace(/^postgresql:/, 'http:'));
  http.hostname = HOST;
  http.port = String(PORT);
  if (!http.pathname || http.pathname === '/') {
    http.pathname = `/${DEV_DATABASE}`;
  }
  if (!http.searchParams.get('schema')) {
    http.searchParams.set('schema', 'public');
  }
  return `postgresql:${http.toString().slice('http:'.length)}`;
}

function updateEnvFiles() {
  for (const file of ENV_FILES) {
    if (!fs.existsSync(file)) {
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    const next = text.replace(/^DATABASE_URL=(?:"([^"]+)"|'([^']+)'|(\S+))/m, (_all, dq, sq, bare) => {
      const current = (dq || sq || bare).trim();
      const updated = rewriteDatabaseUrl(current);
      const quote = dq ? '"' : sq ? "'" : '';
      return `DATABASE_URL=${quote}${updated}${quote}`;
    });
    if (next === text) {
      fail(`Could not update DATABASE_URL in ${path.relative(repoRoot, file)}`);
    }
    fs.writeFileSync(file, next, 'utf8');
    console.log(`Updated DATABASE_URL host/port in ${path.relative(repoRoot, file)}`);
  }
}

const command = process.argv[2];
const commands = {
  init: initCluster,
  start: startCluster,
  stop: stopCluster,
  status: statusCluster,
    verify: inspectCluster,
    inspect: inspectCluster,
  'update-env': async () => {
    updateEnvFiles();
  },
};

if (!command || !commands[command]) {
  fail('Usage: node scripts/local-postgres.mjs <init|start|stop|status|inspect|update-env>');
}

try {
  await commands[command]();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
