(() => {
  'use strict';
  const form = document.getElementById('del-form');
  const input = document.getElementById('code');
  const err = document.getElementById('del-error');
  const ok = document.getElementById('del-ok');
  const btn = document.getElementById('del-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true; ok.hidden = true;
    const code = input.value.trim();
    if (!code) { err.textContent = 'Isi kode hapusnya dulu.'; err.hidden = false; return; }
    if (!window.confirm('Hapus pesan ini permanen? Tindakan ini tidak bisa dibatalkan.')) return;
    btn.disabled = true;
    try {
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan. Coba lagi ya.');
      ok.textContent = 'Pesanmu sudah dihapus permanen.';
      ok.hidden = false;
      input.value = '';
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
})();
