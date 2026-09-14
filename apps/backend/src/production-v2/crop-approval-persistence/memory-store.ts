import { randomUUID } from 'node:crypto';
import type {
  PersistedAuthorization,
  PersistedExecutionRun,
  PersistedHumanApproval,
  PersistedReviewSession,
  TenantScope,
} from './persistence.types.js';

export class MemoryCropApprovalStore {
  sessions = new Map<string, PersistedReviewSession>();
  approvals = new Map<string, PersistedHumanApproval>();
  authorizations = new Map<string, PersistedAuthorization>();
  runs = new Map<string, PersistedExecutionRun>();

  private scoped<T extends { id: string; tenantId: string }>(row: T | undefined, scope: TenantScope): T | undefined {
    if (!row) return undefined;
    if (row.tenantId !== scope.tenantId) return undefined;
    return row;
  }

  getSession(id: string, scope: TenantScope) {
    const row = this.sessions.get(id);
    if (!row) return undefined;
    if (row.tenantId !== scope.tenantId || row.workspaceId !== scope.workspaceId) {
      return undefined;
    }
    if (scope.projectId && scope.projectId !== 'unbound' && row.projectId !== scope.projectId) {
      return undefined;
    }
    return row;
  }

  putSession(session: PersistedReviewSession) {
    this.sessions.set(session.id, session);
    return session;
  }

  findApprovalByClientAction(tenantId: string, clientActionId: string) {
    return [...this.approvals.values()].find((item) => item.tenantId === tenantId && item.clientActionId === clientActionId);
  }

  findActiveApprovalForSession(sessionId: string, tenantId: string) {
    return [...this.approvals.values()].find(
      (item) => item.reviewSessionId === sessionId && item.tenantId === tenantId && item.status === 'ACTIVE',
    );
  }

  getApproval(id: string, scope: TenantScope) {
    const row = this.approvals.get(id);
    if (!row || row.tenantId !== scope.tenantId) return undefined;
    return row;
  }

  putApproval(row: PersistedHumanApproval) {
    this.approvals.set(row.id, row);
    return row;
  }

  findAuthorizationByClientRequest(tenantId: string, clientRequestId: string) {
    return [...this.authorizations.values()].find(
      (item) => item.tenantId === tenantId && item.clientRequestId === clientRequestId,
    );
  }

  getAuthorization(id: string, scope: TenantScope) {
    const row = this.authorizations.get(id);
    if (!row || row.tenantId !== scope.tenantId) return undefined;
    return row;
  }

  putAuthorization(row: PersistedAuthorization) {
    this.authorizations.set(row.id, row);
    return row;
  }

  findRunByClientRequest(tenantId: string, clientRequestId: string) {
    return [...this.runs.values()].find((item) => item.tenantId === tenantId && item.clientRequestId === clientRequestId);
  }

  getRun(id: string, scope: TenantScope) {
    const row = this.runs.get(id);
    if (!row || row.tenantId !== scope.tenantId) return undefined;
    return row;
  }

  putRun(row: PersistedExecutionRun) {
    this.runs.set(row.id, row);
    return row;
  }
}

export function newId(): string {
  return randomUUID();
}
