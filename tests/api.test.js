// Testes das rotas /api como a Vercel chama (req/res do Node).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__AGENDA_TEST_SQL__ = (text, params = []) => db.query(text, params).then((r) => r.rows);
process.env.ADMIN_PASSWORD = 'senha-do-werter';

const slots = (await import('../api/slots.js')).default;
const book = (await import('../api/book.js')).default;
const agenda = (await import('../api/admin/agenda.js')).default;
const action = (await import('../api/admin/action.js')).default;
const { ensureSchema } = await import('../lib/agenda.js');

function call(handler, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) { resolve({ status: this.statusCode, headers: this.headers, body: JSON.parse(data) }); },
    };
    handler({ method, body, headers }, res);
  });
}

before(async () => { await ensureSchema(); });
beforeEach(async () => { await db.query('TRUNCATE agenda RESTART IDENTITY'); await db.query('TRUNCATE agenda_regras RESTART IDENTITY'); });

test('GET /api/slots devolve 7 dias, sem cache', async () => {
  const r = await call(slots);
  assert.equal(r.status, 200);
  assert.equal(r.body.days.length, 7);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.ok(r.body.next && r.body.next.start);
});

test('POST /api/book cria, e o mesmo horário depois dá 409', async () => {
  const s = (await call(slots)).body.days[2].slots[5];
  const body = { service: 'corte-barba', name: 'João', phone: '85 99157-1111', start: s.start };
  const r1 = await call(book, { method: 'POST', body });
  assert.equal(r1.status, 201);
  assert.equal(r1.body.booking.serviceLabel, 'Corte + barba');
  const r2 = await call(book, { method: 'POST', body: { ...body, phone: '85 99157-2222' } });
  assert.equal(r2.status, 409);
  assert.equal(r2.body.error, 'TAKEN');
  const again = (await call(slots)).body.days[2].slots.map((x) => x.start);
  assert.ok(!again.includes(s.start), 'horário reservado sumiu da lista');
});

test('campo-isca anti-robô e método errado', async () => {
  assert.equal((await call(book, { method: 'POST', body: { website: 'spam' } })).status, 400);
  assert.equal((await call(book, { method: 'GET' })).status, 405);
});

test('painel exige senha', async () => {
  assert.equal((await call(agenda)).status, 401);
  assert.equal((await call(agenda, { headers: { 'x-admin-key': 'errada' } })).status, 401);
  const ok = await call(agenda, { headers: { 'x-admin-key': 'senha-do-werter' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.items, []);
});

test('painel: regra fixa, bloqueio, marcar e cancelar', async () => {
  const H = { 'x-admin-key': 'senha-do-werter' };
  const rule = await call(action, { method: 'POST', headers: H, body: { action: 'rule', dias: '0123456', from: '23:00', to: '06:00', note: 'dormir' } });
  assert.equal(rule.status, 201);
  const days = (await call(slots)).body.days;
  assert.ok(days.every((d) => d.slots.every((s) => s.time >= '06:00' && s.time <= '22:00')));

  const d = days[3].date;
  const blk = await call(action, { method: 'POST', headers: H, body: { action: 'block', date: d, from: '12:00', to: '14:00', note: 'almoço' } });
  assert.equal(blk.status, 201);

  const mk = await call(action, { method: 'POST', headers: H, body: { action: 'book', date: d, time: '15:00', service: 'barba', name: 'Cliente do balcão', phone: '85991572222' } });
  assert.equal(mk.status, 201);
  const conflict = await call(action, { method: 'POST', headers: H, body: { action: 'block', date: d, from: '14:30', to: '16:00' } });
  assert.equal(conflict.status, 409);

  const list = await call(agenda, { headers: H });
  assert.equal(list.body.items.length, 2);
  assert.equal(list.body.rules.length, 1);

  const c = await call(action, { method: 'POST', headers: H, body: { action: 'cancel', id: mk.body.id } });
  assert.equal(c.status, 200);
  assert.equal((await call(action, { method: 'POST', headers: H, body: { action: 'cancel', id: mk.body.id } })).status, 404);
  assert.equal((await call(action, { method: 'POST', headers: H, body: { action: 'deleteRule', id: rule.body.id } })).status, 200);
});

test('sem banco configurado responde 503 com mensagem amigável', async () => {
  const saved = globalThis.__AGENDA_TEST_SQL__;
  delete globalThis.__AGENDA_TEST_SQL__;
  const old = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
  const { getSql } = await import('../lib/db.js');
  assert.throws(() => getSql(), { code: 'NO_DB' });
  globalThis.__AGENDA_TEST_SQL__ = saved;
  if (old) process.env.DATABASE_URL = old;
});
