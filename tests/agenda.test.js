// Testes da agenda contra um PostgreSQL real (PGlite, em memória).
// Rode com: npm test
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
globalThis.__AGENDA_TEST_SQL__ = (text, params = []) => db.query(text, params).then((r) => r.rows);

const A = await import('../lib/agenda.js');
const { parseLocal } = await import('../lib/time.js');

// "Agora" fixo: terça-feira 24/11/2026 às 07:00 em Cascavel (10:00 UTC)
const NOW = parseLocal('2026-11-24', '07:00');
const at = (date, time) => parseLocal(date, time).toISOString();
const book = (date, time, extra = {}) => A.createBooking(
  { service: 'corte', name: 'Cliente Teste', phone: '85 9' + String(Math.floor(10000000 + Math.random() * 89999999)), start: at(date, time), ...extra },
  { now: NOW },
);
const times = (days, date) => days.find((d) => d.date === date).slots.map((s) => s.time);

before(async () => { await A.ensureSchema(); });
beforeEach(async () => {
  await db.query('TRUNCATE agenda RESTART IDENTITY');
  await db.query('TRUNCATE agenda_regras RESTART IDENTITY');
});

test('fuso: 07:00 em Cascavel é 10:00 UTC', () => {
  assert.equal(NOW.toISOString(), '2026-11-24T10:00:00.000Z');
});

test('janela de 7 dias corridos, a partir de hoje', async () => {
  const days = await A.getSlots(NOW);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.date), ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30']);
  await assert.rejects(book('2026-12-01', '10:00'), { code: 'WINDOW' });
});

test('expediente: terça 9h–11h e 14h–18h; atendimento de 1h precisa caber', () => {
  const inH = (t) => A.isInBusinessHours(parseLocal('2026-11-24', t));
  assert.equal(inH('09:00'), true);
  assert.equal(inH('10:00'), true);
  assert.equal(inH('10:30'), false); // terminaria 11:30
  assert.equal(inH('14:00'), true);
  assert.equal(inH('17:00'), true);
  assert.equal(inH('17:30'), false);
  assert.equal(A.isInBusinessHours(parseLocal('2026-11-28', '17:00')), true);  // sábado
  assert.equal(A.isInBusinessHours(parseLocal('2026-11-29', '10:00')), false); // domingo
  assert.equal(A.isInBusinessHours(parseLocal('2026-11-30', '10:00')), false); // segunda
});

test('antecedência: 30 min no expediente, 3h fora dele', async () => {
  const now = parseLocal('2026-11-24', '08:40');
  const days = await A.getSlots(now);
  const t = times(days, '2026-11-24');
  assert.ok(!t.includes('09:00'), '09:00 está a só 20 min');
  assert.ok(t.includes('09:30'));        // expediente, 50 min depois
  assert.ok(!t.includes('10:30'));       // fora do expediente, menos de 3h
  assert.ok(!t.includes('11:30'));       // fora, 2h50
  assert.ok(t.includes('12:00'));        // fora, 3h20
  await assert.rejects(A.createBooking({ service: 'corte', name: 'Ana', phone: '85991111111', start: at('2026-11-24', '09:00') }, { now }), { code: 'LEAD' });
});

test('horário passado nunca aparece', async () => {
  const days = await A.getSlots(NOW);
  assert.ok(!times(days, '2026-11-24').some((t) => t < '07:30'));
});

test('marcou 10:00: somem 9:30, 10:00 e 10:30; 9:00 e 11:00 continuam', async () => {
  await book('2026-11-25', '10:00');
  const t = times(await A.getSlots(NOW), '2026-11-25');
  assert.ok(t.includes('09:00'));
  assert.ok(!t.includes('09:30'));
  assert.ok(!t.includes('10:00'));
  assert.ok(!t.includes('10:30'));
  assert.ok(t.includes('11:00'));
  await book('2026-11-25', '09:00');
  await book('2026-11-25', '11:00');
});

test('mesmo horário ou a menos de 1h é recusado pelo banco', async () => {
  await book('2026-11-25', '15:00');
  await assert.rejects(book('2026-11-25', '15:00'), { code: 'TAKEN' });
  await assert.rejects(book('2026-11-25', '14:30'), { code: 'TAKEN' });
  await assert.rejects(book('2026-11-25', '15:30'), { code: 'TAKEN' });
});

test('100 pessoas confirmando ao mesmo tempo horários conflitantes: só 1 consegue', async () => {
  const tries = Array.from({ length: 100 }, (_, i) => book('2026-11-26', ['15:00', '15:30', '15:00'][i % 3]));
  const results = await Promise.allSettled(tries);
  const ok = results.filter((r) => r.status === 'fulfilled');
  assert.equal(ok.length, 1);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'TAKEN'));
  const [{ n }] = (await db.query(`SELECT count(*)::int n FROM agenda WHERE status='active'`)).rows;
  assert.equal(n, 1);
});

test('agenda lotada sem nenhuma sobreposição (varredura do dia inteiro)', async () => {
  const all = [];
  for (let m = 0; m < 1440; m += 30) all.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  await Promise.allSettled(all.map((t) => book('2026-11-27', t)));
  const rows = (await db.query(`SELECT starts_at, ends_at FROM agenda WHERE status='active' ORDER BY starts_at`)).rows;
  for (let i = 1; i < rows.length; i++) {
    assert.ok(new Date(rows[i].starts_at) - new Date(rows[i - 1].starts_at) >= 3600000, 'dois agendamentos a menos de 1h');
  }
  assert.equal(times(await A.getSlots(NOW), '2026-11-27').length, 0, 'dia cheio não mostra horários');
});

test('cancelar devolve o horário para todo mundo', async () => {
  const b = await book('2026-11-25', '16:00');
  assert.ok(!times(await A.getSlots(NOW), '2026-11-25').includes('16:00'));
  await A.cancelItem(b.id);
  assert.ok(times(await A.getSlots(NOW), '2026-11-25').includes('16:00'));
  await book('2026-11-25', '16:00');
});

test('bloqueio do Werter tira horários e não deixa sobrepor agendamento', async () => {
  await A.createBlock({ start: parseLocal('2026-11-25', '12:00'), end: parseLocal('2026-11-25', '14:00'), note: 'almoço' });
  const t = times(await A.getSlots(NOW), '2026-11-25');
  assert.ok(t.includes('11:00'));
  assert.ok(!t.includes('11:30') && !t.includes('12:00') && !t.includes('13:30'));
  assert.ok(t.includes('14:00'));
  await assert.rejects(book('2026-11-25', '13:00'), { code: 'TAKEN' });
  await book('2026-11-25', '17:00');
  await assert.rejects(A.createBlock({ start: parseLocal('2026-11-25', '16:00'), end: parseLocal('2026-11-25', '18:00') }), { code: 'CONFLICT' });
});

test('regra fixa que atravessa a meia-noite (22:00 às 07:00, todos os dias)', async () => {
  await A.createRule({ dias: '0123456', inicio: 22 * 60, fim: 7 * 60 });
  const days = await A.getSlots(NOW);
  for (const d of days) {
    for (const s of d.slots) assert.ok(s.time >= '07:00' && s.time <= '21:00', `${d.date} ${s.time} deveria estar bloqueado`);
  }
  assert.ok(times(days, '2026-11-25').includes('21:00'));
  await assert.rejects(book('2026-11-25', '21:30'), { code: 'TAKEN' });
  await assert.rejects(book('2026-11-26', '02:00'), { code: 'TAKEN' });
  await book('2026-11-26', '07:00');
});

test('limite de 2 horários futuros por WhatsApp', async () => {
  const phone = '(85) 99157-0000';
  await book('2026-11-25', '09:00', { phone });
  await book('2026-11-26', '09:00', { phone: '5585991570000' }); // mesmo número em outro formato
  await assert.rejects(book('2026-11-27', '09:00', { phone }), { code: 'LIMIT' });
});

test('validações de entrada', async () => {
  await assert.rejects(book('2026-11-25', '10:15'), { code: 'START' });
  await assert.rejects(book('2026-11-25', '10:00', { service: 'xpto' }), { code: 'SERVICE' });
  await assert.rejects(book('2026-11-25', '10:00', { name: ' ' }), { code: 'NAME' });
  await assert.rejects(book('2026-11-25', '10:00', { phone: '123' }), { code: 'PHONE' });
  await assert.rejects(A.createBooking({ service: 'corte', name: 'Ana', phone: '85991111111', start: 'amanhã' }, { now: NOW }), { code: 'START' });
  assert.equal(A.normalizePhone('(85) 99157-3639'), '5585991573639');
  assert.equal(A.normalizePhone('+55 85 99157-3639'), '5585991573639');
  assert.equal(A.normalizePhone('85 3321-1234'), '558533211234');
  assert.equal(A.normalizePhone('85 89157-3639'), null);
});

test('agendamento fora do expediente fica marcado como 24h', async () => {
  const b = await book('2026-11-25', '20:00');
  assert.equal(b.offHours, true);
  const c = await book('2026-11-25', '15:00');
  assert.equal(c.offHours, false);
  assert.equal(c.price, 50);
  assert.equal(c.time, '15:00');
  assert.equal(c.weekday, 'quarta');
});
