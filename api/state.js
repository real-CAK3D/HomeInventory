const DEFAULT_STATE = { users: [], items: [] };

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const bucket = process.env.HOME_INVENTORY_BUCKET || 'home-inventory';
  const objectPath = process.env.HOME_INVENTORY_STATE_PATH || 'state.json';

  if (!url || !key) {
    return { error: 'Supabase storage is not configured on this deployment.' };
  }

  return {
    url: url.replace(/\/$/, ''),
    key,
    bucket,
    objectPath,
    backupPrefix: objectPath.replace(/\.json$/i, '') + '-backups'
  };
}

function storageHeaders(config, extra = {}) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    ...extra
  };
}

async function send(response, status, payload) {
  response.status(status).setHeader('Content-Type', jsonHeaders['Content-Type']);
  response.send(JSON.stringify(payload));
}

async function isSupabaseMissing(response) {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const body = await response.clone().json();
    return String(body.statusCode) === '404' || /not found/i.test(body.message || '');
  } catch {
    return false;
  }
}

async function ensureBucket(config) {
  const bucketUrl = `${config.url}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`;
  const existing = await fetch(bucketUrl, { headers: storageHeaders(config) });
  if (existing.ok) return;
  if (!(await isSupabaseMissing(existing))) {
    const text = await existing.text();
    throw new Error(`Supabase bucket check failed with ${existing.status}: ${text}`);
  }
  const created = await fetch(`${config.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: storageHeaders(config, jsonHeaders),
    body: JSON.stringify({ id: config.bucket, name: config.bucket, public: false })
  });
  if (!created.ok && created.status !== 409) {
    const text = await created.text();
    throw new Error(`Supabase bucket creation failed with ${created.status}: ${text}`);
  }
}

function objectUrl(config, path) {
  return `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${path}`;
}

async function readObject(config, path, fallback = null) {
  await ensureBucket(config);
  const existing = await fetch(objectUrl(config, path), { headers: storageHeaders(config) });
  if (await isSupabaseMissing(existing)) return fallback;
  if (!existing.ok) {
    const text = await existing.text();
    throw new Error(`Supabase read failed with ${existing.status}: ${text}`);
  }
  return existing.json();
}

async function writeObject(config, path, payload) {
  await ensureBucket(config);
  const saved = await fetch(objectUrl(config, path), {
    method: 'POST',
    headers: storageHeaders(config, {
      'Content-Type': 'application/json; charset=utf-8',
      'x-upsert': 'true',
      'cache-control': 'no-cache'
    }),
    body: JSON.stringify(payload, null, 2)
  });
  if (!saved.ok) {
    const text = await saved.text();
    throw new Error(`Supabase write failed with ${saved.status}: ${text}`);
  }
}

async function readState(config) {
  return await readObject(config, config.objectPath, DEFAULT_STATE);
}

async function readBackups(config) {
  const backups = await readObject(config, `${config.backupPrefix}/index.json`, []);
  return Array.isArray(backups) ? backups.slice(0, 5) : [];
}

async function saveBackups(config, backups) {
  await writeObject(config, `${config.backupPrefix}/index.json`, backups.slice(0, 5));
}

async function snapshotCurrentState(config, reason = 'Auto-save') {
  const current = await readState(config);
  const backups = await readBackups(config);
  const backup = {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    createdAt: new Date().toISOString(),
    reason,
    itemCount: Array.isArray(current.items) ? current.items.length : 0,
    userCount: Array.isArray(current.users) ? current.users.length : 0,
    state: current
  };
  await saveBackups(config, [backup, ...backups].slice(0, 5));
  return backup;
}

async function writeState(config, payload) {
  await snapshotCurrentState(config, payload?.lastSaveReason || 'Auto-save before inventory change');
  await writeObject(config, config.objectPath, { ...payload, lastCloudSaveAt: new Date().toISOString() });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const config = getConfig();
  if (config.error) {
    await send(response, 503, { ok: false, error: config.error });
    return;
  }

  try {
    const url = new URL(request.url || '/api/state', 'https://home-inventory.local');

    if (request.method === 'GET' && url.searchParams.get('backups') === '1') {
      await send(response, 200, { ok: true, backups: await readBackups(config) });
      return;
    }

    if (request.method === 'POST' && url.searchParams.get('restore')) {
      const backupId = url.searchParams.get('restore');
      const backups = await readBackups(config);
      const backup = backups.find((entry) => entry.id === backupId);
      if (!backup) {
        await send(response, 404, { ok: false, error: 'Backup not found' });
        return;
      }
      await snapshotCurrentState(config, 'Snapshot before rollback');
      await writeObject(config, config.objectPath, { ...backup.state, lastCloudSaveAt: new Date().toISOString(), restoredFrom: backup.id });
      await send(response, 200, { ok: true, restored: backup.id });
      return;
    }

    if (request.method === 'GET') {
      await send(response, 200, await readState(config));
      return;
    }

    if (request.method === 'PUT') {
      await writeState(config, request.body || DEFAULT_STATE);
      await send(response, 200, { ok: true, source: 'supabase-storage', backedUp: true });
      return;
    }

    response.setHeader('Allow', 'GET, PUT, POST');
    await send(response, 405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    await send(response, 500, { ok: false, error: error.message });
  }
}
