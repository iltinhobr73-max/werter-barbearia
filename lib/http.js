// Utilidades para as funções da Vercel (/api).
import { createHash, timingSafeEqual } from 'node:crypto';
import { AgendaError } from './agenda.js';

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export function handleError(res, e) {
  if (e instanceof AgendaError) return send(res, e.status, { error: e.code, message: e.message });
  if (e && e.code === 'NO_DB') return send(res, 503, { error: 'NO_DB', message: 'Agendamento online indisponível no momento.' });
  console.error(e);
  return send(res, 500, { error: 'SERVER', message: 'Erro inesperado. Tente de novo ou agende pelo WhatsApp.' });
}

export function onlyMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  send(res, 405, { error: 'METHOD', message: 'Método não permitido.' });
  return false;
}

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** Confere a senha do painel (header x-admin-key) contra ADMIN_PASSWORD. */
export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 6) {
    send(res, 503, { error: 'NO_PASSWORD', message: 'Defina ADMIN_PASSWORD (mínimo 6 caracteres) nas variáveis da Vercel.' });
    return false;
  }
  const given = req.headers['x-admin-key'] || '';
  if (!timingSafeEqual(digest(given), digest(expected))) {
    send(res, 401, { error: 'AUTH', message: 'Senha incorreta.' });
    return false;
  }
  return true;
}
