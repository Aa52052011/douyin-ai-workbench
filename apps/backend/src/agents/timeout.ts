import { AsyncLocalStorage } from 'node:async_hooks';
import { ErrorCode } from '../common/errors/app-error.js';
import { AgentError } from './agent.errors.js';

export type AgentExecutionStore = {
  signal: AbortSignal;
  startedAt: number;
  deadlineAt: number;
};

const executionAbort = new AsyncLocalStorage<AgentExecutionStore>();

export function getAgentExecutionContext(): AgentExecutionStore | undefined {
  return executionAbort.getStore();
}

export function getAgentExecutionAbortSignal(): AbortSignal | undefined {
  return executionAbort.getStore()?.signal;
}

export function isAgentExecutionAborted(): boolean {
  return Boolean(executionAbort.getStore()?.signal.aborted);
}

export function remainingAgentBudgetMs(now = Date.now()): number | undefined {
  const store = executionAbort.getStore();
  if (!store) {
    return undefined;
  }
  return Math.max(0, store.deadlineAt - now);
}

export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const live = signals.filter(Boolean);
  if (live.length === 0) {
    return new AbortController().signal;
  }
  if (live.length === 1) {
    return live[0]!;
  }
  const any = (AbortSignal as { any?: (items: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === 'function') {
    return any.call(AbortSignal, live);
  }
  const controller = new AbortController();
  const onAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  for (const signal of live) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

export async function runWithTimeout<T>(
  work: Promise<T> | (() => Promise<T>),
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const deadlineAt = startedAt + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AgentError(ErrorCode.AGENT_TIMEOUT, undefined, true));
      controller.abort();
    }, timeoutMs);
  });
  const start = typeof work === 'function' ? work : () => work;
  try {
    return await executionAbort.run({ signal: controller.signal, startedAt, deadlineAt }, () =>
      Promise.race([start(), timeout]),
    );
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
