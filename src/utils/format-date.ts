// Render dates in UTC so a post dated 2026-05-02 reads as "May 2, 2026" for
// every reader regardless of their timezone. A calendar date is a calendar
// date — there's no reason a Tokyo reader should see a different day than a
// Maryland reader for "the day this post was published."
const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(date: Date): string {
  return formatter.format(date);
}
