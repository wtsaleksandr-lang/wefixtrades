import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
const ROOT = 'C:/Users/Owner/.codex/wt-preview/dist/public';
const PORT = 5099;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon','.txt':'text/plain','.webp':'image/webp' };
const tryFile = async (p) => { try { const s = await stat(p); if (s.isFile()) return p; } catch {} return null; };
createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let fp = join(ROOT, url);
    let found = await tryFile(fp);
    if (!found && !extname(url)) found = await tryFile(join(fp, 'index.html'));
    if (!found) found = join(ROOT, 'index.html');
    const data = await readFile(found);
    res.writeHead(200, {
      'content-type': MIME[extname(found)] || 'application/octet-stream',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      'pragma': 'no-cache',
      'expires': '0',
    });
    res.end(data);
  } catch (e) { res.writeHead(500); res.end('err ' + e.message); }
}).listen(PORT, () => console.log('static (no-store) on ' + PORT));
