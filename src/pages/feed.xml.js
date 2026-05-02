// Re-emits the same RSS feed at /feed.xml so existing Jekyll-era
// subscribers keep working. RSS readers don't follow HTML meta-refresh
// redirects (GitHub Pages can't do server-level 301s), so a duplicate
// route is the only way to preserve them. Content is identical to
// /rss.xml — both stay in sync because they share the same generator.

import rss from '@astrojs/rss';
import { SITE_TITLE, SITE_DESCRIPTION, SITE_AUTHOR, SITE_AUTHOR_EMAIL } from '../consts';
import { getPublishedPosts } from '../utils/posts';

export async function GET(context) {
  const posts = await getPublishedPosts();

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/posts/${post.id}/`,
      customData: `<author>${SITE_AUTHOR_EMAIL} (${SITE_AUTHOR})</author>`,
    })),
    customData: `<language>en-us</language>`,
    trailingSlash: true,
  });
}
