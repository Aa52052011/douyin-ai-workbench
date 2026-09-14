export type RouteHealthState = 'HEALTHY' | 'OPEN_CIRCUIT' | 'RECOVERING';

export type RouteHealthSnapshot = {
  routeKey: string;
  failureCount: number;
  state: RouteHealthState;
  openedAt: number | null;
  nextProbeAt: number | null;
};

export function modelRouteKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}

function emptySnapshot(routeKey: string): RouteHealthSnapshot {
  return {
    routeKey,
    failureCount: 0,
    state: 'HEALTHY',
    openedAt: null,
    nextProbeAt: null,
  };
}

export class ModelRouteHealthRegistry {
  private readonly routes = new Map<string, RouteHealthSnapshot>();

  constructor(private readonly now: () => number = Date.now) {}

  snapshot(routeKey: string): RouteHealthSnapshot {
    const current = this.routes.get(routeKey) ?? emptySnapshot(routeKey);
    return { ...current };
  }

  recordSuccess(routeKey: string): void {
    this.routes.set(routeKey, emptySnapshot(routeKey));
  }

  recordEligibleFailure(routeKey: string, threshold: number, cooldownMs: number): RouteHealthSnapshot {
    const current = this.routes.get(routeKey) ?? emptySnapshot(routeKey);
    const failureCount = current.failureCount + 1;
    if (failureCount >= threshold) {
      const openedAt = this.now();
      const next: RouteHealthSnapshot = {
        routeKey,
        failureCount,
        state: 'OPEN_CIRCUIT',
        openedAt,
        nextProbeAt: openedAt + cooldownMs,
      };
      this.routes.set(routeKey, next);
      return { ...next };
    }
    const next: RouteHealthSnapshot = {
      ...current,
      routeKey,
      failureCount,
      state: 'HEALTHY',
    };
    this.routes.set(routeKey, next);
    return { ...next };
  }

  markRecovering(routeKey: string): void {
    const current = this.routes.get(routeKey) ?? emptySnapshot(routeKey);
    this.routes.set(routeKey, { ...current, routeKey, state: 'RECOVERING' });
  }

  reopen(routeKey: string, cooldownMs: number): void {
    const openedAt = this.now();
    const current = this.routes.get(routeKey) ?? emptySnapshot(routeKey);
    this.routes.set(routeKey, {
      routeKey,
      failureCount: Math.max(current.failureCount, 1),
      state: 'OPEN_CIRCUIT',
      openedAt,
      nextProbeAt: openedAt + cooldownMs,
    });
  }

  isOpen(routeKey: string): boolean {
    const state = this.snapshot(routeKey).state;
    return state === 'OPEN_CIRCUIT' || state === 'RECOVERING';
  }

  isProbeEligible(routeKey: string): boolean {
    const current = this.snapshot(routeKey);
    if (current.state !== 'OPEN_CIRCUIT') {
      return false;
    }
    if (current.nextProbeAt == null) {
      return true;
    }
    return this.now() >= current.nextProbeAt;
  }
}
