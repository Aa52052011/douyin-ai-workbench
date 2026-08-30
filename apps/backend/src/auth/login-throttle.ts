import { Injectable } from '@nestjs/common';

export type LoginAttemptKey = {
  ip: string;
  email: string;
};

/**
 * V1.0 内存限流。接口形状留给 V2（IP / 账号 / Redis）。
 * 测试环境关闭，避免干扰可重复用例。
 */
@Injectable()
export class LoginThrottle {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly windowMs = 15 * 60 * 1000;
  private readonly maxAttempts = 20;

  allow(key: LoginAttemptKey): boolean {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    const id = `${key.ip}:${key.email}`;
    const now = Date.now();
    const current = this.attempts.get(id);
    if (!current || current.resetAt <= now) {
      this.attempts.set(id, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    current.count += 1;
    return current.count <= this.maxAttempts;
  }
}
