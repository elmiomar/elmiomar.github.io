// Open all external links in a new tab and harden them with
// rel="noopener noreferrer" (Jekyll only set noopener — audit caught this).
// Internal links are left alone.

const host = window.location.hostname;

document.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((link) => {
  if (link.hostname && link.hostname !== host) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }
});
