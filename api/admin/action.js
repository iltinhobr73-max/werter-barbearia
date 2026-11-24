// POST /api/admin/action — ações do painel: cancelar, bloquear, regra fixa, marcar para cliente.
import { cancelItem, createBlock, createRule, deleteRule, createBooking, AgendaError } from '../../lib/agenda.js';
import { parseLocal } from '../../lib/time.js';
import { send, readBody, handleError, onlyMethods, requireAdmin } from '../../lib/http.js';

const toMin = (t) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t || '');
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
};

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;
  if (!requireAdmin(req, res)) return;
  const b = readBody(req);
  try {
    switch (b.action) {
      case 'cancel':
        return send(res, 200, await cancelItem(b.id));
      case 'block': {
        // De "data às hora" até "data às hora". Se o fim for antes do início no mesmo dia, vai até o dia seguinte.
        const start = parseLocal(b.date, b.from);
        let end = parseLocal(b.dateEnd || b.date, b.to === '24:00' ? '24:00' : b.to);
        if (!start || !end) throw new AgendaError(400, 'RANGE', 'Preencha data e horários.');
        if (!b.dateEnd && end <= start) end = new Date(end.getTime() + 24 * 3600000);
        return send(res, 201, await createBlock({ start, end, note: b.note }));
      }
      case 'rule':
        return send(res, 201, await createRule({ dias: b.dias, inicio: toMin(b.from), fim: b.to === '24:00' ? 1440 : toMin(b.to), note: b.note }));
      case 'deleteRule':
        return send(res, 200, await deleteRule(b.id));
      case 'book': {
        const start = parseLocal(b.date, b.time);
        if (!start) throw new AgendaError(400, 'START', 'Preencha data e horário.');
        return send(res, 201, await createBooking({ service: b.service, name: b.name, phone: b.phone, start: start.toISOString() }, { admin: true }));
      }
      default:
        return send(res, 400, { error: 'ACTION', message: 'Ação desconhecida.' });
    }
  } catch (e) {
    handleError(res, e);
  }
}
