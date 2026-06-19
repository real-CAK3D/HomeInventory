import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE_KEY = 'nukebox-inventory-v2';
const API_STATE = '/api/state';
const DEFAULT_PIN = '0000';

const categories = ['Electronics', 'Documents', 'Toys', 'Clothing', 'Tools', 'Keepsakes', 'Household', 'Other'];
const shelfLevels = ['Top', 'Middle', 'Bottom', 'Ground'];
const shelfZones = ['Whole shelf', 'Left', 'Middle', 'Right'];
const containerTypes = ['Loose item', 'Box', 'Bin', 'Bag', 'Pouch', 'Case'];
const accents = ['#147a74', '#2f6fc3', '#c98221', '#8f5ab8', '#2f8755'];

const seedUsers = [
  { id: 'andrew', name: 'Andrew', displayName: 'Andrew', pin: DEFAULT_PIN, pinSet: false, photo: '', accent: '#147a74' },
  { id: 'zayne', name: 'Zayne', displayName: 'Zayne', pin: DEFAULT_PIN, pinSet: false, photo: '', accent: '#2f6fc3' },
  { id: 'victoria', name: 'Victoria', displayName: 'Victoria', pin: DEFAULT_PIN, pinSet: false, photo: '', accent: '#8f5ab8' },
  { id: 'cork', name: 'Cork', displayName: 'Cork', pin: DEFAULT_PIN, pinSet: false, photo: '', accent: '#c98221' }
];

const seedItems = [
  {
    id: 'tag-001',
    tag: '001',
    title: 'Lego Mindstorms kit',
    ownerId: 'zayne',
    category: 'Toys',
    content: 'EV3 brick, motor pack, sensor tray, charging cable, and build cards. Keep the small sorted bags with the main case.',
    status: 'In',
    location: {
      shelfNumber: '1',
      shelfLevel: 'Middle',
      shelfZone: 'Left',
      containerType: 'Bin',
      containerName: 'Robotics bin',
      boxSpot: 'Front row',
      notes: 'Blue lid, label faces out'
    },
    lastEdited: '2026-06-18',
    history: [
      { action: 'Returned', person: 'Zayne', date: '2026-06-18', note: 'Charged brick and restored sensor tray.' },
      { action: 'Taken', person: 'Zayne', date: '2026-06-15', note: 'Robot club practice.' }
    ]
  },
  {
    id: 'tag-002',
    tag: '002',
    title: 'Camera chargers',
    ownerId: 'andrew',
    category: 'Electronics',
    content: 'Sony dual charger, two NP-FW50 batteries, USB-C adapter, and wall plug.',
    status: 'Out',
    location: {
      shelfNumber: '2',
      shelfLevel: 'Top',
      shelfZone: 'Right',
      containerType: 'Pouch',
      containerName: 'Travel tech pouch',
      boxSpot: 'Inside mesh pocket',
      notes: 'Usually travels with the field bag'
    },
    lastEdited: '2026-06-17',
    history: [{ action: 'Taken', person: 'Andrew', date: '2026-06-17', note: 'Packed for field day.' }]
  },
  {
    id: 'tag-003',
    tag: '003',
    title: 'Winter gloves',
    ownerId: 'victoria',
    category: 'Clothing',
    content: 'Two insulated pairs, black liners, and hand warmers. Check sizes before winter storage.',
    status: 'In',
    location: {
      shelfNumber: '3',
      shelfLevel: 'Bottom',
      shelfZone: 'Middle',
      containerType: 'Box',
      containerName: 'Seasonal clothes',
      boxSpot: 'Upper layer',
      notes: 'Clear box with gray clips'
    },
    lastEdited: '2026-06-12',
    history: [{ action: 'Returned', person: 'Victoria', date: '2026-06-12', note: 'Washed and paired.' }]
  },
  {
    id: 'tag-004',
    tag: '004',
    title: 'Document pouch',
    ownerId: 'cork',
    category: 'Documents',
    content: 'Insurance cards, vehicle copies, emergency contacts, and medical notes.',
    status: 'In',
    location: {
      shelfNumber: '1',
      shelfLevel: 'Top',
      shelfZone: 'Whole shelf',
      containerType: 'Pouch',
      containerName: 'Red document pouch',
      boxSpot: 'Lock tray',
      notes: 'Keep flat and dry'
    },
    lastEdited: '2026-06-10',
    history: [{ action: 'Returned', person: 'Cork', date: '2026-06-10', note: 'Updated contact sheet.' }]
  }
];

const defaultState = { users: seedUsers, items: seedItems };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeState(raw) {
  const users = Array.isArray(raw?.users) && raw.users.length ? raw.users : seedUsers;
  const legacyOwnerMap = { Dad: 'andrew', Son: 'zayne', Parents: 'victoria', Andrew: 'andrew', Zayne: 'zayne', Victoria: 'victoria', Cork: 'cork' };
  const rawItems = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : seedItems;
  const items = rawItems.length ? rawItems : seedItems;
  return {
    users: seedUsers.map((seed) => ({ ...seed, ...(users.find((user) => user.id === seed.id) || {}) })),
    items: items.map((item) => ({
      ...item,
      ownerId: item.ownerId || legacyOwnerMap[item.owner] || 'andrew',
      location: {
        shelfNumber: item.location?.shelfNumber || '1',
        shelfLevel: item.location?.shelfLevel || 'Middle',
        shelfZone: item.location?.shelfZone || 'Whole shelf',
        containerType: item.location?.containerType || 'Box',
        containerName: item.location?.containerName || item.location || 'Nukebox',
        boxSpot: item.location?.boxSpot || 'Front',
        notes: item.location?.notes || ''
      },
      history: Array.isArray(item.history) ? item.history : []
    }))
  };
}

async function loadState() {
  try {
    const response = await fetch(API_STATE, { cache: 'no-store' });
    if (response.ok) {
      const data = normalizeState(await response.json());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return { data, source: 'Saved to cloud inventory' };
    }
  } catch {
    // Vite-only development falls back to local browser storage.
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('nukebox-inventory-v1');
    return { data: normalizeState(raw ? JSON.parse(raw) : defaultState), source: 'Saved in this browser' };
  } catch {
    return { data: defaultState, source: 'Saved in this browser' };
  }
}

async function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  try {
    const response = await fetch(API_STATE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextState)
    });
    if (response.ok) return 'Saved to cloud inventory';
  } catch {
    // Keep local fallback available.
  }
  return 'Saved in this browser';
}

function userName(users, id) {
  return users.find((user) => user.id === id)?.displayName || users.find((user) => user.id === id)?.name || 'Unassigned';
}

function locationLine(location) {
  return `Shelf ${location.shelfNumber} · ${location.shelfLevel} · ${location.shelfZone} · ${location.containerName}`;
}

function endpointFor(tag) {
  return `${window.location.origin}/tag/${tag}`;
}

function Icon({ name }) {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    copy: 'M8 8h10v10H8z M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1',
    search: 'm21 21-4.3-4.3 M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z',
    link: 'M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.2 1.2 M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.2-1.2',
    box: 'M21 8 12 3 3 8l9 5 9-5Z M3 8v8l9 5 9-5V8 M12 13v8',
    user: 'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
    pin: 'M12 17v.01 M8 11V8a4 4 0 0 1 8 0v3 M7 11h10v10H7z',
    arrow: 'M5 12h14 M13 5l7 7-7 7',
    photo: 'M4 7h3l2-3h6l2 3h3v13H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={paths[name]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Avatar({ user, large = false }) {
  return (
    <span className={large ? 'avatar large' : 'avatar'} style={{ '--accent': user?.accent || '#147a74' }}>
      {user?.photo ? <img src={user.photo} alt="" /> : (user?.displayName || user?.name || '?').slice(0, 1)}
    </span>
  );
}

function TagPage({ state }) {
  const tag = decodeURIComponent(window.location.pathname.split('/tag/')[1] || '');
  const item = state.items.find((entry) => entry.tag === tag);
  if (!item) {
    return (
      <main className="tagPage">
        <section className="tagDocument">
          <div className="notFound">
            <p className="tagNumber">Tag {tag || 'unknown'}</p>
            <h1>Inventory tag not found</h1>
            <p>This NFC endpoint is ready, but no saved item currently uses this tag number.</p>
            <a href="/" className="textLink">Open inventory</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="tagPage">
      <section className="tagDocument">
        <header>
          <p className="tagNumber">Nukebox tag {item.tag}</p>
          <h1>{item.title}</h1>
          <div className="tagMeta">
            <span>{userName(state.users, item.ownerId)}</span>
            <span>{item.category}</span>
            <span className={item.status === 'In' ? 'status in' : 'status out'}>{item.status}</span>
          </div>
        </header>
        <article>
          {item.photo && <img className="itemPhotoBanner" src={item.photo} alt="" />}
          <p>{item.content}</p>
          <div className="locationCard">
            <strong>Location</strong>
            <span>{locationLine(item.location)}</span>
            <small>{item.location.containerType} · {item.location.boxSpot} · {item.location.notes || 'No extra note'}</small>
          </div>
        </article>
        <footer>
          <span>Tag {item.tag}</span>
          <span>Last edited {item.lastEdited}</span>
        </footer>
      </section>
    </main>
  );
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
    if (!/^\d{4}$/.test(pin)) {
      setMessage('Enter a 4 digit PIN.');
      return;
    }
    if (pin !== user.pin) {
      setMessage('PIN does not match this profile.');
      return;
    }
    if (!user.pinSet) {
      if (!needsPinSetup) {
        setMessage('Use default PIN 0000 to set up this profile.');
        return;
      }
      if (!/^\d{4}$/.test(newPin) || newPin !== verifyPin) {
        setMessage('Create and verify a matching 4 digit PIN.');
        return;
      }
      const nextUsers = users.map((entry) =>
        entry.id === user.id ? { ...entry, pin: newPin, pinSet: true } : entry
      );
      onUpdateUsers(nextUsers, `${user.displayName} PIN created`);
      onLogin(nextUsers.find((entry) => entry.id === user.id));
      return;
    }
    onLogin(user);
  };

  return (
    <main className="loginPage">
      <form className="loginPanel" onSubmit={submit}>
        <div className="brand loginBrand">
          <span className="brandMark"><Icon name="box" /></span>
          <div>
            <h1>Nukebox Inventory</h1>
            <p>Sign in to manage family storage</p>
          </div>
        </div>
        <label>Profile
          <select value={selectedUser} onChange={(event) => { setSelectedUser(event.target.value); setPin(''); setMessage(''); }}>
            {users.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
          </select>
        </label>
        <label>PIN
          <input inputMode="numeric" maxLength="4" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" />
        </label>
        {needsPinSetup && (
          <div className="pinSetup">
            <label>Create PIN
              <input inputMode="numeric" maxLength="4" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
            </label>
            <label>Verify PIN
              <input inputMode="numeric" maxLength="4" value={verifyPin} onChange={(event) => setVerifyPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
            </label>
          </div>
        )}
        {message && <p className="formMessage">{message}</p>}
        <button className="primaryButton" type="submit"><Icon name="pin" /> {needsPinSetup ? 'Create PIN' : 'Log in'}</button>
      </form>
    </main>
  );
}

function App() {
  const [state, setState] = useState(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState('all');
  const [query, setQuery] = useState('');
  const [savedState, setSavedState] = useState('Loading');

  useEffect(() => {
    loadState().then(({ data, source }) => {
      setState(data);
      setSelectedId(data.items[0]?.id || '');
      setSavedState(source);
      setLoaded(true);
    });
  }, []);

  const selected = state.items.find((item) => item.id === selectedId) || state.items[0];
  const currentProfile = currentUser ? state.users.find((user) => user.id === currentUser.id) || currentUser : null;

  const persist = async (nextState, message = 'Saved') => {
    setState(nextState);
    const source = await saveState(nextState);
    setSavedState(`${message} · ${source}`);
    window.setTimeout(() => setSavedState(source), 1800);
  };

  const updateUsers = (users, message) => persist({ ...state, users }, message);

  const updateSelected = (patch) => {
    const nextItems = state.items.map((item) =>
      item.id === selected.id ? { ...item, ...patch, lastEdited: today() } : item
    );
    persist({ ...state, items: nextItems }, 'Item updated');
  };

  const updateLocation = (patch) => {
    updateSelected({ location: { ...selected.location, ...patch } });
  };

  const updateProfile = (patch) => {
    const nextUsers = state.users.map((user) =>
      user.id === currentProfile.id ? { ...user, ...patch } : user
    );
    setCurrentUser({ ...currentProfile, ...patch });
    persist({ ...state, users: nextUsers }, 'Profile updated');
  };

  const changePin = () => {
    const pin = window.prompt('Enter a new 4 digit PIN');
    if (!pin || !/^\d{4}$/.test(pin)) {
      setSavedState('PIN must be 4 digits');
      return;
    }
    updateProfile({ pin, pinSet: true });
  };

  const addItem = () => {
    const max = state.items.reduce((highest, item) => Math.max(highest, Number(item.tag) || 0), 0);
    const tag = String(max + 1).padStart(3, '0');
    const next = {
      id: `tag-${tag}-${Date.now()}`,
      tag,
      title: 'New inventory item',
      ownerId: currentProfile.id,
      category: 'Other',
      content: 'Add the contents, exact shelf/bin location, and any notes someone should see when the NFC tag is scanned.',
      status: 'In',
      photo: '',
      location: {
        shelfNumber: '1',
        shelfLevel: 'Middle',
        shelfZone: 'Whole shelf',
        containerType: 'Box',
        containerName: 'New box',
        boxSpot: 'Front',
        notes: ''
      },
      lastEdited: today(),
      history: [{ action: 'Created', person: currentProfile.displayName, date: today(), note: 'New tag record created.' }]
    };
    persist({ ...state, items: [next, ...state.items] }, `Tag ${tag} created`);
    setSelectedId(next.id);
    setViewMode('mine');
  };

  const toggleStatus = () => {
    const nextStatus = selected.status === 'In' ? 'Out' : 'In';
    const entry = {
      action: nextStatus === 'In' ? 'Returned' : 'Taken',
      person: currentProfile.displayName,
      date: today(),
      note: nextStatus === 'In' ? 'Returned to the Nukebox.' : 'Checked out from the Nukebox.'
    };
    const nextItems = state.items.map((item) =>
      item.id === selected.id
        ? { ...item, status: nextStatus, history: [entry, ...item.history], lastEdited: today() }
        : item
    );
    persist({ ...state, items: nextItems }, `${selected.title} marked ${nextStatus}`);
  };

  const copyEndpoint = async (item = selected) => {
    const endpoint = endpointFor(item.tag);
    try {
      await navigator.clipboard.writeText(endpoint);
      setSavedState(`Copied ${item.tag} endpoint`);
    } catch {
      setSavedState(endpoint);
    }
  };

  const readPhoto = (file, callback) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => callback(reader.result);
    reader.readAsDataURL(file);
  };

  const filtered = useMemo(() => {
    return state.items.filter((item) => {
      const q = query.trim().toLowerCase();
      const ownerMatches = ownerFilter === 'all' || item.ownerId === ownerFilter;
      const categoryMatches = categoryFilter === 'all' || item.category === categoryFilter;
      const modeMatches = viewMode === 'all' || item.ownerId === currentProfile?.id;
      const haystack = [
        item.tag,
        item.title,
        item.content,
        item.category,
        userName(state.users, item.ownerId),
        item.location.shelfNumber,
        item.location.shelfLevel,
        item.location.shelfZone,
        item.location.containerType,
        item.location.containerName,
        item.location.boxSpot,
        item.location.notes
      ].join(' ').toLowerCase();
      return ownerMatches && categoryMatches && modeMatches && (!q || haystack.includes(q));
    });
  }, [state.items, state.users, ownerFilter, categoryFilter, viewMode, currentProfile, query]);

  if (!loaded) {
    return <main className="loginPage"><section className="loginPanel"><h1>Nukebox Inventory</h1><p>Loading inventory...</p></section></main>;
  }

  if (window.location.pathname.startsWith('/tag/')) {
    return <TagPage state={state} />;
  }

  if (!currentProfile) {
    return <Login users={state.users} onLogin={setCurrentUser} onUpdateUsers={updateUsers} />;
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand">
          <span className="brandMark"><Icon name="box" /></span>
          <div>
            <h1>Nukebox Inventory</h1>
            <p>Family storage tags and NFC endpoints</p>
          </div>
        </div>
        <div className="topActions">
          <span className="saveState">{savedState}</span>
          <Avatar user={currentProfile} />
          <button className="secondaryButton" onClick={() => setCurrentUser(null)}>Log out</button>
          <button className="primaryButton" onClick={addItem}><Icon name="plus" /> Add tag</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="profileCard">
            <Avatar user={currentProfile} large />
            <div>
              <strong>{currentProfile.displayName}</strong>
              <span>{state.items.filter((item) => item.ownerId === currentProfile.id).length} assigned items</span>
            </div>
          </div>
          <div className="searchBox">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, shelf, bin, tag" />
          </div>
          <div className="segmented">
            <button className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>All</button>
            <button className={viewMode === 'mine' ? 'active' : ''} onClick={() => setViewMode('mine')}>Mine</button>
          </div>
          <nav>
            <h2>Users</h2>
            <button className={ownerFilter === 'all' ? 'active navButton' : 'navButton'} onClick={() => setOwnerFilter('all')}>
              <span>All users</span><strong>{state.items.length}</strong>
            </button>
            {state.users.map((entry) => (
              <button key={entry.id} className={ownerFilter === entry.id ? 'active navButton' : 'navButton'} onClick={() => setOwnerFilter(entry.id)}>
                <span>{entry.displayName}</span>
                <strong>{state.items.filter((item) => item.ownerId === entry.id).length}</strong>
              </button>
            ))}
            <h2>Categories</h2>
            <button className={categoryFilter === 'all' ? 'active navButton' : 'navButton'} onClick={() => setCategoryFilter('all')}>
              <span>All categories</span><strong>{state.items.length}</strong>
            </button>
            {categories.map((entry) => (
              <button key={entry} className={categoryFilter === entry ? 'active navButton' : 'navButton'} onClick={() => setCategoryFilter(entry)}>
                <span>{entry}</span>
                <strong>{state.items.filter((item) => item.category === entry).length}</strong>
              </button>
            ))}
          </nav>
          <section className="profileEditor">
            <h2>Profile</h2>
            <label>Name
              <input value={currentProfile.displayName} onChange={(event) => updateProfile({ displayName: event.target.value })} />
            </label>
            <label>Photo
              <input type="file" accept="image/*" onChange={(event) => readPhoto(event.target.files?.[0], (photo) => updateProfile({ photo }))} />
            </label>
            <label>Accent
              <select value={currentProfile.accent} onChange={(event) => updateProfile({ accent: event.target.value })}>
                {accents.map((accent) => <option key={accent} value={accent}>{accent}</option>)}
              </select>
            </label>
            <button className="secondaryButton wide" onClick={changePin}><Icon name="pin" /> Change PIN</button>
          </section>
        </aside>

        <section className="inventoryPanel">
          <div className="panelHeader">
            <div>
              <h2>{viewMode === 'mine' ? `${currentProfile.displayName}'s inventory` : 'All inventory'}</h2>
              <p>{filtered.length} visible tags</p>
            </div>
            <button className="secondaryButton" onClick={() => copyEndpoint(selected)}><Icon name="link" /> Copy selected URL</button>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Name</th>
                  <th>User</th>
                  <th>Category</th>
                  <th>Shelf</th>
                  <th>Status</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className={item.id === selected?.id ? 'selectedRow' : ''} onClick={() => setSelectedId(item.id)}>
                    <td><span className="tagChip">{item.tag}</span></td>
                    <td>
                      <strong>{item.title}</strong>
                      <small>{locationLine(item.location)}</small>
                    </td>
                    <td>{userName(state.users, item.ownerId)}</td>
                    <td>{item.category}</td>
                    <td>{item.location.shelfNumber} · {item.location.shelfLevel}</td>
                    <td><span className={item.status === 'In' ? 'status in' : 'status out'}>{item.status}</span></td>
                    <td>
                      <button className="iconButton" onClick={(event) => { event.stopPropagation(); copyEndpoint(item); }} title="Copy endpoint">
                        <Icon name="copy" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {selected && (
          <aside className="detailPanel">
            <div className="panelHeader detailHeader">
              <div>
                <p className="label">Tag {selected.tag}</p>
                <h2>{selected.title}</h2>
              </div>
              <button className="iconButton strong" onClick={() => copyEndpoint(selected)} title="Copy tag URL"><Icon name="copy" /></button>
            </div>

            <label>Title
              <input value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} />
            </label>
            <label>Content
              <textarea value={selected.content} onChange={(event) => updateSelected({ content: event.target.value })} />
            </label>
            <div className="fieldGrid">
              <label>User
                <select value={selected.ownerId} onChange={(event) => updateSelected({ ownerId: event.target.value })}>
                  {state.users.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
                </select>
              </label>
              <label>Category
                <select value={selected.category} onChange={(event) => updateSelected({ category: event.target.value })}>
                  {categories.map((entry) => <option key={entry}>{entry}</option>)}
                </select>
              </label>
            </div>

            <section className="locationEditor">
              <h3>Location</h3>
              <div className="fieldGrid three">
                <label>Shelf
                  <input value={selected.location.shelfNumber} onChange={(event) => updateLocation({ shelfNumber: event.target.value })} />
                </label>
                <label>Level
                  <select value={selected.location.shelfLevel} onChange={(event) => updateLocation({ shelfLevel: event.target.value })}>
                    {shelfLevels.map((entry) => <option key={entry}>{entry}</option>)}
                  </select>
                </label>
                <label>Placement
                  <select value={selected.location.shelfZone} onChange={(event) => updateLocation({ shelfZone: event.target.value })}>
                    {shelfZones.map((entry) => <option key={entry}>{entry}</option>)}
                  </select>
                </label>
              </div>
              <div className="fieldGrid">
                <label>Container
                  <select value={selected.location.containerType} onChange={(event) => updateLocation({ containerType: event.target.value })}>
                    {containerTypes.map((entry) => <option key={entry}>{entry}</option>)}
                  </select>
                </label>
                <label>Box or bin name
                  <input value={selected.location.containerName} onChange={(event) => updateLocation({ containerName: event.target.value })} />
                </label>
              </div>
              <label>Spot in box/bin
                <input value={selected.location.boxSpot} onChange={(event) => updateLocation({ boxSpot: event.target.value })} />
              </label>
              <label>Location note
                <input value={selected.location.notes} onChange={(event) => updateLocation({ notes: event.target.value })} />
              </label>
            </section>

            <label>Item photo
              <input type="file" accept="image/*" onChange={(event) => readPhoto(event.target.files?.[0], (photo) => updateSelected({ photo }))} />
            </label>
            <label>Endpoint URL
              <div className="endpointBox">
                <code>{endpointFor(selected.tag)}</code>
                <button onClick={() => copyEndpoint(selected)}><Icon name="copy" /></button>
              </div>
            </label>

            <div className="preview">
              <header>
                <span>Nukebox item</span>
                <strong>{selected.title}</strong>
              </header>
              {selected.photo && <img src={selected.photo} alt="" />}
              <p>{selected.content}</p>
              <footer>
                <span>Shelf {selected.location.shelfNumber} · {selected.location.shelfLevel} · {selected.location.shelfZone}</span>
                <span>Tag {selected.tag}</span>
              </footer>
            </div>

            <div className="statusStrip">
              <span className={selected.status === 'In' ? 'status in' : 'status out'}>{selected.status}</span>
              <button className="secondaryButton" onClick={toggleStatus}>
                <Icon name="arrow" /> Mark {selected.status === 'In' ? 'out' : 'returned'}
              </button>
            </div>

            <section className="timeline">
              <h3>In and out history</h3>
              {selected.history.map((entry, index) => (
                <article key={`${entry.date}-${entry.action}-${index}`}>
                  <span className="dot" />
                  <div>
                    <strong>{entry.action} by {entry.person}</strong>
                    <p>{entry.note}</p>
                    <time>{entry.date}</time>
                  </div>
                </article>
              ))}
            </section>
          </aside>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
