// Minimal static server for built folders (dist-qa, dist-public, dist-stable). No dependency.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.map': 'application/json' };

export function serveDir(dir, port, { routes = {} } = {}) {
  const root = resolve(dir);
  return new Promise((res, rej) => {
    const server = createServer((req, resp) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (routes[url.pathname]) { routes[url.pathname](req, resp); return; }
      let p = normalize(join(root, decodeURIComponent(url.pathname)));
      if (!p.startsWith(root)) { resp.writeHead(403); resp.end(); return; }
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { resp.writeHead(404); resp.end('not found'); return; }
      resp.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      resp.end(readFileSync(p));
    });
    server.on('error', rej);
    server.listen(port, '127.0.0.1', () => res(server));
  });
}
