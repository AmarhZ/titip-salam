(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const KEY = 'titipsalam:admin';

  let token = '';
  try { token = sessionStorage.getItem(KEY) || ''; } catch { /* abaikan */ }

  let reasonLabels = {};
  let tab = 'reported';
  let view = 'all';
  let query = '';
  let cursor = null;
  let seq = 0; // menolak respons lama saat berpindah tab dengan cepat
  const items = new Map();

  const els = {
    login: $('#login'), loginForm: $('#login-form'), loginErr: $('#login-error'), loginBtn: $('#login-btn'),
    app: $('#app'), barActions: $('#bar-actions'), stats: $('#stats'), chart: $('#chart'),
    list: $('#list'), more: $('#more'), tools: $('#tools'), note: $('#note'),
    countReported: $('#count-reported'), countQueue: $('#count-queue'), who: $('#who'), toast: $('#toast'),
  };

  // ---------- util ----------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(name, attrs = {}, text) {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function icon(name) {
    const s = svg('svg', { class: 'i', viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    s.appendChild(svg('use', { href: '#' + name }));
    return s;
  }

  let toastTimer;
  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3000);
  }

  function timeAgo(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'baru saja';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'kemarin' : `${d} hari lalu`;
  }
  const fullTime = (ts) =>
    new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ---------- API ----------
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api/admin' + path, {
      method,
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* abaikan */ }
    if (res.status === 401) {
      logout('Token salah atau sudah tidak berlaku.');
      throw new Error('Tidak diizinkan.');
    }
    if (!res.ok) throw Object.assign(new Error(data.error || 'Terjadi kesalahan.'), { status: res.status });
    return data;
  }

  // ---------- login / logout ----------
  function showLogin(message) {
    els.app.hidden = true;
    els.barActions.hidden = true;
    els.login.hidden = false;
    els.loginErr.textContent = message || '';
    els.loginErr.hidden = !message;
  }

  function logout(message) {
    token = '';
    try { sessionStorage.removeItem(KEY); } catch { /* abaikan */ }
    items.clear();
    showLogin(message);
  }

  async function enter() {
    // verifikasi token lewat endpoint statistik
    const stats = await api('/stats?tz=' + -new Date().getTimezoneOffset());
    try { sessionStorage.setItem(KEY, token); } catch { /* abaikan */ }
    els.login.hidden = true;
    els.app.hidden = false;
    els.barActions.hidden = false;
    renderStats(stats);
    try {
      const r = await fetch('/api/report-reasons');
      (await r.json()).forEach((x) => { reasonLabels[x.value] = x.label; });
    } catch { /* label cadangan: pakai kode alasan */ }
    loadTab();
  }

  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    token = $('#token').value.trim();
    if (!token) return showLogin('Isi token admin dulu.');
    els.loginBtn.disabled = true;
    try {
      await enter();
      $('#token').value = '';
    } catch (err) {
      if (err.status === 404) showLogin('Admin belum aktif. Atur ADMIN_TOKENS atau ADMIN_TOKEN di server lalu jalankan ulang.');
      else if (err.message !== 'Tidak diizinkan.') showLogin(err.message);
      token = '';
    } finally {
      els.loginBtn.disabled = false;
    }
  });

  $('#logout').addEventListener('click', () => logout(''));
  $('#refresh').addEventListener('click', async () => {
    if (!(await discardOk())) return;
    refreshStats(); loadTab(); toast('Data disegarkan');
  });

  // ---------- statistik ----------
  function statCard(label, value, note, warn) {
    const c = el('div', 'stat' + (warn ? ' warn' : ''));
    c.append(el('span', 'lbl', label), el('span', 'num', String(value)), el('span', 'snote', note));
    return c;
  }

  let lastStats = null;
  function renderStats(s) {
    lastStats = s;
    els.who.textContent = s.admin ? `Masuk: ${s.admin}` : '';
    const todo = s.pendingReview + (s.queue || 0);
    els.stats.replaceChildren(
      statCard('Perlu ditinjau', todo, todo ? `${s.pendingReview} dilaporkan · ${s.queue || 0} di antrean` : 'semua beres', todo > 0),
      statCard('Total pesan', s.total, `${s.public} umum · ${s.personal} personal`),
      statCard('Disembunyikan', s.hidden, 'tidak tampil ke publik'),
      statCard('24 jam terakhir', s.last24h, `pesan baru · ${s.reports24h} laporan`)
    );
    els.countReported.textContent = String(s.pendingReview);
    els.countReported.hidden = !s.pendingReview;
    els.countQueue.textContent = String(s.queue || 0);
    els.countQueue.hidden = !s.queue;
    renderChart(s.daily);
  }

  let lastDaily = [];
  function renderChart(daily) {
    lastDaily = daily;
    drawChart();
  }
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawChart, 150); });

  function drawChart() {
    const daily = lastDaily;
    // 7 hari terakhir (zona waktu peramban), hari tanpa data = 0
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA');
      const row = byDay.get(key) || { public: 0, personal: 0 };
      days.push({ label: d.toLocaleDateString('id-ID', { weekday: 'short' }), pub: row.public, per: row.personal });
    }
    // Lebar mengikuti wadah (skala 1:1), jadi teks tetap 13px di desktop maupun HP
    const W = Math.max(280, Math.floor(els.chart.clientWidth || 600));
    const H = 190, base = 150, top = 26, pad = 8;
    const step = (W - pad * 2) / 7;
    const bw = Math.min(64, step * 0.6);
    const x0 = pad + (step - bw) / 2;
    const max = Math.max(1, ...days.map((d) => d.pub + d.per));
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': 'Grafik pesan baru per hari: ' + days.map((d) => `${d.label} ${d.pub + d.per}`).join(', ') });
    s.appendChild(svg('line', { x1: 0, x2: W, y1: base, y2: base, class: 'chart-axis' }));
    days.forEach((d, i) => {
      const x = x0 + i * step;
      const hPer = ((base - top) * d.per) / max;
      const hPub = ((base - top) * d.pub) / max;
      if (d.per) s.appendChild(svg('rect', { x, y: base - hPer, width: bw, height: hPer, rx: 4, class: 'bar-per' }));
      if (d.pub) s.appendChild(svg('rect', { x, y: base - hPer - hPub, width: bw, height: hPub, rx: 4, class: 'bar-pub' }));
      const total = d.pub + d.per;
      s.appendChild(svg('text', { x: x + bw / 2, y: base - hPer - hPub - 6, 'text-anchor': 'middle', class: 'chart-t chart-v' }, String(total)));
      s.appendChild(svg('text', { x: x + bw / 2, y: base + 22, 'text-anchor': 'middle', class: 'chart-t' }, d.label));
    });
    els.chart.replaceChildren(s);
  }

  async function refreshStats() {
    try { renderStats(await api('/stats?tz=' + -new Date().getTimezoneOffset())); } catch { /* abaikan */ }
  }
  setInterval(() => { if (!document.hidden && !els.app.hidden) refreshStats(); }, 60000);

  // ---------- kartu pesan ----------
  function reasonLabel(code) { return reasonLabels[code] || code; }

  function renderItem(item) {
    const card = el('article', 'adm-item' + (item.hidden ? ' is-hidden' : ''));
    card.dataset.id = item.id;

    const head = el('div', 'adm-head');
    head.append(el('span', 'badge ' + (item.mode === 'personal' ? 'b-personal' : 'b-public'), item.mode === 'personal' ? 'Personal' : 'Umum'));
    if (item.hidden) {
      const why = item.hiddenReason === 'auto' ? 'otomatis' : String(item.hiddenReason || '').startsWith('filter:') ? 'filter' : 'admin';
      head.append(el('span', 'badge b-hidden', `Tersembunyi · ${why}`));
    } else {
      head.append(el('span', 'badge b-live', 'Tampil'));
    }
    const rc = item.reportCount ?? (item.reports ? item.reports.length : 0);
    if (rc) head.append(el('span', 'badge b-rep', `${rc} laporan`));
    const time = el('time', 'adm-time', `#${item.id} · ${timeAgo(item.createdAt)}`);
    time.title = fullTime(item.createdAt);
    head.append(time);
    card.append(head);

    if (item.masked) {
      card.append(el('p', 'adm-muted', 'Isi pesan Personal tidak ditampilkan demi privasi. Pesan ini baru bisa kamu baca jika dilaporkan.'));
    } else {
      card.append(
        el('p', 'adm-to', `Untuk: ${item.to}`),
        el('p', 'adm-msg', item.message), // textContent: aman dari XSS
        el('p', 'adm-by', `dari ${item.from || 'Anonim'}`)
      );
    }

    if (item.filterReasons && item.filterReasons.length) {
      const ul = el('ul', 'adm-reports');
      const li = el('li');
      li.append(el('span', 'why', 'Ditahan filter'), el('span', '', item.filterReasons.map((c) => FILTER_LABELS[c] || c).join(', ')));
      ul.appendChild(li);
      card.append(ul);
    }

    if (item.reports && item.reports.length) {
      const ul = el('ul', 'adm-reports');
      item.reports.forEach((r) => {
        const li = el('li');
        li.append(el('span', 'why', reasonLabel(r.reason)));
        if (r.detail) li.append(el('span', '', `"${r.detail}"`));
        li.append(el('span', 'when', fullTime(r.at)));
        ul.appendChild(li);
      });
      card.append(ul);
    }

    const actions = el('div', 'adm-act');
    const toggle = el('button', 'abtn' + (item.hidden ? ' primary' : ''));
    toggle.type = 'button';
    if (item.filterReasons) {
      toggle.append(icon('check'), document.createTextNode('Setujui & tampilkan'));
      toggle.addEventListener('click', () => act(item, 'approve', toggle));
    } else if (item.hidden) {
      toggle.append(icon('eye'), document.createTextNode(item.reportCount || item.reports ? 'Tampilkan & tutup laporan' : 'Tampilkan'));
      toggle.addEventListener('click', () => act(item, 'restore', toggle));
    } else {
      toggle.append(icon('eye-off'), document.createTextNode('Sembunyikan'));
      toggle.addEventListener('click', () => act(item, 'hide', toggle));
    }
    actions.append(toggle);

    // pesan tampil yang punya laporan: opsi menutup laporan tanpa menyembunyikan
    if (!item.hidden && rc) {
      const keep = el('button', 'abtn');
      keep.type = 'button';
      keep.append(icon('check'), document.createTextNode('Tidak melanggar'));
      keep.addEventListener('click', () => act(item, 'restore', keep));
      actions.append(keep);
    }

    const del = el('button', 'abtn danger');
    del.type = 'button';
    del.append(icon('trash'), document.createTextNode('Hapus'));
    del.addEventListener('click', () => act(item, 'delete', del));
    actions.append(del);
    card.append(actions);
    return card;
  }

  function emptyState(text) {
    return el('div', 'adm-empty', text);
  }

  function setBusy(card, busy) {
    card.querySelectorAll('button').forEach((b) => { b.disabled = busy; });
  }

  async function act(item, action, btn) {
    const card = els.list.querySelector(`.adm-item[data-id="${item.id}"]`);
    if (action === 'delete') {
      const ok = await confirmDialog(
        'Hapus pesan ini permanen?',
        `Pesan #${item.id} beserta laporannya akan dihapus dan tidak bisa dikembalikan.`
      );
      if (!ok) return;
    }
    if (card) setBusy(card, true);
    try {
      if (action === 'hide') {
        await api(`/confessions/${item.id}/hide`, { method: 'POST' });
        item.hidden = true; item.hiddenReason = 'admin';
        toast('Pesan disembunyikan');
      } else if (action === 'approve') {
        await api(`/confessions/${item.id}/approve`, { method: 'POST' });
        toast('Pesan disetujui dan tampil di feed');
      } else if (action === 'restore') {
        await api(`/confessions/${item.id}/restore`, { method: 'POST' });
        item.hidden = false; item.hiddenReason = null; item.reportCount = 0; item.reports = [];
        toast('Pesan ditampilkan, laporan ditutup');
      } else {
        await api(`/confessions/${item.id}`, { method: 'DELETE' });
        items.delete(item.id);
        toast('Pesan dihapus');
      }
    } catch (err) {
      if (card) setBusy(card, false);
      if (err.message !== 'Tidak diizinkan.') toast(err.message);
      return;
    }

    const gone = action === 'delete' || action === 'approve' || (action === 'restore' && tab === 'reported');
    if (card) {
      if (gone) card.remove();
      else card.replaceWith(renderItem(item));
    }
    if (!els.list.querySelector('.adm-item')) {
      (tab === 'queue' ? els.list.querySelector('.queue-items') : els.list).append(
        emptyState(tab === 'reported' ? 'Semua beres. Tidak ada laporan yang perlu ditinjau.' : tab === 'queue' ? 'Antrean kosong. Tidak ada pesan yang menunggu tinjauan.' : 'Tidak ada pesan.')
      );
    }
    refreshStats();
  }

  // ---------- dialog konfirmasi ----------
  let confirmEl;
  function confirmDialog(title, text, { yes: yesLabel = 'Hapus permanen', no: noLabel = 'Batal' } = {}) {
    if (!confirmEl) {
      confirmEl = el('dialog', 'modal');
      confirmEl.setAttribute('aria-labelledby', 'confirm-title');
      const body = el('div', 'modal-body');
      const h = el('h2', '', ''); h.id = 'confirm-title';
      const p = el('p');
      const actions = el('div', 'modal-actions');
      const no = el('button', 'btn btn-ghost', 'Batal'); no.type = 'button'; no.dataset.answer = 'no';
      const yes = el('button', 'btn btn-danger', 'Hapus permanen'); yes.type = 'button'; yes.dataset.answer = 'yes';
      actions.append(no, yes);
      body.append(h, p, actions);
      confirmEl.append(body);
      document.body.appendChild(confirmEl);
    }
    $('#confirm-title').textContent = title;
    $('p', confirmEl).textContent = text;
    $('[data-answer="yes"]', confirmEl).textContent = yesLabel;
    $('[data-answer="no"]', confirmEl).textContent = noLabel;
    return new Promise((resolve) => {
      const done = (v) => { confirmEl.removeEventListener('close', onClose); confirmEl.removeEventListener('click', onClick); resolve(v); };
      const onClose = () => done(confirmEl.returnValue === 'yes');
      const onClick = (e) => {
        const b = e.target.closest('[data-answer]');
        if (b) confirmEl.close(b.dataset.answer);
        else if (e.target === confirmEl) confirmEl.close('no');
      };
      confirmEl.returnValue = 'no';
      confirmEl.addEventListener('close', onClose);
      confirmEl.addEventListener('click', onClick);
      confirmEl.showModal();
      $('[data-answer="no"]', confirmEl).focus(); // fokus awal di aksi yang aman
    });
  }

  // ---------- tab dan daftar ----------
  const tabButtons = [...document.querySelectorAll('.tab')];

  // Konten landing: ada perubahan yang belum disimpan?
  let cmsInputs = [];
  const cmsDirty = () => tab === 'content' && cmsInputs.some((i) => i.value.trim() !== i.dataset.orig);
  async function discardOk() {
    if (!cmsDirty()) return true;
    return confirmDialog(
      'Buang perubahan?',
      'Ada perubahan konten yang belum disimpan. Kalau dilanjutkan, perubahan itu hilang.',
      { yes: 'Buang perubahan', no: 'Kembali mengedit' }
    );
  }
  window.addEventListener('beforeunload', (e) => { if (cmsDirty()) { e.preventDefault(); e.returnValue = ''; } });

  async function selectTab(name, focus) {
    if (name !== tab && !(await discardOk())) return;
    tab = name;
    tabButtons.forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) {
        $('#panel').setAttribute('aria-labelledby', b.id);
        if (focus) b.focus();
      }
    });
    loadTab();
  }
  tabButtons.forEach((b, i) => {
    b.addEventListener('click', () => selectTab(b.dataset.tab));
    b.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      selectTab(tabButtons[(i + dir + tabButtons.length) % tabButtons.length].dataset.tab, true);
    });
  });

  const ACTION_LABELS = {
    auto_hide: 'Disembunyikan otomatis (laporan mencapai ambang)',
    hide: 'Disembunyikan oleh admin',
    restore: 'Ditampilkan kembali dan laporan ditutup',
    delete: 'Dihapus permanen',
    content_update: 'Konten landing page diperbarui',
    approve: 'Pesan di antrean disetujui dan ditampilkan',
    filter_hold: 'Pesan ditahan otomatis oleh filter',
    filter_update: 'Daftar kata filter diperbarui',
    sender_delete: 'Dihapus oleh pengirimnya (kode hapus)',
  };
  const FILTER_LABELS = {
    telepon: 'nomor telepon', tautan: 'tautan', email: 'email', akun: 'akun media sosial',
    kata: 'kata terlarang', duplikat: 'pesan yang sama berulang',
  };

  // ---------- antrean: daftar kata filter ----------
  function renderFilterEditor(f) {
    const box = el('section', 'qfilter');
    box.append(el('h3', '', 'Kata yang ditahan'));
    box.append(el('p', 'adm-muted', 'Satu kata atau frasa per baris. Pesan Umum yang memuat kata ini masuk antrean untuk ditinjau (tidak ditolak). Pencocokan mengabaikan huruf besar, aksen, dan angka pengelabuan (b4ngs4t). Selalu ditahan juga: nomor telepon, tautan, email, akun media sosial, dan pesan yang sama berulang. Pesan Personal tidak disaring.'));
    const ta = el('textarea', 'input');
    ta.rows = 6; ta.value = f.words; ta.setAttribute('aria-label', 'Daftar kata yang ditahan'); ta.spellcheck = false;
    const row = el('div', 'qrow');
    const note = el('span', 'qnote', f.isDefault ? 'Memakai daftar bawaan' : 'Daftar sudah diubah');
    const reset = el('button', 'btn btn-ghost', 'Kembalikan bawaan'); reset.type = 'button';
    const save = el('button', 'btn btn-primary', 'Simpan daftar'); save.type = 'button';
    row.append(note, reset, save);
    reset.addEventListener('click', () => { ta.value = f.defaultWords; });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const r = await api('/filter', { method: 'PUT', body: { words: ta.value } });
        note.textContent = 'Tersimpan'; toast(`Daftar disimpan (${r.count} kata)`);
        refreshStats();
      } catch (err) { if (err.message !== 'Tidak diizinkan.') toast(err.message); }
      finally { save.disabled = false; }
    });
    box.append(ta, row);
    return box;
  }


  // ---------- editor konten landing ----------
  function renderContent(data) {
    cmsInputs = [];
    const form = el('form', 'cms');
    form.noValidate = true;
    form.setAttribute('aria-label', 'Editor konten landing page');

    const intro = el('p', 'adm-note');
    intro.append(
      'Ubah teks landing page, Disclaimer, dan Kebijakan Privasi tanpa menyentuh kode. Perubahan langsung tampil setelah disimpan. ',
      'Kosongkan kolom atau klik "Kembalikan bawaan" untuk memakai teks asli. '
    );
    const open = el('a', '', 'Buka landing page');
    open.href = '/'; open.target = '_blank'; open.rel = 'noopener';
    intro.append(open, ' (tab baru).');
    form.append(intro);

    const bar = el('div', 'cms-bar');
    const status = el('span', 'cms-status', 'Belum ada perubahan');
    const revert = el('button', 'btn btn-ghost', 'Batalkan'); revert.type = 'button';
    const save = el('button', 'btn btn-primary', 'Simpan perubahan'); save.type = 'submit'; save.disabled = true;
    bar.append(status, revert, save);

    function sync() {
      const n = cmsInputs.filter((i) => i.value.trim() !== i.dataset.orig).length;
      save.disabled = n === 0;
      revert.disabled = n === 0;
      status.textContent = n ? `${n} perubahan belum disimpan` : 'Belum ada perubahan';
      bar.classList.toggle('is-dirty', n > 0);
    }

    data.groups.forEach((g, gi) => {
      const collapsible = !!g.collapsible;
      const section = el(collapsible ? 'details' : 'section', 'cms-group' + (collapsible ? ' cms-legal' : ''));
      const heading = el('h3', '', g.name);
      heading.id = `cms-g-${gi}`;
      const fs = el('div', 'cms-fields');
      if (collapsible) {
        const sum = el('summary', 'cms-sum');
        sum.append(heading);
        const badge = el('span', 'cms-badge', '');
        sum.append(badge);
        section.append(sum);
        section.open = g.fields.some((f) => f.custom);
        const nCustom = g.fields.filter((f) => f.custom).length;
        badge.textContent = nCustom ? `${nCustom} diubah` : 'Bawaan';
        badge.classList.toggle('is-custom', nCustom > 0);
        if (g.note) section.append(el('p', 'adm-note', g.note));
        if (g.link) {
          const pl = el('p', 'cms-open');
          const la = el('a', '', 'Buka halaman'); la.href = g.link; la.target = '_blank'; la.rel = 'noopener';
          pl.append(la, ' (tab baru) untuk melihat hasilnya.');
          section.append(pl);
        }
        if (g.help) {
          const hp = el('div', 'cms-help');
          hp.append(el('strong', '', 'Cara menulis isi'));
          const ul = el('ul');
          [
            'Baris kosong memisahkan paragraf.',
            'Awali baris dengan "- " untuk membuat daftar.',
            '**tebal** dan *miring* untuk penekanan.',
            '[teks](/privasi) untuk tautan, atau [teks](/disclaimer#moderasi) ke bagian tertentu.',
            '{{CONTACT}} diganti otomatis dengan email kontak.',
          ].forEach((t) => ul.append(el('li', '', t)));
          hp.append(ul);
          section.append(hp);
        }
        section.append(fs);
      } else {
        section.setAttribute('aria-labelledby', heading.id);
        section.append(heading, fs);
      }
      g.fields.forEach((f, fi) => {
        const id = `cms-${gi}-${fi}`;
        const wrap = el('div', 'field cms-field');

        const lab = el('label', '', f.label);
        lab.htmlFor = id;
        const counter = el('span', 'chars', '');
        lab.append(counter);

        const long = f.multiline || f.max > 100;
        const input = long ? el('textarea', 'input') : el('input', 'input');
        if (f.multiline) { input.rows = f.max > 1000 ? 9 : 4; input.classList.add('is-multi'); }
        else if (long) input.rows = f.max > 200 ? 3 : 2;
        else input.type = 'text';
        input.id = id;
        input.maxLength = f.max;
        input.value = f.value;
        input.dataset.key = f.key;
        input.dataset.orig = f.value;
        input.dataset.def = f.default;
        cmsInputs.push(input);

        const sub = el('div', 'cms-sub');
        const hint = el('span', 'cms-default', f.custom ? 'Sudah diubah dari bawaan' : 'Memakai teks bawaan');
        const reset = el('button', 'link-btn', 'Kembalikan bawaan'); reset.type = 'button';
        const updateRow = () => {
          counter.textContent = `${input.value.length}/${f.max}`;
          input.classList.toggle('is-changed', input.value.trim() !== input.dataset.orig);
          reset.hidden = input.value.trim() === f.default;
        };
        input.addEventListener('input', () => { updateRow(); sync(); });
        reset.addEventListener('click', () => { input.value = f.default; updateRow(); sync(); input.focus(); });
        sub.append(hint, reset);

        wrap.append(lab, input, sub);
        fs.append(wrap);
        updateRow();
      });
      form.append(section);
    });

    revert.addEventListener('click', () => {
      cmsInputs.forEach((i) => { i.value = i.dataset.orig; i.dispatchEvent(new Event('input')); });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = {};
      cmsInputs.forEach((i) => { if (i.value.trim() !== i.dataset.orig) values[i.dataset.key] = i.value.trim(); });
      if (!Object.keys(values).length) return;
      save.disabled = true;
      try {
        await api('/content', { method: 'PUT', body: { values } });
        toast('Tersimpan. Landing page sudah diperbarui.');
        refreshStats();
        loadTab(); // muat ulang dari server supaya status "diubah/bawaan" akurat
      } catch (err) {
        save.disabled = false;
        if (err.message !== 'Tidak diizinkan.') toast(err.message);
      }
    });

    form.append(bar);
    sync();
    return form;
  }

  async function loadTab({ more = false } = {}) {
    const mySeq = ++seq;
    const isAll = tab === 'all';
    els.tools.hidden = !isAll;
    els.note.hidden = !isAll;
    if (!more) {
      cursor = null;
      items.clear();
      els.list.replaceChildren(emptyState('Memuat…'));
      els.more.hidden = true;
    }
    els.more.disabled = true;
    try {
      let data;
      if (tab === 'reported') data = await api('/reports');
      else if (tab === 'queue') {
        const [q, f] = await Promise.all([api('/queue'), api('/filter')]);
        if (mySeq !== seq) return;
        const wrap = el('div', 'adm-list queue-items');
        q.items.forEach((it) => { items.set(it.id, it); wrap.appendChild(renderItem(it)); });
        if (!q.items.length) wrap.append(emptyState('Antrean kosong. Tidak ada pesan yang menunggu tinjauan.'));
        els.list.replaceChildren(renderFilterEditor(f), wrap);
        return;
      }
      else if (tab === 'log') data = await api('/log');
      else if (tab === 'content') {
        data = await api('/content');
        if (mySeq !== seq) return;
        els.list.replaceChildren(renderContent(data));
        return;
      } else {
        const p = new URLSearchParams({ view });
        if (query) p.set('q', query);
        if (cursor) p.set('before', cursor);
        data = await api('/confessions?' + p);
      }
      if (mySeq !== seq) return; // sudah pindah tab

      if (!more) els.list.replaceChildren();
      if (tab === 'log') {
        if (!data.items.length) return els.list.append(emptyState('Belum ada aktivitas moderasi.'));
        const ul = el('ul', 'adm-log');
        data.items.forEach((r) => {
          const li = el('li');
          li.append(el('span', 'log-what', ACTION_LABELS[r.action] || r.action), el('span', 'log-id', [r.confessionId ? `Pesan #${r.confessionId}` : '', r.actor ? `oleh ${r.actor}` : (r.action === 'auto_hide' || r.action === 'filter_hold') ? 'otomatis' : ''].filter(Boolean).join(' · ')));
          const t = el('time', 'log-when', fullTime(r.at));
          li.append(t);
          ul.appendChild(li);
        });
        return els.list.append(ul);
      }

      data.items.forEach((it) => { items.set(it.id, it); els.list.appendChild(renderItem(it)); });
      cursor = data.next || null;
      els.more.hidden = !cursor;
      if (!els.list.children.length) {
        els.list.append(emptyState(tab === 'reported' ? 'Semua beres. Tidak ada laporan yang perlu ditinjau.' : 'Tidak ada pesan yang cocok.'));
      }
    } catch (err) {
      if (mySeq !== seq || err.message === 'Tidak diizinkan.') return;
      els.list.replaceChildren(emptyState(err.message));
    } finally {
      if (mySeq === seq) els.more.disabled = false;
    }
  }

  els.more.addEventListener('click', () => loadTab({ more: true }));

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      view = chip.dataset.view;
      document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      loadTab();
    });
  });
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    query = $('#q').value.trim();
    loadTab();
  });

  // ---------- mulai ----------
  if (token) enter().catch((err) => { if (err.message !== 'Tidak diizinkan.') showLogin(err.status === 404 ? 'Admin belum aktif. Atur ADMIN_TOKENS atau ADMIN_TOKEN di server.' : err.message); });
  else showLogin('');
})();
