// Word count / 180 wpm, rounded up, minimum 1 minute.
// 180 matches the Jekyll layout's number_of_words / 180 calculation.
export function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.ceil(words / 180);
  return Math.max(1, minutes);
}
