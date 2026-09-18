# Phase II-A.5 Redis VPS runbook

Do not run on a live VPS in this phase. No public `6379`.

## Role

BullMQ job queue (`acf-jobs`) and Douyin OAuth state (when that feature is enabled). Worker singleton lock key `acf:worker:singleton`.

## Install

Redis 7.x from distro. `bind 127.0.0.1`. `protected-mode yes`. Enable AOF (`appendonly yes`) so jobs/lock/OAuth state survive reboot.

Firewall: do not allow 6379/tcp from the internet.

## Password

The app has **no** `REDIS_PASSWORD` variable. If Redis `requirepass` is set, put it in `REDIS_URL`:

`redis://:PASSWORD@127.0.0.1:6379`

ioredis accepts that URL. Do not invent a second env name.

## Health

`redis-cli -h 127.0.0.1 ping` → `PONG`
