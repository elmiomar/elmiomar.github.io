// Theme toggle: light/dark switch with localStorage persistence and
// prefers-color-scheme fallback. Sets data-theme="dark" or "light" on <html>.
// aria-pressed reflects current state (was missing in Jekyll — fixed here).

const html = document.documentElement;
const toggle = document.getElementById('themeToggle') as HTMLButtonElement | null;

function isDark(): boolean {
  const theme = html.getAttribute('data-theme');
  if (theme) return theme === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function paint(): void {
  if (!toggle) return;
  const dark = isDark();
  toggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
  const sun = toggle.querySelector<HTMLElement>('.icon-sun');
  const moon = toggle.querySelector<HTMLElement>('.icon-moon');
  if (sun) sun.style.display = dark ? 'block' : 'none';
  if (moon) moon.style.display = dark ? 'none' : 'block';
}

// Apply persisted theme before first paint of toggle to avoid icon flash
const saved = localStorage.getItem('theme');
if (saved === 'dark' || saved === 'light') {
  html.setAttribute('data-theme', saved);
}

if (toggle) {
  toggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let next: 'dark' | 'light';
    if (!current) {
      next = systemDark ? 'light' : 'dark';
    } else {
      next = current === 'dark' ? 'light' : 'dark';
    }
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    paint();
  });
  paint();
}

// Repaint when system preference changes (only matters when no explicit choice saved)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
