// Generate per-post OG images (1200x630 PNGs) into dist/og/.
// Runs after `astro build` and before pagefind. Reads frontmatter from
// src/content/posts/, lays out a card with satori, rasterizes with resvg.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const POSTS_DIR = path.join(ROOT, 'src/content/posts');
const OUT_DIR = path.join(ROOT, 'dist/og');

const SITE = "elmimouni.net";

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

async function loadFont(file) {
  const p = path.join(ROOT, 'node_modules/@fontsource/inter/files', file);
  return await fs.readFile(p);
}

function card({ title, dateLine, tagsLine }) {
  return {
    type: 'div',
    props: {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '70px 80px',
        backgroundColor: '#ffffff',
        fontFamily: 'Inter',
        position: 'relative',
      },
      children: [
        // Top-left accent strip (matches the site's link blue)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '8px',
              backgroundColor: '#0066cc',
            },
          },
        },
        // Title
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '64px',
              fontWeight: 700,
              color: '#1a1a1a',
              lineHeight: 1.15,
              maxWidth: '1040px',
            },
            children: title,
          },
        },
        // Bottom row: date + tags / site
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              fontSize: '24px',
              color: '#666666',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', gap: '8px' },
                  children: [
                    { type: 'div', props: { children: dateLine } },
                    tagsLine
                      ? { type: 'div', props: { style: { color: '#999999', fontSize: '20px' }, children: tagsLine } }
                      : null,
                  ].filter(Boolean),
                },
              },
              {
                type: 'div',
                props: {
                  style: { color: '#0066cc', fontWeight: 700 },
                  children: SITE,
                },
              },
            ],
          },
        },
      ],
    },
  };
}

async function renderPng(node, fonts) {
  const svg = await satori(node, {
    width: 1200,
    height: 630,
    fonts,
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return png;
}

async function main() {
  const [interRegular, interBold] = await Promise.all([
    loadFont('inter-latin-400-normal.woff'),
    loadFont('inter-latin-700-normal.woff'),
  ]);

  const fonts = [
    { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
    { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
  ];

  await fs.mkdir(OUT_DIR, { recursive: true });

  // Per-post images
  const files = (await fs.readdir(POSTS_DIR)).filter(
    (f) => f.endsWith('.md') || f.endsWith('.mdx'),
  );

  let count = 0;
  for (const file of files) {
    const slug = file.replace(/\.(md|mdx)$/, '');
    const raw = await fs.readFile(path.join(POSTS_DIR, file), 'utf8');
    const { data } = matter(raw);
    if (data.draft) continue;

    const dateLine = dateFormatter.format(new Date(data.pubDate));
    const tagsLine = (data.tags ?? []).join(' · ');

    const png = await renderPng(card({ title: data.title, dateLine, tagsLine }), fonts);
    const out = path.join(OUT_DIR, `${slug}.png`);
    await fs.writeFile(out, png);
    console.log(`og: ${out}`);
    count++;
  }

  // Default OG (used by non-post pages)
  const defaultPng = await renderPng(
    card({
      title: "Omar's Blog",
      dateLine: 'Software engineering · distributed systems · backend',
      tagsLine: '',
    }),
    fonts,
  );
  await fs.writeFile(path.join(OUT_DIR, 'default.png'), defaultPng);
  console.log(`og: ${path.join(OUT_DIR, 'default.png')}`);

  console.log(`generated ${count} per-post OG images + 1 default`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
