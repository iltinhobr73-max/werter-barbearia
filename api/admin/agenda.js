// GET /api/admin/agenda — agenda completa para o painel do Werter.
import { adminAgenda } from '../../lib/agenda.js';
import { send, handleError, onlyMethods, requireAdmin } from '../../lib/http.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;
  try {
    send(res, 200, await adminAgenda(new Date()));
  } catch (e) {
    handleError(res, e);
  }
}
