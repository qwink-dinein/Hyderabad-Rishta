// Static server with SPA fallback for the exported Expo web build.
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2]; const port = Number(process.argv[3] || 8081);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
// Same security headers production sends (public/_headers → dist/_headers), minus HSTS/upgrade on plain http.
const headers = {};
try {
  for (const line of fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n')) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m && m[1] !== 'Strict-Transport-Security') headers[m[1]] = m[2].replace(/;\s*upgrade-insecure-requests/, '');
  }
} catch {}
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('serving', root, 'on', port));
