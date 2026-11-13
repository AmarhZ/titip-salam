(() => {
  'use strict';

  const letter = document.getElementById('letter');
  const token = location.pathname.split('/').filter(Boolean).pop() || '';

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // Ganti isi surat (sticker hati di pojok tetap dipertahankan)
  function setContent(...nodes) {
    [...letter.children].filter((c) => !c.classList.contains('sticker')).forEach((c) => c.remove());
    letter.append(...nodes);
  }

  function renderState(title, text, withHomeButton = true) {
    const box = el('div', 'read-state');
    box.append(el('h1', '', title), el('p', '', text));
    if (withHomeButton) {
      const back = el('a', 'btn btn-primary', 'Ke beranda');
      back.href = '/';
      box.append(back);
    }
    setContent(box);
  }

  const renderHidden = () =>
    renderState(
      'Pesan ini disembunyikan',
      'Pesan ini sudah dilaporkan dan tidak ditampilkan lagi. Pengelola akan meninjaunya.'
    );

  async function open() {
    try {
      const res = await fetch('/api/secret/' + encodeURIComponent(token), { cache: 'no-store' });
      if (res.status === 410) {
        const j = await res.json().catch(() => ({}));
        if (j.expired) {
          return renderState('Link ini sudah kedaluwarsa', 'Pengirim memberi masa berlaku pada pesan ini, dan masa itu sudah habis. Pesannya tidak bisa dibuka lagi.');
        }
        return renderHidden();
      }
      if (!res.ok) throw new Error();
      const d = await res.json();

      const when = new Date(d.createdAt).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      const by = el('p', 'by');
      by.append('dari ', el('b', '', d.from || 'Seseorang yang menyimpan rasa'));

      const report = el('button', 'report-btn', '');
      report.type = 'button';
      report.dataset.report = `/api/secret/${encodeURIComponent(token)}/report`;
      const flag = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      flag.setAttribute('class', 'i');
      flag.setAttribute('viewBox', '0 0 24 24');
      flag.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#flag');
      flag.appendChild(use);
      report.append(flag, document.createTextNode('Laporkan pesan ini'));

      setContent(
        el('p', 'for', `Untuk: ${d.to}`),
        el('p', 'body', d.message), // textContent: aman dari XSS
        by,
        el('p', 'when', `Ditulis ${when}`),
        ...(d.expiresAt ? [el('p', 'when', `Link berlaku sampai ${new Date(d.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`)] : []),
        el('p', 'hint', 'Surat ini bersifat pribadi. Hanya kamu yang memegang link ini.'),
        report
      );
      document.title = `Untuk ${d.to} — Titip Salam`;
    } catch {
      renderState(
        'Surat ini tidak ditemukan',
        'Link-nya mungkin salah ketik atau tidak berlaku. Pastikan kamu menyalin link secara lengkap.'
      );
    }
  }

  // Setelah dilaporkan, pesan Personal langsung disembunyikan di server
  document.addEventListener('ts:reported', () => {
    renderHidden();
    document.title = 'Pesan disembunyikan — Titip Salam';
  });

  open();
})();
