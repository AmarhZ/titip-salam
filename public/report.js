/* Dialog laporan bersama untuk feed dan halaman baca.
   Tombol apa pun dengan atribut data-report="<url POST>" akan membuka dialog ini.
   Setelah laporan terkirim, event "ts:reported" dikirim ke document dengan detail {url, id}. */
(() => {
  'use strict';

  let dialog, form, reasonsBox, detailEl, errorEl, submitBtn, doneBox;
  let target = null;
  let reasonsReady = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function build() {
    dialog = el('dialog', 'modal');
    dialog.setAttribute('aria-labelledby', 'report-title');
    // Markup statis (tanpa data pengguna), jadi aman memakai innerHTML.
    dialog.innerHTML = `
      <form class="modal-body" novalidate>
        <div>
          <h2 id="report-title">Laporkan pesan ini</h2>
          <p class="sub">Pilih alasan yang paling sesuai. Laporanmu bersifat anonim.</p>
        </div>
        <fieldset class="reasons">
          <legend class="sr-only">Alasan laporan</legend>
        </fieldset>
        <div class="field">
          <label for="report-detail">Keterangan (opsional)</label>
          <textarea class="input" id="report-detail" rows="3" maxlength="300" placeholder="Ceritakan singkat kalau perlu"></textarea>
        </div>
        <p class="form-error" role="alert" hidden></p>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-close>Batal</button>
          <button class="btn btn-primary" type="submit">Kirim Laporan</button>
        </div>
      </form>
      <div class="modal-body" hidden>
        <h2>Terima kasih</h2>
        <p>Laporanmu sudah kami terima dan akan ditinjau. Pesan yang dilaporkan bisa disembunyikan sambil menunggu peninjauan.</p>
        <div class="modal-actions"><button class="btn btn-primary" type="button" data-close>Tutup</button></div>
      </div>`;
    document.body.appendChild(dialog);

    form = dialog.querySelector('form');
    reasonsBox = dialog.querySelector('.reasons');
    detailEl = dialog.querySelector('#report-detail');
    errorEl = dialog.querySelector('.form-error');
    submitBtn = dialog.querySelector('[type="submit"]');
    doneBox = dialog.querySelector('.modal-body[hidden]');

    dialog.addEventListener('click', (e) => {
      // klik pada latar gelap atau tombol tutup
      if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    });
    form.addEventListener('submit', submit);
  }

  function loadReasons() {
    if (reasonsReady) return reasonsReady;
    reasonsReady = fetch('/api/report-reasons')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((list) => {
        list.forEach((r, i) => {
          const label = el('label');
          const input = el('input');
          input.type = 'radio';
          input.name = 'reason';
          input.value = r.value;
          if (i === 0) input.required = true;
          label.append(input, el('span', '', r.label));
          reasonsBox.appendChild(label);
        });
      })
      .catch(() => { reasonsReady = null; throw new Error('Daftar alasan gagal dimuat. Coba lagi ya.'); });
    return reasonsReady;
  }

  function showError(text) {
    errorEl.textContent = text;
    errorEl.hidden = !text;
  }

  async function open(t) {
    if (!dialog) build();
    target = t;
    form.reset();
    showError('');
    form.hidden = false;
    doneBox.hidden = true;
    submitBtn.disabled = false;
    dialog.showModal();
    try {
      await loadReasons();
      const first = reasonsBox.querySelector('input');
      if (first && dialog.open) first.focus();
    } catch (err) { showError(err.message); }
  }

  async function submit(e) {
    e.preventDefault();
    showError('');
    const chosen = form.querySelector('input[name="reason"]:checked');
    if (!chosen) return showError('Pilih alasan laporan dulu.');

    submitBtn.disabled = true;
    try {
      const res = await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: chosen.value, detail: detailEl.value.trim() }),
      });
      let data = {};
      try { data = await res.json(); } catch { /* abaikan */ }
      if (!res.ok) throw new Error(data.error || 'Laporan gagal dikirim. Coba lagi ya.');
      form.hidden = true;
      doneBox.hidden = false;
      doneBox.querySelector('button').focus();
      document.dispatchEvent(new CustomEvent('ts:reported', { detail: target }));
    } catch (err) {
      showError(err.message);
      submitBtn.disabled = false;
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-report]');
    if (!btn) return;
    open({ url: btn.dataset.report, id: btn.dataset.reportId || null });
  });
})();
