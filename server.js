import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';
const dataDir = resolve(process.env.HOME_INVENTORY_DIR || join(__dirname, 'Home Inventory'));
const dataFile = join(dataDir, 'inventory-data.json');
const distDir = join(__dirname, 'dist');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function ensureDataFile() {
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    writeFileSync(dataFile, JSON.stringify({ users: [], items: [] }, null, 2));
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 15 * 1024 * 1024) {
        rejectBody(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolveBody(body));
    request.on('error', rejectBody);
  });
}

function serveFile(response, requestUrl) {
  const parsed = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(parsed.pathname);
  const relative = pathname === '/' || pathname.startsWith('/tag/') ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = resolve(distDir, relative);
  const fallback = join(distDir, 'index.html');
  const safeTarget = target.startsWith(distDir) ? target : fallback;
  const filePath = existsSync(safeTarget) && statSync(safeTarget).isFile() ? safeTarget : fallback;
  const ext = extname(filePath);
  response.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  response.end(readFileSync(filePath));
}

ensureDataFile();

createServer(async (request, response) => {
  try {
    if (request.url === '/api/state' && request.method === 'GET') {
      ensureDataFile();
      sendJson(response, 200, JSON.parse(readFileSync(dataFile, 'utf8')));
      return;
    }

    if (request.url === '/api/state' && request.method === 'PUT') {
      const payload = JSON.parse(await readBody(request));
      ensureDataFile();
      writeFileSync(dataFile, JSON.stringify(payload, null, 2));
      sendJson(response, 200, { ok: true, path: dataFile });
      return;
    }

    serveFile(response, request.url || '/');
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
}).listen(port, host, () => {
  console.log(`Nukebox Inventory running at http://${host}:${port}`);
  console.log(`Saving inventory to ${dataFile}`);
});
