// Conexão com o Postgres (Neon, criado pela própria Vercel em Storage).
// A Vercel coloca a URL do banco em DATABASE_URL automaticamente.
import { neon } from '@neondatabase/serverless';

let sql = null;

export function getSql() {
  if (globalThis.__AGENDA_TEST_SQL__) return globalThis.__AGENDA_TEST_SQL__;
  if (!sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) {
      const err = new Error('Banco de dados não configurado (DATABASE_URL ausente).');
      err.status = 503;
      err.code = 'NO_DB';
      throw err;
    }
    const client = neon(url);
    sql = (text, params = []) => client.query(text, params);
  }
  return sql;
}
