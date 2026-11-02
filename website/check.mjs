// Validates website/dist: SEO basics, structured data, links, sitemap/robots and privacy.
//   node website/check.mjs          (exit 1 on any error)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const errors = [];
const warn = [];
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) files.push(p);
  }
})(OUT);

const titles = new Map();
const descs = new Map();
const one = (html, re) => (html.match(re) || [])[1];
const PHONE = /(?<![\d/.-])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/; // Indian mobile numbers
const robotsTxt = readFileSync(join(OUT, 'robots.txt'), 'utf8');
const production = !/Disallow: \/\n?$/.test(robotsTxt.split('User-agent: *')[1] || '');
let base = '';

for (const f of files) {
  const rel = '/' + relative(OUT, f).replace(/index\.html$/, '');
  const html = readFileSync(f, 'utf8');
  const is404 = rel.includes('404');
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) errors.push(`${rel}: ${h1s} <h1> (want 1)`);
  const title = one(html, /<title>([^<]*)<\/title>/);
  const desc = one(html, /<meta name="description" content="([^"]*)"/);
  const canon = one(html, /<link rel="canonical" href="([^"]*)"/);
  const robots = one(html, /<meta name="robots" content="([^"]*)"/);
  if (!title) errors.push(`${rel}: no <title>`);
  else {
    if (title.length > 70) warn.push(`${rel}: title ${title.length} chars (may be cut in results)`);
    if (titles.has(title)) errors.push(`${rel}: duplicate title with ${titles.get(title)}`);
    titles.set(title, rel);
  }
  if (!desc) errors.push(`${rel}: no meta description`);
  else {
    if (desc.length < 70 || desc.length > 170) warn.push(`${rel}: description ${desc.length} chars`);
    if (descs.has(desc)) errors.push(`${rel}: duplicate description with ${descs.get(desc)}`);
    descs.set(desc, rel);
  }
  if (!canon) errors.push(`${rel}: no canonical`);
  else if (!is404) {
    base = base || canon.replace(/\/[^/]*\/?$|\/$/, '').replace(/(https?:\/\/[^/]+).*/, '$1');
    if (!canon.endsWith(rel)) errors.push(`${rel}: canonical ${canon} does not match the page`);
  }
  if (!robots) errors.push(`${rel}: no robots meta`);
  if (is404 && !/noindex/.test(robots)) errors.push('404 page must be noindex');
  for (const k of ['og:title', 'og:description', 'og:image', 'og:url']) if (!html.includes(`property="${k}"`)) errors.push(`${rel}: missing ${k}`);
  // Structured data must parse and never carry ratings/reviews we do not have.
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      const s = JSON.stringify(j);
      if (/aggregateRating|"review"|ratingValue|"offers"/.test(s)) errors.push(`${rel}: structured data claims ratings/reviews/offers`);
      if (!j['@type']) errors.push(`${rel}: JSON-LD without @type`);
    } catch (e) {
      errors.push(`${rel}: invalid JSON-LD (${e.message})`);
    }
  }
  // Images need alt (empty alt allowed for decorative ones) and dimensions (no layout shift).
  for (const img of html.match(/<img\b[^>]*>/g) || []) {
    if (!/\salt="/.test(img)) errors.push(`${rel}: <img> without alt: ${img.slice(0, 80)}`);
    if (!/\swidth="\d+"/.test(img) || !/\sheight="\d+"/.test(img)) errors.push(`${rel}: <img> without width/height`);
  }
  // Heading order: no h3 before the first h2.
  const firstH2 = html.indexOf('<h2'), firstH3 = html.indexOf('<h3');
  if (firstH3 !== -1 && (firstH2 === -1 || firstH3 < firstH2)) errors.push(`${rel}: <h3> before any <h2>`);
  // Internal links resolve.
  for (const m of html.matchAll(/href="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
    const u = m[1];
    const target = u.endsWith('/') ? join(OUT, u, 'index.html') : join(OUT, u);
    if (!existsSync(target)) errors.push(`${rel}: broken link ${u}`);
  }
  // Privacy: no phone numbers anywhere in the public site.
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ');
  if (PHONE.test(text)) errors.push(`${rel}: looks like a phone number in the page`);
}

// sitemap.xml: well-formed, only pages that exist, nothing private, no noindex pages.
const sm = readFileSync(join(OUT, 'sitemap.xml'), 'utf8');
if (!/^<\?xml[\s\S]*<urlset[\s\S]*<\/urlset>\s*$/.test(sm)) errors.push('sitemap.xml malformed');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const loc of locs) {
  const path = loc.replace(/^https?:\/\/[^/]+/, '');
  const f = path.endsWith('/') ? join(OUT, path, 'index.html') : join(OUT, path);
  if (!existsSync(f)) errors.push(`sitemap: ${loc} has no page`);
  else if (/<meta name="robots" content="noindex/.test(readFileSync(f, 'utf8')) && production) errors.push(`sitemap: ${loc} is noindex`);
  if (/^\/(profile|biodata|app|login|admin|start|pin)(\/|$)/.test(path)) errors.push(`sitemap: private-looking URL ${loc}`);
}
if (!robotsTxt.includes('User-agent: *')) errors.push('robots.txt has no default group');
if (production && !robotsTxt.includes('Sitemap:')) errors.push('robots.txt has no Sitemap line');

console.log(`Checked ${files.length} pages, ${locs.length} sitemap URLs (${production ? 'production' : 'preview'} build).`);
for (const w of warn) console.log('  warn:', w);
for (const e of errors) console.log('  ERROR:', e);
console.log(errors.length ? `WEBSITE CHECK FAILED (${errors.length})` : 'WEBSITE CHECK PASSED');
process.exit(errors.length ? 1 : 0);
