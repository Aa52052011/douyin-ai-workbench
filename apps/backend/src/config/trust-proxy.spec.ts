import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import proxyaddr from 'proxy-addr';
import {
  TRUST_PROXY_LOOPBACK,
  applyTrustProxy,
  isBroadTrustProxyValue,
  resolveClientIp,
  resolveTrustProxySetting,
} from './trust-proxy.js';

describe('trust proxy', () => {
  it('never enables broad trust', () => {
    expect(isBroadTrustProxyValue('true')).toBe(true);
    expect(isBroadTrustProxyValue('1')).toBe(true);
    expect(isBroadTrustProxyValue('*')).toBe(true);
    expect(resolveTrustProxySetting({ NODE_ENV: 'production', TRUST_PROXY: 'true' })).toBe(TRUST_PROXY_LOOPBACK);
    expect(resolveTrustProxySetting({ NODE_ENV: 'production' })).toBe(TRUST_PROXY_LOOPBACK);
    expect(resolveTrustProxySetting({ NODE_ENV: 'development' })).toBe(TRUST_PROXY_LOOPBACK);
    expect(resolveTrustProxySetting({ TRUST_PROXY: 'false' })).toBe(false);
  });

  it('limits Express trust to loopback addresses', () => {
    const trust = proxyaddr.compile(TRUST_PROXY_LOOPBACK);
    expect(trust('127.0.0.1', 0)).toBe(true);
    expect(trust('::1', 0)).toBe(true);
    expect(trust('10.0.0.8', 0)).toBe(false);
    expect(trust('203.0.113.10', 0)).toBe(false);
  });

  it('uses req.ip rather than raw X-Forwarded-For', () => {
    expect(resolveClientIp({ ip: '203.0.113.10' })).toBe('203.0.113.10');
    expect(resolveClientIp({})).toBe('0.0.0.0');
  });

  it('accepts forwarded https and client IP from a loopback hop', async () => {
    const app = express();
    expect(applyTrustProxy(app, { NODE_ENV: 'production' })).toBe(TRUST_PROXY_LOOPBACK);
    app.get('/probe', (req, res) => {
      res.json({
        ip: req.ip,
        protocol: req.protocol,
        secure: req.secure,
        trust: app.get('trust proxy'),
      });
    });
    const res = await request(app)
      .get('/probe')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', '203.0.113.10');
    expect(res.body.trust).toBe('loopback');
    expect(res.body.protocol).toBe('https');
    expect(res.body.secure).toBe(true);
    expect(res.body.ip).toContain('203.0.113.10');
  });

  it('ignores spoofed forwarded proto when trust is disabled', async () => {
    const app = express();
    applyTrustProxy(app, { TRUST_PROXY: 'false' });
    app.get('/probe', (req, res) => {
      res.json({ protocol: req.protocol, secure: req.secure, ip: req.ip });
    });
    const res = await request(app)
      .get('/probe')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', '203.0.113.10');
    expect(res.body.protocol).toBe('http');
    expect(res.body.secure).toBe(false);
    expect(String(res.body.ip)).not.toContain('203.0.113.10');
  });

  it('does not set boolean true on the Express app', () => {
    const app = express();
    applyTrustProxy(app, { TRUST_PROXY: 'true' });
    expect(app.get('trust proxy')).toBe('loopback');
    expect(app.get('trust proxy')).not.toBe(true);
  });
});
