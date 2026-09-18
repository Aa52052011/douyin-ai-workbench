# Phase II-A.5 Nginx HTTPS and deployment package

Date: 2026-09-18. Templates and runbooks only. No VPS, DNS, certbot, or Git mutation.

## Production Network Topology

Internet → 443 Nginx → `/` Next `127.0.0.1:3010`; `/api/` Nest `127.0.0.1:3001` (prefix stripped). Worker has no port. PG `127.0.0.1:5432`, Redis `127.0.0.1:6379`.

## API Proxy Prefix Strategy

**A: `location /api/` + `proxy_pass http://127.0.0.1:3001/`**

Nest has no `setGlobalPrefix`. Browser `NEXT_PUBLIC_API_BASE=/api` + `/auth/login` → `/api/auth/login` → Nest `/auth/login`. `/api/health` → `/health`.

Public `/api` is **Nginx only**. Next rewrite stays for loopback `:3010` and does not receive Internet `/api` (more specific Nginx location). No frontend architecture change.

WebSocket Required: **NO**

Nginx Upload Limit: **128m** (`MEDIA_MAX_UPLOAD_BYTES` default 128MiB; app max 512MiB)

proxy_read/send_timeout `/api`: **240s** (matches Next `proxyTimeout`; video work is async jobs)

Production Media Serving: **API only** (no Nginx alias of `MEDIA_STORAGE_ROOT`)

## Remaining blockers after this package

P0: real VPS rehearsal (DNS, cert, firewall apply, systemd enable, backup timer runtime)

P1: Nest `trust proxy` behind Nginx; off-server copy actually configured

P2: CSP; CORS multi-host; readiness `/health`; crop-review cwd
