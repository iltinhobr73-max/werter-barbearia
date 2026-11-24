// POST /api/book — cria um agendamento. O banco garante que não há conflito.
import { createBooking } from '../lib/agenda.js';
import { send, readBody, handleError, onlyMethods } from '../lib/http.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;
  const body = readBody(req);
  if (body.website) return send(res, 400, { error: 'BOT', message: 'Requisição inválida.' }); // campo-isca anti-robô
  try {
    const booking = await createBooking({
      service: body.service, name: body.name, phone: body.phone, start: body.start,
    });
    send(res, 201, { booking });
  } catch (e) {
    handleError(res, e);
  }
}
