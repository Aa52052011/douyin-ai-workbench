import type { Request, Response } from 'express';
import { REFRESH_COOKIE_NAME, refreshTtlSeconds } from './auth.constants.js';

export function setRefreshCookie(res: Response, rawToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: refreshTtlSeconds() * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
  });
}

export function readRefreshToken(req: Request, bodyToken?: string): string | undefined {
  const fromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  if (typeof bodyToken === 'string' && bodyToken.length > 0) {
    return bodyToken;
  }
  return undefined;
}
