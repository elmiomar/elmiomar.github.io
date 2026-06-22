// Series difficulty filter: wires the filter buttons to show/hide list items.
// Buttons carry data-filter (all|beginner|intermediate|advanced); list items
// carry data-difficulty. Toggles an is-hidden class and marks the active
// button with aria-pressed. No-op when the controls are absent.

const buttons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('.series-filter [data-filter]'),
);
const items = Array.from(
  document.querySelectorAll<HTMLElement>('[data-difficulty]'),
);

if (buttons.length > 0) {
  const apply = (filter: string): void => {
    for (const item of items) {
      const level = item.getAttribute('data-difficulty');
      const show = filter === 'all' || level === filter;
      item.classList.toggle('is-hidden', !show);
    }
    for (const btn of buttons) {
      const active = btn.getAttribute('data-filter') === filter;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  };

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      apply(btn.getAttribute('data-filter') ?? 'all');
    });
  }

  apply('all');
}
