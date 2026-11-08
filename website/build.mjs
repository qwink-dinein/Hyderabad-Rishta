// Builds the public Hyderabad Rishta website into website/dist as plain, pre-rendered HTML.
// Why static HTML: every word is in the page source, so Google, Bing and AI search crawlers read it
// without running JavaScript, and pages load fast on any phone. The app itself stays a separate,
// private, never-indexed web app (APP_URL).
//
//   node website/build.mjs                         preview build (noindex everywhere)
//   SITE_URL=https://www.example.com APP_URL=https://app.example.com node website/build.mjs
//
// Content: website/content/pages/*.md and website/content/blog/*.md (front matter + Markdown).
// No dependencies beyond Node itself.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANDROID_APK_URL, APP_STORE_URL, APP_URL, BASE, BING_SITE_VERIFICATION, BRAND, CF_ANALYTICS_TOKEN, CRAWLERS, FACTS, GOOGLE_SITE_VERIFICATION, PLAY_URL, PRODUCTION } from './site.config.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'dist');
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (p) => (/^https?:/.test(p) ? p : BASE + p);

// ───────────── content loading ─────────────
function parse(file) {
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split('|').map((s) => s.trim()).filter(Boolean);
    else if (v === 'true' || v === 'false') v = v === 'true';
    else v = v.replace(/^"(.*)"$/, '$1');
    meta[kv[1]] = v;
  }
  return { ...meta, body: m[2] };
}
const load = (dir) =>
  readdirSync(join(ROOT, 'content', dir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ file: f, ...parse(join(ROOT, 'content', dir, f)) }));

// ───────────── Markdown (the small subset the content uses) ─────────────
// Headings, paragraphs, lists, tables, quotes, links, bold/italic, and raw HTML blocks (lines that
// start with "<"). {{CREATE}} / {{LOGIN}} are replaced with the app links.
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${esc(link(u))}"${/^https?:/.test(link(u)) && !link(u).startsWith(BASE) ? ' rel="noopener"' : ''}>${t}</a>`);
}
const CREATE = APP_URL ? `${APP_URL}/` : '/how-it-works/#get-started';
const LOGIN = APP_URL ? `${APP_URL}/login` : '/how-it-works/#get-started';
function link(u) {
  if (u === '{{CREATE}}') return CREATE;
  if (u === '{{LOGIN}}') return LOGIN;
  return u;
}
// Facts-driven placeholders, so copy can never claim more than site.config.mjs FACTS allow.
function tokens(src) {
  return src
    .replace(/\{\{FREE_LINE\}\}/g, FACTS.publicationFree ? ' Creating and publishing your biodata is currently free.' : '')
    .replace(/\{\{FREE_ANSWER\}\}/g, FACTS.publicationFree
      ? 'Creating and publishing a biodata, discovering profiles, sending interest requests and sharing contact details are currently free. Boost — extra visibility for a set number of days — is optional and currently free: you earn one by inviting a family who completes their biodata. It never renews by itself.'
      : 'Prices for publishing and for Boost are shown in the app before you pay. Payments are one-time, with no automatic renewal.')
    // The support address is never printed in the HTML (owner 2026-11-08): it links to the contact page, where a
    // click assembles it (contact.js) so scrapers cannot harvest it.
    .replace(/\{\{EMAIL\}\}/g, '[our contact page](/contact/)');
}
function md(src) {
  src = tokens(src);
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('<')) { // raw HTML block until a blank line
      const block = [];
      while (i < lines.length && lines[i].trim()) block.push(lines[i++].replace(/\{\{SOCIAL:([\w-]+)\}\}/g, (_, from) => socialLinks(from)).replace(/\{\{STORES:([\w-]+)\}\}/g, (_, from) => storeBadges(from)).replace(/\{\{CREATE\}\}/g, esc(CREATE)).replace(/\{\{LOGIN\}\}/g, esc(LOGIN)));
      out.push(block.join('\n'));
      continue;
    }
    const h = l.match(/^(#{2,3})\s+(.*)$/);
    if (h) { const lv = h[1].length; out.push(`<h${lv} id="${slug(h[2])}">${inline(h[2])}</h${lv}>`); i++; continue; }
    if (/^\s*[-*]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ''))}</li>`);
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*\d+\.\s+/, ''))}</li>`);
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c, k) => (k === 0 ? `<th scope="row">${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (l.startsWith('> ')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('> ')) q.push(lines[i++].slice(2));
      out.push(`<aside class="note">${inline(q.join(' '))}</aside>`);
      continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|\s*[-*]\s|\s*\d+\.\s|\||> |<)/.test(lines[i])) p.push(lines[i++]);
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ───────────── layout ─────────────
const css = readFileSync(join(ROOT, 'static', 'site.css'), 'utf8');
const cssHash = createHash('sha256').update(css).digest('hex').slice(0, 10);
// The stylesheet is small (~8 KB), so it is inlined: no render-blocking request. Allowed by its CSP hash.
const cssCsp = `'sha256-${createHash('sha256').update(css).digest('base64')}'`;
const NAV = [
  ['/muslim-matrimony-hyderabad/', 'Muslim Matrimony Hyderabad'],
  ['/how-it-works/', 'How it works'],
  ['/muslim-marriage-biodata/', 'Biodata guide'],
  ['/blog/', 'Guides'],
  ['/faqs/', 'FAQs'],
];
const FOOTER = [
  ['Explore', [['/muslim-matrimony-hyderabad/', 'Muslim matrimony in Hyderabad'], ['/muslim-rishta-hyderabad/', 'Muslim rishta in Hyderabad'], ['/muslim-matrimony-india/', 'Muslim matrimony in India & for NRIs'], ['/muslim-marriage-biodata/', 'Muslim marriage biodata']]],
  ['Learn', [['/how-it-works/', 'How it works'], ['/blog/', 'Guides & articles'], ['/faqs/', 'FAQs'], ['/about/', 'About Hyderabad Rishta']]],
  ['Trust', [['/privacy/', 'Privacy policy'], ['/safety/', 'Safety'], ['/terms/', 'Terms of use'], ['/contact/', 'Contact']]],
];

function jsonLd(objs) {
  return objs.filter(Boolean).map((o) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c')}</script>`).join('\n');
}
const ORG = {
  '@type': 'Organization',
  '@id': `${BASE}/#organization`,
  name: BRAND.name,
  url: `${BASE}/`,
  logo: { '@type': 'ImageObject', url: abs(BRAND.logo), width: 512, height: 512 },
  description: BRAND.description,
  areaServed: { '@type': 'City', name: 'Hyderabad', containedInPlace: { '@type': 'State', name: 'Telangana' } },
  knowsLanguage: ['en', 'ur', 'te'],
  ...(BRAND.sameAs.length ? { sameAs: BRAND.sameAs } : {}),
};
const WEBSITE = { '@type': 'WebSite', '@id': `${BASE}/#website`, name: BRAND.name, url: `${BASE}/`, inLanguage: 'en-IN', publisher: { '@id': `${BASE}/#organization` } };
// Only once a store listing is live (never describe an app people cannot get). No ratings/prices invented.
// The app people can actually get today: Google Play / App Store once listed, else the Android APK download.
const APP = PLAY_URL || APP_STORE_URL || ANDROID_APK_URL
  ? {
      '@type': 'MobileApplication',
      name: BRAND.name,
      operatingSystem: [(PLAY_URL || ANDROID_APK_URL) && 'Android', APP_STORE_URL && 'iOS'].filter(Boolean).join(', '),
      applicationCategory: 'LifestyleApplication',
      inLanguage: ['en', 'ur', 'te'],
      url: PLAY_URL || APP_STORE_URL || `${BASE}/#download`,
      ...(!PLAY_URL && ANDROID_APK_URL ? { downloadUrl: ANDROID_APK_URL } : {}),
      publisher: { '@id': `${BASE}/#organization` },
    }
  : null;
/** FAQPage data from an FAQ page written as "### Question" + answer paragraphs (helps AI answers quote us). */
function faqLd(body) {
  const plain = (t) => tokens(t).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/\s+/g, ' ').trim();
  const items = [];
  const parts = body.split(/^### /m).slice(1);
  for (const part of parts) {
    const [q, ...rest] = part.split('\n');
    const answer = plain(rest.join('\n').split(/^##/m)[0]);
    if (q.trim() && answer) items.push({ '@type': 'Question', name: q.trim(), acceptedAnswer: { '@type': 'Answer', text: answer } });
  }
  return items.length ? { '@type': 'FAQPage', mainEntity: items } : null;
}

function breadcrumbs(trail) {
  if (!trail || trail.length < 2) return { html: '', ld: null };
  const html = `<nav class="crumbs" aria-label="Breadcrumb"><ol>${trail.map(([u, n], i) => (i === trail.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${u}">${esc(n)}</a></li>`)).join('')}</ol></nav>`;
  const ld = { '@type': 'BreadcrumbList', itemListElement: trail.map(([u, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: abs(u) })) };
  return { html, ld };
}

// ───────────── app store badges ─────────────
// Owner decision 2026-11-08: the website sends people to the apps — no web sign-up, log-in or "create" buttons.
// Set PLAY_URL / APP_STORE_URL (Cloudflare build variables) when the listings go live: every badge on every page
// becomes a real link. Until then a badge shows "Coming soon" and leads nowhere (never a dead store page).
// Replace these drawn badges with Google's and Apple's official badge files before launch (brand guidelines).
const PLAY_ICON = '<svg class="store-icon" viewBox="0 0 24 26" aria-hidden="true"><path d="M1.2.6 13.4 12.8 1.2 25a1.6 1.6 0 0 1-.7-1.4V2A1.6 1.6 0 0 1 1.2.6z" fill="#00d7fe"/><path d="m17.5 16.9-4.1-4.1 4.1-4.1 4.7 2.7c1.3.8 1.3 2 0 2.8z" fill="#ffce00"/><path d="M17.5 16.9 13.4 12.8 1.2 25c.5.5 1.2.5 2 .1z" fill="#ff3a44"/><path d="M17.5 8.7 3.2.5C2.4.1 1.7.1 1.2.6l12.2 12.2z" fill="#00f076"/></svg>';
const APPLE_ICON = '<svg class="store-icon" viewBox="0 0 24 28" aria-hidden="true"><path fill="#fff" d="M19.7 14.9c0-3.2 2.6-4.7 2.7-4.8a5.9 5.9 0 0 0-4.6-2.5c-2-.2-3.8 1.1-4.8 1.1-1 0-2.5-1.1-4.1-1.1A6.1 6.1 0 0 0 3.8 10.8c-2.2 3.8-.6 9.4 1.6 12.5 1 1.5 2.3 3.2 3.9 3.1 1.6-.1 2.2-1 4.1-1s2.4 1 4.1 1 2.7-1.5 3.7-3a13 13 0 0 0 1.7-3.5 5.3 5.3 0 0 1-3.2-5zM16.5 5.6A5.4 5.4 0 0 0 17.8 1.6a5.5 5.5 0 0 0-3.6 1.9 5.1 5.1 0 0 0-1.3 3.8 4.6 4.6 0 0 0 3.6-1.7z"/></svg>';
// Android robot (Google, CC BY 3.0) in the brand's gold-green.
const ANDROID_ICON = '<svg class="store-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#3ddc84" d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22a11.4 11.4 0 0 0-9.84 0L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>';
// Official Instagram + WhatsApp channel (owner 2026-11-08): logo buttons that open the profile/channel directly.
const IG_ICON = '<svg class="soc-ico" viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="igG" cx="30%" cy="107%" r="150%"><stop offset="0" stop-color="#fdf497"/><stop offset=".05" stop-color="#fdf497"/><stop offset=".45" stop-color="#fd5949"/><stop offset=".6" stop-color="#d6249f"/><stop offset=".9" stop-color="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="6" fill="url(#igG)"/><rect x="5.5" y="5.5" width="13" height="13" rx="3.8" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/></svg>';
const WA_ICON = '<svg class="soc-ico" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#25d366"/><path fill="#fff" d="M12 4.6a7.3 7.3 0 0 0-6.3 11l-1 3.8 3.9-1a7.3 7.3 0 1 0 3.4-13.8zm0 13.3a6 6 0 0 1-3.1-.8l-.2-.1-2.3.6.6-2.2-.2-.2a6 6 0 1 1 5.2 2.7zm3.3-4.5c-.2-.1-1.1-.5-1.2-.6-.2 0-.3-.1-.4.1l-.6.7c-.1.1-.2.1-.4 0a4.9 4.9 0 0 1-2.4-2.1c-.2-.3.2-.3.5-1 .1-.1 0-.2 0-.3l-.6-1.3c-.1-.3-.3-.3-.4-.3h-.3a.6.6 0 0 0-.4.2 1.8 1.8 0 0 0-.6 1.3 3.1 3.1 0 0 0 .7 1.7 7 7 0 0 0 2.7 2.4c1 .4 1.4.5 1.9.4a1.6 1.6 0 0 0 1.1-.8 1.3 1.3 0 0 0 .1-.8c-.1-.1-.2-.1-.4-.2z"/></svg>';
function socialLinks(from) {
  const link = (url, icon, small, big, kind) => `<a class="soc soc-${kind}" href="${esc(url)}" target="_blank" rel="noopener me" data-cta="social" data-social="${kind}" data-from="${esc(from)}">${icon}<span><small>${small}</small><strong>${big}</strong></span></a>`;
  return `<div class="socials">${link(BRAND.instagram, IG_ICON, 'Follow on Instagram', '@hyderabadrishta.official', 'instagram')}${link(BRAND.whatsapp, WA_ICON, 'Join on WhatsApp', 'Hyderabad Rishta channel', 'whatsapp')}</div>`;
}
function storeBadges(from, { size = '' } = {}) {
  const badge = (url, store, icon, small, big) => {
    const inner = `${icon}<span class="store-text"><small>${small}</small><strong>${big}</strong></span>`;
    return url
      ? `<a class="store ${size}" href="${esc(url)}" rel="noopener" data-cta="store" data-store="${store}" data-from="${esc(from)}">${inner}</a>`
      : `<span class="store soon ${size}" role="img" aria-label="${big}: coming soon">${inner}<em>Coming soon</em></span>`;
  };
  // Android: the Google Play badge once the listing is live; until then a direct APK download (never labelled
  // "Google Play" — the Play badge may only point to Google Play).
  const android = PLAY_URL
    ? badge(PLAY_URL, 'play', PLAY_ICON, 'GET IT ON', 'Google Play')
    : ANDROID_APK_URL
      ? `<a class="store ${size}" href="${esc(ANDROID_APK_URL)}" download data-cta="store" data-store="apk" data-from="${esc(from)}">${ANDROID_ICON}<span class="store-text"><small>DOWNLOAD FOR</small><strong>Android</strong></span><em class="apk">Free APK</em></a>`
      : badge('', 'play', PLAY_ICON, 'GET IT ON', 'Google Play');
  return `<div class="stores">${android}${badge(APP_STORE_URL, 'ios', APPLE_ICON, 'Download on the', 'App Store')}</div>${!PLAY_URL && ANDROID_APK_URL ? '<p class="apk-note">Android: the app downloads straight to your phone. Open the file and allow installing from your browser if asked. Google Play coming soon.</p>' : ''}`;
}
function cta(from) {
  return `<section class="cta" aria-labelledby="cta-${esc(from)}">
  <h2 id="cta-${esc(from)}">Your rishta search, in your pocket</h2>
  <p>Get the free Hyderabad Rishta app for Android and iPhone. See matching brides and grooms before you share your number${FACTS.publicationFree ? ', create your biodata for free' : ''} and connect only when both families agree.</p>
  ${storeBadges(from)}
</section>`;
}

function page({ path, title, description, h1, lead, bodyHtml, trail, ld = [], type = 'website', noindex = false, published, updated, hideCta, image, layout }) {
  const url = abs(path);
  const robots = !PRODUCTION || noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1';
  const crumbs = breadcrumbs(trail);
  const og = abs(image || BRAND.ogImage);
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#3F2F48">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(BRAND.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Hyderabad Rishta logo: a bride and groom under a Hyderabadi arch">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
${published ? `<meta property="article:published_time" content="${esc(published)}">` : ''}
${updated ? `<meta property="article:modified_time" content="${esc(updated)}">` : ''}
${GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(GOOGLE_SITE_VERIFICATION)}">` : ''}
${BING_SITE_VERIFICATION ? `<meta name="msvalidate.01" content="${esc(BING_SITE_VERIFICATION)}">` : ''}
<link rel="icon" href="/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preload" href="/fonts/cormorant-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/lato-400.woff2" as="font" type="font/woff2" crossorigin>
<style>${css}</style>
<link rel="alternate" type="application/rss+xml" title="Hyderabad Rishta guides" href="/blog/feed.xml">
${jsonLd([ORG, WEBSITE, APP, crumbs.ld, ...ld])}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/" aria-label="Hyderabad Rishta home"><img src="/img/logo-96.webp" width="40" height="40" alt=""><span>Hyderabad Rishta</span></a>
    <nav aria-label="Main"><ul>${NAV.map(([u, n]) => `<li><a href="${u}"${path === u ? ' aria-current="page"' : ''}>${n}</a></li>`).join('')}</ul></nav>
    <a class="btn btn-small" href="/#download" data-cta="get-app" data-from="header">Get the app</a>
  </div>
</header>
${layout === 'home'
  // Home: full-width sections; the page's single <h1> lives in the hero (content/pages/index.md).
  ? `<main id="main" class="home">\n${bodyHtml}\n</main>`
  : `<main id="main">
  <div class="wrap">
    ${crumbs.html}
    <article class="content">
      <h1>${esc(h1 || title)}</h1>
      ${lead ? `<p class="lead">${inline(lead)}</p>` : ''}
      ${updated && type === 'article' ? `<p class="meta">Updated <time datetime="${esc(updated)}">${new Date(updated).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</time> · By the Hyderabad Rishta team</p>` : ''}
      ${bodyHtml}
    </article>
    ${hideCta ? '' : cta(path)}
  </div>
</main>`}
<footer class="site-footer">
  <div class="wrap">
    <p class="about">${esc(BRAND.description)}</p>
    <div class="cols">${FOOTER.map(([h, links]) => `<div><h2>${h}</h2><ul>${links.map(([u, n]) => `<li><a href="${u}">${n}</a></li>`).join('')}</ul></div>`).join('')}</div>
    <p class="small">© ${new Date().getFullYear()} Hyderabad Rishta · In English, Urdu, Roman Urdu and Telugu · <a href="/contact/">Contact support</a></p>
    ${socialLinks('footer')}
  </div>
</footer>
${CF_ANALYTICS_TOKEN ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({ token: CF_ANALYTICS_TOKEN })}'></script>` : ''}
</body>
</html>
`;
}

// Cloudflare injects its cookie-free Web Analytics beacon on the live domain, so the CSP always allows it.
// ───────────── build ─────────────
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'static', 'fonts'), join(OUT, 'fonts'), { recursive: true });
cpSync(join(ROOT, 'static', 'img'), join(OUT, 'img'), { recursive: true });
cpSync(join(ROOT, 'static', 'video'), join(OUT, 'video'), { recursive: true });
writeFileSync(join(OUT, `site.${cssHash}.css`), css);

const write = (p, html) => {
  const file = p.endsWith('/') ? join(OUT, p, 'index.html') : join(OUT, p);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
};
const sitemap = [];
const pages = load('pages');
const posts = load('blog').sort((a, b) => String(b.date).localeCompare(String(a.date)));
const live = (x) => x.status === 'published';

for (const p of pages) {
  if (p.requires === 'publicationFree' && !FACTS.publicationFree) continue; // the page only exists while it is true
  const path = p.slug === '' || p.slug === 'index' ? '/' : `/${p.slug}/`;
  const trail = path === '/' ? null : [['/', 'Home'], ...(p.parent ? [[`/${p.parent}/`, p.parentName]] : []), [path, p.crumb || p.h1 || p.title]];
  const ld = [];
  if (p.schema === 'AboutPage') ld.push({ '@type': 'AboutPage', name: p.title, url: abs(path), about: { '@id': `${BASE}/#organization` } });
  else ld.push({ '@type': 'WebPage', name: p.title, url: abs(path), description: p.description, isPartOf: { '@id': `${BASE}/#website` }, inLanguage: 'en-IN' });
  if (p.slug === 'faqs') ld.push(faqLd(p.body));
  write(path, page({ path, title: p.title, description: p.description, h1: p.h1, lead: p.lead, bodyHtml: md(p.body), trail, ld, noindex: p.noindex === true, hideCta: p.hideCta === true, updated: p.updated, layout: p.layout }));
  if (p.noindex !== true) sitemap.push({ loc: abs(path), lastmod: p.updated });
}

for (const a of posts) {
  if (!live(a)) continue; // drafts wait for editorial review (see 90_DAY_GROWTH_PLAN.md)
  const path = `/blog/${a.slug}/`;
  const ld = [{
    '@type': 'BlogPosting',
    headline: a.h1 || a.title,
    description: a.description,
    datePublished: a.date,
    dateModified: a.updated || a.date,
    author: { '@type': 'Organization', name: 'Hyderabad Rishta team', url: `${BASE}/about/` },
    publisher: { '@id': `${BASE}/#organization` },
    mainEntityOfPage: abs(path),
    image: abs(BRAND.ogImage),
    inLanguage: 'en-IN',
    keywords: (a.keywords || []).join(', '),
  }];
  const related = (a.related || []).map((s) => posts.find((x) => x.slug === s && live(x))).filter(Boolean);
  const relHtml = related.length ? `<section class="related" aria-labelledby="related"><h2 id="related">Related guides</h2><ul>${related.map((r) => `<li><a href="/blog/${r.slug}/">${esc(r.h1 || r.title)}</a></li>`).join('')}</ul></section>` : '';
  write(path, page({ path, title: a.title, description: a.description, h1: a.h1, lead: a.lead, bodyHtml: md(a.body) + relHtml, trail: [['/', 'Home'], ['/blog/', 'Guides'], [path, a.crumb || a.h1 || a.title]], ld, type: 'article', published: a.date, updated: a.updated || a.date }));
  sitemap.push({ loc: abs(path), lastmod: a.updated || a.date });
}

// Blog index + RSS
const listed = posts.filter(live);
write('/blog/', page({
  path: '/blog/',
  title: 'Muslim Marriage & Rishta Guides | Hyderabad Rishta',
  description: 'Practical guides for Muslim families in Hyderabad: finding a rishta, writing a marriage biodata, evaluating proposals and staying private on matrimonial apps.',
  h1: 'Guides for Muslim families looking for a rishta',
  lead: 'Practical, plain-language guides on finding a suitable match, writing a good biodata and protecting your privacy.',
  bodyHtml: `<ul class="cards">${listed.map((a) => `<li><a href="/blog/${a.slug}/"><h2>${esc(a.h1 || a.title)}</h2><p>${esc(a.description)}</p></a></li>`).join('')}</ul>`,
  trail: [['/', 'Home'], ['/blog/', 'Guides']],
  ld: [{ '@type': 'CollectionPage', name: 'Hyderabad Rishta guides', url: abs('/blog/'), isPartOf: { '@id': `${BASE}/#website` } }],
}));
sitemap.push({ loc: abs('/blog/'), lastmod: listed[0]?.updated || listed[0]?.date });
writeFileSync(join(OUT, 'blog', 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Hyderabad Rishta guides</title><link>${esc(abs('/blog/'))}</link><description>${esc(BRAND.description)}</description><language>en-in</language>
${listed.map((a) => `<item><title>${esc(a.h1 || a.title)}</title><link>${esc(abs(`/blog/${a.slug}/`))}</link><guid>${esc(abs(`/blog/${a.slug}/`))}</guid><pubDate>${new Date(a.date).toUTCString()}</pubDate><description>${esc(a.description)}</description></item>`).join('\n')}
</channel></rss>
`);

// 404 (served with status 404 by the host; never indexed)
write('/404.html', page({ path: '/404.html', title: 'Page not found | Hyderabad Rishta', description: 'This page does not exist. Find Muslim matrimony guides and profiles help on Hyderabad Rishta.', h1: 'We could not find that page', bodyHtml: `<p>The link may be old or mistyped. Try <a href="/">the home page</a>, <a href="/muslim-matrimony-hyderabad/">Muslim matrimony in Hyderabad</a> or <a href="/blog/">our guides</a>.</p>`, noindex: true }));

// sitemap.xml — public marketing pages only. Member profiles are private and never listed.
const smap = sitemap.sort((a, b) => a.loc.localeCompare(b.loc));
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${smap.map((s) => `  <url><loc>${esc(s.loc)}</loc>${s.lastmod ? `<lastmod>${esc(s.lastmod)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);

// robots.txt — see site.config.mjs CRAWLERS and GEO_STRATEGY.md.
const robots = PRODUCTION
  ? [
      '# Hyderabad Rishta public website. Member profiles live in the private app (not on this site).',
      '# Search engines and AI search/answer crawlers may read these public pages.',
      ...CRAWLERS.allow.flatMap((b) => [`User-agent: ${b}`, 'Allow: /', '']),
      `# AI model-training crawlers: ${CRAWLERS.allowTraining ? 'allowed (owner may opt out with AI_TRAINING=0)' : 'opted out'}`,
      ...CRAWLERS.training.flatMap((b) => [`User-agent: ${b}`, CRAWLERS.allowTraining ? 'Allow: /' : 'Disallow: /', '']),
      '# Bulk scrapers',
      ...CRAWLERS.block.flatMap((b) => [`User-agent: ${b}`, 'Disallow: /', '']),
      'User-agent: *',
      'Allow: /',
      '',
      `Sitemap: ${BASE}/sitemap.xml`,
    ].join('\n') + '\n'
  : '# Preview build: not for indexing.\nUser-agent: *\nDisallow: /\n';
writeFileSync(join(OUT, 'robots.txt'), robots);

// llms.txt — an optional, experimental summary for AI tools (not a ranking factor).
writeFileSync(join(OUT, 'llms.txt'), `# ${BRAND.name}

> ${BRAND.description}

Hyderabad Rishta is a mobile app for Muslim matrimony (Android now, as a direct download from ${abs('/#download')}; Google Play and the App Store are coming). The website is informational: sign-up and everything else happen in the app. Families and individuals create a structured marriage biodata, see matching brides and grooms before sharing their number, send interest requests and share contact details only with consent. Creating and publishing a biodata is currently free; a Boost (extra visibility) is earned free by inviting a family. The app is available in English, Urdu, Roman Urdu and Telugu. Profiles are not identity-verified by the platform; members are asked to involve family and meet safely.

## Key pages
${pages.filter((p) => p.noindex !== true && p.slug).map((p) => `- [${p.h1 || p.title}](${abs(`/${p.slug}/`)}): ${p.description}`).join('\n')}

## Guides
${listed.map((a) => `- [${a.h1 || a.title}](${abs(`/blog/${a.slug}/`)}): ${a.description}`).join('\n')}

## Contact
- Contact page: ${abs('/contact/')}
`);

// ───────────── invitations (referral links) ─────────────
// https://<domain>/r/HRXXXX — opens the app straight away on Android once App Links are verified (assetlinks.json
// below); otherwise this page shows the code, an "Open the app" button and how to use the code at sign-up.
// One static page serves every code (_redirects rewrites /r/* to it); a tiny same-origin script fills the code in.
const ANDROID_PACKAGE = 'com.hyderabadrishta.app';
// SHA-256 of the app's signing certificates: the EAS upload key now; add Google Play's app-signing key once the
// Play listing exists (Play Console → App integrity), or links open the website instead of the app.
const ANDROID_CERTS = (process.env.ANDROID_CERT_SHA256 || '5B:30:37:0C:07:69:41:42:5D:7A:67:25:C0:5F:9D:3A:3C:08:40:AB:7C:1E:9D:19:B7:12:72:8F:FD:0A:B2:8A')
  .split(',').map((x) => x.trim()).filter(Boolean);
const store = storeBadges('invite');
write('/r/', page({
  path: '/r/', title: 'You are invited to Hyderabad Rishta', noindex: true, hideCta: true,
  description: 'A family invited you to Hyderabad Rishta. Use their invitation code when you sign up.',
  h1: 'A family invited you',
  lead: 'Join Hyderabad Rishta with this invitation code. Both families get a free Boost once your biodata is complete and approved.',
  bodyHtml: `<p class="invite-code" id="invite-code">—</p>
<p><a class="btn btn-gold" id="invite-open" href="hyderabadrishta://">Open Hyderabad Rishta</a></p>
${store}
<h2>How to use the code</h2>
<ol><li>Open or install the Hyderabad Rishta app.</li><li>Tap <strong>Find a rishta</strong> and sign up with your own mobile number.</li><li>On the mobile-number step, enter the code above (the app fills it in if you opened this link on your phone).</li></ol>
<p class="meta">The code can only be added while signing up. Your number and biodata are never shown to the family who invited you.</p>
<script src="/r.js" defer></script>`,
}));
// Home hero video: loads only when motion and data are welcome; plays only while the hero is on screen. It is fetched
// whole and played from a blob: URL because the host ignores Range requests, and iPhone Safari refuses to stream video
// without them (CSP allows media-src blob:).
writeFileSync(join(OUT, 'hero.js'), `(function(){var v=document.getElementById('hero-video');if(!v||!v.play||!window.fetch||!window.URL)return;var c=navigator.connection||{};if(matchMedia('(prefers-reduced-motion: reduce)').matches||c.saveData||/2g/.test(c.effectiveType||''))return;var u=v.getAttribute(matchMedia('(max-aspect-ratio: 1/1)').matches?'data-tall':'data-wide');v.muted=true;v.defaultMuted=true;v.setAttribute('muted','');v.setAttribute('playsinline','');v.addEventListener('playing',function(){v.classList.add('on');},{once:true});var seen=false;function go(){if(!seen||!v.src)return;var p=v.play();if(p&&p.catch)p.catch(function(){});}if('IntersectionObserver' in window){new IntersectionObserver(function(e){seen=e[0].isIntersecting;seen?go():v.pause();}).observe(v);}else seen=true;fetch(u).then(function(r){if(!r.ok)throw 0;return r.blob();}).then(function(b){v.src=URL.createObjectURL(b);go();}).catch(function(){});})();\n`);
writeFileSync(join(OUT, 'contact.js'), `(function(){var b=document.getElementById('show-email');if(!b)return;b.addEventListener('click',function(){var u=['mukarram','jahmm'].join(''),d=['gmail','com'].join('.'),a=u+'@'+d,o=document.getElementById('email-out');o.innerHTML='';var l=document.createElement('a');l.href='mailto:'+a+'?subject='+encodeURIComponent('Hyderabad Rishta support');l.textContent=a;o.appendChild(l);o.hidden=false;b.hidden=true;window.location.href=l.href;});})();\n`);
writeFileSync(join(OUT, 'r.js'), `(function(){var m=location.pathname.match(/^\\/r\\/([A-Za-z0-9]{6,8})\\/?$/);var c=m?m[1].toUpperCase():'';if(!/^HR[2-9A-HJKMNP-Z]{4,6}$/.test(c))return;document.getElementById('invite-code').textContent=c;document.getElementById('invite-open').href='hyderabadrishta://r/'+c;})();\n`);
mkdirSync(join(OUT, '.well-known'), { recursive: true });
writeFileSync(join(OUT, '.well-known', 'assetlinks.json'), JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: ANDROID_CERTS },
}], null, 2) + '\n');
writeFileSync(join(OUT, '_redirects'), `/r/*  /r/  200\n`);

// Hosting headers (Netlify / Cloudflare Pages format). Long cache for hashed/static assets.
writeFileSync(join(OUT, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' ${cssCsp}; font-src 'self'; media-src 'self' blob:; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
${PRODUCTION ? '' : '  X-Robots-Tag: noindex, nofollow\n'}/site.*.css
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/img/*
  Cache-Control: public, max-age=604800
/video/*
  Cache-Control: public, max-age=604800
/.well-known/assetlinks.json
  Content-Type: application/json
  Access-Control-Allow-Origin: *
`);

if (!existsSync(join(OUT, 'index.html'))) throw new Error('no home page built');
console.log(`Built ${sitemap.length} indexable URLs → website/dist (${PRODUCTION ? `production: ${BASE}` : 'PREVIEW: noindex, robots blocked'})${PRODUCTION && !(PLAY_URL && APP_STORE_URL) ? `\nNOTE: store badges show "Coming soon" until set: ${[!PLAY_URL && 'PLAY_URL', !APP_STORE_URL && 'APP_STORE_URL'].filter(Boolean).join(', ')}.` : ''}`);
