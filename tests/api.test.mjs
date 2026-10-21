// Run with: npm test   (uses a throwaway local data folder)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-test-'));
process.env.HOME_INVENTORY_DATA_DIR = dir;
delete process.env.SUPABASE_URL;
const { routes } = await import('../server/core.js');

const jars = {};
async function call(who, method, url, body) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { method, url, headers: { host: 'localhost', cookie: jars[who] || '', 'x-hi': '1', 'content-type': 'application/json' } });
  const res = {
    statusCode: 200, headers: {}, headersSent: false, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(chunk) { this.body = chunk ? chunk.toString() : ''; this.headersSent = true; }
  };
  await routes[new URL(url, 'http://x').pathname](req, res);
  const cookie = res.headers['set-cookie'];
  if (cookie) jars[who] = cookie.split(';')[0];
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
}

let n = 0;
const op = (o) => ({ opId: `t${++n}x${Date.now()}`, ...o });
const mutate = async (who, ...ops) => (await call(who, 'POST', '/api/mutate', { ops })).json.results;

async function signIn(who) {
  const first = await call(who, 'POST', '/api/auth', { action: 'login', profileId: who, pin: '0000' });
  assert.equal(first.json.needsNewPin, true);
  const done = await call(who, 'POST', '/api/auth', { action: 'login', profileId: who, pin: '0000', newPin: '1234' });
  assert.equal(done.json.ok, true);
}

test('seeds profiles and hides pins', async () => {
  const r = await call('anon', 'GET', '/api/auth');
  assert.equal(r.json.profiles.length, 4);
  assert.ok(!JSON.stringify(r.json).includes('pinHash'));
  assert.equal((await call('anon', 'GET', '/api/sync')).status, 401);
});

test('sign in, wrong pin lockout', async () => {
  await signIn('andrew');
  await signIn('victoria');
  await signIn('zayne');
  for (let i = 0; i < 5; i++) await call('cork', 'POST', '/api/auth', { action: 'login', profileId: 'cork', pin: '9999' });
  const locked = await call('cork', 'POST', '/api/auth', { action: 'login', profileId: 'cork', pin: '0000' });
  assert.equal(locked.status, 429);
});

test('locks, approvals, privacy, notifications', async () => {
  const [sec] = await mutate('andrew', op({ type: 'create', kind: 'section', id: 'sec_1', data: { number: 1, levels: [{ id: 'l1', name: 'Top shelf' }] } }));
  assert.equal(sec.status, 'applied');
  const [box] = await mutate('victoria', op({ type: 'create', kind: 'box', id: 'box_v', data: { number: 5, name: 'China', sectionId: 'sec_1', levelId: 'l1', locked: true } }));
  assert.equal(box.status, 'applied');
  const [item] = await mutate('victoria', op({ type: 'create', kind: 'item', id: 'itm_plate', data: { name: 'Gold plates', qty: 8, boxId: 'box_v' } }));
  assert.equal(item.status, 'applied');

  // Zayne cannot just remove from Victoria's locked box: it becomes a request.
  const [del] = await mutate('zayne', op({ type: 'delete', kind: 'item', id: 'itm_plate', note: 'need for party' }));
  assert.equal(del.status, 'pending');

  // Duplicate box numbers get bumped.
  const [dupe] = await mutate('zayne', op({ type: 'create', kind: 'box', id: 'box_z', data: { number: 5, sectionId: 'sec_1', levelId: 'l1', private: true } }));
  assert.notEqual(dupe.records[0].data.number, 5);
  await mutate('zayne', op({ type: 'create', kind: 'item', id: 'itm_secret', data: { name: 'Diary', boxId: 'box_z' } }));

  const vSync = (await call('victoria', 'GET', '/api/sync')).json.records;
  const reqNote = vSync.find((r) => r.kind === 'notification' && r.data?.requestId);
  assert.ok(reqNote, 'Victoria gets asked');
  assert.equal(vSync.find((r) => r.id === 'itm_secret').gone, true, 'private contents hidden');
  assert.equal(vSync.find((r) => r.id === 'box_z').data.redacted, true);
  assert.ok(!vSync.some((r) => r.kind === 'auth'));

  // Only Victoria may answer; she says yes.
  const [wrong] = await mutate('andrew', op({ type: 'decide', requestId: reqNote.data.requestId, answer: 'approve' }));
  assert.equal(wrong.status, 'denied');
  const [yes] = await mutate('victoria', op({ type: 'decide', requestId: reqNote.data.requestId, answer: 'approve', reply: 'ok!' }));
  assert.equal(yes.status, 'applied');
  const zSync = (await call('zayne', 'GET', '/api/sync')).json.records;
  assert.ok(zSync.find((r) => r.id === 'itm_plate').data.deletedAt, 'removed after approval');
  assert.ok(zSync.some((r) => r.kind === 'notification' && /said yes/.test(r.data?.text)));

  // Unlocked thing owned by someone else: applied, owner told.
  await mutate('andrew', op({ type: 'create', kind: 'item', id: 'itm_drill', data: { name: 'Drill', sectionId: 'sec_1', levelId: 'l1' } }));
  const [edit] = await mutate('zayne', op({ type: 'update', kind: 'item', id: 'itm_drill', data: { status: 'out', outBy: 'zayne' } }));
  assert.equal(edit.status, 'applied');
  const aSync = (await call('andrew', 'GET', '/api/sync')).json.records;
  assert.ok(aSync.some((r) => r.kind === 'notification' && /took out Drill/.test(r.data?.text)));

  // Delta sync returns only recent changes.
  const cursor = (await call('andrew', 'GET', '/api/sync')).json.cursor;
  const later = (await call('andrew', 'GET', `/api/sync?since=${encodeURIComponent(cursor)}`)).json;
  assert.equal(later.full, false);
});

test('new shelf photo tells everyone with things on that shelf', async () => {
  const [r] = await mutate('andrew', op({ type: 'update', kind: 'section', id: 'sec_1', data: { levels: [{ id: 'l1', name: 'Top shelf', photoId: 'ph_new', photoHistory: [{ photoId: 'ph_old' }] }] }, announce: { levelId: 'l1', reorganized: true } }));
  assert.equal(r.status, 'applied');
  const vSync = (await call('victoria', 'GET', '/api/sync')).json.records;
  assert.ok(vSync.some((n) => n.kind === 'notification' && /rearranged Section 1 · Top shelf/.test(n.data?.text || '') && /check where/.test(n.data.text)));
  // Moving a locked box during the check still asks its owner.
  const [mv] = await mutate('andrew', op({ type: 'update', kind: 'box', id: 'box_v', data: { levelId: 'l1', sectionId: 'sec_1', spot: 'left' } }));
  assert.equal(mv.status, 'pending');
});
