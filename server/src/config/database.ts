// ============================================
// DATABASE CONFIG — mysql2 connection pool
// Tagged template literal wrapper to keep
// existing db`SELECT ... WHERE id = ${x}` syntax
// ============================================

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'trondex',
  // Connection pool settings
  connectionLimit: 20,
  waitForConnections: true,
  queueLimit: 0,
  // Timezone
  timezone: 'Z', // UTC
  // Return numbers as numbers not strings
  typeCast(field, next) {
    if (field.type === 'DECIMAL' || field.type === 'NEWDECIMAL') {
      const val = field.string();
      return val === null ? null : parseFloat(val);
    }
    if (field.type === 'TINY' && field.length === 1) {
      return field.string() === '1';
    }
    return next();
  },
});

// ─── Tagged template literal interface ────────────────────────
// Converts db`SELECT * FROM users WHERE id = ${userId}`
// into a parameterized mysql2 query safely.
//
// Returns: array of row objects (same as Bun.SQL)
// ─────────────────────────────────────────────────────────────

async function sql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]> {
  let query = '';
  const params: any[] = [];

  for (let i = 0; i < strings.length; i++) {
    query += strings[i];
    if (i < values.length) {
      const val = values[i];

      // Handle arrays like IN (${ids}) → IN (?, ?, ?)
      if (Array.isArray(val)) {
        if (val.length === 0) {
          query += '(NULL)'; // safe empty IN
        } else {
          query += '(' + val.map(() => '?').join(', ') + ')';
          params.push(...val);
        }
      } else {
        query += '?';
        params.push(val ?? null);
      }
    }
  }

  const [rows] = await pool.execute(query, params);
  return rows as any[];
}

// ─── Transaction helper ────────────────────────────────────────
// Usage: await db.transaction(async (tx) => { await tx`...` })
// ─────────────────────────────────────────────────────────────

sql.transaction = async function <T>(
  callback: (tx: typeof sql) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  // Build a tx function using the same template literal pattern
  async function tx(strings: TemplateStringsArray, ...values: any[]): Promise<any[]> {
    let query = '';
    const params: any[] = [];
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        const val = values[i];
        if (Array.isArray(val)) {
          if (val.length === 0) {
            query += '(NULL)';
          } else {
            query += '(' + val.map(() => '?').join(', ') + ')';
            params.push(...val);
          }
        } else {
          query += '?';
          params.push(val ?? null);
        }
      }
    }
    const [rows] = await conn.execute(query, params);
    return rows as any[];
  }

  try {
    const result = await callback(tx as any);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// End pool on process exit
sql.end = async function () {
  await pool.end();
};

// ─── db.unsafe(rawSql) — for DDL like CREATE TABLE ─────────
// No parameterization, use only for trusted internal SQL.
sql.unsafe = async function (rawQuery: string): Promise<any[]> {
  const [rows] = await pool.query(rawQuery);
  return rows as any[];
};

// ─── db.execute(rawSql, params?) — returns { rows, rowCount } ─
// Used when you need ResultSetHeader (e.g. UPDATE affected rows)
sql.execute = async function (rawQuery: string, params?: any[]): Promise<{ rows: any[]; rowCount: number }> {
  const [result] = await pool.execute(rawQuery, params ?? []);
  // For SELECT → result is RowDataPacket[]
  // For DML → result is ResultSetHeader with affectedRows
  if (Array.isArray(result)) {
    return { rows: result as any[], rowCount: (result as any[]).length };
  }
  return { rows: [], rowCount: (result as any).affectedRows ?? 0 };
};

export type DB = typeof sql;
export default sql;
