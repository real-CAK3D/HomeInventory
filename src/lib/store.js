// The app's data layer: a local copy of every record, an outbox of changes waiting to reach the
// server, and a sync loop. Changes show instantly; anything that needs someone's OK becomes a request.
import { useMemo, useSyncExternalStore } from 'react';
import { idb } from './idb.js';
import { decide, describeOp, newId, nowIso, FAMILY, DEFAULT_PREFS, sectionLabel, levelLabel, boxLabel } from '../../shared/model.js';

const SYNC_EVERY_MS = 20000;

let records = new Map();
let me = null;
let cursor = null;
let outbox = [];
let version = 0;
let profilesCache = [];
const listeners = new Set();
const notifyHandlers = new Set();
export const status = { ready: false, online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false, lastSync: null, error: null, signedIn: false };

function emit() {
  version += 1;
  index = null;
  for (const fn of listeners) fn();
}
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function useVersion() { return useSyncExternalStore(subscribe, () => version); }
export function onNotification(fn) { notifyHandlers.add(fn); return () => notifyHandlers.delete(fn); }

// ---------- persistence ----------

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    idb.set('kv', 'records', [...records.values()]);
    idb.set('kv', 'meta', { me, cursor, profiles: profilesCache });
  }, 400);
}
const persistOutbox = () => idb.set('kv', 'outbox', outbox);

// ---------- api ----------

async function api(path, body) {
  const init = body === undefined ? { credentials: 'same-origin', cache: 'no-store' } : {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-hi': '1' }, body: JSON.stringify(body)
  };
  const response = await fetch(path, init);
  let json = null;
  try { json = await response.json(); } catch { /* empty */ }
  if (response.status === 401 && path !== '/api/auth') {
    status.signedIn = false;
    emit();
  }
  return { status: response.status, ok: response.ok && json?.ok !== false, json: json || {} };
}

// ---------- start up / auth ----------

export async function boot() {
  const meta = (await idb.get('kv', 'meta')) || {};
  const saved = (await idb.get('kv', 'records')) || [];
  outbox = (await idb.get('kv', 'outbox')) || [];
  profilesCache = meta.profiles || [];
  if (meta.me) {
    me = meta.me;
    cursor = meta.cursor || null;
    records = new Map(saved.map((r) => [r.id, r]));
  }
  try {
    const r = await api('/api/auth');
    if (r.ok) {
      profilesCache = r.json.profiles || [];
      if (r.json.me !== me) resetLocal(r.json.me);
      status.signedIn = Boolean(r.json.me);
    }
  } catch {
    // Offline: trust the cached session so the inventory still opens.
    status.signedIn = Boolean(me);
  }
  status.ready = true;
  emit();
  if (status.signedIn) sync();
  startLoop();
}

function resetLocal(newMe) {
  me = newMe || null;
  cursor = null;
  records = new Map();
  if (!newMe) { outbox = []; persistOutbox(); }
  persist();
}

export function loginProfiles() { return profilesCache; }

export async function login(profileId, pin, newPin) {
  const r = await api('/api/auth', { action: 'login', profileId, pin, newPin });
  if (r.json.needsNewPin) return { needsNewPin: true, error: r.json.error };
  if (!r.ok) return { error: r.json.error || 'Could not sign in. Check the internet connection.' };
  resetLocal(r.json.me);
  status.signedIn = true;
  emit();
  await sync();
  return { ok: true };
}

export async function logout() {
  // Send anything still waiting first, so switching person never throws away unsent changes.
  await flushOutbox();
  if (outbox.length) {
    toast('Some changes haven’t sent yet. Connect to Wi-Fi first, then switch person.', { tone: 'error' });
    return false;
  }
  try { await api('/api/auth', { action: 'logout' }); } catch { /* offline */ }
  resetLocal(null);
  status.signedIn = false;
  const r = await api('/api/auth').catch(() => null);
  if (r?.ok) profilesCache = r.json.profiles || profilesCache;
  emit();
}

export async function authAction(body) {
  const r = await api('/api/auth', body);
  if (r.ok && body.action === 'addProfile') await sync();
  return r.ok ? { ok: true, ...r.json } : { error: r.json.error || 'That did not work.' };
}

// ---------- sync ----------

const pendingIds = () => new Set(outbox.filter((e) => e.op && e.predicted === 'apply').map((e) => e.op.id));

function absorb(list, { full = false, quietNotes = false } = {}) {
  const keep = pendingIds();
  if (full) {
    const next = new Map();
    for (const id of keep) if (records.has(id)) next.set(id, records.get(id));
    records = next;
  }
  const fresh = [];
  for (const rec of list) {
    if (keep.has(rec.id)) continue;
    if (rec.gone) { records.delete(rec.id); continue; }
    if (rec.kind === 'notification' && !records.has(rec.id) && !rec.data.read) fresh.push(rec);
    records.set(rec.id, rec);
  }
  if (!quietNotes && !full) for (const note of fresh) for (const fn of notifyHandlers) fn(note);
}

let syncPromise = null;
export function sync() {
  if (syncPromise) return syncPromise;
  if (!status.signedIn) return Promise.resolve();
  syncPromise = (async () => {
    status.syncing = true;
    emit();
    try {
      await flushOutbox();
      const firstLoad = !cursor;
      const r = await api(`/api/sync${cursor ? `?since=${encodeURIComponent(cursor)}` : ''}`);
      if (!r.ok) throw new Error(r.json.error || `Sync failed (${r.status})`);
      if (r.json.me && r.json.me !== me) resetLocal(r.json.me);
      absorb(r.json.records || [], { full: r.json.full, quietNotes: firstLoad });
      cursor = r.json.cursor;
      status.online = true;
      status.error = null;
      status.lastSync = nowIso();
      persist();
    } catch (error) {
      status.error = navigator.onLine ? error.message : null;
      status.online = navigator.onLine && !/fetch|network/i.test(error.message);
    } finally {
      status.syncing = false;
      syncPromise = null;
      emit();
    }
  })();
  return syncPromise;
}

let loopStarted = false;
function startLoop() {
  if (loopStarted) return;
  loopStarted = true;
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, SYNC_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('online', () => { status.online = true; emit(); sync(); });
  window.addEventListener('offline', () => { status.online = false; emit(); });
}

// ---------- outbox ----------

let flushing = false;
async function flushOutbox() {
  if (flushing || !outbox.length || !navigator.onLine) return;
  flushing = true;
  try {
    while (outbox.length) {
      const head = outbox[0];
      if (head.photo) {
        const ok = await uploadPhoto(head.photo);
        if (!ok) break;
        outbox.shift();
        persistOutbox();
        continue;
      }
      const batch = [];
      while (batch.length < 40 && outbox[batch.length]?.op) batch.push(outbox[batch.length]);
      const r = await api('/api/mutate', { ops: batch.map((e) => ({ ...e.op, note: e.note })) });
      if (r.status === 401 || !r.ok) break;
      const byOp = new Map((r.json.results || []).map((x) => [x.opId, x]));
      outbox = outbox.slice(batch.length);
      persistOutbox();
      for (const entry of batch) handleResult(entry, byOp.get(entry.op.opId));
      emit();
    }
  } catch { /* offline: try again later */ } finally {
    flushing = false;
    persist();
  }
}

function handleResult(entry, result) {
  if (!result) return;
  if (result.status === 'applied' || result.status === 'pending') {
    for (const rec of result.records || []) {
      if (rec.gone) records.delete(rec.id); else records.set(rec.id, rec);
    }
    if (result.status === 'pending' && entry.predicted === 'apply') {
      revert(entry);
      toast(`That needs ${result.approverName || 'the owner'}’s OK — we asked them for you.`, { tone: 'info' });
    }
  } else {
    revert(entry);
    toast(result.error || 'That change did not save.', { tone: 'error' });
  }
}

function revert(entry) {
  for (const [id, prev] of entry.prev || []) {
    if (prev) records.set(id, prev); else records.delete(id);
  }
}

// ---------- optimistic local apply (mirrors the server) ----------

function localApply(op) {
  const changed = [];
  const at = nowIso();
  const save = (rec) => { changed.push([rec.id, records.get(rec.id) || null]); records.set(rec.id, rec); };
  const cur = records.get(op.id);
  if (op.type === 'create') {
    save({ id: op.id, kind: op.kind, data: { ownerId: op.kind === 'box' || op.kind === 'item' ? me : undefined, ...op.data, createdBy: me, createdAt: at }, local: true });
  } else if (op.type === 'delete' && cur) {
    save({ ...cur, data: { ...cur.data, deletedAt: at, deletedBy: me } });
    if (op.kind === 'box') for (const item of records.values()) if (item.kind === 'item' && item.data.boxId === op.id && !item.data.deletedAt) save({ ...item, data: { ...item.data, deletedAt: at, deletedWithBox: op.id } });
  } else if (op.type === 'restore' && cur) {
    save({ ...cur, data: { ...cur.data, deletedAt: null, deletedBy: null } });
    if (op.kind === 'box') for (const item of records.values()) if (item.kind === 'item' && item.data.deletedWithBox === op.id) save({ ...item, data: { ...item.data, deletedAt: null, deletedWithBox: null } });
  } else if (op.type === 'update' && cur) {
    save({ ...cur, data: { ...cur.data, ...op.data, updatedAt: at, updatedBy: me } });
  }
  return changed;
}

function inverseOf(op, prevRec) {
  if (op.type === 'create') return { type: 'delete', kind: op.kind, id: op.id };
  if (op.type === 'delete') return { type: 'restore', kind: op.kind, id: op.id };
  if (op.type === 'restore') return { type: 'delete', kind: op.kind, id: op.id };
  if (op.type === 'update' && prevRec) {
    const back = {};
    for (const key of Object.keys(op.data || {})) back[key] = prevRec.data[key] ?? null;
    return { type: 'update', kind: op.kind, id: op.id, data: back };
  }
  return null;
}

/**
 * Make a change. Returns 'apply' | 'request' | 'deny'.
 * opts: { note, quiet, undo: boolean, message }
 */
export function mutate(op, opts = {}) {
  const actor = records.get(me);
  if (!actor) { toast('Still loading — try again in a moment.', { tone: 'error' }); return 'deny'; }
  const full = { ...op, opId: newId('op') };
  if (!full.id) full.id = newId({ box: 'box', item: 'itm', section: 'sec' }[op.kind] || op.kind);
  const verdict = decide(actor, full, records);
  if (verdict.mode === 'deny') {
    toast(verdict.reason || 'You can’t change that.', { tone: 'error' });
    return 'deny';
  }
  const prevRec = records.get(full.id) || null;
  const summary = describeOp(full, records, 'You');
  let prev = [];
  if (verdict.mode === 'apply') prev = localApply(full);
  outbox.push({ op: full, prev, predicted: verdict.mode, note: opts.note || '' });
  persistOutbox();
  emit();
  persist();
  if (verdict.mode === 'request') {
    const who = records.get(verdict.approverId)?.data?.name || 'the owner';
    toast(`Sent to ${who} to OK. We’ll let you know.`, { tone: 'info', icon: 'send' });
  } else if (!opts.quiet) {
    const inverse = opts.undo === false ? null : inverseOf(full, prevRec);
    toast(opts.message || summary, { tone: 'ok', undo: inverse ? () => mutate(inverse, { quiet: false, undo: false, message: 'Undone' }) : null });
  }
  flushSoon();
  return verdict.mode;
}

let flushTimer = null;
function flushSoon() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushOutbox().then(emit); }, 250);
}

export function answerRequest(requestId, answer, reply = '') {
  const req = records.get(requestId);
  if (req) records.set(requestId, { ...req, data: { ...req.data, status: answer === 'approve' ? 'approved' : 'denied' } });
  outbox.push({ op: { type: 'decide', opId: newId('op'), requestId, answer, reply }, prev: [[requestId, req]], predicted: 'apply' });
  persistOutbox();
  emit();
  flushSoon();
}

export function cancelRequest(requestId) {
  const req = records.get(requestId);
  if (req) records.set(requestId, { ...req, data: { ...req.data, status: 'cancelled' } });
  outbox.push({ op: { type: 'cancel', opId: newId('op'), requestId }, prev: [[requestId, req]], predicted: 'apply' });
  persistOutbox();
  emit();
  flushSoon();
}

export function markNotificationsRead(ids) {
  for (const id of ids) {
    const n = records.get(id);
    if (n && !n.data.read) mutate({ type: 'update', kind: 'notification', id, data: { read: true } }, { quiet: true, undo: false });
  }
}

export const pendingCount = () => outbox.length;

// ---------- photos ----------

const photoUrls = new Map();

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = () => reject(new Error('That file is not a picture we can read.'));
    img.src = url;
  });
}

function shrink(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Compress a camera photo, keep it on the phone, and queue it for upload. Returns the photo id. */
export async function addPhoto(file) {
  const img = await loadImage(file);
  const [full, thumb] = await Promise.all([shrink(img, 1600, 0.82), shrink(img, 480, 0.72)]);
  const id = newId('ph');
  await idb.set('photos', id, { full, thumb });
  photoUrls.set(`${id}:t`, URL.createObjectURL(thumb));
  photoUrls.set(`${id}:f`, URL.createObjectURL(full));
  outbox.push({ photo: id });
  persistOutbox();
  flushSoon();
  return id;
}

const blobToDataUrl = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsDataURL(blob);
});

async function uploadPhoto(id) {
  const local = await idb.get('photos', id);
  if (!local) return true;
  try {
    const r = await api('/api/photo', { id, full: await blobToDataUrl(local.full), thumb: await blobToDataUrl(local.thumb) });
    if (!r.ok && r.status !== 413) return false;
    // Keep the small thumbnail for offline browsing; the big one now lives on the server.
    await idb.set('photos', id, { thumb: local.thumb, uploaded: true });
    return true;
  } catch { return false; }
}

/** Resolve a photo id to something an <img> can show, preferring the copy on this phone. */
export async function photoSrc(id, size = 't') {
  const key = `${id}:${size}`;
  if (photoUrls.has(key)) return photoUrls.get(key);
  const local = await idb.get('photos', id);
  const blob = size === 'f' ? local?.full : local?.thumb;
  if (blob) {
    const url = URL.createObjectURL(blob);
    photoUrls.set(key, url);
    return url;
  }
  return `/api/photo?id=${encodeURIComponent(id)}${size === 't' ? '&s=t' : ''}`;
}

export function cachedPhotoSrc(id, size = 't') { return photoUrls.get(`${id}:${size}`) || null; }

// ---------- toasts ----------

let toasts = [];
const toastListeners = new Set();
export function toast(text, opts = {}) {
  const t = { id: Math.random().toString(36).slice(2), text, ...opts };
  toasts = [...toasts.slice(-2), t];
  toastListeners.forEach((fn) => fn());
  setTimeout(() => dismissToast(t.id), opts.undo ? 6500 : 3800);
}
export function dismissToast(id) { toasts = toasts.filter((t) => t.id !== id); toastListeners.forEach((fn) => fn()); }
export function useToasts() {
  return useSyncExternalStore((fn) => { toastListeners.add(fn); return () => toastListeners.delete(fn); }, () => toasts);
}

// ---------- derived views ----------

let index = null;
function live(rec) { return rec && !rec.data?.deletedAt; }

function buildIndex() {
  const profiles = [], sections = [], boxes = [], items = [], notifications = [], requests = [], activity = [], trash = [];
  let settings = { data: { householdName: 'Our Home', categories: [] } };
  for (const rec of records.values()) {
    switch (rec.kind) {
      case 'profile': if (live(rec)) profiles.push(rec); break;
      case 'section': if (live(rec)) sections.push(rec); break;
      case 'box': if (live(rec)) boxes.push(rec); else trash.push(rec); break;
      case 'item': if (live(rec)) items.push(rec); else if (!rec.data.deletedWithBox) trash.push(rec); break;
      case 'notification': if (rec.data.toId === me) notifications.push(rec); break;
      case 'request': requests.push(rec); break;
      case 'activity': activity.push(rec); break;
      case 'settings': settings = rec; break;
      default: break;
    }
  }
  const order = ['andrew', 'victoria', 'cork', 'zayne'];
  profiles.sort((a, b) => ((order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99)) || a.data.name.localeCompare(b.data.name));
  sections.sort((a, b) => (a.data.number || 0) - (b.data.number || 0));
  boxes.sort((a, b) => (a.data.number || 0) - (b.data.number || 0));
  items.sort((a, b) => (a.data.name || '').localeCompare(b.data.name || ''));
  notifications.sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt));
  activity.sort((a, b) => b.data.at.localeCompare(a.data.at));
  requests.sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt));
  trash.sort((a, b) => (b.data.deletedAt || '').localeCompare(a.data.deletedAt || ''));

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const sectionByNumber = new Map(sections.map((s) => [Number(s.data.number), s]));
  const boxById = new Map(boxes.map((b) => [b.id, b]));
  const boxByNumber = new Map(boxes.map((b) => [Number(b.data.number), b]));
  const itemsByBox = new Map();
  const looseByShelf = new Map();
  const boxesByShelf = new Map();
  for (const box of boxes) {
    const key = `${box.data.sectionId}|${box.data.levelId}`;
    if (!boxesByShelf.has(key)) boxesByShelf.set(key, []);
    boxesByShelf.get(key).push(box);
  }
  for (const item of items) {
    if (item.data.boxId && boxById.has(item.data.boxId)) {
      if (!itemsByBox.has(item.data.boxId)) itemsByBox.set(item.data.boxId, []);
      itemsByBox.get(item.data.boxId).push(item);
    } else {
      const key = `${item.data.sectionId}|${item.data.levelId}`;
      if (!looseByShelf.has(key)) looseByShelf.set(key, []);
      looseByShelf.get(key).push(item);
    }
  }
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const mine = records.get(me);
  const prefs = { ...DEFAULT_PREFS, ...(mine?.data?.prefs || {}) };
  const categories = settings.data.categories || [];
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  /** Where is a box or item? → { section, levelId, box, trail: string[] } */
  function whereIs(rec) {
    if (!rec) return null;
    let box = null, sectionId = rec.data.sectionId, levelId = rec.data.levelId;
    if (rec.kind === 'item' && rec.data.boxId) {
      box = boxById.get(rec.data.boxId) || null;
      if (box) { sectionId = box.data.sectionId; levelId = box.data.levelId; }
    }
    const section = sectionById.get(sectionId) || null;
    const trail = [];
    if (section) trail.push(sectionLabel(section), levelLabel(section, levelId));
    if (box) trail.push(boxLabel(box));
    return { section, levelId, box, trail };
  }

  return {
    me, mine, isAdmin: mine?.data?.role === 'admin', prefs, settings, categories, categoryById,
    profiles, profileById, sections, sectionById, sectionByNumber, boxes, boxById, boxByNumber, items,
    itemsByBox, looseByShelf, boxesByShelf, notifications, unread: notifications.filter((n) => !n.data.read).length,
    requestsToMe: requests.filter((r) => r.data.approverId === me && r.data.status === 'pending'),
    requestsFromMe: requests.filter((r) => r.data.requesterId === me),
    activity, trash, whereIs, get: (id) => records.get(id) || null,
    nameOf: (id) => (id === FAMILY ? 'Family' : profileById.get(id)?.data?.name || 'Someone')
  };
}

export function getIndex() {
  if (!index) index = buildIndex();
  return index;
}

export function useIndex() {
  const v = useVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getIndex(), [v]);
}

export function exportAll() {
  return { exportedAt: nowIso(), records: [...records.values()].filter((r) => r.kind !== 'notification') };
}
