// NukeBox / LAN server: serves the built app and the same API as Vercel, saving to a local folder.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from './server/core.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';
const distDir = join(__dirname, 'dist');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2'
};

function serveFile(response, pathname) {
  const relative = pathname === '/' || !pathname.includes('.') ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = resolve(distDir, relative);
  const fallback = join(distDir, 'index.html');
  const filePath = target.startsWith(distDir) && existsSync(target) && statSync(target).isFile() ? target : fallback;
  const headers = { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' };
  if (filePath.includes(`${join('dist', 'assets')}`)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  response.writeHead(200, headers);
  response.end(readFileSync(filePath));
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url || '/', 'http://local');
  const route = routes[pathname];
  if (route) return route(request, response);
  serveFile(response, decodeURIComponent(pathname));
}).listen(port, host, () => {
  console.log(`Home Inventory running at http://${host}:${port}`);
});
