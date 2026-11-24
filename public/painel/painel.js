/* Painel da agenda — Barbearia Marcos Werter */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const KEY = 'mw-painel-key';
  const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const WD_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let key = '';
  try { key = localStorage.getItem(KEY) || ''; } catch { /* ok */ }

  // datas no horário de Cascavel (UTC-3)
  const ce = (d = new Date()) => new Date(d.getTime() + d.getTimezoneOffset() * 60000 - 3 * 3600000);
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => ymd(ce());
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d + n); return ymd(x); };

  async function api(path, body) {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-admin-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { logout(); throw new Error(data.message || 'Senha incorreta.'); }
    if (!r.ok) throw new Error(data.message || 'Erro ' + r.status);
    return data;
  }

  // ---------- login
  const loginForm = $('[data-login]'), app = $('[data-app]');
  function logout() {
    key = ''; try { localStorage.removeItem(KEY); } catch { /* ok */ }
    app.hidden = true; loginForm.hidden = false; $('[data-logout]').hidden = true;
  }
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    key = loginForm.pass.value;
    const err = $('[data-login-err]');
    try {
      await load();
      try { localStorage.setItem(KEY, key); } catch { /* ok */ }
      err.hidden = true;
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  $('[data-logout]').addEventListener('click', logout);

  // ---------- abas
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));

  // ---------- selects de horário
  const times = [];
  for (let m = 0; m < 1440; m += 30) times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  const fill = (sel, list, def) => { sel.innerHTML = list.map((t) => `<option ${t === def ? 'selected' : ''}>${t}</option>`).join(''); };
  fill($('[data-f-book]').time, times, '09:00');
  fill($('[data-f-block]').from, times, '12:00');
  fill($('[data-f-block]').to, [...times.slice(1), '24:00'], '14:00');
  fill($('[data-f-rule]').from, times, '23:00');
  fill($('[data-f-rule]').to, [...times.slice(1), '24:00'], '07:00');
  $('[data-wd]').innerHTML = WD.map((d, i) => `<label><input type="checkbox" value="${i}" checked><span>${d}</span></label>`).join('');
  $$('input[type="date"]').forEach((i) => { i.value = todayStr(); i.min = addDays(todayStr(), -1); });

  // ---------- agenda
  function render({ items, rules }) {
    const today = todayStr();
    const now = Date.now();
    const byDay = {};
    for (const it of items) (byDay[it.date] ||= []).push(it);
    const bookings = items.filter((i) => i.kind === 'booking');
    $('[data-st-today]').textContent = bookings.filter((b) => b.date === today).length;
    $('[data-st-tomorrow]').textContent = bookings.filter((b) => b.date === addDays(today, 1)).length;
    $('[data-st-week]').textContent = bookings.filter((b) => b.date >= today && b.date <= addDays(today, 6)).length;

    let html = '';
    for (let i = 0; i < 8; i++) {
      const date = addDays(today, i);
      const [y, m, d] = date.split('-').map(Number);
      const wd = WD_LONG[new Date(y, m - 1, d).getDay()];
      const list = byDay[date] || [];
      const title = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : wd;
      html += `<div class="p-day"><h2>${title} <small>${pad(d)}/${pad(m)} · ${list.filter((x) => x.kind === 'booking').length} agendado(s)</small></h2>`;
      if (!list.length) html += '<p class="p-empty">Nada marcado.</p>';
      for (const it of list) {
        const past = new Date(it.end).getTime() < now ? ' is-past' : '';
        if (it.kind === 'block') {
          const end = ce(new Date(it.end));
          html += `<div class="p-item is-block${past}"><div class="p-time">${it.time}<small>até ${pad(end.getHours())}:${pad(end.getMinutes())}</small></div>
            <div class="p-name">Bloqueado</div><div class="p-actions"><button class="p-btn p-btn--danger" data-cancel="${it.id}" data-what="o bloqueio das ${it.time}">Liberar</button></div>
            <div class="p-meta">${esc(it.note || 'Sem motivo')}</div></div>`;
        } else {
          const phone = String(it.phone || '');
          const local = phone.replace(/^55/, '');
          const fmt = local.length === 11 ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}` : local;
          const msg = encodeURIComponent(`Olá, ${it.name}! Aqui é da Barbearia Marcos Werter. Seu horário de ${it.serviceLabel} está confirmado para ${wd}, ${pad(d)}/${pad(m)} às ${it.time}. Tolerância de 7 minutos. Até lá!`);
          html += `<div class="p-item${past}"><div class="p-time">${it.time}<small>#${it.id}</small></div>
            <div class="p-name">${esc(it.name)}${it.offHours ? '<span class="p-tag">24h</span>' : ''}</div>
            <div class="p-actions"><a class="p-btn" href="https://wa.me/${esc(phone)}?text=${msg}" target="_blank" rel="noopener">WhatsApp</a>
              <button class="p-btn p-btn--danger" data-cancel="${it.id}" data-what="o horário de ${esc(it.name)} às ${it.time}">Cancelar</button></div>
            <div class="p-meta">${esc(it.serviceLabel || '')} · ${fmt}</div></div>`;
        }
      }
      html += '</div>';
    }
    $('[data-agenda]').innerHTML = html;

    $('[data-rules]').innerHTML = rules.length
      ? rules.map((r) => {
          const dias = String(r.dias).split('').map((x) => WD[+x]).join(', ');
          const f = (m) => (m >= 1440 ? '24:00' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
          return `<div class="p-rule"><div><b>${f(r.inicio)} → ${f(r.fim)}</b><span>${dias}${r.note ? ' · ' + esc(r.note) : ''}</span></div>
            <button class="p-btn p-btn--danger" data-del-rule="${r.id}">Remover</button></div>`;
        }).join('')
      : '<p class="p-empty">Nenhum bloqueio fixo. Com a agenda 24h, vale criar um para a madrugada.</p>';
  }

  async function load() {
    const data = await api('/api/admin/agenda');
    loginForm.hidden = true; app.hidden = false; $('[data-logout]').hidden = false;
    render(data);
  }

  document.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-cancel]');
    if (c) {
      if (!confirm(`Cancelar ${c.dataset.what}? O horário volta a aparecer no site.`)) return;
      try { await api('/api/admin/action', { action: 'cancel', id: c.dataset.cancel }); await load(); } catch (ex) { alert(ex.message); }
    }
    const r = e.target.closest('[data-del-rule]');
    if (r) {
      if (!confirm('Remover este bloqueio fixo?')) return;
      try { await api('/api/admin/action', { action: 'deleteRule', id: r.dataset.delRule }); await load(); } catch (ex) { alert(ex.message); }
    }
  });

  function bindForm(sel, build, okMsg) {
    const f = $(sel), msg = $('[data-msg]', f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api('/api/admin/action', build(f));
        msg.textContent = okMsg; msg.className = 'p-msg ok'; msg.hidden = false;
        await load();
      } catch (ex) {
        msg.textContent = ex.message; msg.className = 'p-msg err'; msg.hidden = false;
      } finally { btn.disabled = false; }
    });
  }
  bindForm('[data-f-book]', (f) => ({ action: 'book', date: f.date.value, time: f.time.value, service: f.service.value, name: f.name.value, phone: f.phone.value }), 'Horário marcado. Já sumiu do site.');
  bindForm('[data-f-block]', (f) => ({ action: 'block', date: f.date.value, from: f.from.value, to: f.to.value, note: f.note.value }), 'Período bloqueado.');
  bindForm('[data-f-rule]', (f) => ({ action: 'rule', dias: $$('[data-wd] input:checked').map((i) => i.value).join(''), from: f.from.value, to: f.to.value, note: f.note.value }), 'Bloqueio fixo salvo.');

  if (key) load().catch(() => logout());
  setInterval(() => { if (key && document.visibilityState === 'visible') load().catch(() => {}); }, 30000);
})();
