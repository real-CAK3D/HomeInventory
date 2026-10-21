// Shared by the browser and the server: data shapes, permission rules, and the
// plain-English sentences used in notifications and the activity feed.

export const FAMILY = 'family';
export const DEFAULT_PIN = '0000';

export const DEFAULT_LEVELS = ['Top shelf', 'Middle shelf', 'Bottom shelf', 'Floor'];

export const DEFAULT_CATEGORIES = [
  ['kitchen', 'Kitchen', '🍳'], ['clothes', 'Clothes', '👕'], ['books', 'Books & papers', '📚'],
  ['photos', 'Photos & keepsakes', '🖼️'], ['holiday', 'Holiday', '🎄'], ['tools', 'Tools', '🧰'],
  ['electronics', 'Electronics', '🔌'], ['linens', 'Linens & bedding', '🛏️'], ['decor', 'Decor', '🪴'],
  ['toys', 'Toys & games', '🧸'], ['medical', 'Health', '💊'], ['bath', 'Bathroom', '🛁'],
  ['crafts', 'Crafts & hobbies', '🧶'], ['other', 'Other', '📦']
].map(([id, name, emoji]) => ({ id, name, emoji }));

export const SPOTS = [
  ['', 'Anywhere'], ['left', 'Left side'], ['center', 'Middle'], ['right', 'Right side'],
  ['front', 'Front'], ['back', 'Back'], ['top', 'Stacked on top']
];

export const CONTAINERS = ['Box', 'Bin', 'Tote', 'Crate', 'Bag', 'Basket', 'Case', 'Drawer', 'Suitcase'];

/** "Bin 12" — the container type plus its number. */
export function containerName(box) {
  const d = box?.data || box || {};
  return `${d.container || 'Box'} ${d.number ?? ''}`.trim();
}

export const BOX_COLORS = ['#c8955a', '#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9b72cf', '#e56b9f', '#5bc0be', '#8d99ae', '#f4a261'];

export const PEOPLE_COLORS = ['#ff7a59', '#4f9dff', '#b07cff', '#2ec4a6', '#ffb347', '#ff5c8a', '#7bd389', '#5b8def'];

export const SEED_PROFILES = [
  { id: 'andrew', name: 'Andrew', color: '#4f9dff', emoji: '🛠️', role: 'admin' },
  { id: 'victoria', name: 'Victoria', color: '#b07cff', emoji: '🌷', role: 'member' },
  { id: 'cork', name: 'Cork', color: '#ffb347', emoji: '🎣', role: 'member' },
  { id: 'zayne', name: 'Zayne', color: '#2ec4a6', emoji: '🎮', role: 'member' }
];

export const DEFAULT_PREFS = { textSize: 'standard', theme: 'auto', motion: 'full', onEdit: 'tell', onRemove: 'ask', sound: true };

export function newId(prefix) {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 18);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function nowIso() { return new Date().toISOString(); }

export const isLive = (rec) => rec && !rec.gone && !rec.data?.deletedAt;

// ---------- naming ----------

export function sectionLabel(section) {
  if (!section) return 'Unknown section';
  const d = section.data || section;
  return d.name?.trim() ? d.name : `Section ${d.number}`;
}

export function levelLabel(section, levelId) {
  const d = section?.data || section;
  return d?.levels?.find((l) => l.id === levelId)?.name || 'Shelf';
}

export function boxLabel(box) {
  if (!box) return 'a box';
  const d = box.data || box;
  return d.name?.trim() ? `${containerName(d)} (${d.name})` : containerName(d);
}

export function thingLabel(rec) {
  if (!rec) return 'something';
  if (rec.kind === 'box') return boxLabel(rec);
  if (rec.kind === 'item') return rec.data.qty > 1 ? `${rec.data.qty}× ${rec.data.name}` : rec.data.name || 'an item';
  if (rec.kind === 'section') return sectionLabel(rec);
  if (rec.kind === 'profile') return rec.data.name;
  return rec.kind;
}

// ---------- permissions ----------

export function ownerOf(rec) { return rec?.data?.ownerId || FAMILY; }

/** Who must approve a change to rec (null when nobody needs to). */
export function protectorOf(rec, records, actorId) {
  if (!rec) return null;
  const owner = ownerOf(rec);
  if (rec.data.locked && owner !== FAMILY && owner !== actorId) return owner;
  if (rec.kind === 'item' && rec.data.boxId) {
    const box = records.get(rec.data.boxId);
    if (box && box.data.locked && ownerOf(box) !== FAMILY && ownerOf(box) !== actorId) return ownerOf(box);
  }
  return null;
}

function boxGuard(boxId, records, actorId) {
  if (!boxId) return null;
  const box = records.get(boxId);
  if (box && box.data.locked && ownerOf(box) !== FAMILY && ownerOf(box) !== actorId) return ownerOf(box);
  return null;
}

/**
 * Decide what happens when actor runs op.
 * Returns { mode: 'apply' | 'request' | 'deny', approverId?, notify: string[], reason? }
 */
export function decide(actor, op, records) {
  const actorId = actor.id;
  const isAdmin = actor.data?.role === 'admin';
  const current = op.id ? records.get(op.id) : null;
  const notify = [];
  const deny = (reason) => ({ mode: 'deny', notify, reason });

  if (op.kind === 'auth' || op.kind === 'activity') return deny('Not allowed');

  if (op.kind === 'notification') {
    if (op.type !== 'update' || !current || current.data.toId !== actorId) return deny('Not your notification');
    return { mode: 'apply', notify };
  }

  if (op.kind === 'profile') {
    if (op.type === 'create' || op.type === 'delete' || op.type === 'restore') return isAdmin ? { mode: 'apply', notify } : deny('Only an admin can add or remove people');
    if (!current) return deny('Unknown person');
    if (current.id !== actorId && !isAdmin) return deny('You can only change your own profile');
    if ('role' in (op.data || {}) && !isAdmin) return deny('Only an admin can change roles');
    return { mode: 'apply', notify };
  }

  if (op.kind === 'section' || op.kind === 'settings') {
    if (op.type === 'delete' && !isAdmin) return deny('Only an admin can remove a whole section');
    return { mode: 'apply', notify };
  }

  if (op.kind !== 'box' && op.kind !== 'item') return deny('Unknown kind');

  if (op.type === 'create') {
    const guard = op.kind === 'item' ? boxGuard(op.data?.boxId, records, actorId) : null;
    if (guard) return { mode: 'request', approverId: guard, notify: [guard] };
    // Adding to someone else's (unlocked) box: let them know unless they asked for quiet.
    const box = op.kind === 'item' && op.data?.boxId ? records.get(op.data.boxId) : null;
    const boxOwner = box ? ownerOf(box) : FAMILY;
    if (boxOwner !== FAMILY && boxOwner !== actorId) {
      const ownerPrefs = { ...DEFAULT_PREFS, ...(records.get(boxOwner)?.data?.prefs || {}) };
      if (ownerPrefs.onEdit !== 'quiet') notify.push(boxOwner);
    }
    return { mode: 'apply', notify };
  }

  if (!current) return deny('That no longer exists');
  const owner = ownerOf(current);
  if (current.data.private && owner !== actorId) return deny('That is private');

  const patch = op.data || {};
  const returning = op.type === 'update' && Object.keys(patch).every((k) => ['status', 'outBy', 'outAt', 'outNote'].includes(k)) && patch.status === 'stored';

  // Moving an item into someone else's locked box needs their OK too.
  const destGuard = op.kind === 'item' && patch.boxId && patch.boxId !== current.data.boxId ? boxGuard(patch.boxId, records, actorId) : null;
  const protector = returning ? null : protectorOf(current, records, actorId) || destGuard;
  if (protector) return { mode: 'request', approverId: protector, notify: [protector] };

  if (owner === actorId || owner === FAMILY) return { mode: 'apply', notify };

  // Unlocked but belongs to someone else: follow the owner's preferences.
  const ownerRec = records.get(owner);
  const prefs = { ...DEFAULT_PREFS, ...(ownerRec?.data?.prefs || {}) };
  if (op.type === 'delete') {
    if (prefs.onRemove === 'ask') return { mode: 'request', approverId: owner, notify: [owner] };
    return { mode: 'apply', notify: [owner] };
  }
  if (returning) return { mode: 'apply', notify: [owner] };
  if (prefs.onEdit === 'ask') return { mode: 'request', approverId: owner, notify: [owner] };
  if (prefs.onEdit === 'tell') return { mode: 'apply', notify: [owner] };
  return { mode: 'apply', notify };
}

// ---------- plain-English summaries ----------

function whereText(data, records) {
  if (data.boxId) {
    const box = records.get(data.boxId);
    return box ? boxLabel(box) : 'a box';
  }
  const section = records.get(data.sectionId);
  if (!section) return 'a shelf';
  return `${sectionLabel(section)} · ${levelLabel(section, data.levelId)}`;
}

/** The change as a phrase: verbs come in [past, plain] pairs, e.g. ['moved', 'move']. */
function opPhrase(op, records) {
  const current = op.id ? records.get(op.id) : null;
  const name = current ? thingLabel(current) : thingLabel({ kind: op.kind, data: op.data || {} });
  const patch = op.data || {};
  if (op.type === 'create') {
    if (op.kind === 'item') return [['added', 'add'], `${name} to ${whereText(patch, records)}`];
    if (op.kind === 'box') return [['added', 'add'], `${boxLabel(patch)} to ${whereText(patch, records)}`];
    return [['added', 'add'], name];
  }
  if (op.kind === 'section' && op.type === 'update' && op.announce?.levelId) {
    const shelf = `${name} · ${levelLabel(current, op.announce.levelId)}`;
    return op.announce.reorganized ? [['rearranged', 'rearrange'], `${shelf} (new photo, things moved around)`] : [['took a new photo of', 'take a new photo of'], shelf];
  }
  if (op.type === 'delete') return [['removed', 'remove'], name];
  if (op.type === 'restore') return [['brought back', 'bring back'], name];
  if (patch.status === 'out') return [['took out', 'take out'], `${name}${patch.outNote ? ` (“${patch.outNote}”)` : ''}`];
  if (patch.status === 'stored') return [['put back', 'put back'], name];
  if ('boxId' in patch || 'sectionId' in patch || 'levelId' in patch) {
    return [['moved', 'move'], `${name} to ${whereText({ ...(current?.data || {}), ...patch }, records)}`];
  }
  if ('locked' in patch) return [patch.locked ? ['locked', 'lock'] : ['unlocked', 'unlock'], name];
  if ('container' in patch && current) return [['turned', 'turn'], `${thingLabel(current)} into a ${patch.container.toLowerCase()}`];
  if ('ownerId' in patch) {
    const who = patch.ownerId === FAMILY ? 'the whole family' : records.get(patch.ownerId)?.data?.name || 'someone';
    return [['gave', 'give'], `${name} to ${who}`];
  }
  if ('photoIds' in patch || 'contentPhotoIds' in patch || 'photoId' in patch) return [['updated photos of', 'update photos of'], name];
  return [['edited', 'edit'], name];
}

/** "Victoria moved Box 12 to Section 3 · Top shelf" */
export function describeOp(op, records, actorName = 'Someone') {
  const [[past], rest] = opPhrase(op, records);
  return `${actorName} ${past} ${rest}`;
}

/** "move Box 12 to Section 3 · Top shelf" (for requests: "Zayne wants to …", "You asked to …") */
export function describeAsk(op, records) {
  const [[, plain], rest] = opPhrase(op, records);
  return `${plain} ${rest}`;
}

// ---------- visibility ----------

/** What a given viewer is allowed to receive for a record. */
export function viewFor(rec, viewerId, records) {
  if (!rec) return null;
  switch (rec.kind) {
    case 'auth': return null;
    case 'notification': return rec.data.toId === viewerId ? rec : { id: rec.id, kind: rec.kind, gone: true };
    case 'request': return rec.data.requesterId === viewerId || rec.data.approverId === viewerId ? rec : { id: rec.id, kind: rec.kind, gone: true };
    case 'activity': return !rec.data.privateTo || rec.data.privateTo === viewerId ? rec : { id: rec.id, kind: rec.kind, gone: true };
    case 'box':
      if (rec.data.private && ownerOf(rec) !== viewerId) {
        const { number, sectionId, levelId, spot, ownerId, color, deletedAt } = rec.data;
        return { ...rec, data: { number, sectionId, levelId, spot, ownerId, color, deletedAt, private: true, redacted: true, photoIds: [], contentPhotoIds: [] } };
      }
      return rec;
    case 'item': {
      if (rec.data.private && ownerOf(rec) !== viewerId) return { id: rec.id, kind: rec.kind, gone: true };
      const box = rec.data.boxId ? records.get(rec.data.boxId) : null;
      if (box && box.data.private && ownerOf(box) !== viewerId) return { id: rec.id, kind: rec.kind, gone: true };
      return rec;
    }
    default: return rec;
  }
}
