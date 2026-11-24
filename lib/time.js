// Funções de data/hora sempre no fuso de Cascavel – CE (UTC-3), independente
// do fuso do servidor (a Vercel roda em UTC) ou do celular do cliente.
import { TZ_OFFSET_MIN } from './config.js';

const OFFSET_MS = TZ_OFFSET_MIN * 60000;
export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Partes da data no horário local do Ceará. */
export function localParts(date) {
  const d = new Date(date.getTime() + OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
    ms: d.getUTCMilliseconds(),
  };
}

/** Instante (Date) de uma data local + minutos desde 0h. Aceita minutos >= 1440 (dia seguinte). */
export function localToDate(year, month, day, minutes) {
  return new Date(Date.UTC(year, month - 1, day, 0, minutes) - OFFSET_MS);
}

/** Meia-noite local do dia de `date`, deslocada `addDays` dias. */
export function startOfLocalDay(date, addDays = 0) {
  const p = localParts(date);
  return localToDate(p.year, p.month, p.day + addDays, 0);
}

export const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (p) => `${p.year}-${pad(p.month)}-${pad(p.day)}`;
export const hhmm = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

/** "2026-11-24" + "14:30" -> Date. Retorna null se inválido. */
export function parseLocal(dateStr, timeStr) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  const tm = /^(\d{2}):(\d{2})$/.exec(timeStr || '');
  if (!dm || !tm) return null;
  const [y, mo, d] = dm.slice(1).map(Number);
  const [h, mi] = tm.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  const date = localToDate(y, mo, d, h * 60 + mi);
  const back = localParts(localToDate(y, mo, d, 0));
  if (back.day !== d || back.month !== mo) return null; // ex.: 31/02
  return date;
}
