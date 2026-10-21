// All API logic lives here so Vercel functions, the Vite dev server and the NukeBox server share it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseStore } from './store-supabase.js';
import { createFileStore } from './store-file.js';
import {
  DEFAULT_PIN, DEFAULT_PREFS, DEFAULT_CATEGORIES, SEED_PROFILES, FAMILY,
  decide, describeOp, describeAsk, viewFor, ownerOf, thingLabel, nowIso
} from '../shared/model.js';

const SESSION_COOKIE = 'hi_session';
const SESSION_DAYS = 400;
const ID_RE = /^[A-Za-z0-9_:-]{3,80}$/;
const SYNC_OVERLAP_MS = 15000;

// ---------- store + secret ----------

let storePromise = null;
export function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      const url = process.env.SUPABASE_URL;
      const candidates = [['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY], ['SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY]].filter(([, v]) => v);
      if (url && candidates.length) {
        // Use the first key the database accepts, so a stale leftover variable can't break the app.
        const failures = [];
        for (const [name, key] of candidates) {
          const store = createSupabaseStore({ url, key: key.trim(), bucket: process.env.HOME_INVENTORY_BUCKET || 'home-inventory' });
          try {
            await store.ping();
            return store;
          } catch (error) {
            // Old-style keys name their project inside (not secret), which shows a key copied from the wrong project.
            let from = '';
            try { from = ` from project ${JSON.parse(Buffer.from(key.trim().split('.')[1], 'base64url').toString()).ref}`; } catch { /* sb_ keys */ }
            failures.push(`${name} (${key.trim().slice(0, 9)}…${from}): ${String(error.message).slice(0, 90)}`);
          }
        }
        storePromise = null; // try again on the next request once the keys are fixed
        throw new Error(`Database rejected every key for ${url}. ${failures.join(' | ')}`);
      }
      if (process.env.VERCEL) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set on this deployment.');
      const here = path.dirname(fileURLToPath(import.meta.url));
      const base = process.env.HOME_INVENTORY_DIR || path.join(here, '..', 'Home Inventory');
      return createFileStore(process.env.HOME_INVENTORY_DATA_DIR || path.join(base, 'data'));
    })();
  }
  return storePromise;
}

let secretCache = null;
function sessionSecret(store) {
  if (secretCache) return secretCache;
  if (process.env.SESSION_SECRET) return (secretCache = process.env.SESSION_SECRET);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (serviceKey) return (secretCache = crypto.createHmac('sha256', serviceKey).update('home-inventory-session-v2').digest('hex'));
  if (store.secretFile) {
    if (!fs.existsSync(store.secretFile)) fs.writeFileSync(store.secretFile, crypto.randomBytes(32).toString('hex'));
    return (secretCache = fs.readFileSync(store.secretFile, 'utf8').trim());
  }
  throw new Error('No session secret available');
}

// ---------- http helpers ----------

function send(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function queryOf(req) { return new URL(req.url || '/', 'http://local').searchParams; }

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isSecure(req) {
  const host = String(req.headers.host || '');
  return !/^(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(host) && (req.headers['x-forwarded-proto'] === 'https' || Boolean(process.env.VERCEL));
}

function sessionCookie(req, value, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isSecure(req) ? '; Secure' : ''}`;
}

function sign(store, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', sessionSecret(store)).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(store, token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', sessionSecret(store)).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, pinHash: crypto.scryptSync(String(pin), salt, 32).toString('hex') };
}

function pinMatches(auth, pin) {
  const { pinHash } = hashPin(pin, auth.salt);
  return crypto.timingSafeEqual(Buffer.from(pinHash, 'hex'), Buffer.from(auth.pinHash, 'hex'));
}

const publicProfile = (rec) => ({ id: rec.id, name: rec.data.name, color: rec.data.color, emoji: rec.data.emoji, photoId: rec.data.photoId || '', deletedAt: rec.data.deletedAt || null });

// ---------- bootstrap ----------

async function ensureSeeded(store) {
  const profiles = await store.listKind('profile');
  if (profiles.length) return profiles;
  const at = nowIso();
  const rows = [];
  for (const p of SEED_PROFILES) {
    rows.push({ id: p.id, kind: 'profile', data: { name: p.name, color: p.color, emoji: p.emoji, role: p.role, photoId: '', prefs: { ...DEFAULT_PREFS }, createdAt: at } });
    rows.push({ id: `auth:${p.id}`, kind: 'auth', data: { ...hashPin(DEFAULT_PIN), pinSet: false, failed: 0, lockUntil: 0 } });
  }
  rows.push({ id: 'settings', kind: 'settings', data: { householdName: 'Our Home', categories: DEFAULT_CATEGORIES, setupDone: false, createdAt: at } });
  await store.put(rows);
  return store.listKind('profile');
}

async function currentActor(req, store) {
  const session = verify(store, cookies(req)[SESSION_COOKIE]);
  if (!session) return null;
  const found = await store.getMany([session.uid]);
  const actor = found.get(session.uid);
  if (!actor || actor.data.deletedAt) return null;
  return actor;
}

// ---------- /api/auth ----------

export async function handleAuth(req, res) {
  const store = await getStore();
  const profiles = await ensureSeeded(store);

  if (req.method === 'GET') {
    const actor = await currentActor(req, store);
    const auths = await store.getMany(profiles.map((p) => `auth:${p.id}`));
    return send(res, 200, {
      ok: true,
      me: actor ? actor.id : null,
      profiles: profiles.filter((p) => !p.data.deletedAt).map((p) => ({ ...publicProfile(p), pinSet: Boolean(auths.get(`auth:${p.id}`)?.data.pinSet) }))
    });
  }

  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed' });
  if (req.headers['x-hi'] !== '1') return send(res, 400, { ok: false, error: 'Missing app header' });
  const body = await readBody(req);

  if (body.action === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });

  if (body.action === 'login') {
    const profile = profiles.find((p) => p.id === body.profileId && !p.data.deletedAt);
    if (!profile) return send(res, 404, { ok: false, error: 'Pick a person first.' });
    const authId = `auth:${profile.id}`;
    const auth = (await store.getMany([authId])).get(authId) || { id: authId, kind: 'auth', data: { ...hashPin(DEFAULT_PIN), pinSet: false, failed: 0, lockUntil: 0 } };
    const waitMs = (auth.data.lockUntil || 0) - Date.now();
    if (waitMs > 0) return send(res, 429, { ok: false, error: `Too many tries. Wait ${Math.ceil(waitMs / 1000)} seconds and try again.`, waitMs });
    if (!/^\d{4}$/.test(String(body.pin || '')) || !pinMatches(auth.data, body.pin)) {
      const failed = (auth.data.failed || 0) + 1;
      const lockUntil = failed >= 5 ? Date.now() + Math.min(15 * 60000, 30000 * 2 ** (failed - 5)) : 0;
      await store.put([{ ...auth, data: { ...auth.data, failed, lockUntil } }]);
      return send(res, 401, { ok: false, error: failed >= 5 ? 'That PIN is not right. Taking a short break before the next try.' : 'That PIN is not right. Try again.' });
    }
    if (!auth.data.pinSet) {
      if (!/^\d{4}$/.test(String(body.newPin || ''))) return send(res, 200, { ok: false, needsNewPin: true });
      if (body.newPin === DEFAULT_PIN) return send(res, 400, { ok: false, needsNewPin: true, error: 'Choose a PIN other than 0000.' });
      await store.put([{ ...auth, data: { ...auth.data, ...hashPin(body.newPin), pinSet: true, failed: 0, lockUntil: 0 } }]);
    } else if (auth.data.failed) {
      await store.put([{ ...auth, data: { ...auth.data, failed: 0, lockUntil: 0 } }]);
    }
    const token = sign(store, { uid: profile.id, exp: Date.now() + SESSION_DAYS * 86400000 });
    return send(res, 200, { ok: true, me: profile.id }, { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
  }

  const actor = await currentActor(req, store);
  if (!actor) return send(res, 401, { ok: false, error: 'Please sign in again.' });

  if (body.action === 'changePin') {
    const authId = `auth:${actor.id}`;
    const auth = (await store.getMany([authId])).get(authId);
    if (!auth || !pinMatches(auth.data, body.pin)) return send(res, 401, { ok: false, error: 'Your current PIN is not right.' });
    if (!/^\d{4}$/.test(String(body.newPin || '')) || body.newPin === DEFAULT_PIN) return send(res, 400, { ok: false, error: 'Pick a new 4-digit PIN (not 0000).' });
    await store.put([{ ...auth, data: { ...auth.data, ...hashPin(body.newPin), pinSet: true, failed: 0, lockUntil: 0 } }]);
    return send(res, 200, { ok: true });
  }

  if (body.action === 'resetPin' || body.action === 'addProfile') {
    if (actor.data.role !== 'admin') return send(res, 403, { ok: false, error: 'Only an admin can do that.' });
    if (body.action === 'resetPin') {
      if (!profiles.some((p) => p.id === body.profileId)) return send(res, 404, { ok: false, error: 'Unknown person.' });
      await store.put([{ id: `auth:${body.profileId}`, kind: 'auth', data: { ...hashPin(DEFAULT_PIN), pinSet: false, failed: 0, lockUntil: 0 } }]);
      return send(res, 200, { ok: true });
    }
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return send(res, 400, { ok: false, error: 'Type a name.' });
    const id = `p_${crypto.randomBytes(5).toString('hex')}`;
    const [saved] = await store.put([
      { id, kind: 'profile', data: { name, color: body.color || '#4f9dff', emoji: body.emoji || '🙂', role: 'member', photoId: '', prefs: { ...DEFAULT_PREFS }, createdAt: nowIso() } },
      { id: `auth:${id}`, kind: 'auth', data: { ...hashPin(DEFAULT_PIN), pinSet: false, failed: 0, lockUntil: 0 } }
    ]);
    return send(res, 200, { ok: true, record: saved });
  }

  return send(res, 400, { ok: false, error: 'Unknown action' });
}

// ---------- /api/sync ----------

export async function handleSync(req, res) {
  const store = await getStore();
  const actor = await currentActor(req, store);
  if (!actor) return send(res, 401, { ok: false, error: 'Please sign in again.' });
  const since = queryOf(req).get('since');
  const serverNow = nowIso();
  const overlapSince = since ? new Date(new Date(since).getTime() - SYNC_OVERLAP_MS).toISOString() : null;
  const changed = await store.listSince(overlapSince);
  // Visibility of an item can depend on its box, so pull in parent boxes not already in the batch.
  const byId = new Map(changed.map((r) => [r.id, r]));
  const missingBoxes = changed.filter((r) => r.kind === 'item' && r.data.boxId && !byId.has(r.data.boxId)).map((r) => r.data.boxId);
  if (missingBoxes.length) for (const [id, rec] of await store.getMany(missingBoxes)) byId.set(id, rec);
  const records = changed.map((r) => viewFor(r, actor.id, byId)).filter(Boolean);
  const cursor = changed.length ? changed[changed.length - 1].updated_at : since || serverNow;
  return send(res, 200, { ok: true, me: actor.id, cursor, full: !since, records });
}

// ---------- /api/mutate ----------

const KIND_PREFIX = { box: 'box', item: 'itm', section: 'sec', settings: 'settings', profile: 'p', notification: 'ntf' };

function cleanData(kind, data) {
  const out = { ...(data || {}) };
  delete out.redacted;
  if (kind === 'profile') {
    delete out.pinHash; delete out.salt;
  }
  return out;
}

async function loadContext(store, ops, actor) {
  const ids = new Set([actor.id]);
  for (const op of ops) {
    if (op.id) ids.add(op.id);
    if (op.data?.boxId) ids.add(op.data.boxId);
    if (op.data?.sectionId) ids.add(op.data.sectionId);
  }
  const records = await store.getMany([...ids]);
  for (const rec of [...records.values()]) {
    if (rec.data?.boxId) ids.add(rec.data.boxId);
    if (rec.data?.sectionId) ids.add(rec.data.sectionId);
    if (rec.data?.ownerId) ids.add(rec.data.ownerId);
  }
  for (const op of ops) if (op.data?.ownerId) ids.add(op.data.ownerId);
  // Owner profiles are needed for their notification preferences.
  const more = await store.getMany([...ids].filter((id) => !records.has(id)));
  for (const [id, rec] of more) records.set(id, rec);
  return records;
}

async function nextFreeBoxNumber(store, wanted, selfId) {
  const boxes = (await store.listKind('box')).filter((b) => !b.data.deletedAt && b.id !== selfId);
  const used = new Set(boxes.map((b) => Number(b.data.number)));
  if (wanted && !used.has(Number(wanted))) return Number(wanted);
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

/** Apply one op for real. Returns the saved record(s). */
async function applyOp(store, op, records, actor, extraSummary = '') {
  const current = op.id ? records.get(op.id) : null;
  const at = nowIso();
  let data;
  if (op.type === 'create') {
    data = { ...cleanData(op.kind, op.data), createdBy: op.data?.createdBy || actor.id, createdAt: op.data?.createdAt || at };
    if (op.kind === 'box') data.number = await nextFreeBoxNumber(store, data.number, op.id);
    if ((op.kind === 'box' || op.kind === 'item') && !data.ownerId) data.ownerId = actor.id;
  } else if (op.type === 'delete') {
    data = { ...current.data, deletedAt: at, deletedBy: actor.id };
  } else if (op.type === 'restore') {
    data = { ...current.data, deletedAt: null, deletedBy: null };
    if (op.kind === 'box') data.number = await nextFreeBoxNumber(store, data.number, op.id);
  } else {
    data = { ...current.data, ...cleanData(op.kind, op.data), updatedAt: at, updatedBy: actor.id };
    if (op.kind === 'box' && 'number' in (op.data || {})) data.number = await nextFreeBoxNumber(store, op.data.number, op.id);
  }
  const rows = [{ id: op.id, kind: op.kind, data }];

  // Box privacy or deletion changes how its contents look to others: re-save the contents so delta sync picks them up.
  if (op.kind === 'box' && current && (data.private !== current.data.private || op.type === 'delete' || op.type === 'restore')) {
    const contents = (await store.listKind('item')).filter((i) => i.data.boxId === op.id);
    for (const item of contents) {
      if (op.type === 'delete' && !item.data.deletedAt) rows.push({ ...item, data: { ...item.data, deletedAt: at, deletedBy: actor.id, deletedWithBox: op.id } });
      else if (op.type === 'restore' && item.data.deletedWithBox === op.id) rows.push({ ...item, data: { ...item.data, deletedAt: null, deletedBy: null, deletedWithBox: null } });
      else rows.push(item);
    }
  }
  const saved = await store.put(rows);
  return { saved, summary: extraSummary };
}

function activityRow(opId, actor, op, summary, records) {
  const rec = records.get(op.id);
  const target = rec?.data || op.data || {};
  const box = target.boxId ? records.get(target.boxId) : null;
  const privateTo = target.private ? ownerOf({ data: target }) : box?.data?.private ? ownerOf(box) : null;
  return { id: `act_${opId}`, kind: 'activity', data: { actorId: actor.id, summary, entityKind: op.kind, entityId: op.id, opType: op.type, at: nowIso(), privateTo } };
}

function notificationRows(opId, actor, toIds, text, op, requestId = null) {
  return [...new Set(toIds)].filter((to) => to && to !== actor.id && to !== FAMILY).map((toId) => ({
    id: `ntf_${opId}_${toId}`, kind: 'notification',
    data: { toId, actorId: actor.id, text, link: { kind: op.kind, id: op.id }, requestId, read: false, createdAt: nowIso() }
  }));
}

export async function handleMutate(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed' });
  if (req.headers['x-hi'] !== '1') return send(res, 400, { ok: false, error: 'Missing app header' });
  const store = await getStore();
  const actor = await currentActor(req, store);
  if (!actor) return send(res, 401, { ok: false, error: 'Please sign in again.' });
  const body = await readBody(req);
  const ops = Array.isArray(body.ops) ? body.ops.slice(0, 200) : [];
  const results = [];
  const actorName = actor.data.name;

  for (const op of ops) {
    try {
      if (!op.opId || !ID_RE.test(op.opId)) throw new Error('Bad op id');
      if (op.type === 'decide' || op.type === 'cancel') {
        results.push(await decideRequest(store, actor, op));
        continue;
      }
      if (!['create', 'update', 'delete', 'restore'].includes(op.type)) throw new Error('Unknown op');
      if (!op.id) op.id = `${KIND_PREFIX[op.kind] || op.kind}_${op.opId}`;
      op.announce = op.kind === 'section' && op.announce?.levelId ? { levelId: String(op.announce.levelId).slice(0, 80), reorganized: Boolean(op.announce.reorganized) } : undefined;
      if (!ID_RE.test(op.id)) throw new Error('Bad id');
      const records = await loadContext(store, [op], actor);
      if (op.type === 'create' && records.has(op.id)) {
        // Retried create: it already landed.
        results.push({ opId: op.opId, status: 'applied', records: [records.get(op.id)].map((r) => viewFor(r, actor.id, records)) });
        continue;
      }
      if (op.type !== 'create' && !records.has(op.id)) throw new Error('That no longer exists');
      const verdict = decide(actor, op, records);
      const summary = describeOp(op, records, actorName);

      if (verdict.mode === 'deny') { results.push({ opId: op.opId, status: 'denied', error: verdict.reason }); continue; }

      if (verdict.mode === 'request') {
        const approverName = records.get(verdict.approverId)?.data?.name || 'the owner';
        const requestId = `req_${op.opId}`;
        const askText = describeAsk(op, records);
        const request = {
          id: requestId, kind: 'request',
          data: { requesterId: actor.id, approverId: verdict.approverId, op: { ...op }, summary, ask: askText, note: String(op.note || '').slice(0, 300), status: 'pending', createdAt: nowIso() }
        };
        const saved = await store.put([request, ...notificationRows(op.opId, actor, [verdict.approverId], `${actorName} wants to ${askText}`, op, requestId)]);
        results.push({ opId: op.opId, status: 'pending', requestId, approverName, records: saved.map((r) => viewFor(r, actor.id, records)).filter(Boolean) });
        continue;
      }

      const { saved } = await applyOp(store, op, records, actor);
      let notifyIds = verdict.notify;
      let noteText = summary;
      if (op.kind === 'section' && op.announce?.levelId) {
        // New shelf photo: tell everyone who keeps things on that shelf.
        const onShelf = [...await store.listKind('box'), ...await store.listKind('item')].filter((r) => !r.data.deletedAt && !r.data.boxId
          && r.data.sectionId === op.id && r.data.levelId === op.announce.levelId);
        notifyIds = [...notifyIds, ...onShelf.map((r) => ownerOf(r))];
        if (op.announce.reorganized) noteText = `${summary} — check where your things ended up`;
      }
      const extra = await store.put([
        activityRow(op.opId, actor, op, summary, new Map([...records, ...saved.map((r) => [r.id, r])])),
        ...notificationRows(op.opId, actor, notifyIds, noteText, op)
      ]);
      const all = new Map([...records, ...saved.map((r) => [r.id, r])]);
      results.push({ opId: op.opId, status: 'applied', records: [...saved, ...extra].map((r) => viewFor(r, actor.id, all)).filter(Boolean) });
    } catch (error) {
      results.push({ opId: op.opId, status: 'error', error: error.message });
    }
  }
  return send(res, 200, { ok: true, results });
}

async function decideRequest(store, actor, op) {
  const reqRec = (await store.getMany([op.requestId])).get(op.requestId);
  if (!reqRec || reqRec.data.status !== 'pending') return { opId: op.opId, status: 'error', error: 'That request was already handled.' };
  const r = reqRec.data;

  if (op.type === 'cancel') {
    if (r.requesterId !== actor.id) return { opId: op.opId, status: 'denied', error: 'Not your request' };
    const saved = await store.put([{ ...reqRec, data: { ...r, status: 'cancelled', decidedAt: nowIso(), decidedBy: actor.id } }]);
    return { opId: op.opId, status: 'applied', records: saved };
  }

  if (r.approverId !== actor.id) return { opId: op.opId, status: 'denied', error: 'Only the owner can answer this.' };
  const approve = op.answer === 'approve';
  const inner = r.op;
  const rows = [];
  let applied = [];
  if (approve) {
    const requester = (await store.getMany([r.requesterId])).get(r.requesterId) || actor;
    const records = await loadContext(store, [inner], requester);
    if (inner.type !== 'create' && !records.has(inner.id)) return { opId: op.opId, status: 'error', error: 'That thing no longer exists.' };
    if (!(inner.type === 'create' && records.has(inner.id))) {
      ({ saved: applied } = await applyOp(store, inner, records, requester));
      rows.push(activityRow(inner.opId, requester, inner, `${r.summary} (OK’d by ${actor.data.name})`, records));
    }
  }
  const decided = { ...reqRec, data: { ...r, status: approve ? 'approved' : 'denied', decidedAt: nowIso(), decidedBy: actor.id, reply: String(op.reply || '').slice(0, 300) } };
  rows.push(decided);
  const text = `${actor.data.name} said ${approve ? 'yes' : 'no'} to: ${r.ask || r.summary}${op.reply ? ` — “${op.reply}”` : ''}`;
  rows.push(...notificationRows(`${op.opId}_answer`, actor, [r.requesterId], text, inner, op.requestId));
  // Clear the approver's own "asking" notification.
  const askId = `ntf_${inner.opId}_${actor.id}`;
  const ask = (await store.getMany([askId])).get(askId);
  if (ask) rows.push({ ...ask, data: { ...ask.data, read: true } });
  const saved = await store.put(rows);
  return { opId: op.opId, status: 'applied', records: [...applied, ...saved].map((x) => viewFor(x, actor.id, new Map())).filter(Boolean) };
}

// ---------- /api/photo ----------

export async function handlePhoto(req, res) {
  const store = await getStore();
  const actor = await currentActor(req, store);
  if (!actor) return send(res, 401, { ok: false, error: 'Please sign in again.' });

  if (req.method === 'GET') {
    const q = queryOf(req);
    const id = q.get('id') || '';
    if (!ID_RE.test(id)) return send(res, 400, { ok: false, error: 'Bad photo id' });
    const photo = await store.getPhoto(`${id}${q.get('s') === 't' ? '_t' : ''}.jpg`);
    if (!photo) return send(res, 404, { ok: false, error: 'Photo not found' });
    res.statusCode = 200;
    res.setHeader('Content-Type', photo.type);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.end(photo.buffer);
  }

  if (req.method !== 'POST' || req.headers['x-hi'] !== '1') return send(res, 405, { ok: false, error: 'Method not allowed' });
  const body = await readBody(req);
  if (!ID_RE.test(body.id || '')) return send(res, 400, { ok: false, error: 'Bad photo id' });
  const decode = (dataUrl) => Buffer.from(String(dataUrl || '').replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const full = decode(body.full), thumb = decode(body.thumb);
  if (!full.length || full.length > 4_000_000 || thumb.length > 1_000_000) return send(res, 413, { ok: false, error: 'Photo is too big' });
  await store.putPhoto(`${body.id}.jpg`, full, 'image/jpeg');
  if (thumb.length) await store.putPhoto(`${body.id}_t.jpg`, thumb, 'image/jpeg');
  return send(res, 200, { ok: true, id: body.id });
}

// ---------- /api/cron (keeps the free database awake) ----------

export async function handleCron(req, res) {
  const store = await getStore();
  await store.ping();
  return send(res, 200, { ok: true, store: store.name, at: nowIso() });
}

// ---------- /.well-known/assetlinks.json (lets the Android app open full-screen with no browser bar) ----------

export async function handleAssetLinks(req, res) {
  const fingerprints = String(process.env.ANDROID_CERT_SHA256 || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end(JSON.stringify(fingerprints.length ? [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: process.env.ANDROID_PACKAGE || 'com.cak3d.homeinventory', sha256_cert_fingerprints: fingerprints }
  }] : []));
}

export function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(res, 500, { ok: false, error: error.message || 'Server error' });
    }
  };
}

export const routes = {
  '/api/auth': withErrors(handleAuth),
  '/api/sync': withErrors(handleSync),
  '/api/mutate': withErrors(handleMutate),
  '/api/photo': withErrors(handlePhoto),
  '/api/cron': withErrors(handleCron),
  '/api/assetlinks': withErrors(handleAssetLinks),
  '/.well-known/assetlinks.json': withErrors(handleAssetLinks)
};

export { thingLabel };
