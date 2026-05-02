// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://www.elmimouni.net',
	trailingSlash: 'always',
	build: {
		format: 'directory',
	},
	integrations: [mdx(), sitemap()],
	redirects: {
		// Old Jekyll category-prefixed URLs → new flat post URLs.
		// On GitHub Pages these become HTML pages with <meta http-equiv="refresh">
		// (no server-level 301 support). Trade-off accepted in the migration plan.
		'/general/2018/07/16/hello-and-welcome/': '/posts/hello-and-welcome/',
		'/technology/social/2018/07/16/angelhack-hackathon/': '/posts/angelhack-hackathon/',
		'/backend/iot/2021/11/15/building-iot-component-sdk/': '/posts/building-iot-component-sdk/',
		'/backend/2025/01/15/aws-sdk-memory-leak/': '/posts/aws-sdk-memory-leak/',
		'/technology/cloud/2026/02/03/aws-s3-scale-lessons/': '/posts/aws-s3-scale-lessons/',
		// Existing RSS subscribers used /feed.xml under Jekyll. Astro emits /rss.xml.
		'/feed.xml': '/rss.xml',
	},
});
