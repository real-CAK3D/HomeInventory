import React, { useState } from 'react';
import { motion } from 'motion/react';
import { authAction, exportAll, logout, mutate, pendingCount, status, sync, useIndex, toast } from '../lib/store.js';
import { back, navigate } from '../lib/router.js';
import { Avatar, Btn, CameraButton, Empty, Icon, Page, Segmented, Sheet, Toggle, ask, BoxTile } from '../ui/kit.jsx';
import { cx, download, timeAgo } from '../lib/util.js';
import { DEFAULT_PREFS, PEOPLE_COLORS, thingLabel } from '../../shared/model.js';

const EMOJIS = ['🙂', '😎', '🌷', '🌻', '🎣', '🛠️', '🎮', '⚽', '🎨', '📚', '🍳', '🐶', '🐱', '🦊', '🚗', '⭐', '❤️', '🌈'];

let installEvent = null;
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });

export default function Me() {
  const ix = useIndex();
  const me = ix.mine;
  const [pinOpen, setPinOpen] = useState(false);
  if (!me) return null;
  const prefs = { ...DEFAULT_PREFS, ...(me.data.prefs || {}) };
  const setPrefs = (patch) => mutate({ type: 'update', kind: 'profile', id: me.id, data: { prefs: { ...prefs, ...patch } } }, { quiet: true });
  const setMe = (data, message) => mutate({ type: 'update', kind: 'profile', id: me.id, data }, { message: message || 'Saved', undo: false });

  const askNotify = async () => {
    if (!('Notification' in window)) return toast('This phone doesn’t support pop-up alerts in the browser.', { tone: 'error' });
    const result = await Notification.requestPermission();
    setPrefs({ phoneAlerts: result === 'granted' });
    toast(result === 'granted' ? 'Alerts are on' : 'Alerts are off — you can turn them on in the browser settings.', { tone: result === 'granted' ? 'ok' : 'info' });
  };
  const install = async () => {
    if (installEvent) { installEvent.prompt(); await installEvent.userChoice; installEvent = null; }
    else toast('Open your browser menu (⋮) and choose “Add to Home screen”.', { tone: 'info' });
  };

  return (
    <Page title="Me" kicker="Settings">
      <section className="card profileCard" style={{ '--c': me.data.color }}>
        <div className="profileTop">
          <CameraButton className="avatarCam" onPhoto={(photoId) => setMe({ photoId }, 'Photo saved')}>
            <Avatar profile={me} size={92} ring />
            <span className="camBadge"><Icon name="camera" size={18} /></span>
          </CameraButton>
          <div>
            <input className="nameInput" defaultValue={me.data.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== me.data.name && setMe({ name: e.target.value.trim() })} aria-label="Your name" />
            <p className="muted">{me.data.role === 'admin' ? 'Runs the house inventory' : 'Family member'}</p>
          </div>
        </div>
        <p className="fieldLabel">Your color</p>
        <div className="swatches">{PEOPLE_COLORS.map((c) => <button key={c} className={cx('swatch', me.data.color === c && 'on')} style={{ background: c }} onClick={() => setMe({ color: c })} aria-label={`Color ${c}`} />)}</div>
        <p className="fieldLabel">Your picture (if no photo)</p>
        <div className="emojiRow">{EMOJIS.map((e) => <button key={e} className={cx(me.data.emoji === e && 'on')} onClick={() => setMe({ emoji: e, photoId: '' })}>{e}</button>)}</div>
      </section>

      <section className="card">
        <h2 className="cardTitle"><Icon name="sparkle" /> How it looks</h2>
        <p className="fieldLabel">Text size</p>
        <Segmented value={prefs.textSize} onChange={(textSize) => setPrefs({ textSize })} options={[['standard', 'Normal', <span className="aa s">Aa</span>], ['large', 'Bigger', <span className="aa m">Aa</span>], ['xl', 'Biggest', <span className="aa l">Aa</span>]]} />
        <p className="fieldLabel">Light or dark</p>
        <Segmented value={prefs.theme} onChange={(theme) => setPrefs({ theme })} options={[['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']]} />
        <p className="fieldLabel">Animations</p>
        <Segmented value={prefs.motion} onChange={(motion) => setPrefs({ motion })} options={[['full', 'Lively'], ['calm', 'Calm']]} />
        <Toggle icon="bell" label="Sounds" hint="A soft chime when something saves." checked={prefs.sound} onChange={(sound) => setPrefs({ sound })} />
      </section>

      <section className="card">
        <h2 className="cardTitle"><Icon name="users" /> When others touch your things</h2>
        <p className="fieldLabel">If someone moves or changes something of yours</p>
        <Segmented value={prefs.onEdit} onChange={(onEdit) => setPrefs({ onEdit })} options={[['tell', 'Tell me'], ['ask', 'Ask me first'], ['quiet', 'Don’t bother me']]} />
        <p className="fieldLabel">If someone wants to remove something of yours</p>
        <Segmented value={prefs.onRemove} onChange={(onRemove) => setPrefs({ onRemove })} options={[['ask', 'Ask me first'], ['tell', 'Just tell me']]} />
        <p className="muted small">Anything you lock always needs your OK, no matter what.</p>
        <Toggle icon="bell" label="Pop-up alerts on this phone" hint="Get a notice even when the app is in the background." checked={prefs.phoneAlerts && typeof Notification !== 'undefined' && Notification.permission === 'granted'} onChange={(v) => (v ? askNotify() : setPrefs({ phoneAlerts: false }))} />
      </section>

      <section className="card menuList">
        {ix.isAdmin && <MenuLink icon="wall" label="Shelf setup" hint="Sections, shelves, rooms" to="/setup" />}
        {ix.isAdmin && <MenuLink icon="users" label="People" hint="Add family, reset a PIN" to="/people" />}
        <MenuLink icon="nfc" label="NFC tags & box labels" hint="Write tags, print labels" to="/tags" />
        <MenuLink icon="history" label="Everything that happened" to="/activity" />
        <MenuLink icon="trash" label="Trash" hint={ix.trash.length ? `${ix.trash.length} removed` : 'Bring back removed things'} to="/trash" />
        <MenuLink icon="sparkle" label="How to use this app" to="/help" />
      </section>

      <section className="card">
        <h2 className="cardTitle"><Icon name={status.online ? 'check' : 'wifioff'} /> {status.online ? 'Everything is saved' : 'No internet right now'}</h2>
        <p className="muted">{pendingCount() ? `${pendingCount()} change${pendingCount() === 1 ? '' : 's'} waiting to send. They’ll go as soon as you’re back online.` : `Last checked ${timeAgo(status.lastSync) || 'never'}.`}</p>
        <div className="rowBtns">
          <Btn icon="restore" kind="soft" onClick={() => sync().then(() => toast('Up to date'))}>Check now</Btn>
          <Btn icon="pin" kind="soft" onClick={install}>Put on home screen</Btn>
          {ix.isAdmin && <Btn icon="copy" kind="soft" onClick={() => download(`home-inventory-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportAll(), null, 1))}>Save a backup</Btn>}
        </div>
      </section>

      <div className="rowBtns big">
        <Btn icon="lock" kind="soft" onClick={() => setPinOpen(true)}>Change my PIN</Btn>
        <Btn icon="logout" kind="soft" onClick={async () => { if ((await logout()) !== false) navigate('/', { replace: true }); }}>Switch person</Btn>
      </div>
      <PinSheet open={pinOpen} onClose={() => setPinOpen(false)} />
    </Page>
  );
}

function MenuLink({ icon, label, hint, to }) {
  return (
    <button className="menuLink" onClick={() => navigate(to)}>
      <span className="menuIcon"><Icon name={icon} /></span>
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <Icon name="chevron" />
    </button>
  );
}

function PinSheet({ open, onClose }) {
  const [pin, setPin] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const clean = (v) => v.replace(/\D/g, '').slice(0, 4);
  const save = async () => {
    if (next !== again) return setError('The new PINs don’t match.');
    const r = await authAction({ action: 'changePin', pin, newPin: next });
    if (r.error) return setError(r.error);
    toast('PIN changed');
    setPin(''); setNext(''); setAgain(''); setError('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Change my PIN">
      <label className="fieldLabel">Current PIN</label>
      <input className="field big pinField" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(clean(e.target.value))} />
      <label className="fieldLabel">New PIN</label>
      <input className="field big pinField" type="password" inputMode="numeric" value={next} onChange={(e) => setNext(clean(e.target.value))} />
      <label className="fieldLabel">New PIN again</label>
      <input className="field big pinField" type="password" inputMode="numeric" value={again} onChange={(e) => setAgain(clean(e.target.value))} />
      {error && <p className="warn">{error}</p>}
      <div className="sheetFoot"><Btn big kind="primary" icon="check" disabled={pin.length < 4 || next.length < 4 || again.length < 4} onClick={save}>Save PIN</Btn></div>
    </Sheet>
  );
}

export function People() {
  const ix = useIndex();
  const [name, setName] = useState('');
  if (!ix.isAdmin) return <Page back={() => back('/me')} title="People"><Empty icon="lock" title="Only Andrew can manage people" /></Page>;
  const add = async () => {
    const r = await authAction({ action: 'addProfile', name, color: PEOPLE_COLORS[ix.profiles.length % PEOPLE_COLORS.length] });
    if (r.error) return toast(r.error, { tone: 'error' });
    toast(`${name} added — their first PIN is 0000`);
    setName('');
  };
  const reset = async (p) => {
    if (!(await ask({ title: `Reset ${p.data.name}’s PIN?`, body: 'They’ll sign in with 0000 and pick a new one.', yes: 'Reset PIN' }))) return;
    const r = await authAction({ action: 'resetPin', profileId: p.id });
    toast(r.error || `${p.data.name} can now sign in with 0000`, { tone: r.error ? 'error' : 'ok' });
  };
  const remove = async (p) => {
    if (!(await ask({ title: `Remove ${p.data.name}?`, body: 'Their things stay in the inventory. They just can’t sign in.', yes: 'Remove', danger: true }))) return;
    mutate({ type: 'delete', kind: 'profile', id: p.id });
  };
  return (
    <Page back={() => back('/me')} title="People" kicker="Family">
      {ix.profiles.map((p) => (
        <motion.section key={p.id} layout className="card personRow">
          <Avatar profile={p} size={56} />
          <div className="personInfo"><strong>{p.data.name}</strong><small>{p.data.role === 'admin' ? 'Admin' : 'Family'} · {ix.items.filter((i) => i.data.ownerId === p.id).length} things · {ix.boxes.filter((b) => b.data.ownerId === p.id).length} boxes</small></div>
          <div className="personBtns">
            <Btn kind="soft" icon="lock" onClick={() => reset(p)}>Reset PIN</Btn>
            {p.id !== ix.me && <Btn kind="soft" onClick={() => mutate({ type: 'update', kind: 'profile', id: p.id, data: { role: p.data.role === 'admin' ? 'member' : 'admin' } })}>{p.data.role === 'admin' ? 'Make family' : 'Make admin'}</Btn>}
            {p.id !== ix.me && <Btn kind="dangerGhost" icon="trash" onClick={() => remove(p)} aria-label={`Remove ${p.data.name}`} />}
          </div>
        </motion.section>
      ))}
      <section className="card">
        <h2 className="cardTitle"><Icon name="plus" /> Add someone</h2>
        <div className="inlineForm"><input className="field big" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" /><Btn big kind="primary" disabled={!name.trim()} onClick={add}>Add</Btn></div>
      </section>
    </Page>
  );
}

export function Activity() {
  const ix = useIndex();
  const [who, setWho] = useState('all');
  const list = ix.activity.filter((a) => who === 'all' || a.data.actorId === who).slice(0, 300);
  return (
    <Page back={() => back('/me')} title="What happened" kicker="History">
      <div className="whoChips">
        <button className={cx('whoChip', who === 'all' && 'on')} onClick={() => setWho('all')}>Everyone</button>
        {ix.profiles.map((p) => <button key={p.id} className={cx('whoChip', who === p.id && 'on')} onClick={() => setWho(p.id)}><Avatar profile={p} size={24} /> {p.data.name}</button>)}
      </div>
      {list.length ? (
        <ul className="feed big">
          {list.map((a) => {
            const rec = ix.get(a.data.entityId);
            const to = rec && !rec.data?.deletedAt ? (rec.kind === 'box' ? `/b/${rec.data.number}` : rec.kind === 'item' ? `/i/${rec.id}` : rec.kind === 'section' ? `/s/${rec.data.number}` : null) : null;
            return <li key={a.id} onClick={() => to && navigate(to)} className={cx(to && 'tappable')}><Avatar profile={ix.profileById.get(a.data.actorId)} size={36} /><span>{a.data.summary}<small>{timeAgo(a.data.at)}</small></span></li>;
          })}
        </ul>
      ) : <Empty icon="history" title="Nothing yet" />}
    </Page>
  );
}

export function Trash() {
  const ix = useIndex();
  const bringBack = (rec) => mutate({ type: 'restore', kind: rec.kind, id: rec.id }, { message: `${thingLabel(rec)} is back` });
  return (
    <Page back={() => back('/me')} title="Trash" kicker="Removed things">
      {ix.trash.length ? ix.trash.slice(0, 200).map((rec) => (
        <section key={rec.id} className="card trashRow">
          {rec.kind === 'box' ? <BoxTile box={rec} size="xs" /> : <span className="emojiThumb">{ix.categoryById.get(rec.data.categoryId)?.emoji || '📦'}</span>}
          <span><strong>{thingLabel(rec)}</strong><small>Removed by {ix.nameOf(rec.data.deletedBy)} {timeAgo(rec.data.deletedAt)}</small></span>
          <Btn kind="soft" icon="restore" onClick={() => bringBack(rec)}>Bring back</Btn>
        </section>
      )) : <Empty icon="trash" title="Trash is empty">Removed boxes and things wait here so nothing is ever lost by accident.</Empty>}
    </Page>
  );
}
