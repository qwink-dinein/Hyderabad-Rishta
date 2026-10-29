// Packs a SINGLE_BUNDLE=1 web export into one self-contained HTML body fragment:
// inlines the JS bundle and turns every /assets/... reference into a data: URI.
// Usage: node scripts/pack-web.js dist-single out.html [--standalone]
//   --standalone writes a complete HTML document (doctype, head, mobile meta) instead of a body fragment.
const fs = require('fs');
const path = require('path');
const [, , dir, out, flag] = process.argv;
const standalone = flag === '--standalone';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const src = html.match(/<script src="([^"]+)"/)[1];
let js = fs.readFileSync(path.join(dir, src), 'utf8');
const mime = { '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.webp': 'image/webp' };
let inlined = 0;
js = js.replace(/"(\/assets\/[^"?]+)(\?[^"]*)?"/g, (m, p) => {
  const file = path.join(dir, p);
  if (!fs.existsSync(file)) return m;
  inlined++;
  return JSON.stringify(`data:${mime[path.extname(p)] || 'application/octet-stream'};base64,${fs.readFileSync(file).toString('base64')}`);
});
// Keep the HTML parser from ending the inline script early.
js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const head = `<title>Hyderabad Rishta</title>
<meta name="theme-color" content="#123D32">
<style>
  :root { --ivory: #F8F4EB; }
  html, body { height: 100%; background: var(--ivory); }
  body { margin: 0; overflow: hidden; overscroll-behavior: none; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; }
  #root { display: flex; height: 100%; flex: 1; }
</style>`;
const bodyHtml = `<div id="root"></div>
<script>
  // Hosted previews are served under an arbitrary path; start the router at "/".
  try { if (location.pathname !== '/') history.replaceState(null, '', '/'); } catch (e) {}
</script>
<script>${js}</script>
`;
const page = standalone
  ? `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${bodyHtml}</body>\n</html>\n`
  : head + '\n' + bodyHtml;
fs.writeFileSync(out, page);
console.log(`inlined ${inlined} assets → ${(page.length / 1048576).toFixed(1)} MB`);
