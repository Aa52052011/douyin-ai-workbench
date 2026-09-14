import { AsyncLocalStorage } from 'node:async_hooks';
import type { MeteringScope } from './usage.types.js';

const store = new AsyncLocalStorage<MeteringScope>();

export function runMeteringScope<T>(scope: MeteringScope, fn: () => T): T {
  const parent = store.getStore();
  return store.run({ ...parent, ...scope }, fn);
}

export function getMeteringScope(): MeteringScope | undefined {
  return store.getStore();
}
