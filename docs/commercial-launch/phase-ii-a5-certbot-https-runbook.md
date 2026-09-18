# Phase II-A.5 Certbot / HTTPS runbook

Do not run these commands in this phase. Target: Ubuntu 24.04 LTS (Debian-compatible). Replace `YOUR_DOMAIN`.

## Before the first certificate

1. DNS A record for `YOUR_DOMAIN` points at the VPS public IP. Do not use this lab to change DNS.
2. Nginx HTTP server is enabled with `location /.well-known/acme-challenge/` and (temporarily) no forced HTTPS redirect **or** keep redirect only after certs exist.
3. `sudo mkdir -p /var/www/certbot`
4. Open 80/tcp.

## Install (not executed here)

```
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
```

## Issue

```
sudo certbot --nginx -d YOUR_DOMAIN
```

Or webroot:

```
sudo certbot certonly --webroot -w /var/www/certbot -d YOUR_DOMAIN
```

Then install `deploy/nginx/ai-content-factory.conf` with TLS paths:

`/etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem`

`/etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem`

Reload Nginx. Enable HTTP → HTTPS redirect.

## After certificate

- App login only over HTTPS.
- `COOKIE_SECURE=true`
- `CORS_ORIGIN=https://YOUR_DOMAIN`

## Renewal

systemd timer from the package: `certbot.timer`. Check (on VPS later):

```
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

HTTP/80 must remain open for renewal.
