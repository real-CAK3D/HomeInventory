import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { addPhoto, cachedPhotoSrc, photoSrc, useToasts, dismissToast } from '../lib/store.js';
import { navigate } from '../lib/router.js';
import { buzz, cx } from '../lib/util.js';
import { FAMILY, containerName } from '../../shared/model.js';

// ---------- icons ----------

const PATHS = {
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.35-4.35',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm7-3a7 7 0 0 1-14 0m7 7v3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  box: 'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5M7.5 5.5l9 5',
  wall: 'M4 3h16v18H4zM4 9h16M4 15h16M12 3v18',
  bell: 'M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2Zm-8 4a2 2 0 0 0 4 0',
  user: 'M20 21a8 8 0 0 0-16 0m8-8a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  camera: 'M3 8h3.5L8 5.5h8L17.5 8H21v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
  unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v10H5z',
  eyeoff: 'M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5.5 0 9 6 9 6a15.6 15.6 0 0 1-3 3.6M6.4 7.6C4.2 9.2 3 12 3 12s3.5 6 9 6a9 9 0 0 0 4-1M9.9 10a3 3 0 0 0 4.2 4.1',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm11-15 4 4',
  move: 'M12 3v18M3 12h18M12 3 9 6m3-3 3 3m-3 15-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17l9-10',
  chevron: 'M9 5l7 7-7 7',
  nfc: 'M6 8.5a6 6 0 0 1 0 7M9.5 6a10 10 0 0 1 0 12M13 4a14 14 0 0 1 0 16M17 2.5a17 17 0 0 1 0 19',
  print: 'M7 9V3h10v6M7 17H4V9h16v8h-3M7 14h10v7H7z',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z',
  home: 'M3 11 12 3l9 8M5 9.5V21h14V9.5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
  restore: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  out: 'M7 17 17 7M9 7h8v8',
  in: 'M17 7 7 17M15 17H7V9',
  pin: 'M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  users: 'M16 21a6 6 0 0 0-12 0m6-8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm12 8a5 5 0 0 0-5-5m1-4a3 3 0 1 0 0-6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.5 1.6 1.2-2 3.4-1.9-.6a7 7 0 0 1-1.9 1.1L15 21h-4l-.3-2.4a7 7 0 0 1-1.9-1.1l-2 .6-2-3.4 1.6-1.2a7 7 0 0 1 0-2.2L4.8 10l2-3.4 1.9.6a7 7 0 0 1 2-1.1L11 3h4l.3 2.4a7 7 0 0 1 1.9 1.1l2-.6 2 3.4-1.7 1.2a7 7 0 0 1 0 2.1Z',
  wifioff: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.5-2.8M19 13a10 10 0 0 0-2.3-1.6M2 9.5a15 15 0 0 1 4.2-2.7M22 9.5A15 15 0 0 0 11 5.6M12 20h.01',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  layers: 'M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2M14 18h2v2M18 18h2v2',
  logout: 'M15 4h4v16h-4M10 16l-4-4 4-4M6 12h10',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z',
  tag: 'M3 12V3h9l9 9-9 9-9-9Zm5-4h.01',
  hand: 'M7 11V5a1.5 1.5 0 0 1 3 0v5m0-1V3.5a1.5 1.5 0 0 1 3 0V10m0-5.5a1.5 1.5 0 0 1 3 0V11m0-3a1.5 1.5 0 0 1 3 0v6a8 8 0 0 1-8 8h-1a7 7 0 0 1-5.6-2.8L3 15.4a1.6 1.6 0 0 1 2.4-2.1L7 15'
};

export function Icon({ name, size = 24, stroke = 2.2, className }) {
  return (
    <svg className={cx('icon', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={PATHS[name] || PATHS.box} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- people ----------

export function Avatar({ profile, id, size = 44, ring = false }) {
  const d = profile?.data;
  if (id === FAMILY || (!profile && id === undefined)) {
    return <span className="avatar family" style={{ width: size, height: size, fontSize: size * 0.45 }}>🏠</span>;
  }
  return (
    <span className={cx('avatar', ring && 'ring')} style={{ width: size, height: size, '--c': d?.color || '#888', fontSize: size * 0.48 }}>
      {d?.photoId ? <PhotoImg id={d.photoId} alt="" /> : <span>{d?.emoji || (d?.name || '?').slice(0, 1)}</span>}
    </span>
  );
}

// ---------- photos ----------

export function PhotoImg({ id, size = 't', alt = '', className, onClick }) {
  const [src, setSrc] = useState(() => (id ? cachedPhotoSrc(id, size) : null));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (id) photoSrc(id, size).then((s) => alive && setSrc(s));
    return () => { alive = false; };
  }, [id, size]);
  if (!id || failed) return <span className={cx('photoPlaceholder', className)} onClick={onClick}><Icon name="image" size={28} /></span>;
  return src ? <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onClick={onClick} onError={() => setFailed(true)} draggable="false" /> : <span className={cx('photoPlaceholder shimmer', className)} />;
}

/** A big friendly button that opens the camera (or file picker on a computer). */
export function CameraButton({ onPhoto, label = 'Take a photo', multiple = false, className, big = false, children }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) onPhoto(await addPhoto(file));
      buzz(20);
    } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={cx('cameraBtn', big && 'big', className)} onClick={() => input.current?.click()} disabled={busy}>
        {children || <><Icon name="camera" size={big ? 34 : 22} /><span>{busy ? 'Saving…' : label}</span></>}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple={multiple} hidden onChange={pick} />
    </>
  );
}

let viewerState = null;
const viewerListeners = new Set();
export function openViewer(ids, start = 0) { viewerState = { ids, start }; viewerListeners.forEach((f) => f()); }
function closeViewer() { viewerState = null; viewerListeners.forEach((f) => f()); }

export function PhotoViewer() {
  const state = useSyncExternalStore((fn) => { viewerListeners.add(fn); return () => viewerListeners.delete(fn); }, () => viewerState);
  const [i, setI] = useState(0);
  useEffect(() => { if (state) setI(state.start); }, [state]);
  useEffect(() => {
    if (!state) return undefined;
    const key = (e) => {
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowRight') setI((x) => Math.min(state.ids.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [state]);
  return (
    <AnimatePresence>
      {state && (
        <motion.div className="viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeViewer}>
          <motion.div key={state.ids[i]} className="viewerFrame" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.6} onClick={(e) => e.stopPropagation()}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80) setI((x) => Math.min(state.ids.length - 1, x + 1));
              else if (info.offset.x > 80) setI((x) => Math.max(0, x - 1));
              else if (Math.abs(info.offset.y) > 120) closeViewer();
            }}>
            <PhotoImg id={state.ids[i]} size="f" />
          </motion.div>
          <button className="viewerClose" onClick={closeViewer} aria-label="Close photo"><Icon name="close" size={30} /></button>
          {state.ids.length > 1 && <div className="viewerDots">{state.ids.map((id, n) => <span key={id} className={n === i ? 'on' : ''} />)}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PhotoStrip({ ids = [], onAdd, onRemove, addLabel = 'Add photo', emptyText }) {
  return (
    <div className="photoStrip">
      {ids.map((id, n) => (
        <div className="photoThumb" key={id}>
          <PhotoImg id={id} onClick={() => openViewer(ids, n)} />
          {onRemove && <button className="photoRemove" aria-label="Remove photo" onClick={() => onRemove(id)}><Icon name="close" size={16} /></button>}
        </div>
      ))}
      {onAdd && <CameraButton className="photoAdd" onPhoto={onAdd} multiple label={addLabel} />}
      {!ids.length && !onAdd && emptyText && <p className="muted">{emptyText}</p>}
    </div>
  );
}

// ---------- boxes ----------

export function BoxTile({ box, count = 0, ownerColor, highlight = false, dim = false, onClick, size = 'md', layoutId }) {
  const d = box.data;
  return (
    <motion.button layout layoutId={layoutId} type="button" className={cx('boxTile', size, highlight && 'hit', dim && 'dim', d.redacted && 'secret')} style={{ '--box': d.color || '#c8955a', '--owner': ownerColor || 'transparent' }}
      onClick={onClick} whileTap={{ scale: 0.94 }} aria-label={d.redacted ? `${containerName(d)}, private` : `${containerName(d)}${d.name ? `, ${d.name}` : ''}, ${count} things`}>
      <span className="tape" />
      <span className="boxNum">{d.number}</span>
      {size !== 'xs' && <span className="boxName">{d.redacted ? 'Private' : d.name || `${count} thing${count === 1 ? '' : 's'}`}</span>}
      {(d.locked || d.redacted) && <span className="boxLock"><Icon name={d.redacted ? 'eyeoff' : 'lock'} size={13} stroke={2.6} /></span>}
      {highlight && <motion.span className="hitPin" initial={{ y: -30, opacity: 0 }} animate={{ y: [-14, 0, -14], opacity: 1 }} transition={{ y: { repeat: Infinity, duration: 1.2 }, opacity: { duration: 0.3 } }}><Icon name="pin" size={26} /></motion.span>}
    </motion.button>
  );
}

export function Trail({ where, onShow, compact = false }) {
  if (!where?.trail?.length) return <span className="trail muted">No spot set yet</span>;
  return (
    <span className={cx('trail', compact && 'compact')}>
      {where.trail.map((t, i) => <span key={i} className="crumb">{t}</span>)}
      {onShow && <button type="button" className="showBtn" onClick={(e) => { e.stopPropagation(); onShow(); }}><Icon name="pin" size={16} /> Show me</button>}
    </span>
  );
}

export function showOnWall(rec) {
  navigate(`/wall?find=${encodeURIComponent(rec.id)}`);
}

// ---------- layout pieces ----------

export function Page({ title, kicker, back, actions, children, className, hero }) {
  return (
    <motion.main className={cx('page', className)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}>
      {(title || back) && (
        <header className="pageHead">
          {back && <button className="iconBtn" onClick={back} aria-label="Go back"><Icon name="back" size={28} /></button>}
          <div className="pageTitle">
            {kicker && <p className="kicker">{kicker}</p>}
            {title && <h1>{title}</h1>}
          </div>
          {actions && <div className="pageActions">{actions}</div>}
        </header>
      )}
      {hero}
      {children}
    </motion.main>
  );
}

export function Card({ children, className, ...rest }) {
  return <section className={cx('card', className)} {...rest}>{children}</section>;
}

export function Btn({ icon, children, kind = 'plain', big = false, className, ...rest }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.96 }} className={cx('btn', kind, big && 'big', className)} {...rest} onClick={(e) => { buzz(8); rest.onClick?.(e); }}>
      {icon && <Icon name={icon} size={big ? 26 : 22} />}
      {children && <span>{children}</span>}
    </motion.button>
  );
}

export function Segmented({ value, options, onChange, className }) {
  return (
    <div className={cx('segmented', className)} role="radiogroup">
      {options.map(([v, label, icon]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => { buzz(8); onChange(v); }}>
          {icon && <span className="segIcon">{icon}</span>}<span>{label}</span>
          {value === v && <motion.span layoutId={`seg-${options.map((o) => o[0]).join('')}`} className="segPill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, icon }) {
  return (
    <label className="toggleRow">
      {icon && <span className="toggleIcon"><Icon name={icon} /></span>}
      <span className="toggleText"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => { buzz(10); onChange(e.target.checked); }} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

export function Stepper({ value, onChange, min = 1, max = 9999, label }) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" onClick={() => { buzz(8); onChange(Math.max(min, value - 1)); }} aria-label="Less"><Icon name="minus" /></button>
      <input inputMode="numeric" value={value} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (!Number.isNaN(n)) onChange(Math.min(max, n)); }} onBlur={() => onChange(Math.max(min, value))} />
      <button type="button" onClick={() => { buzz(8); onChange(Math.min(max, value + 1)); }} aria-label="More"><Icon name="plus" /></button>
    </div>
  );
}

export function Empty({ icon = 'box', title, children, action }) {
  return (
    <div className="empty">
      <motion.div className="emptyIcon" initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}><Icon name={icon} size={44} /></motion.div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

// ---------- sheets & confirm ----------

export function Sheet({ open, onClose, title, children, tall = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    document.body.classList.add('noScroll');
    return () => { window.removeEventListener('keydown', key); document.body.classList.remove('noScroll'); };
  }, [open, onClose]);
  // Drawn at the top of the page so it always sits above the bottom bar.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="sheetWrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className={cx('sheet', tall && 'tall')} role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }} dragSnapToOrigin
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 700) onClose(); }}
            onClick={(e) => e.stopPropagation()}>
            <div className="sheetGrip" />
            {title && <header className="sheetHead"><h2>{title}</h2><button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" size={26} /></button></header>}
            <div className="sheetBody" onPointerDownCapture={(e) => { if (e.target.closest('input,textarea,select,.scrollable')) e.stopPropagation(); }}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

let askState = null;
const askListeners = new Set();
/** Promise-based friendly confirm: await ask({ title, body, yes, no, danger }) */
export function ask(opts) {
  return new Promise((resolve) => {
    askState = { ...opts, resolve };
    askListeners.forEach((f) => f());
  });
}
export function AskHost() {
  const state = useSyncExternalStore((fn) => { askListeners.add(fn); return () => askListeners.delete(fn); }, () => askState);
  const [text, setText] = useState('');
  useEffect(() => setText(state?.defaultText || ''), [state]);
  const done = (value) => { state?.resolve(value); askState = null; askListeners.forEach((f) => f()); };
  return (
    <Sheet open={Boolean(state)} onClose={() => done(false)} title={state?.title}>
      {state?.body && <p className="lead">{state.body}</p>}
      {state?.input && <textarea className="field" rows={2} placeholder={state.input} value={text} onChange={(e) => setText(e.target.value)} />}
      {state?.choices ? (
        <div className="stackBtns">{state.choices.map(([v, label, kind]) => <Btn key={v} big kind={kind || 'soft'} onClick={() => done(v)}>{label}</Btn>)}<Btn big kind="ghost" onClick={() => done(false)}>Never mind</Btn></div>
      ) : (
        <div className="stackBtns">
          <Btn big kind={state?.danger ? 'danger' : 'primary'} onClick={() => done(state?.input ? { text } : true)}>{state?.yes || 'Yes'}</Btn>
          <Btn big kind="ghost" onClick={() => done(false)}>{state?.no || 'Never mind'}</Btn>
        </div>
      )}
    </Sheet>
  );
}

// ---------- toasts ----------

export function Toasts() {
  const list = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div key={t.id} layout className={cx('toast', t.tone)} initial={{ y: 40, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.95 }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} onDragEnd={(_, i) => Math.abs(i.offset.x) > 80 && dismissToast(t.id)}>
            <Icon name={t.icon || (t.tone === 'error' ? 'close' : t.tone === 'info' ? 'bell' : 'check')} size={22} />
            <span>{t.text}</span>
            {t.undo && <button onClick={() => { t.undo(); dismissToast(t.id); }}><Icon name="undo" size={18} /> Undo</button>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------- celebration ----------

export function burst(colors = ['#ff7a59', '#4f9dff', '#ffd166', '#2ec4a6', '#b07cff']) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'calm') return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const W = (canvas.width = window.innerWidth), H = (canvas.height = window.innerHeight);
  const bits = Array.from({ length: 140 }, () => ({
    x: W / 2, y: H * 0.45, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 4,
    r: Math.random() * 6 + 4, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.4
  }));
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += 0.42; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.a += b.va;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.c; ctx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r); ctx.restore();
    }
    if (++frame < 150) requestAnimationFrame(tick); else canvas.remove();
  };
  tick();
}
