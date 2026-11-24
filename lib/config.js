// Regras da agenda da Barbearia Marcos Werter.
// Tudo que o dono pode querer mudar está aqui.

export const WHATSAPP = '5585991573639';

// Ceará não tem horário de verão: UTC-3 o ano todo.
export const TZ_OFFSET_MIN = -180;

export const SLOT_STEP_MIN = 30;     // horários aparecem de 30 em 30 min
export const DURATION_MIN = 60;      // cada atendimento ocupa 1h na agenda
export const WINDOW_DAYS = 7;        // hoje + 6 dias (7 dias corridos)
export const LEAD_IN_HOURS_MIN = 30; // antecedência mínima dentro do expediente
export const LEAD_OFF_HOURS_MIN = 180; // antecedência mínima fora do expediente (24h)
export const MAX_ACTIVE_PER_PHONE = 2; // agendamentos futuros por número de WhatsApp
export const LATE_TOLERANCE_MIN = 7;

// Expediente normal (minutos desde 0h). 0 = domingo ... 6 = sábado.
// Um horário é "dentro do expediente" se o atendimento inteiro (1h) cabe numa faixa.
export const BUSINESS_HOURS = {
  0: [],
  1: [],
  2: [[9 * 60, 11 * 60], [14 * 60, 18 * 60]],
  3: [[9 * 60, 11 * 60], [14 * 60, 18 * 60]],
  4: [[9 * 60, 11 * 60], [14 * 60, 18 * 60]],
  5: [[9 * 60, 11 * 60], [14 * 60, 18 * 60]],
  6: [[9 * 60, 18 * 60]],
};

// Serviços que podem ser agendados (preço de agendamento dentro do expediente).
export const SERVICES = {
  corte: { label: 'Corte', price: 50 },
  barba: { label: 'Barba', price: 40 },
  'corte-barba': { label: 'Corte + barba', price: 90 },
};

export const OFF_HOURS_NOTE = 'Atendimento exclusivo 24h: valor diferenciado + taxa de reserva a partir de R$ 30, confirmado pelo Werter no WhatsApp.';
