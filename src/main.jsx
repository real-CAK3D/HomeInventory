import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE_KEY = 'home-inventory-v3';
const LEGACY_KEYS = ['nukebox-inventory-v2', 'nukebox-inventory-v1'];
const API_STATE = '/api/state';
const DEFAULT_PIN = '0000';

const shelfLevels = ['Top', 'Middle', 'Bottom', 'Ground'];
const shelfZones = ['Whole shelf', 'Left', 'Middle', 'Right'];
const containerTypes = ['Loose item', 'Box', 'Bin', 'Bag', 'Pouch', 'Case', 'Drawer', 'Tub'];
const defaultCategories = ['Electronics', 'Documents', 'Toys', 'Clothing', 'Tools', 'Keepsakes', 'Household', 'Medical', 'School', 'Other'];
const tabs = [
  { id: 'home', label: 'Home' },
  { id: 'add', label: 'Add Item' },
  { id: 'browse', label: 'Browse' },
  { id: 'locations', label: 'Shelves' },
  { id: 'categories', label: 'Categories' },
  { id: 'settings', label: 'People' }
];

const seedUsers = [
  { id: 'andrew', name: 'Andrew', displayName: 'Andrew', pin: DEFAULT_PIN, pinSet: false, photo: '', accent: '#16766f', helperText: 'Main inventory manager' },
  { id: 'zayne', name: 'Zayne', displayName: 'Zayne', pin: DEFAULT_PIN, pinSet: false, photo: '', accent: '#2f6fc3', helperText: 'Scan and add your stuff' },
  { id: 'victoria', name: 'Victoria', displayName: 'Victoria', pin: DEFAULT_PIN, pinSet: false, photo: '', accent: '#8f5ab8', helperText: 'Simple shelf lookup' },
  { id: 'cork', name: 'Cork', displayName: 'Cork', pin: DEFAULT_PIN, pinSet: false, photo: '', accent: '#c98221', helperText: 'Shared family items' }
];

const seedItems = [
  {
    id: 'tag-001', tag: '001', title: 'Lego Mindstorms kit', ownerId: 'zayne', category: 'Toys', status: 'In', photo: '',
    content: 'EV3 brick, motor pack, sensor tray, charging cable, and build cards. Keep the small sorted bags with the main case.',
    location: { shelfNumber: '1', shelfLevel: 'Middle', shelfZone: 'Left', containerType: 'Bin', containerName: 'Robotics bin', boxSpot: 'Front row', notes: 'Blue lid, label faces out', photo: '' },
    lastEdited: '2026-06-18', history: [{ action: 'Returned', person: 'Zayne', date: '2026-06-18', note: 'Charged brick and restored sensor tray.' }]
  },
  {
    id: 'tag-002', tag: '002', title: 'Camera chargers', ownerId: 'andrew', category: 'Electronics', status: 'Out', photo: '',
    content: 'Sony dual charger, two NP-FW50 batteries, USB-C adapter, and wall plug.',
    location: { shelfNumber: '2', shelfLevel: 'Top', shelfZone: 'Right', containerType: 'Pouch', containerName: 'Travel tech pouch', boxSpot: 'Inside mesh pocket', notes: 'Usually travels with the field bag', photo: '' },
    lastEdited: '2026-06-17', history: [{ action: 'Taken', person: 'Andrew', date: '2026-06-17', note: 'Packed for field day.' }]
  },
  {
    id: 'tag-003', tag: '003', title: 'Winter gloves', ownerId: 'victoria', category: 'Clothing', status: 'In', photo: '',
    content: 'Two insulated pairs, black liners, and hand warmers. Check sizes before winter storage.',
    location: { shelfNumber: '3', shelfLevel: 'Top', shelfZone: 'Middle', containerType: 'Box', containerName: 'Seasonal clothes', boxSpot: 'Upper layer', notes: 'Clear box with gray clips', photo: '' },
    lastEdited: '2026-06-12', history: [{ action: 'Returned', person: 'Victoria', date: '2026-06-12', note: 'Washed and paired.' }]
  },
  {
    id: 'tag-004', tag: '004', title: 'Document pouch', ownerId: 'cork', category: 'Documents', status: 'In', photo: '',
    content: 'Insurance cards, vehicle copies, emergency contacts, and medical notes.',
    location: { shelfNumber: '1', shelfLevel: 'Top', shelfZone: 'Whole shelf', containerType: 'Pouch', containerName: 'Red document pouch', boxSpot: 'Lock tray', notes: 'Keep flat and dry', photo: '' },
    lastEdited: '2026-06-10', history: [{ action: 'Returned', person: 'Cork', date: '2026-06-10', note: 'Updated contact sheet.' }]
  }
];

const defaultState = { users: seedUsers, items: seedItems, categories: defaultCategories, onboardingDone: false };

function today() { return new Date().toISOString().slice(0, 10); }
function makeId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function titleCase(value = '') { return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase(); }
function userName(users, id) { return users.find((user) => user.id === id)?.displayName || users.find((user) => user.id === id)?.name || 'Unassigned'; }
function endpointFor(tag) { return `${window.location.origin}/tag/${tag}`; }
function locationKey(location) { return `Shelf ${location.shelfNumber || '?'} ${location.shelfLevel || ''}`.trim(); }
function locationLine(location) { return `Shelf ${location.shelfNumber || '?'} · ${location.shelfLevel || 'Level'} · ${location.shelfZone || 'Placement'} · ${location.containerName || 'Container'}`; }
function emptyLocation() { return { shelfNumber: '1', shelfLevel: 'Middle', shelfZone: 'Whole shelf', containerType: 'Box', containerName: '', boxSpot: '', notes: '', photo: '' }; }
function emptyItem(users, categories, ownerId) {
  const tag = '001';
  return { id: makeId('draft'), tag, title: '', ownerId: ownerId || users[0]?.id || 'andrew', category: categories[0] || 'Other', status: 'In', photo: '', content: '', location: emptyLocation(), lastEdited: today(), history: [] };
}

function normalizeState(raw) {
  const source = raw && typeof raw === 'object' ? raw : defaultState;
  const rawUsers = Array.isArray(source.users) && source.users.length ? source.users : seedUsers;
  const users = seedUsers.map((seed) => ({ ...seed, ...(rawUsers.find((user) => user.id === seed.id) || {}) }));
  const extraUsers = rawUsers.filter((user) => user.id && !users.some((seed) => seed.id === user.id));
  const legacyOwnerMap = { Dad: 'andrew', Son: 'zayne', Parents: 'victoria', Andrew: 'andrew', Zayne: 'zayne', Victoria: 'victoria', Cork: 'cork' };
  const rawItems = Array.isArray(source.items) ? source.items : Array.isArray(source) ? source : seedItems;
  const items = (rawItems.length ? rawItems : seedItems).map((item) => ({
    ...item,
    id: item.id || makeId('item'),
    tag: String(item.tag || '001').padStart(3, '0'),
    title: item.title || 'Untitled item',
    ownerId: item.ownerId || legacyOwnerMap[item.owner] || 'andrew',
    category: item.category || 'Other',
    status: item.status || 'In',
    content: item.content || '',
    photo: item.photo || '',
    location: { ...emptyLocation(), ...(typeof item.location === 'object' ? item.location : { containerName: item.location || '' }) },
    lastEdited: item.lastEdited || today(),
    history: Array.isArray(item.history) ? item.history : []
  }));
  const categories = Array.from(new Set([...(Array.isArray(source.categories) ? source.categories : defaultCategories), ...items.map((item) => item.category).filter(Boolean)]));
  return { ...source, users: [...users, ...extraUsers], items, categories, onboardingDone: Boolean(source.onboardingDone) };
}

async function loadState() {
  try {
    const response = await fetch(API_STATE, { cache: 'no-store' });
    if (response.ok) {
      const data = normalizeState(await response.json());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return { data, source: 'Saved to cloud inventory' };
    }
  } catch {}

  for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { data: normalizeState(JSON.parse(raw)), source: 'Saved in this browser' };
    } catch {}
  }
  return { data: defaultState, source: 'Saved in this browser' };
}

async function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  try {
    const response = await fetch(API_STATE, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextState) });
    if (response.ok) return 'Saved to cloud inventory';
  } catch {}
  return 'Saved in this browser';
}

function readPhoto(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
}

function Icon({ name }) {
  const paths = {
    box: 'M21 8 12 3 3 8l9 5 9-5Z M3 8v8l9 5 9-5V8 M12 13v8',
    plus: 'M12 5v14M5 12h14',
    search: 'm21 21-4.3-4.3 M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z',
    copy: 'M8 8h10v10H8z M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1',
    trash: 'M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 11v6 M14 11v6',
    save: 'M5 3h12l2 2v16H5z M8 3v6h8V3 M8 21v-7h8v7',
    photo: 'M4 7h3l2-3h6l2 3h3v13H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    arrow: 'M5 12h14 M13 5l7 7-7 7',
    pin: 'M12 17v.01 M8 11V8a4 4 0 0 1 8 0v3 M7 11h10v10H7z',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    shelf: 'M4 5h16v14H4z M4 11h16 M10 5v14',
    user: 'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z'
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={paths[name]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Avatar({ user }) {
  return <span className="avatar" style={{ '--accent': user?.accent || '#16766f' }}>{user?.photo ? <img src={user.photo} alt="" /> : (user?.displayName || '?').slice(0, 1)}</span>;
}

function Login({ users, onLogin, onUpdateUsers }) {
  const [selectedUser, setSelectedUser] = useState(users[0]?.id || 'andrew');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [verifyPin, setVerifyPin] = useState('');
  const [message, setMessage] = useState('');
  const user = users.find((entry) => entry.id === selectedUser) || users[0];
  const needsPinSetup = user && !user.pinSet && pin === DEFAULT_PIN;

  const submit = (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setMessage('Enter a 4 digit PIN.');
    if (pin !== user.pin) return setMessage('That PIN does not match this person.');
    if (!user.pinSet) {
      if (!needsPinSetup) return setMessage('Use default PIN 0000 for first setup.');
      if (!/^\d{4}$/.test(newPin) || newPin !== verifyPin) return setMessage('Create and verify a matching 4 digit PIN.');
      const nextUsers = users.map((entry) => entry.id === user.id ? { ...entry, pin: newPin, pinSet: true } : entry);
      onUpdateUsers(nextUsers, `${user.displayName} PIN created`);
      onLogin(nextUsers.find((entry) => entry.id === user.id));
      return;
    }
    onLogin(user);
  };

  return (
    <main className="loginPage">
      <form className="loginPanel" onSubmit={submit}>
        <div className="brand loginBrand"><span className="brandMark"><Icon name="box" /></span><div><h1>Home Inventory</h1><p>Simple family storage for phones and NFC tags</p></div></div>
        <div className="helperCard"><strong>First time?</strong><span>Choose your name, enter PIN 0000, then make your own 4 digit PIN.</span></div>
        <label>Who are you?<select value={selectedUser} onChange={(event) => { setSelectedUser(event.target.value); setPin(''); setMessage(''); }}>{users.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label>
        <label>4 digit PIN<input inputMode="numeric" maxLength="4" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" /></label>
        {needsPinSetup && <div className="pinSetup"><label>New PIN<input inputMode="numeric" maxLength="4" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label><label>Verify PIN<input inputMode="numeric" maxLength="4" value={verifyPin} onChange={(event) => setVerifyPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label></div>}
        {message && <p className="formMessage">{message}</p>}
        <button className="primaryButton big" type="submit"><Icon name="pin" /> {needsPinSetup ? 'Create PIN and Enter' : 'Enter Inventory'}</button>
      </form>
    </main>
  );
}

function TagPage({ state }) {
  const tag = decodeURIComponent(window.location.pathname.split('/tag/')[1] || '');
  const item = state.items.find((entry) => entry.tag === tag);
  if (!item) return <main className="tagPage"><section className="tagDocument notFound"><p className="tagNumber">Tag {tag || 'unknown'}</p><h1>Tag not found</h1><p>This NFC tag is ready, but no item uses it yet.</p><a href="/" className="primaryButton">Open Home Inventory</a></section></main>;
  return (
    <main className="tagPage">
      <section className="tagDocument">
        <header><p className="tagNumber">Home Inventory Tag {item.tag}</p><h1>{item.title}</h1><div className="tagMeta"><span>{userName(state.users, item.ownerId)}</span><span>{item.category}</span><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span></div></header>
        <article>
          <div className="scanGrid">
            <PhotoBox src={item.photo} label="Item photo" />
            <PhotoBox src={item.location.photo} label="Shelf photo" />
          </div>
          <p>{item.content || 'No item notes saved yet.'}</p>
          <div className="locationCard"><strong>Where it lives</strong><span>{locationLine(item.location)}</span><small>{item.location.containerType} · {item.location.boxSpot || 'No spot set'} · {item.location.notes || 'No extra note'}</small></div>
        </article>
        <footer><span>Tag {item.tag}</span><span>Last edited {item.lastEdited}</span></footer>
      </section>
    </main>
  );
}

function PhotoBox({ src, label }) {
  return <div className="photoBox">{src ? <img src={src} alt="" /> : <div className="photoEmpty"><Icon name="photo" /><span>{label}</span></div>}<strong>{label}</strong></div>;
}

function App() {
  const [state, setState] = useState(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedId, setSelectedId] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [shelfFilter, setShelfFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [savedState, setSavedState] = useState('Loading');
  const [draft, setDraft] = useState(null);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => { loadState().then(({ data, source }) => { setState(data); setSelectedId(data.items[0]?.id || ''); setSavedState(source); setLoaded(true); }); }, []);

  const currentProfile = currentUser ? state.users.find((user) => user.id === currentUser.id) || currentUser : null;
  const selected = state.items.find((item) => item.id === selectedId) || state.items[0] || null;
  const shelves = useMemo(() => Array.from(new Set(state.items.map((item) => item.location.shelfNumber).filter(Boolean))).sort((a, b) => Number(a) - Number(b)), [state.items]);
  const locationGroups = useMemo(() => {
    const groups = new Map();
    state.items.forEach((item) => {
      const key = locationKey(item.location);
      if (!groups.has(key)) groups.set(key, { key, location: item.location, items: [] });
      groups.get(key).items.push(item);
    });
    return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }, [state.items]);

  const persist = async (nextState, message = 'Saved') => {
    const normalized = normalizeState(nextState);
    setState(normalized);
    const source = await saveState(normalized);
    setSavedState(`${message} · ${source}`);
    window.setTimeout(() => setSavedState(source), 2200);
  };
  const updateUsers = (users, message) => persist({ ...state, users }, message);
  const markOnboardingDone = () => persist({ ...state, onboardingDone: true }, 'Setup guide hidden');

  const filtered = useMemo(() => state.items.filter((item) => {
    const q = query.trim().toLowerCase();
    const haystack = [item.tag, item.title, item.content, item.category, userName(state.users, item.ownerId), item.location.shelfNumber, item.location.shelfLevel, item.location.shelfZone, item.location.containerType, item.location.containerName, item.location.boxSpot, item.location.notes].join(' ').toLowerCase();
    return (ownerFilter === 'all' || item.ownerId === ownerFilter)
      && (categoryFilter === 'all' || item.category === categoryFilter)
      && (shelfFilter === 'all' || item.location.shelfNumber === shelfFilter)
      && (levelFilter === 'all' || item.location.shelfLevel === levelFilter)
      && (!q || haystack.includes(q));
  }), [state.items, state.users, ownerFilter, categoryFilter, shelfFilter, levelFilter, query]);

  const startAdd = () => {
    const max = state.items.reduce((highest, item) => Math.max(highest, Number(item.tag) || 0), 0);
    const next = emptyItem(state.users, state.categories, currentProfile?.id);
    next.tag = String(max + 1).padStart(3, '0');
    next.id = makeId('tag');
    setDraft(next);
    setActiveTab('add');
  };
  const startEdit = (item = selected) => { if (item) { setDraft(JSON.parse(JSON.stringify(item))); setSelectedId(item.id); setActiveTab('add'); } };
  const saveDraft = () => {
    if (!draft.title.trim()) return setSavedState('Add an item name before saving');
    const exists = state.items.some((item) => item.id === draft.id);
    const nextDraft = { ...draft, title: draft.title.trim(), tag: String(draft.tag || '001').padStart(3, '0'), lastEdited: today(), history: exists ? draft.history : [{ action: 'Created', person: currentProfile.displayName, date: today(), note: 'Item added from phone dashboard.' }] };
    const items = exists ? state.items.map((item) => item.id === draft.id ? nextDraft : item) : [nextDraft, ...state.items];
    persist({ ...state, items }, exists ? 'Item saved' : `Tag ${nextDraft.tag} added`);
    setSelectedId(nextDraft.id);
    setDraft(null);
    setActiveTab('browse');
  };
  const deleteDraft = () => {
    if (!draft) return;
    const exists = state.items.some((item) => item.id === draft.id);
    if (!exists) { setDraft(null); setActiveTab('browse'); return; }
    if (!window.confirm(`Delete ${draft.title || 'this item'}?`)) return;
    const items = state.items.filter((item) => item.id !== draft.id);
    persist({ ...state, items }, 'Item deleted');
    setSelectedId(items[0]?.id || '');
    setDraft(null);
    setActiveTab('browse');
  };
  const toggleStatus = (item = selected) => {
    if (!item) return;
    const nextStatus = item.status === 'In' ? 'Out' : 'In';
    const entry = { action: nextStatus === 'In' ? 'Returned' : 'Taken', person: currentProfile.displayName, date: today(), note: nextStatus === 'In' ? 'Returned to storage.' : 'Checked out from storage.' };
    const items = state.items.map((entryItem) => entryItem.id === item.id ? { ...entryItem, status: nextStatus, history: [entry, ...(entryItem.history || [])], lastEdited: today() } : entryItem);
    persist({ ...state, items }, `${item.title} marked ${nextStatus}`);
  };
  const copyEndpoint = async (item = selected) => {
    if (!item) return;
    try { await navigator.clipboard.writeText(endpointFor(item.tag)); setSavedState(`Copied tag ${item.tag} URL`); }
    catch { setSavedState(endpointFor(item.tag)); }
  };
  const addCategory = () => {
    const clean = titleCase(newCategory.trim());
    if (!clean || state.categories.includes(clean)) return;
    persist({ ...state, categories: [...state.categories, clean] }, `${clean} category added`);
    setNewCategory('');
  };
  const deleteCategory = (category) => {
    if (state.items.some((item) => item.category === category)) return setSavedState('Move items out of this category before deleting it');
    persist({ ...state, categories: state.categories.filter((entry) => entry !== category) }, `${category} category removed`);
  };
  const quickFilter = (patch) => { if (patch.ownerFilter !== undefined) setOwnerFilter(patch.ownerFilter); if (patch.categoryFilter !== undefined) setCategoryFilter(patch.categoryFilter); if (patch.shelfFilter !== undefined) setShelfFilter(patch.shelfFilter); if (patch.levelFilter !== undefined) setLevelFilter(patch.levelFilter); setActiveTab('browse'); };

  if (!loaded) return <main className="loginPage"><section className="loginPanel"><h1>Home Inventory</h1><p>Loading inventory...</p></section></main>;
  if (window.location.pathname.startsWith('/tag/')) return <TagPage state={state} />;
  if (!currentProfile) return <Login users={state.users} onLogin={setCurrentUser} onUpdateUsers={updateUsers} />;

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand"><span className="brandMark"><Icon name="box" /></span><div><h1>Home Inventory</h1><p>Find, add, scan, and organize family belongings</p></div></div>
        <div className="topActions"><span className="saveState">{savedState}</span><Avatar user={currentProfile} /><button className="secondaryButton" onClick={() => setCurrentUser(null)}>Log out</button><button className="primaryButton" onClick={startAdd}><Icon name="plus" /> Add Item</button></div>
      </header>

      <nav className="tabbar" aria-label="Inventory sections">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>

      {!state.onboardingDone && <section className="onboarding"><div><p className="eyebrow">Easy setup</p><h2>Start with one shelf and one item.</h2><p>Pick Add Item, take an item photo, take a shelf photo, choose who owns it, then save. The app creates the NFC URL automatically.</p></div><button className="secondaryButton" onClick={markOnboardingDone}>Hide guide</button></section>}

      {activeTab === 'home' && <HomeTab state={state} currentProfile={currentProfile} setActiveTab={setActiveTab} quickFilter={quickFilter} startAdd={startAdd} />}
      {activeTab === 'add' && <EditTab draft={draft} setDraft={setDraft} state={state} saveDraft={saveDraft} deleteDraft={deleteDraft} startAdd={startAdd} readPhoto={readPhoto} />}
      {activeTab === 'browse' && <BrowseTab state={state} filtered={filtered} selected={selected} setSelectedId={setSelectedId} startEdit={startEdit} toggleStatus={toggleStatus} copyEndpoint={copyEndpoint} filters={{ ownerFilter, categoryFilter, shelfFilter, levelFilter, query }} setters={{ setOwnerFilter, setCategoryFilter, setShelfFilter, setLevelFilter, setQuery }} shelves={shelves} />}
      {activeTab === 'locations' && <LocationsTab groups={locationGroups} state={state} quickFilter={quickFilter} startEdit={startEdit} />}
      {activeTab === 'categories' && <CategoriesTab state={state} quickFilter={quickFilter} newCategory={newCategory} setNewCategory={setNewCategory} addCategory={addCategory} deleteCategory={deleteCategory} />}
      {activeTab === 'settings' && <PeopleTab state={state} currentProfile={currentProfile} updateUsers={updateUsers} setCurrentUser={setCurrentUser} readPhoto={readPhoto} />}
    </main>
  );
}

function HomeTab({ state, currentProfile, quickFilter, startAdd }) {
  const mine = state.items.filter((item) => item.ownerId === currentProfile.id).length;
  const out = state.items.filter((item) => item.status === 'Out').length;
  const shelves = new Set(state.items.map((item) => item.location.shelfNumber)).size;
  return <section className="homeGrid"><div className="heroPanel"><p className="eyebrow">Welcome, {currentProfile.displayName}</p><h2>What do you want to find?</h2><p>Tap a person, shelf, or category. Everything is linked together, so Shelf 3 Top can show Zayne's items or everybody's items.</p><div className="heroActions"><button className="primaryButton big" onClick={startAdd}><Icon name="plus" /> Add a new item</button><button className="secondaryButton big" onClick={() => quickFilter({ ownerFilter: currentProfile.id })}>Show my items</button></div></div><StatCard label="All items" value={state.items.length} /><StatCard label="My items" value={mine} /><StatCard label="Checked out" value={out} /><StatCard label="Shelves" value={shelves} /><section className="quickPanel"><h3>People</h3><div className="chipGrid">{state.users.map((user) => <button key={user.id} onClick={() => quickFilter({ ownerFilter: user.id })}><Avatar user={user} /> {user.displayName}<strong>{state.items.filter((item) => item.ownerId === user.id).length}</strong></button>)}</div></section><section className="quickPanel"><h3>Common shelf searches</h3><div className="chipGrid">{['1','2','3','4'].map((shelf) => <button key={shelf} onClick={() => quickFilter({ shelfFilter: shelf, levelFilter: 'all' })}><Icon name="shelf" /> Shelf {shelf}<strong>{state.items.filter((item) => item.location.shelfNumber === shelf).length}</strong></button>)}</div></section></section>;
}
function StatCard({ label, value }) { return <article className="statCard"><strong>{value}</strong><span>{label}</span></article>; }

function EditTab({ draft, setDraft, state, saveDraft, deleteDraft, startAdd, readPhoto }) {
  if (!draft) return <section className="emptyPanel"><h2>Add or edit an item</h2><p>Use the big button below to make a new NFC item card, or open Browse and edit an existing item.</p><button className="primaryButton big" onClick={startAdd}><Icon name="plus" /> Add item</button></section>;
  const update = (patch) => setDraft({ ...draft, ...patch });
  const updateLocation = (patch) => setDraft({ ...draft, location: { ...draft.location, ...patch } });
  return <section className="editLayout"><div className="editPanel"><div className="panelTitle"><p className="eyebrow">Step 1</p><h2>Name and describe it</h2></div><label>Item name<input value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="Blue tool box" /></label><label>What is inside?<textarea value={draft.content} onChange={(e) => update({ content: e.target.value })} placeholder="Write the contents in plain words." /></label><div className="fieldGrid"><label>Person<select value={draft.ownerId} onChange={(e) => update({ ownerId: e.target.value })}>{state.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label><label>Category<select value={draft.category} onChange={(e) => update({ category: e.target.value })}>{state.categories.map((cat) => <option key={cat}>{cat}</option>)}</select></label></div><div className="fieldGrid"><label>Tag number<input value={draft.tag} onChange={(e) => update({ tag: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label><label>Status<select value={draft.status} onChange={(e) => update({ status: e.target.value })}><option>In</option><option>Out</option></select></label></div></div><div className="editPanel"><div className="panelTitle"><p className="eyebrow">Step 2</p><h2>Show where it lives</h2></div><div className="fieldGrid three"><label>Shelf<input value={draft.location.shelfNumber} onChange={(e) => updateLocation({ shelfNumber: e.target.value })} /></label><label>Level<select value={draft.location.shelfLevel} onChange={(e) => updateLocation({ shelfLevel: e.target.value })}>{shelfLevels.map((level) => <option key={level}>{level}</option>)}</select></label><label>Side<select value={draft.location.shelfZone} onChange={(e) => updateLocation({ shelfZone: e.target.value })}>{shelfZones.map((zone) => <option key={zone}>{zone}</option>)}</select></label></div><div className="fieldGrid"><label>Container type<select value={draft.location.containerType} onChange={(e) => updateLocation({ containerType: e.target.value })}>{containerTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Box/bin name<input value={draft.location.containerName} onChange={(e) => updateLocation({ containerName: e.target.value })} placeholder="Holiday bin" /></label></div><label>Spot and notes<input value={draft.location.boxSpot} onChange={(e) => updateLocation({ boxSpot: e.target.value })} placeholder="Front left, under cables" /></label><label>Extra location notes<input value={draft.location.notes} onChange={(e) => updateLocation({ notes: e.target.value })} placeholder="Anything that helps someone find it" /></label></div><div className="editPanel"><div className="panelTitle"><p className="eyebrow">Step 3</p><h2>Add photos and save</h2></div><div className="photoGrid"><label className="photoInput"><PhotoBox src={draft.photo} label="Item photo" /><input type="file" accept="image/*" onChange={(e) => readPhoto(e.target.files?.[0], (photo) => update({ photo }))} /></label><label className="photoInput"><PhotoBox src={draft.location.photo} label="Shelf photo" /><input type="file" accept="image/*" onChange={(e) => readPhoto(e.target.files?.[0], (photo) => updateLocation({ photo }))} /></label></div><div className="endpointPreview"><span>NFC URL</span><code>{endpointFor(draft.tag || '001')}</code></div><div className="saveRow"><button className="primaryButton big" onClick={saveDraft}><Icon name="save" /> Save item</button><button className="dangerButton big" onClick={deleteDraft}><Icon name="trash" /> Delete</button></div></div></section>;
}

function BrowseTab({ state, filtered, selected, setSelectedId, startEdit, toggleStatus, copyEndpoint, filters, setters, shelves }) {
  return <section className="browseLayout"><aside className="filterPanel"><h2>Find items</h2><div className="searchBox"><Icon name="search" /><input value={filters.query} onChange={(e) => setters.setQuery(e.target.value)} placeholder="Search name, shelf, owner, category" /></div><label>Person<select value={filters.ownerFilter} onChange={(e) => setters.setOwnerFilter(e.target.value)}><option value="all">Everyone</option>{state.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label><label>Shelf<select value={filters.shelfFilter} onChange={(e) => setters.setShelfFilter(e.target.value)}><option value="all">All shelves</option>{shelves.map((shelf) => <option key={shelf} value={shelf}>Shelf {shelf}</option>)}</select></label><label>Level<select value={filters.levelFilter} onChange={(e) => setters.setLevelFilter(e.target.value)}><option value="all">All levels</option>{shelfLevels.map((level) => <option key={level}>{level}</option>)}</select></label><label>Category<select value={filters.categoryFilter} onChange={(e) => setters.setCategoryFilter(e.target.value)}><option value="all">All categories</option>{state.categories.map((cat) => <option key={cat}>{cat}</option>)}</select></label></aside><section className="itemList"><div className="panelHeader"><div><h2>{filtered.length} matching items</h2><p>Tap any card to see or edit it.</p></div></div>{filtered.map((item) => <article key={item.id} className={`itemCard ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}><PhotoBox src={item.photo} label="Item" /><div><span className="tagChip">{item.tag}</span><h3>{item.title}</h3><p>{userName(state.users, item.ownerId)} · {item.category}</p><button onClick={(e) => { e.stopPropagation(); setters.setShelfFilter(item.location.shelfNumber); setters.setLevelFilter(item.location.shelfLevel); }}>Shelf {item.location.shelfNumber} {item.location.shelfLevel}</button></div><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span></article>)}</section>{selected && <aside className="detailPanel"><div className="panelTitle"><p className="eyebrow">Selected item</p><h2>{selected.title}</h2></div><div className="scanGrid"><PhotoBox src={selected.photo} label="Item photo" /><PhotoBox src={selected.location.photo} label="Shelf photo" /></div><p>{selected.content}</p><div className="locationCard"><strong>Location</strong><span>{locationLine(selected.location)}</span><small>{selected.location.containerType} · {selected.location.boxSpot || 'No spot'} · {selected.location.notes || 'No note'}</small></div><div className="saveRow"><button className="primaryButton" onClick={() => startEdit(selected)}>Edit</button><button className="secondaryButton" onClick={() => copyEndpoint(selected)}>Copy NFC URL</button><button className="secondaryButton" onClick={() => toggleStatus(selected)}>Mark {selected.status === 'In' ? 'Out' : 'In'}</button></div></aside>}</section>;
}

function LocationsTab({ groups, state, quickFilter, startEdit }) {
  return <section className="locationsGrid">{groups.map((group) => <article key={group.key} className="locationTile"><PhotoBox src={group.location.photo} label="Shelf photo" /><div className="locationTileBody"><h2>{group.key}</h2><p>{group.items.length} items · {group.location.shelfZone}</p><div className="miniList">{group.items.map((item) => <button key={item.id} onClick={() => startEdit(item)}><span>{item.title}</span><small>{userName(state.users, item.ownerId)} · {item.category}</small></button>)}</div><div className="saveRow"><button className="secondaryButton" onClick={() => quickFilter({ shelfFilter: group.location.shelfNumber, levelFilter: group.location.shelfLevel, ownerFilter: 'all' })}>Show everyone here</button></div></div></article>)}</section>;
}

function CategoriesTab({ state, quickFilter, newCategory, setNewCategory, addCategory, deleteCategory }) {
  return <section className="categoryLayout"><div className="editPanel"><h2>Add a category</h2><p>Use categories for toys, tools, documents, keepsakes, medical, school, or anything your family needs later.</p><div className="inlineForm"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" /><button className="primaryButton" onClick={addCategory}>Add</button></div></div><div className="categoryCards">{state.categories.map((cat) => <article key={cat}><h3>{cat}</h3><p>{state.items.filter((item) => item.category === cat).length} items</p><button className="secondaryButton" onClick={() => quickFilter({ categoryFilter: cat })}>View items</button><button className="textDanger" onClick={() => deleteCategory(cat)}>Delete empty category</button></article>)}</div></section>;
}

function PeopleTab({ state, currentProfile, updateUsers, setCurrentUser, readPhoto }) {
  const update = (userId, patch) => { const users = state.users.map((user) => user.id === userId ? { ...user, ...patch } : user); updateUsers(users, 'Person saved'); if (userId === currentProfile.id) setCurrentUser({ ...currentProfile, ...patch }); };
  return <section className="peopleGrid">{state.users.map((user) => <article key={user.id} className="personCard"><Avatar user={user} /><label>Name<input value={user.displayName} onChange={(e) => update(user.id, { displayName: e.target.value })} /></label><label>Helper note<input value={user.helperText || ''} onChange={(e) => update(user.id, { helperText: e.target.value })} /></label><label>Photo<input type="file" accept="image/*" onChange={(e) => readPhoto(e.target.files?.[0], (photo) => update(user.id, { photo }))} /></label><label>Accent<input type="color" value={user.accent || '#16766f'} onChange={(e) => update(user.id, { accent: e.target.value })} /></label></article>)}</section>;
}

createRoot(document.getElementById('root')).render(<App />);
