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
