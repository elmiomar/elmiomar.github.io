// Back-to-top button: visible after scrolling past 300px, smooth-scrolls to top.

const btn = document.getElementById('backToTop') as HTMLButtonElement | null;
if (btn) {
  const onScroll = (): void => {
    btn.classList.toggle('visible', window.scrollY > 300);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
  onScroll();
}
