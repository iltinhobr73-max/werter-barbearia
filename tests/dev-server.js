// Servidor local que imita a Vercel: arquivos de /public + funções de /api,
// com um PostgreSQL em memória (PGlite). Uso: node tests/dev-server.js [porta]
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
globalThis.__AGENDA_TEST_SQL__ = (text, params = []) => db.query(text, params).then((r) => r.rows);
process.env.ADMIN_PASSWORD ||= 'werter123';

const routes = {
  '/api/slots': (await import('../api/slots.js')).default,
  '/api/book': (await import('../api/book.js')).default,
  '/api/admin/agenda': (await import('../api/admin/agenda.js')).default,
  '/api/admin/action': (await import('../api/admin/action.js')).default,
};
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const handler = routes[url.pathname];
  if (handler) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : undefined;
    req.query = Object.fromEntries(url.searchParams);
    return handler(req, res);
  }
  let p = decodeURIComponent(url.pathname);
  const candidates = [p, p + '.html', path.join(p, 'index.html')];
  for (const c of candidates) {
    const f = path.join(root, 'public', c);
    if (!f.startsWith(path.join(root, 'public'))) break;
    try {
      const st = await fs.stat(f);
      if (!st.isFile()) continue;
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      return res.end(await fs.readFile(f));
    } catch { /* próximo */ }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404');
});
const port = Number(process.argv[2] || 8790);
server.listen(port, () => console.log(`http://localhost:${port}`));
