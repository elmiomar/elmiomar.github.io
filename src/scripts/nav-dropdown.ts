// Series nav dropdown: click toggles the menu and keeps aria-expanded in sync.
// Hover and focus-within still reveal it via CSS; this adds click/touch toggle,
// outside-click close, and Escape to close. No-op when the toggle is absent.

const toggle = document.getElementById('seriesToggle') as HTMLButtonElement | null;
const dropdown = toggle?.closest('.nav-dropdown') as HTMLElement | null;

if (toggle && dropdown) {
  const close = (): void => {
    dropdown.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target as Node)) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
