// GET /api/slots — horários livres dos próximos 7 dias.
import { getSlots } from '../lib/agenda.js';
import { send, handleError, onlyMethods } from '../lib/http.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['GET'])) return;
  try {
    const days = await getSlots(new Date());
    const next = days.flatMap((d) => d.slots.map((s) => ({ ...s, date: d.date, weekday: d.weekday }))).find(Boolean) || null;
    send(res, 200, { now: new Date().toISOString(), days, next });
  } catch (e) {
    handleError(res, e);
  }
}
