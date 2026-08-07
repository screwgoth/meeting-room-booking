import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

/**
 * Thin Postgres access layer. A single shared Pool for the monolith (§6).
 * All queries are parameterized ($1, $2, ...) — never string-interpolated —
 * per the security posture (§7 input validation, no injection).
 */
export interface Db {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  /** Run fn inside a single transaction; commits on success, rolls back on throw. */
  tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  pool: Pool;
  close(): Promise<void>;
}

export function createDb(connectionString: string): Db {
  const pool = new Pool({ connectionString });

  return {
    pool,
    query: (text, params) => pool.query(text, params as unknown[]),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
