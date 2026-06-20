import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';
const dataDir = resolve(process.env.HOME_INVENTORY_DIR || join(__dirname, 'Home Inventory'));
const dataFile = join(dataDir, 'inventory-data.json');
const backupsFile = join(dataDir, 'inventory-backups.json');
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
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function ensureDataFile() {
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dataFile)) writeFileSync(dataFile, JSON.stringify({ users: [], items: [] }, null, 2));
  if (!existsSync(backupsFile)) writeFileSync(backupsFile, JSON.stringify([], null, 2));
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        rejectBody(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolveBody(body));
    request.on('error', rejectBody);
  });
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function snapshot(reason = 'Local auto-save') {
  ensureDataFile();
  const state = readJson(dataFile, { users: [], items: [] });
  const backups = readJson(backupsFile, []);
  const backup = { id: new Date().toISOString().replace(/[:.]/g, '-'), createdAt: new Date().toISOString(), reason, itemCount: Array.isArray(state.items) ? state.items.length : 0, userCount: Array.isArray(state.users) ? state.users.length : 0, state };
  writeFileSync(backupsFile, JSON.stringify([backup, ...backups].slice(0, 5), null, 2));
}

function serveFile(response, requestUrl) {
  const parsed = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(parsed.pathname);
  const relative = pathname === '/' || !pathname.includes('.') ? 'index.html' : pathname.replace(/^\/+/, '');
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
    const parsed = new URL(request.url || '/', `http://${host}:${port}`);
    if (parsed.pathname === '/api/state' && request.method === 'GET' && parsed.searchParams.get('backups') === '1') {
      ensureDataFile();
      sendJson(response, 200, { ok: true, backups: readJson(backupsFile, []) });
      return;
    }
    if (parsed.pathname === '/api/state' && request.method === 'POST' && parsed.searchParams.get('restore')) {
      ensureDataFile();
      const backups = readJson(backupsFile, []);
      const backup = backups.find((b) => b.id === parsed.searchParams.get('restore'));
      if (!backup) return sendJson(response, 404, { ok: false, error: 'Backup not found' });
      snapshot('Snapshot before local rollback');
      writeFileSync(dataFile, JSON.stringify({ ...backup.state, restoredFrom: backup.id, lastCloudSaveAt: new Date().toISOString() }, null, 2));
      sendJson(response, 200, { ok: true, restored: backup.id });
      return;
    }
    if (parsed.pathname === '/api/state' && request.method === 'GET') {
      ensureDataFile();
      sendJson(response, 200, readJson(dataFile, { users: [], items: [] }));
      return;
    }
    if (parsed.pathname === '/api/state' && request.method === 'PUT') {
      const payload = JSON.parse(await readBody(request));
      ensureDataFile();
      snapshot(payload.lastSaveReason || 'Local auto-save before change');
      writeFileSync(dataFile, JSON.stringify({ ...payload, lastCloudSaveAt: new Date().toISOString() }, null, 2));
      sendJson(response, 200, { ok: true, path: dataFile, backedUp: true });
      return;
    }
    serveFile(response, request.url || '/');
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
}).listen(port, host, () => {
  console.log(`Home Inventory running at http://${host}:${port}`);
  console.log(`Saving inventory to ${dataFile}`);
});
