/**
 * Cleanup leftover RC restore DB + connections, then validate restore from existing dump.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'package.json'));
const { Client } = require('pg');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dumpSql = path.join(repoRoot, 'backups', 'acf_web_v1_rc_smoke.sql');
const tempDb = 'acf_rc_restore_test2';
const cfg = {
  host: '127.0.0.1',
  port: 55432,
  user: 'acf',
  password: 'acf',
};

async function withClient(database, fn) {
  const client = new Client({ ...cfg, database });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function forceDropTemp() {
  await withClient('postgres', async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [tempDb],
    );
    await new Promise((r) => setTimeout(r, 300));
    await client.query(`DROP DATABASE IF EXISTS "${tempDb}"`);
  });
}

async function main() {
  if (!fs.existsSync(dumpSql) || fs.statSync(dumpSql).size <= 0) {
    throw new Error('missing dump file');
  }
  const head = fs.readFileSync(dumpSql, 'utf8').slice(0, 80);
  if (!head.includes('PostgreSQL database dump')) {
    throw new Error('dump not recognizable');
  }

  process.stderr.write('cleanup:start\n');
  await forceDropTemp();
  process.stderr.write('cleanup:done\n');

  await withClient('postgres', async (client) => {
    await client.query(`CREATE DATABASE "${tempDb}" OWNER acf`);
  });
  process.stderr.write('created:temp\n');

  const tempUrl = `postgresql://acf:acf@127.0.0.1:55432/${tempDb}?schema=public`;
  const migrate = spawnSync('npx.cmd', ['prisma', 'migrate', 'deploy', '--schema', 'database/prisma/schema.prisma'], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: tempUrl },
    encoding: 'utf8',
    windowsHide: true,
    shell: true,
    timeout: 120_000,
  });
  if (migrate.status !== 0) {
    throw new Error(`migrate failed: ${(migrate.stderr || migrate.stdout || '').slice(0, 800)}`);
  }
  process.stderr.write('migrate:done\n');

  await withClient(tempDb, async (client) => {
    const sql = fs.readFileSync(dumpSql, 'utf8');
    for (const line of sql.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('--')) continue;
      if (t.includes('_prisma_migrations')) continue;
      await client.query(t.endsWith(';') ? t : `${t};`);
    }
  });
  process.stderr.write('data:restored\n');

  const counts = await withClient(tempDb, async (client) => {
    const migrations = await client.query('SELECT COUNT(*)::int AS c FROM _prisma_migrations');
    const users = await client.query('SELECT COUNT(*)::int AS c FROM users');
    const videos = await client.query('SELECT COUNT(*)::int AS c FROM videos');
    return { migrations: migrations.rows[0].c, users: users.rows[0].c, videos: videos.rows[0].c };
  });

  await forceDropTemp();
  console.log(
    JSON.stringify({
      backup: { file: 'backups/acf_web_v1_rc_smoke.sql', size: fs.statSync(dumpSql).size, recognizable: true },
      restore: { ...counts, tempDbDropped: true },
      exit: 0,
    }),
  );
}

main().catch(async (err) => {
  console.error(String(err?.stack || err).slice(0, 1500));
  try {
    await forceDropTemp();
  } catch {
    // ignore cleanup failure
  }
  process.exit(1);
});
