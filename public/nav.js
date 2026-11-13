(() => {
  const btn = document.querySelector('.nav-toggle');
  const menu = document.getElementById('nav-menu');
  if (!btn || !menu) return;
  const set = (open) => {
    document.body.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 860) set(false); });
})();
