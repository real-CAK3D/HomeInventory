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
    objectPath
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

async function readState(config) {
  await ensureBucket(config);
  const objectUrl = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${config.objectPath}`;
  const existing = await fetch(objectUrl, { headers: storageHeaders(config) });

  if (await isSupabaseMissing(existing)) return DEFAULT_STATE;
  if (!existing.ok) {
    const text = await existing.text();
    throw new Error(`Supabase state read failed with ${existing.status}: ${text}`);
  }

  return existing.json();
}

async function writeState(config, payload) {
  await ensureBucket(config);
  const objectUrl = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${config.objectPath}`;
  const saved = await fetch(objectUrl, {
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
    throw new Error(`Supabase state write failed with ${saved.status}: ${text}`);
  }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const config = getConfig();
  if (config.error) {
    await send(response, 503, { ok: false, error: config.error });
    return;
  }

  try {
    if (request.method === 'GET') {
      await send(response, 200, await readState(config));
      return;
    }

    if (request.method === 'PUT') {
      await writeState(config, request.body || DEFAULT_STATE);
      await send(response, 200, { ok: true, source: 'supabase-storage' });
      return;
    }

    response.setHeader('Allow', 'GET, PUT');
    await send(response, 405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    await send(response, 500, { ok: false, error: error.message });
  }
}
