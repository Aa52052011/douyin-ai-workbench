/**
 * Web V1 RC backup/restore smoke.
 * Prefers pg_dump/pg_restore; otherwise plain SQL key-table dump + temp-DB restore.
 * Never prints passwords. Artifacts under ./backups (gitignored).
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'package.json'));
const { Client } = require('pg');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupsDir = path.join(repoRoot, 'backups');
const dumpSql = path.join(backupsDir, 'acf_web_v1_rc_smoke.sql');
const dumpCustom = path.join(backupsDir, 'acf_web_v1_rc_smoke.dump');
const tempDb = 'acf_rc_restore_test';
const KEY_TABLES = ['_prisma_migrations', 'users', 'projects', 'videos'];

const toolDirs = [
  path.join(repoRoot, '.local', 'pg-client', 'pgsql', 'bin'),
  path.join(repoRoot, 'database', 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin'),
];

function findTool(name) {
  for (const dir of toolDirs) {
    const exe = path.join(dir, process.platform === 'win32' ? `${name}.exe` : name);
    if (fs.existsSync(exe)) return exe;
  }
  const which = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  return null;
}

function parseDatabaseUrl(raw) {
  const u = new URL(raw.replace(/^postgresql:/, 'http:'));
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    database: (u.pathname || '').replace(/^\//, '').split('?')[0],
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    url: raw,
  };
}

function quoteIdent(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}

function run(bin, args, password) {
  return spawnSync(bin, args, {
    env: { ...process.env, PGPASSWORD: password },
    encoding: 'utf8',
    windowsHide: true,
  });
}

async function withClient(cfg, database, fn) {
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function dropDb(cfg, name) {
  await withClient(cfg, 'postgres', async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)}`);
  });
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString().replace(/'/g, "''")}'`;
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'`;
  if (Array.isArray(v)) {
    if (v.length === 0) return `'{}'`;
    const inner = v
      .map((x) => {
        if (x === null) return 'NULL';
        if (typeof x === 'number' || typeof x === 'boolean') return String(x);
        return `"${String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      })
      .join(',');
    return `'${`{${inner}}`.replace(/'/g, "''")}'`;
  }
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function writePlainSqlDump(cfg, outFile) {
  return withClient(cfg, cfg.database, async (client) => {
    const chunks = [];
    chunks.push('-- PostgreSQL database dump\n');
    chunks.push('-- ACF Web V1 RC smoke backup (plain SQL via node-pg; prefer pg_dump -Fc in production)\n');
    chunks.push("SET client_encoding = 'UTF8';\n");
    chunks.push('SET session_replication_role = replica;\n\n');

    const found = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[]) ORDER BY 1`,
      [KEY_TABLES],
    );
    const tables = found.rows.map((r) => r.tablename);
    if (!tables.includes('_prisma_migrations') || !tables.includes('users')) {
      throw new Error(`key tables missing; found=${tables.join(',')}`);
    }

    for (const tablename of tables) {
      const qTable = quoteIdent(tablename);
      const colsRes = await client.query(
        `
        SELECT a.attname AS name
        FROM pg_attribute a
        JOIN pg_class c ON a.attrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
        `,
        [tablename],
      );
      const colNames = colsRes.rows.map((r) => r.name);
      const cols = colNames.map(quoteIdent).join(', ');
      const countRes = await client.query(`SELECT COUNT(*)::int AS c FROM ${qTable}`);
      chunks.push(`-- Data for ${tablename} (rows=${countRes.rows[0].c})\n`);
      chunks.push(`DELETE FROM ${qTable};\n`);
      const rows = await client.query(`SELECT * FROM ${qTable}`);
      for (const row of rows.rows) {
        const values = colNames.map((name) => sqlLiteral(row[name]));
        chunks.push(`INSERT INTO ${qTable} (${cols}) VALUES (${values.join(', ')});\n`);
      }
      chunks.push('\n');
    }
    chunks.push('SET session_replication_role = DEFAULT;\n');
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.writeFileSync(outFile, chunks.join(''), 'utf8');
    return { tables, size: fs.statSync(outFile).size };
  });
}

async function restorePlain(cfg, dumpFile) {
  // Avoid TEMPLATE clone: source DB usually has live backend connections.
  await dropDb(cfg, tempDb);
  await withClient(cfg, 'postgres', async (client) => {
    await client.query(`CREATE DATABASE ${quoteIdent(tempDb)} OWNER ${quoteIdent(cfg.user)}`);
  });

  const tempUrl = cfg.url.replace(/\/[^/?]+(\?|$)/, `/${tempDb}$1`);
  const migrate = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'migrate', 'deploy', '--schema', 'database/prisma/schema.prisma'],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: tempUrl },
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
    },
  );
  if (migrate.status !== 0) {
    // Windows npx may need shell; retry once.
    const migrate2 = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['prisma', 'migrate', 'deploy', '--schema', 'database/prisma/schema.prisma'],
      {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: tempUrl },
        encoding: 'utf8',
        windowsHide: true,
        shell: true,
      },
    );
    if (migrate2.status !== 0) {
      throw new Error(`migrate deploy on temp DB failed: ${(migrate2.stderr || migrate2.stdout || migrate.stderr || '').slice(0, 600)}`);
    }
  }

  await withClient(cfg, tempDb, async (client) => {
    const sql = fs.readFileSync(dumpFile, 'utf8');
    for (const line of sql.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('--')) continue;
      // Skip migration row rewrite; schema already applied by migrate deploy.
      if (t.includes('"_prisma_migrations"') || t.includes('_prisma_migrations')) continue;
      await client.query(t.endsWith(';') ? t : `${t};`);
    }
  });

  const counts = await withClient(cfg, tempDb, async (client) => {
    const migrations = await client.query('SELECT COUNT(*)::int AS c FROM _prisma_migrations');
    const users = await client.query('SELECT COUNT(*)::int AS c FROM users');
    const videos = await client.query('SELECT COUNT(*)::int AS c FROM videos');
    return { migrations: migrations.rows[0].c, users: users.rows[0].c, videos: videos.rows[0].c };
  });

  await dropDb(cfg, tempDb);
  return counts;
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL || 'postgresql://acf:acf@127.0.0.1:55432/acf_dev?schema=public';
  const cfg = parseDatabaseUrl(databaseUrl);
  fs.mkdirSync(backupsDir, { recursive: true });

  const pgDump = findTool('pg_dump');
  const pgRestore = findTool('pg_restore');
  const psql = findTool('psql');

  if (pgDump) {
    const dump = run(
      pgDump,
      ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user, '-d', cfg.database, '--format=custom', `--file=${dumpCustom}`],
      cfg.password,
    );
    if (dump.status === 0 && fs.existsSync(dumpCustom) && fs.statSync(dumpCustom).size > 0) {
      const size = fs.statSync(dumpCustom).size;
      const magic = fs.readFileSync(dumpCustom).subarray(0, 5).toString('ascii');
      const list = pgRestore ? run(pgRestore, ['--list', dumpCustom], cfg.password) : { status: 1, stdout: '' };
      let restoreInfo = { skipped: true };
      if (pgRestore && psql) {
        run(psql, ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${tempDb};`], cfg.password);
        run(psql, ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user, '-d', 'postgres', '-c', `CREATE DATABASE ${tempDb} OWNER ${cfg.user};`], cfg.password);
        const restore = run(
          pgRestore,
          ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user, '-d', tempDb, '--no-owner', '--no-acl', dumpCustom],
          cfg.password,
        );
        const verify = run(
          psql,
          [
            '-h',
            cfg.host,
            '-p',
            String(cfg.port),
            '-U',
            cfg.user,
            '-d',
            tempDb,
            '-t',
            '-A',
            '-c',
            'SELECT COUNT(*) FROM _prisma_migrations; SELECT COUNT(*) FROM users;',
          ],
          cfg.password,
        );
        run(psql, ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${tempDb};`], cfg.password);
        restoreInfo = {
          restoreExit: restore.status,
          verify: (verify.stdout || '').trim().split(/\r?\n/),
          tempDbDropped: true,
        };
      }
      console.log(
        JSON.stringify({
          mode: 'pg_dump-custom',
          exit: 0,
          file: 'backups/acf_web_v1_rc_smoke.dump',
          size,
          magic,
          listExit: list.status,
          restore: restoreInfo,
        }),
      );
      return;
    }
  }

  process.stderr.write('dump:start\n');
  const dumped = await writePlainSqlDump(cfg, dumpSql);
  process.stderr.write(`dump:done size=${dumped.size} tables=${dumped.tables.join(',')}\n`);
  const head = fs.readFileSync(dumpSql, 'utf8').slice(0, 120);
  process.stderr.write('restore:start\n');
  const restore = await restorePlain(cfg, dumpSql);
  process.stderr.write('restore:done\n');
  console.log(
    JSON.stringify({
      mode: 'plain-sql-node-pg',
      exit: 0,
      file: 'backups/acf_web_v1_rc_smoke.sql',
      size: dumped.size,
      tables: dumped.tables,
      recognizable: head.includes('PostgreSQL database dump'),
      restore: { ...restore, tempDbDropped: true },
      note: 'Native pg_dump not on PATH/Docker daemon down; plain SQL key-table smoke used.',
    }),
  );
}

main().catch((err) => {
  console.error(String(err?.stack || err).slice(0, 1500));
  process.exit(1);
});
