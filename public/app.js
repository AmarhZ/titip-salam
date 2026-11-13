(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  const form = $('#confess-form');
  const formInner = $('#form-inner');
  const submitBtn = $('#submit');
  const errorBox = $('#form-error');
  const noteP = $('#note-personal');
  const noteU = $('#note-public');
  const msg = $('#message');
  const count = $('#count');
  const done = $('#done');
  const toastEl = $('#toast');

  // ---------- util ----------
  let toastTimer;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function timeAgo(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'baru saja';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'kemarin';
    if (d < 30) return `${d} hari lalu`;
    return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  async function api(url, options) {
    const res = await fetch(url, options);
    let data = {};
    try { data = await res.json(); } catch { /* abaikan */ }
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan. Coba lagi ya.');
    return data;
  }

  // ---------- mode ----------
  const currentMode = () => form.elements.mode.value;

  function syncMode() {
    const personal = currentMode() === 'personal';
    $('#expiry-field').hidden = !personal;
    noteP.hidden = !personal;
    noteU.hidden = personal;
    submitBtn.textContent = personal ? 'Buat Link Rahasia' : 'Publikasikan Confess';
  }
  form.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', syncMode));

  msg.addEventListener('input', () => { count.textContent = `${msg.value.length}/1000`; });

  // ---------- kirim ----------
  function showError(text) {
    errorBox.textContent = text;
    errorBox.hidden = !text;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');

    const payload = {
      mode: currentMode(),
      to: form.elements.to.value.trim(),
      message: form.elements.message.value.trim(),
      from: form.elements.from.value.trim(),
      website: form.elements.website.value,
    };
    if (payload.mode === 'personal') payload.expiry = form.elements.expiry.value;
    if (tsWidget !== null) {
      if (!tsToken) return showError('Selesaikan verifikasi anti-spam dulu.');
      payload.turnstile = tsToken;
    }
    if (!payload.to) return showError('Isi dulu untuk siapa confess ini.');
    if (payload.message.length < 5) return showError('Pesannya terlalu singkat. Tulis sedikit lebih panjang ya.');

    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = 'Mengirim…';
    try {
      const data = await api('/api/confess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showDone(data);
      resetTurnstile();
      form.reset();
      count.textContent = '0/1000';
      syncMode();
      if (data.mode === 'public') loadFeed({ reset: true });
    } catch (err) {
      showError(err.message);
      resetTurnstile();
    } finally {
      submitBtn.disabled = false;
      if (!done.hidden) submitBtn.textContent = label;
      else syncMode();
    }
  });

  function showDone(data) {
    formInner.hidden = true;
    done.hidden = false;
    const linkbox = $('#linkbox');
    const open = $('#done-open');
    const delbox = $('#delbox');
    delbox.hidden = !data.deleteCode;
    $('#delete-code').value = data.deleteCode || '';
    if (data.mode === 'personal') {
      const url = location.origin + data.path;
      $('#done-title').textContent = 'Link rahasiamu siap';
      $('#done-text').textContent = 'Simpan dan bagikan link ini hanya ke orang yang kamu tuju. Link ini tidak bisa dibuat ulang, jadi salin sekarang.' +
        (data.expiresAt
          ? ' Link berlaku sampai ' + new Date(data.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + '.'
          : '');
      $('#secret-link').value = url;
      linkbox.hidden = false;
      open.textContent = 'Buka link';
      open.href = data.path;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
    } else {
      $('#done-title').textContent = data.held ? 'Pesanmu menunggu tinjauan' : 'Confess-mu sudah terbit';
      $('#done-text').textContent = data.held
        ? 'Pesanmu diterima, tetapi ada bagian yang perlu kami periksa dulu (misalnya nomor telepon, tautan, atau kata tertentu). Setelah ditinjau, pesan akan tampil di feed umum.'
        : 'Pesanmu sekarang tampil di feed umum dan bisa ditemukan lewat pencarian nama.';
      linkbox.hidden = true;
      open.textContent = 'Lihat di Feed';
      open.href = '#feed';
      open.removeAttribute('target');
      open.removeAttribute('rel');
    }
    done.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('#again').addEventListener('click', () => {
    done.hidden = true;
    formInner.hidden = false;
    $('#secret-link').value = '';
    $('#delete-code').value = '';
    $('#to').focus();
  });

  $('#copy').addEventListener('click', async () => {
    const input = $('#secret-link');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    toast('Link disalin');
  });

  $('#copy-del').addEventListener('click', async () => {
    const input = $('#delete-code');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    toast('Kode hapus disalin');
  });

  // ---------- verifikasi anti-spam (Cloudflare Turnstile, hanya bila diaktifkan di server) ----------
  let tsWidget = null;
  let tsToken = '';
  function resetTurnstile() {
    tsToken = '';
    if (tsWidget !== null && window.turnstile) try { window.turnstile.reset(tsWidget); } catch { /* abaikan */ }
  }
  async function initTurnstile() {
    let cfg;
    try { cfg = await api('/api/config'); } catch { return; }
    if (!cfg.turnstileSiteKey) return;
    const box = $('#ts-box');
    box.hidden = false;
    tsWidget = -1; // tanda: verifikasi wajib, widget belum siap
    window.__tsReady = () => {
      tsWidget = window.turnstile.render(box, {
        sitekey: cfg.turnstileSiteKey,
        language: 'id',
        callback: (t) => { tsToken = t; },
        'expired-callback': () => { tsToken = ''; },
        'error-callback': () => { tsToken = ''; },
      });
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tsReady';
    s.async = true;
    document.head.appendChild(s);
  }
  initTurnstile();

  // ---------- feed ----------
  const list = $('#feed-list');
  const moreBtn = $('#more');
  const searchForm = $('#search-form');
  const qInput = $('#q');
  let nextCursor = null;
  let query = '';
  let loading = false;

  function stateCard(text) {
    const d = document.createElement('div');
    d.className = 'feed-state';
    d.textContent = text;
    return d;
  }

  function icon(name, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + name);
    svg.appendChild(use);
    return svg;
  }

  // Pesan yang sudah kamu laporkan tidak ditampilkan lagi di peramban ini
  const REPORTED_KEY = 'titipsalam:reported';
  function loadReported() {
    try { return new Set(JSON.parse(localStorage.getItem(REPORTED_KEY) || '[]')); } catch { return new Set(); }
  }
  function saveReported(set) {
    try { localStorage.setItem(REPORTED_KEY, JSON.stringify([...set].slice(-500))); } catch { /* abaikan */ }
  }
  const reported = loadReported();

  function postCard(item) {
    const art = document.createElement('article');
    art.className = 'post';
    art.dataset.id = item.id;

    const to = document.createElement('span');
    to.className = 'to';
    to.textContent = `Untuk: ${item.to}`;

    const body = document.createElement('p');
    body.className = 'msg';
    body.textContent = item.message; // textContent: aman dari XSS

    const meta = document.createElement('div');
    meta.className = 'meta';
    const when = document.createElement('span');
    when.textContent = `dari ${item.from || 'Anonim'} · ${timeAgo(item.createdAt)}`;

    const report = document.createElement('button');
    report.type = 'button';
    report.className = 'report-btn';
    report.dataset.report = `/api/report/${item.id}`;
    report.dataset.reportId = item.id;
    report.setAttribute('aria-label', `Laporkan pesan untuk ${item.to}`);
    report.append(icon('flag', 'i'), document.createTextNode('Laporkan'));

    meta.append(when, report);
    art.append(icon('heart', 'h'), to, body, meta);
    return art;
  }

  document.addEventListener('ts:reported', (e) => {
    const id = e.detail && e.detail.id;
    if (!id) return;
    reported.add(String(id));
    saveReported(reported);
    const card = list.querySelector(`.post[data-id="${CSS.escape(String(id))}"]`);
    if (card) card.remove();
    if (!list.children.length) list.appendChild(stateCard('Belum ada confess untuk ditampilkan.'));
  });

  async function loadFeed({ reset = false } = {}) {
    if (loading) return;
    loading = true;
    moreBtn.disabled = true;
    if (reset) { nextCursor = null; list.replaceChildren(); }
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (nextCursor) params.set('before', nextCursor);
      const data = await api('/api/feed?' + params);
      data.items.filter((it) => !reported.has(String(it.id))).forEach((it) => list.appendChild(postCard(it)));
      nextCursor = data.next;
      moreBtn.hidden = !data.next;
      if (!list.children.length) {
        list.appendChild(stateCard(
          query
            ? `Belum ada confess untuk "${query}". Siapa tahu kamu yang pertama menulisnya.`
            : 'Feed masih kosong. Jadilah yang pertama menulis confess.'
        ));
      }
    } catch (err) {
      list.replaceChildren(stateCard(err.message));
      moreBtn.hidden = true;
    } finally {
      loading = false;
      moreBtn.disabled = false;
    }
  }

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    query = qInput.value.trim();
    loadFeed({ reset: true });
  });
  moreBtn.addEventListener('click', () => loadFeed());

  syncMode();
  loadFeed({ reset: true });
})();
