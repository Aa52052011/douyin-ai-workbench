declare module 'pg' {
  export class Pool {
    constructor(config?: { connectionString?: string });
    query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
  export class Client {
    constructor(config?: { connectionString?: string });
    connect(): Promise<void>;
    query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
    end(): Promise<void>;
  }
  export interface PoolClient {
    query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
    release(): void;
  }
  const pg: { Pool: typeof Pool; Client: typeof Client };
  export default pg;
}
