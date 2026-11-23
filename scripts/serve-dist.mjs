// Serves dist/ the way GitHub Pages does (same sub-folder, same 404 fallback), for local testing.
// Usage: node scripts/serve-dist.mjs   → http://localhost:8090/<base>/
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const base = (process.env.EXPO_BASE_URL || '/watch-business-manager').replace(/\/$/, '');
const port = Number(process.env.PORT || 8090);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.css': 'text/css', '.svg': 'image/svg+xml' };

createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!url.startsWith(base + '/') && url !== base) {
    res.writeHead(302, { Location: base + '/' });
    return res.end();
  }
  let rel = normalize(url.slice(base.length) || '/').replace(/^[\\/]+/, '');
  if (rel.includes('..')) rel = '';
  let file = join('dist', rel);
  if (!rel || (existsSync(file) && statSync(file).isDirectory())) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return res.end(readFileSync(join('dist', '404.html')));
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Serving dist at http://localhost:${port}${base}/`));
