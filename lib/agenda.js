// Núcleo da agenda: horários livres, criação de agendamento e funções do painel.
//
// Garantia contra horário duplicado: cada agendamento/bloqueio ocupa o intervalo
// [início, fim) e o PostgreSQL tem uma EXCLUSION CONSTRAINT que proíbe dois
// intervalos ativos se sobreporem. Como cada atendimento dura 60 min, se alguém
// marcou 10:00 ninguém consegue 9:30 nem 10:30 — só 9:00 ou 11:00 em diante.
// Isso vale mesmo se duas pessoas confirmarem no mesmo milissegundo: o banco
// aceita uma e recusa a outra (erro 23P01).
import { getSql } from './db.js';
import {
  SLOT_STEP_MIN, DURATION_MIN, WINDOW_DAYS, LEAD_IN_HOURS_MIN, LEAD_OFF_HOURS_MIN,
  BUSINESS_HOURS, SERVICES, MAX_ACTIVE_PER_PHONE,
} from './config.js';
import { localParts, localToDate, startOfLocalDay, isoDate, hhmm, WEEKDAYS } from './time.js';

const MIN = 60000;

export class AgendaError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/* ------------------------------------------------------------------ schema */
let schemaReady = null;
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      const stmts = [
        `CREATE TABLE IF NOT EXISTS agenda (
          id         BIGSERIAL PRIMARY KEY,
          kind       TEXT NOT NULL CHECK (kind IN ('booking', 'block')),
          starts_at  TIMESTAMPTZ NOT NULL,
          ends_at    TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
          service    TEXT,
          name       TEXT,
          phone      TEXT,
          note       TEXT,
          off_hours  BOOLEAN NOT NULL DEFAULT FALSE,
          status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT agenda_sem_sobreposicao
            EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&)
            WHERE (status = 'active')
        )`,
        `CREATE INDEX IF NOT EXISTS agenda_starts_idx ON agenda (starts_at)`,
        `CREATE TABLE IF NOT EXISTS agenda_regras (
          id        BIGSERIAL PRIMARY KEY,
          dias      TEXT NOT NULL,          -- dígitos 0-6 (0 = domingo)
          inicio    INT  NOT NULL CHECK (inicio BETWEEN 0 AND 1439),
          fim       INT  NOT NULL CHECK (fim BETWEEN 1 AND 1440),
          note      TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      ];
      for (const s of stmts) {
        try { await sql(s); } catch (e) {
          // duas instâncias criando a tabela ao mesmo tempo: a outra venceu, segue o jogo
          if (!['42P07', '23505', '42710'].includes(e.code)) throw e;
        }
      }
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

/* ------------------------------------------------------------ regras puras */
export function isInBusinessHours(start) {
  const p = localParts(start);
  return (BUSINESS_HOURS[p.weekday] || []).some(([a, b]) => p.minutes >= a && p.minutes + DURATION_MIN <= b);
}

export function leadTimeFor(start) {
  return isInBusinessHours(start) ? LEAD_IN_HOURS_MIN : LEAD_OFF_HOURS_MIN;
}

export function windowFor(now) {
  return { from: now, to: startOfLocalDay(now, WINDOW_DAYS) };
}

/** Intervalos ocupados pelas regras fixas entre `from` e `to`. */
export function ruleIntervals(rules, from, to) {
  const out = [];
  const days = Math.ceil((to - from) / (24 * 60 * MIN)) + 2;
  for (let i = -1; i <= days; i++) {
    const day0 = startOfLocalDay(from, i);
    const p = localParts(day0);
    for (const r of rules) {
      if (!String(r.dias).includes(String(p.weekday))) continue;
      const fim = r.fim > r.inicio ? r.fim : r.fim + 1440; // atravessa a meia-noite
      out.push({ start: localToDate(p.year, p.month, p.day, r.inicio), end: localToDate(p.year, p.month, p.day, fim) });
    }
  }
  return out.filter((iv) => iv.end > from && iv.start < to);
}

const overlaps = (s, e, iv) => s < iv.end && e > iv.start;

/** Lista de dias com horários livres. Função pura (testável). */
export function computeSlots({ now, busy, rules = [] }) {
  const { to } = windowFor(now);
  const blocked = [...busy, ...ruleIntervals(rules, startOfLocalDay(now), new Date(to.getTime() + DURATION_MIN * MIN))];
  const days = [];
  for (let d = 0; d < WINDOW_DAYS; d++) {
    const day0 = startOfLocalDay(now, d);
    const p = localParts(day0);
    const slots = [];
    for (let m = 0; m < 1440; m += SLOT_STEP_MIN) {
      const start = localToDate(p.year, p.month, p.day, m);
      const end = new Date(start.getTime() + DURATION_MIN * MIN);
      if (start.getTime() < now.getTime() + leadTimeFor(start) * MIN) continue;
      if (blocked.some((iv) => overlaps(start, end, iv))) continue;
      slots.push({ start: start.toISOString(), time: hhmm(m), inHours: isInBusinessHours(start) });
    }
    days.push({ date: isoDate(p), weekday: WEEKDAYS[p.weekday], day: p.day, month: p.month, slots });
  }
  return days;
}

/* ---------------------------------------------------------------- consultas */
async function activeIntervals(sql, from, to) {
  const rows = await sql(
    `SELECT starts_at, ends_at FROM agenda
      WHERE status = 'active' AND starts_at < $2 AND ends_at > $1`,
    [from.toISOString(), to.toISOString()],
  );
  return rows.map((r) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) }));
}

export async function listRules() {
  await ensureSchema();
  return getSql()(`SELECT id, dias, inicio, fim, note FROM agenda_regras ORDER BY inicio, id`);
}

export async function getSlots(now = new Date()) {
  await ensureSchema();
  const sql = getSql();
  const { to } = windowFor(now);
  const [busy, rules] = await Promise.all([
    activeIntervals(sql, startOfLocalDay(now), new Date(to.getTime() + DURATION_MIN * MIN)),
    listRules(),
  ]);
  return computeSlots({ now, busy, rules });
}

/* -------------------------------------------------------------- validação */
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11 && d[2] !== '9') return null;  // celular precisa começar com 9
  if (d.length !== 10 && d.length !== 11) return null;
  if (/^(\d)\1+$/.test(d)) return null;
  return '55' + d;
}

export function cleanName(raw) {
  const n = String(raw || '').replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 60) return null;
  if (!/\p{L}/u.test(n)) return null;
  return n;
}

function parseStart(raw) {
  const t = Date.parse(raw);
  if (!raw || Number.isNaN(t)) return null;
  const d = new Date(t);
  const p = localParts(d);
  if (p.minutes % SLOT_STEP_MIN !== 0 || p.seconds !== 0 || p.ms !== 0) return null;
  return d;
}

/* ------------------------------------------------------- criar agendamento */
export async function createBooking(input, { now = new Date(), admin = false } = {}) {
  const service = SERVICES[input.service] ? input.service : null;
  if (!service) throw new AgendaError(400, 'SERVICE', 'Escolha um serviço.');
  const name = cleanName(input.name);
  if (!name) throw new AgendaError(400, 'NAME', 'Digite seu nome.');
  const phone = normalizePhone(input.phone);
  if (!phone) throw new AgendaError(400, 'PHONE', 'Digite um WhatsApp válido com DDD.');
  const start = parseStart(input.start);
  if (!start) throw new AgendaError(400, 'START', 'Horário inválido. Escolha um horário da lista.');
  const end = new Date(start.getTime() + DURATION_MIN * MIN);

  await ensureSchema();
  const sql = getSql();

  if (!admin) {
    const { to } = windowFor(now);
    if (start >= to) throw new AgendaError(409, 'WINDOW', 'Só dá para agendar nos próximos 7 dias.');
    if (start.getTime() < now.getTime() + leadTimeFor(start) * MIN) {
      throw new AgendaError(409, 'LEAD', 'Esse horário já passou ou está muito em cima. Escolha outro.');
    }
    const rules = await listRules();
    if (ruleIntervals(rules, start, end).some((iv) => overlaps(start, end, iv))) {
      throw new AgendaError(409, 'TAKEN', 'Esse horário não está disponível. Escolha outro.');
    }
    const [{ n }] = await sql(
      `SELECT count(*)::int AS n FROM agenda
        WHERE kind = 'booking' AND status = 'active' AND phone = $1 AND starts_at > $2`,
      [phone, now.toISOString()],
    );
    if (n >= MAX_ACTIVE_PER_PHONE) {
      throw new AgendaError(409, 'LIMIT', `Esse WhatsApp já tem ${n} horários marcados. Para mudar, fale com a barbearia.`);
    }
  } else if (start.getTime() < now.getTime() - 60 * MIN) {
    throw new AgendaError(409, 'PAST', 'Esse horário já passou.');
  }

  const offHours = !isInBusinessHours(start);
  try {
    const [row] = await sql(
      `INSERT INTO agenda (kind, starts_at, ends_at, service, name, phone, off_hours)
       VALUES ('booking', $1, $2, $3, $4, $5, $6)
       RETURNING id, starts_at, ends_at, service, name, phone, off_hours`,
      [start.toISOString(), end.toISOString(), service, name, phone, offHours],
    );
    return serialize(row);
  } catch (e) {
    if (e.code === '23P01') throw new AgendaError(409, 'TAKEN', 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro.');
    throw e;
  }
}

export function serialize(row) {
  const start = new Date(row.starts_at);
  const p = localParts(start);
  return {
    id: Number(row.id),
    kind: row.kind || 'booking',
    start: start.toISOString(),
    end: new Date(row.ends_at).toISOString(),
    date: isoDate(p),
    weekday: WEEKDAYS[p.weekday],
    time: hhmm(p.minutes),
    service: row.service,
    serviceLabel: SERVICES[row.service]?.label || null,
    price: SERVICES[row.service]?.price ?? null,
    name: row.name,
    phone: row.phone,
    note: row.note || null,
    offHours: !!row.off_hours,
    status: row.status || 'active',
  };
}

/* ---------------------------------------------------------------- painel */
export async function adminAgenda(now = new Date()) {
  await ensureSchema();
  const from = startOfLocalDay(now, -1);
  const to = startOfLocalDay(now, 15);
  const rows = await getSql()(
    `SELECT * FROM agenda WHERE status = 'active' AND ends_at > $1 AND starts_at < $2 ORDER BY starts_at`,
    [from.toISOString(), to.toISOString()],
  );
  return { items: rows.map(serialize), rules: await listRules() };
}

export async function cancelItem(id) {
  await ensureSchema();
  const rows = await getSql()(
    `UPDATE agenda SET status = 'cancelled' WHERE id = $1 AND status = 'active' RETURNING id`,
    [Number(id)],
  );
  if (!rows.length) throw new AgendaError(404, 'NOT_FOUND', 'Item não encontrado ou já cancelado.');
  return { id: Number(id) };
}

export async function createBlock({ start, end, note }) {
  if (!(start instanceof Date) || !(end instanceof Date) || !(end > start)) {
    throw new AgendaError(400, 'RANGE', 'Período inválido.');
  }
  if (end - start > 14 * 24 * 60 * MIN) throw new AgendaError(400, 'RANGE', 'Bloqueie no máximo 14 dias de uma vez.');
  await ensureSchema();
  try {
    const [row] = await getSql()(
      `INSERT INTO agenda (kind, starts_at, ends_at, note) VALUES ('block', $1, $2, $3) RETURNING *`,
      [start.toISOString(), end.toISOString(), String(note || '').slice(0, 120) || null],
    );
    return serialize(row);
  } catch (e) {
    if (e.code === '23P01') throw new AgendaError(409, 'CONFLICT', 'Já existe agendamento nesse período. Cancele o agendamento antes ou escolha outro período.');
    throw e;
  }
}

export async function createRule({ dias, inicio, fim, note }) {
  const d = [...new Set(String(dias || '').replace(/[^0-6]/g, ''))].sort().join('');
  if (!d) throw new AgendaError(400, 'DAYS', 'Escolha pelo menos um dia.');
  if (!(inicio >= 0 && inicio < 1440 && fim > 0 && fim <= 1440 && fim !== inicio)) {
    throw new AgendaError(400, 'RANGE', 'Horário inválido.');
  }
  await ensureSchema();
  const [row] = await getSql()(
    `INSERT INTO agenda_regras (dias, inicio, fim, note) VALUES ($1, $2, $3, $4) RETURNING id, dias, inicio, fim, note`,
    [d, inicio, fim, String(note || '').slice(0, 120) || null],
  );
  return row;
}

export async function deleteRule(id) {
  await ensureSchema();
  const rows = await getSql()(`DELETE FROM agenda_regras WHERE id = $1 RETURNING id`, [Number(id)]);
  if (!rows.length) throw new AgendaError(404, 'NOT_FOUND', 'Regra não encontrada.');
  return { id: Number(id) };
}
