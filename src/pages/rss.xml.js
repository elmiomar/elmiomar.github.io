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
      // RFC 2822 author: "email (Display Name)". Audit flagged this was
      // missing in the Jekyll feed; fixed while porting.
      customData: `<author>${SITE_AUTHOR_EMAIL} (${SITE_AUTHOR})</author>`,
    })),
    customData: `<language>en-us</language>`,
    trailingSlash: true,
  });
}
