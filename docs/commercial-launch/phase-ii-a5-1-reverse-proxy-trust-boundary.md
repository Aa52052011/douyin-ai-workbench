# Phase II-A.5.1 Reverse proxy trust boundary

Date: 2026-09-18. Nest/Express loopback trust only. No VPS login, DNS, Certbot, firewall, schema, or Git mutation.

## 1. Original Risk

Public traffic is terminated at Nginx (`:443`). Nest listens on `127.0.0.1:3001` only. Without Express `trust proxy`, `X-Forwarded-Proto` / `X-Forwarded-For` are not applied to `req.protocol` / `req.ip`. Login previously read raw `x-forwarded-for` first, so any client that could reach Nest could spoof IP for login-throttle keys.

`app.set('trust proxy', true)` would trust every hop and is not acceptable.

## 2. Existing Trust Behavior

Current Backend: NestJS 12 / `@nestjs/platform-express` (Express adapter).

| Item | Before this phase |
| --- | --- |
| Current Trust Proxy | unset (Express default: do not trust `X-Forwarded-*`) |
| Uses `req.ip` | YES (fallback after raw `X-Forwarded-For`) |
| Uses `req.protocol` | NO |
| Uses `req.secure` | NO |
| Rate Limiting Depends On IP | YES (`LoginThrottle` keyed by IP + email; not Redis/global limiter) |
| Auth Depends On Protocol | NO (`COOKIE_SECURE` env, not `req.secure`) |

## 3. Implemented Trust Scope

Express API used: `app.set('trust proxy', 'loopback')` via `proxy-addr` (Express-supported string). Applied in `configureApp` before `cookie-parser`.

| Env | Behavior |
| --- | --- |
| unset / production / development | `'loopback'` |
| `TRUST_PROXY=false` | trust disabled (local opt-out) |
| `TRUST_PROXY=true` / `1` / `*` / `all` | **rejected at runtime validation**; `applyTrustProxy` still coerces to `'loopback'` and never sets boolean `true` |

Choice: SINGLE VPS Nginx and Nest share loopback. Trust only loopback proxies. Do not use hop count `1` (would trust the first hop even if it were not loopback, if bind were ever widened). Development uses the same loopback setting so local tests match production semantics; previous raw-header IP trust was less safe.

Trust Scope: **LOOPBACK_ONLY**
Broad Proxy Trust: **NO**

## 4. Nginx Header Alignment

`deploy/nginx/ai-content-factory.conf` already had (frontend and `/api/`):

- `proxy_set_header Host $host;`
- `proxy_set_header X-Real-IP $remote_addr;`
- `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
- `proxy_set_header X-Forwarded-Proto $scheme;`

No nginx file change.

Nginx Header Alignment: **PASS**

## 5. HTTPS Recognition

Supertest to a loopback Express app with `trust proxy = loopback` and `X-Forwarded-Proto: https`:

- `req.protocol` = `https`
- `req.secure` = `true`

With `TRUST_PROXY=false`, the same headers yield `http` / `false`.

Production cookie `secure` flag remains `COOKIE_SECURE=true` (fail-fast), independent of `req.secure`.

Forwarded HTTPS: **PASS**

## 6. Client IP Semantics

`resolveClientIp` uses `req.ip` only (Express + trust proxy). Trusted loopback + `X-Forwarded-For: 203.0.113.10` → `req.ip` contains `203.0.113.10`.

Login audit/throttle IP uses `resolveClientIp(req)`.

Forwarded Client IP: **PASS**

## 7. Spoof Resistance

- `proxyaddr.compile('loopback')`: `127.0.0.1` / `::1` trusted; `10.0.0.8` / `203.0.113.10` not trusted.
- Trust disabled: spoofed `X-Forwarded-For` is not adopted as `req.ip`.
- `TRUST_PROXY=true` never becomes Express boolean `true`.
- Residual: a process already on loopback can send spoofed `X-Forwarded-*`. Production bind `127.0.0.1` keeps that to local processes only.

Spoof Resistance: **PASS**

## 8. Cookie / Auth Regression

`refresh-cookie.ts` still uses `COOKIE_SECURE === 'true'`. Production validation still requires it.

Local smoke (no full login account):

| Call | Result |
| --- | --- |
| `GET /auth/me` | 401 |
| `POST /auth/login` `{}` | 400 |
| `POST /auth/refresh` `{}` | 401 |
| `POST /auth/logout` `{}` | 201 (existing Nest POST default) |

Auth Regression: **PASS** (not `req.secure`-driven)

## 9. Tests

`vitest`: `trust-proxy.spec.ts`, `runtime-env.spec.ts`, `listen-config.spec.ts` — 38 passed.

Covered: production-safe enable; loopback scope; forwarded https via trusted hop; broad trust rejected/coerced; existing COOKIE/CORS/listen validation.

## 10. Builds

| Target | Result |
| --- | --- |
| Backend `npm run build -w backend` | PASS |
| Worker `npm run build -w workers` (delegates to backend) | PASS |
| Frontend `npm run build -w frontend` | PASS |

## 11. Local Runtime Regression

Backend restarted onto new `dist/main.js`.

| Check | Result |
| --- | --- |
| `GET http://127.0.0.1:3001/health` | 200 |
| Frontend `http://127.0.0.1:3010/` | 200 |
| Worker process | 1 alive |
| Embedded Postgres `127.0.0.1:55432` | listening |
| Redis `PING` | PONG |
| Auth smoke | PASS |

Local Runtime Regression: **PASS**
Proxy Simulation: **PASS** (automated; no VPS)

## 12. Security Check

| Item | Result |
| --- | --- |
| Tracked Secrets | 0 |
| CORS wildcard | NO (still rejected) |
| Backend production bind | `127.0.0.1` (`listen-config` + `BACKEND_HOST`) |
| Trust Proxy Broad | NO |
| COOKIE_SECURE production | ENFORCED |

## 13. Modified Files

This phase only (9):

- `apps/backend/src/config/trust-proxy.ts` (added)
- `apps/backend/src/config/trust-proxy.spec.ts` (added)
- `apps/backend/src/configure-app.ts`
- `apps/backend/src/auth/auth.controller.ts`
- `apps/backend/src/config/runtime-env.ts`
- `apps/backend/src/config/runtime-env.spec.ts`
- `.env.example`
- `deploy/env/.env.production.example`
- `docs/commercial-launch/phase-ii-a5-1-reverse-proxy-trust-boundary.md` (added)

Nginx template unchanged. No business modules beyond login IP helper.

## 14. DB Mutation

Schema Mutation: NO
Migration: NO
Business Data Mutation: NO
Validation Dataset Mutation: NO

## 15. Git Mutation

NO (`git add` / `commit` / `push` not run). HEAD remains `4f716c0`.

## 16. Remaining VPS Blockers

trust proxy P1: **CLOSED**

| Priority | Remaining |
| --- | --- |
| P0 | 1 — real VPS rehearsal (provisioning, systemd runtime, Nginx syntax, DNS, TLS, firewall) |
| P1 | 1 — scheduled backup runtime + off-server backup destination |
| P2 | 4 — CSP; CORS multi-host; readiness `/health`; crop-review cwd |

## 17. Gate

Trust Proxy = READY
Trust Scope = LOOPBACK_ONLY
Broad Proxy Trust = NO
Forwarded HTTPS = PASS
Spoof Resistance = PASS
Backend Bind = 127.0.0.1
COOKIE_SECURE enforcement = PASS
Backend / Worker / Frontend Build = PASS
Local Regression = PASS
Tracked Secrets = 0
DB Mutation = NO

Gate: **REVERSE_PROXY_TRUST_BOUNDARY_READY**
