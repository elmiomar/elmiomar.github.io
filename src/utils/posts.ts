import { getCollection, type CollectionEntry } from 'astro:content';

// Drafts visible during `astro dev`, hidden in `astro build`.
// Sorted newest-first by pubDate.
export async function getPublishedPosts(): Promise<CollectionEntry<'posts'>[]> {
  const posts = await getCollection(
    'posts',
    ({ data }) => import.meta.env.DEV || !data.draft,
  );
  return posts.sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
  );
}

// One series, ordered for reading (earliest first). Sorts by seriesOrder
// ascending, falling back to pubDate when seriesOrder is absent.
export async function getSeriesPosts(
  series: string,
): Promise<CollectionEntry<'posts'>[]> {
  const posts = await getPublishedPosts();
  return posts
    .filter((p) => p.data.series === series)
    .sort((a, b) => {
      const ao = a.data.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.data.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.data.pubDate.getTime() - b.data.pubDate.getTime();
    });
}
