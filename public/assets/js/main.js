/* Barbearia Marcos Werter — interações e agendamento. Sem dependências. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WHATS = '5585991573639';
  const SERVICES = {
    corte: { label: 'Corte', price: 50 },
    barba: { label: 'Barba', price: 40 },
    'corte-barba': { label: 'Corte + barba', price: 90 },
  };
  const OFF_NOTE = 'Fora do expediente (atendimento exclusivo 24h): valor diferenciado + taxa de reserva a partir de R$ 30. O Werter confirma o valor no WhatsApp.';
  const WD_SHORT = { domingo: 'dom', segunda: 'seg', 'terça': 'ter', quarta: 'qua', quinta: 'qui', sexta: 'sex', 'sábado': 'sáb' };
  const pad = (n) => String(n).padStart(2, '0');

  /* ------------------------------------------------ horário de Cascavel */
  const nowCE = () => { const d = new Date(); return new Date(d.getTime() + d.getTimezoneOffset() * 60000 - 3 * 3600000); };
  const HOURS = { 0: [], 1: [], 2: [[9, 11], [14, 18]], 3: [[9, 11], [14, 18]], 4: [[9, 11], [14, 18]], 5: [[9, 11], [14, 18]], 6: [[9, 18]] };

  (function openStatus() {
    const n = nowCE(), day = n.getDay(), t = n.getHours() + n.getMinutes() / 60;
    $(`.hours tr[data-day="${day}"]`)?.classList.add('is-today');
    const txt = $('[data-status]'), dot = $('[data-status-dot]');
    if (!txt) return;
    const cur = HOURS[day].find(([a, b]) => t >= a && t < b);
    if (cur) {
      dot.classList.add('is-on');
      txt.textContent = `Aberto agora · até ${cur[1]}h`;
    }
  })();

  /* ------------------------------------------------ header / menu */
  const header = $('.header');
  const mobileCta = $('[data-mobile-cta]');
  const bookSection = $('#agendar');
  let lastY = scrollY, ticking = false;
  const onScroll = () => {
    const y = scrollY;
    header.classList.toggle('is-solid', y > 24);
    if (!document.body.classList.contains('menu-open')) header.classList.toggle('is-hidden', y > lastY && y > 480);
    if (mobileCta) {
      const r = bookSection.getBoundingClientRect();
      const inBook = r.top < innerHeight && r.bottom > 0;
      mobileCta.classList.toggle('is-visible', y > innerHeight * 0.7 && !inBook);
    }
    lastY = y; ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  onScroll();

  const burger = $('.burger'), nav = $('#menu');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    nav.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    document.body.classList.toggle('menu-open', open);
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* ------------------------------------------------ revelar ao rolar */
  const revealEls = $$('[data-reveal], .reveal-img');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    revealEls.forEach((el) => io.observe(el));
  } else revealEls.forEach((el) => el.classList.add('is-in'));

  const score = $('[data-count]');
  if (score && 'IntersectionObserver' in window && !reduceMotion) {
    const target = parseFloat(score.dataset.count);
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 1300), e = 1 - Math.pow(1 - p, 3);
        score.textContent = (target * e).toFixed(1).replace('.', ',');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(score);
  }

  const mapBtn = $('[data-map]');
  mapBtn?.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.src = mapBtn.dataset.map; f.title = 'Mapa: Barbearia Marcos Werter em Cascavel – CE';
    f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade';
    mapBtn.replaceWith(f);
  });
  const yr = $('[data-year]'); if (yr) yr.textContent = new Date().getFullYear();

  let toastTimer;
  const toast = (msg) => {
    const el = $('[data-toast]');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 5200);
  };

  /* ================================================== AGENDAMENTO */
  const booker = $('[data-booker]');
  if (!booker) return;
  const form = $('[data-form]', booker);
  const daysEl = $('[data-days]', booker);
  const timesEl = $('[data-times]', booker);
  const btn = $('[data-confirm]', booker);
  const errEl = $('[data-error]', booker);
  const nextCard = $('[data-next]');

  const state = { days: null, service: null, date: null, start: null, busy: false, loadedOnce: false };

  const dayLabel = (d, i) => (i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : WD_SHORT[d.weekday] || d.weekday);
  const longDay = (d) => {
    const i = state.days ? state.days.findIndex((x) => x.date === d.date) : -1;
    const base = `${d.weekday}, ${pad(d.day)}/${pad(d.month)}`;
    return i === 0 ? `hoje, ${pad(d.day)}/${pad(d.month)}` : i === 1 ? `amanhã, ${pad(d.day)}/${pad(d.month)}` : base;
  };
  const currentDay = () => state.days?.find((d) => d.date === state.date) || null;
  const currentSlot = () => currentDay()?.slots.find((s) => s.start === state.start) || null;

  async function loadSlots({ silent = false } = {}) {
    try {
      const r = await fetch('/api/slots', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (!Array.isArray(data.days)) throw new Error('formato');
      state.days = data.days;
      state.loadedOnce = true;
      booker.classList.remove('is-offline'); $('[data-offline]', booker).hidden = true;
      if (state.start && !currentSlot()) {
        toast('O horário que você escolheu acabou de ser reservado por outra pessoa. Escolha outro.');
        state.start = null;
      }
      if (!state.date || !currentDay()) state.date = (data.days.find((d) => d.slots.length) || data.days[0]).date;
      renderDays(); renderTimes(); renderSummary(); renderNext(data.next);
    } catch (e) {
      if (!state.loadedOnce) {
        booker.classList.add('is-offline'); $('[data-offline]', booker).hidden = false;
        nextCard.hidden = true;
      }
    }
  }

  function renderNext(next) {
    if (!nextCard) return;
    if (!next) { nextCard.hidden = true; return; }
    const i = state.days.findIndex((d) => d.date === next.date);
    const d = state.days[i];
    const when = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : `${WD_SHORT[d.weekday]} ${pad(d.day)}/${pad(d.month)}`;
    $('[data-next-when]').textContent = `${when} · ${next.time}`;
    nextCard.dataset.date = next.date; nextCard.dataset.start = next.start;
    nextCard.hidden = false;
  }

  function renderDays() {
    const frag = document.createDocumentFragment();
    state.days.forEach((d, i) => {
      const free = d.slots.length;
      const lab = document.createElement('label');
      lab.className = 'day' + (free ? '' : ' is-full');
      lab.innerHTML = `<input type="radio" name="day" value="${d.date}" ${free ? '' : 'disabled'} ${d.date === state.date ? 'checked' : ''}>
        <span class="day__box"><span class="day__wd">${dayLabel(d, i)}</span><span class="day__n">${pad(d.day)}</span>
        <span class="day__free">${free ? `${free} livre${free > 1 ? 's' : ''}` : 'lotado'}</span></span>`;
      frag.appendChild(lab);
    });
    daysEl.replaceChildren(frag);
  }

  const PERIODS = [['Madrugada', 0, 6], ['Manhã', 6, 12], ['Tarde', 12, 18], ['Noite', 18, 24]];
  let lastRenderedKey = '';
  function renderTimes() {
    const d = currentDay();
    if (!d) { timesEl.innerHTML = '<p class="muted">Escolha um dia para ver os horários.</p>'; return; }
    const key = d.date + '|' + d.slots.map((s) => s.start).join(',') + '|' + state.start;
    if (key === lastRenderedKey) return; // evita piscar a cada atualização automática
    const animate = !lastRenderedKey.startsWith(d.date + '|');
    lastRenderedKey = key;
    if (!d.slots.length) { timesEl.innerHTML = '<p class="empty">Nenhum horário livre neste dia. Escolha outro dia.</p>'; return; }
    const frag = document.createDocumentFragment();
    for (const [name, a, b] of PERIODS) {
      const list = d.slots.filter((s) => { const h = +s.time.slice(0, 2); return h >= a && h < b; });
      if (!list.length) continue;
      const wrap = document.createElement('div');
      wrap.className = 'period';
      wrap.innerHTML = `<p class="period__name">${name}</p><div class="period__grid"></div>`;
      const grid = wrap.lastElementChild;
      list.forEach((s, idx) => {
        const b2 = document.createElement('button');
        b2.type = 'button';
        b2.className = 'slot' + (s.inHours ? '' : ' is-24h');
        b2.textContent = s.time;
        b2.dataset.start = s.start;
        b2.setAttribute('aria-pressed', String(s.start === state.start));
        b2.setAttribute('aria-label', `${s.time}${s.inHours ? '' : ', fora do expediente (24h)'}`);
        b2.style.animationDelay = animate ? Math.min(idx * 18, 300) + 'ms' : '0ms';
        if (!animate) b2.style.animation = 'none';
        grid.appendChild(b2);
      });
      frag.appendChild(wrap);
    }
    timesEl.replaceChildren(frag);
  }

  function renderSummary() {
    const svc = SERVICES[state.service];
    const d = currentDay();
    const s = currentSlot();
    $('[data-s-service]').textContent = svc ? svc.label : '—';
    $('[data-s-day]').textContent = d && s ? longDay(d) : d ? longDay(d) : '—';
    $('[data-s-time]').textContent = s ? s.time : '—';
    const note = $('[data-s-note]');
    if (s && !s.inHours) {
      $('[data-s-price]').textContent = 'Valor 24h';
      note.textContent = OFF_NOTE; note.hidden = false;
    } else {
      $('[data-s-price]').textContent = svc ? `R$ ${svc.price}` : '—';
      note.hidden = true;
    }
    btn.disabled = !(svc && s) || state.busy;
  }

  // ---- eventos do formulário
  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'service') state.service = t.value;
    if (t.name === 'day') { state.date = t.value; state.start = null; }
    errEl.hidden = true;
    renderTimes(); renderSummary();
  });
  timesEl.addEventListener('click', (e) => {
    const b = e.target.closest('.slot');
    if (!b) return;
    state.start = b.dataset.start;
    errEl.hidden = true;
    renderTimes(); renderSummary();
    if (!state.service) toast('Agora escolha o serviço no passo 1.');
    else if (matchMedia('(max-width: 1080px)').matches) $('[data-step="data"]').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  });

  // máscara de telefone
  const phoneIn = form.elements.phone, nameIn = form.elements.name;
  phoneIn.addEventListener('input', () => {
    let d = phoneIn.value.replace(/\D/g, '');
    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    let out = d;
    if (d.length > 2) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 6 && d.length <= 10) out = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    if (d.length === 11) out = `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
    phoneIn.value = out;
    phoneIn.removeAttribute('aria-invalid');
  });
  nameIn.addEventListener('input', () => nameIn.removeAttribute('aria-invalid'));
  try {
    const saved = JSON.parse(localStorage.getItem('mw-cliente') || 'null');
    if (saved) { nameIn.value = saved.name || ''; phoneIn.value = saved.phone || ''; }
  } catch { /* sem localStorage */ }

  const showError = (msg, withWa) => {
    errEl.innerHTML = '';
    errEl.append(msg);
    if (withWa) {
      const a = document.createElement('a');
      a.href = `https://wa.me/${WHATS}?text=${encodeURIComponent('Olá! Quero agendar um horário na Barbearia Marcos Werter.')}`;
      a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' Agendar pelo WhatsApp →';
      a.style.color = 'inherit'; a.style.fontWeight = '600';
      errEl.append(a);
    }
    errEl.hidden = false;
  };

  function validate() {
    const name = nameIn.value.replace(/\s+/g, ' ').trim();
    const digits = phoneIn.value.replace(/\D/g, '');
    const phoneOk = (digits.length === 11 && digits[2] === '9') || digits.length === 10;
    if (name.length < 2) { nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); return 'Digite seu nome.'; }
    if (!phoneOk) { phoneIn.setAttribute('aria-invalid', 'true'); phoneIn.focus(); return 'Digite um WhatsApp válido com DDD. Ex.: (85) 9 9157-3639'; }
    if (!form.elements.aware.checked) { form.elements.aware.focus(); return 'Confirme que está ciente da tolerância de 7 minutos.'; }
    return null;
  }

  btn.addEventListener('click', async () => {
    if (state.busy) return;
    const problem = validate();
    if (problem) { showError(problem); return; }
    const slot = currentSlot(), day = currentDay();
    if (!slot || !state.service) { showError('Escolha serviço, dia e horário.'); return; }

    state.busy = true; btn.classList.add('is-loading'); renderSummary(); errEl.hidden = true;
    let r, data;
    try {
      r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          service: state.service, start: slot.start,
          name: nameIn.value, phone: phoneIn.value, website: form.elements.website.value,
        }),
      });
      data = await r.json().catch(() => ({}));
    } catch {
      r = null;
    }
    state.busy = false; btn.classList.remove('is-loading');

    if (r && r.status === 201 && data.booking) {
      try { localStorage.setItem('mw-cliente', JSON.stringify({ name: nameIn.value, phone: phoneIn.value })); } catch { /* ok */ }
      state.start = null; // o horário agora é dele: não avisar como "reservado por outra pessoa"
      showDone(data.booking, day);
      loadSlots({ silent: true });
      return;
    }
    if (r && r.status === 409) {
      showError(data.message || 'Esse horário não está mais disponível. Escolha outro.');
      if (data.error === 'TAKEN' || data.error === 'LEAD') { state.start = null; await loadSlots({ silent: true }); }
      renderSummary();
      return;
    }
    if (r && r.status === 400) { showError(data.message || 'Confira os dados e tente de novo.'); renderSummary(); return; }
    showError('Não conseguimos confirmar agora. Tente de novo em instantes ou ', true);
    renderSummary();
  });

  function showDone(b, day) {
    const dia = longDay(day || { weekday: b.weekday, day: +b.date.slice(8), month: +b.date.slice(5, 7), date: b.date });
    const lines = [
      'Olá! Acabei de agendar pelo site ✅',
      '',
      `*Serviço:* ${b.serviceLabel}`,
      `*Dia:* ${b.weekday}, ${b.date.slice(8)}/${b.date.slice(5, 7)}`,
      `*Horário:* ${b.time}`,
      `*Nome:* ${b.name}`,
      `*Código:* #${b.id}`,
      '',
      'Estou ciente da tolerância de 7 minutos de atraso.',
    ];
    if (b.offHours) lines.push('', '⚠️ É fora do horário (atendimento 24h). Aguardo a confirmação do valor e da taxa de reserva.');
    const wa = `https://wa.me/${WHATS}?text=${encodeURIComponent(lines.join('\n'))}`;

    $('[data-done-text]', booker).innerHTML =
      `<strong>${b.serviceLabel}</strong> · <strong>${dia}</strong> às <strong>${b.time}</strong><br>Código do agendamento: <strong>#${b.id}</strong>` +
      (b.offHours ? '<br><small>Fora do expediente: o Werter confirma o valor e a taxa de reserva no WhatsApp.</small>' : '');
    $('[data-done-wa]', booker).href = wa;
    booker.classList.add('is-done');
    const done = $('[data-done]', booker);
    done.hidden = false;
    done.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    done.focus({ preventScroll: true });
    // No celular, já abre o WhatsApp com a confirmação pronta.
    if (matchMedia('(pointer: coarse)').matches) setTimeout(() => { location.href = wa; }, 1400);
  }

  $('[data-again]', booker).addEventListener('click', () => {
    booker.classList.remove('is-done');
    $('[data-done]', booker).hidden = true;
    state.start = null; lastRenderedKey = '';
    renderTimes(); renderSummary();
    booker.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });

  // "Próximo horário livre" do topo: já deixa o horário escolhido
  nextCard?.addEventListener('click', () => {
    if (!nextCard.dataset.start) return;
    state.date = nextCard.dataset.date; state.start = nextCard.dataset.start; lastRenderedKey = '';
    renderDays(); renderTimes(); renderSummary();
    if (!state.service) setTimeout(() => toast('Horário separado. Agora escolha o serviço e seus dados.'), 600);
  });

  // ---- carga inicial + atualização automática (horários somem para todo mundo)
  loadSlots();
  let poll = null;
  const startPoll = () => { if (!poll) poll = setInterval(() => { if (!state.busy && !booker.classList.contains('is-done')) loadSlots({ silent: true }); }, 15000); };
  const stopPoll = () => { clearInterval(poll); poll = null; };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { loadSlots({ silent: true }); startPoll(); } else stopPoll();
  });
  addEventListener('focus', () => loadSlots({ silent: true }));
  startPoll();
})();
