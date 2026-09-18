# RC-10 Known Limitations

RC Version: 0.9.0-rc.1
These are documented constraints. Deferred product scope is **not** listed as a defect.

## P0

None.

## P1

None.

## P2 (do not fix in RC-10)

1. **Root `.env.example` incomplete** — file exists, size 0. `database/.env.example` only documents `DATABASE_URL`. **RELEASE_DOCUMENTATION_GAP**. Runtime names are in the runbook; values must never be copied into git.
2. **CORS default `http://localhost:3000` vs RC frontend 3010** — `configure-app.ts` non-production default origin is 3000. `next start` without `-p` is also 3000. LOCAL RC used **3010**. Browser cookie/CORS from 3010 may need `CORS_ORIGIN=http://localhost:3010` or testers use 3000. Overridable; not changed here.
3. **Worker single-instance guard missing** — two `dist\worker.js` processes can run. Operator must enforce count 0 → 1.
4. **localhost defaults** — `BACKEND_URL` default `http://localhost:3001`; JWT access secret has a non-production fallback string in code; Compose DB default 5432 vs RC embedded **55432**. Fine for LOCAL_WINDOWS_WEB_RC; not production.

## P3 (do not fix in RC-10)

1. **README wording** — root README still says “V1.0 MVP 初始化”; start snippet uses `db:up` (5432) and `dev:*` without 3010.
2. **Workspace package versions** — root `0.9.0-rc.1`; `apps/backend` `0.0.1`; `apps/frontend` `0.1.0`; `workers` `0.0.1`; `database` `0.0.1`.

## Known non-blocking model variance

Script generation produced `AGENT_INVALID_OUTPUT` once; official Retry 1 succeeded without schema/prompt changes. Classify as **KNOWN_NON_BLOCKING_MODEL_OUTPUT_VARIANCE**. Limited retry only.

## Media vs database

Video bytes are not inside the SQL dump. Restore of `acf_dev` without `MEDIA_STORAGE_ROOT` / `./storage` will not yield a playable file even if Video rows exist.

## FFmpeg

Required, host-installed, **not bundled**. Lab version 9.0.1.

## Publication

MANUAL / USER_ASSERTED / NOT_VERIFIED. Official Douyin auto publish and auto metrics remain **Deferred**, not P2.

## Windows Postgres start

`npm run db:local:start` can fail under Administrator. Use the existing PGDATA; do not initdb. See runbook §1.

## Environment matrix

Documented **PARTIAL** for VPS/GA because HTTPS, `CORS_ORIGIN`, `COOKIE_SECURE`, hosted Postgres/Redis, and FFmpeg provisioning are outside this Windows lab freeze.
