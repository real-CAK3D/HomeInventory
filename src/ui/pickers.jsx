import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useIndex } from '../lib/store.js';
import { BoxTile, Btn, Icon, Sheet, Avatar } from './kit.jsx';
import { search } from '../lib/search.js';
import { cx, buzz } from '../lib/util.js';
import { FAMILY, sectionLabel } from '../../shared/model.js';

/** Big-button grid to choose a section and then a shelf. */
export function ShelfChooser({ sectionId, levelId, onChange, compact = false }) {
  const ix = useIndex();
  const section = ix.sectionById.get(sectionId);
  return (
    <div className="shelfChooser">
      <p className="fieldLabel">Which section?</p>
      <div className={cx('numberGrid', compact && 'compact')}>
        {ix.sections.map((s) => (
          <motion.button key={s.id} whileTap={{ scale: 0.9 }} className={cx('numBtn', s.id === sectionId && 'on')} onClick={() => { buzz(8); onChange({ sectionId: s.id, levelId: s.id === sectionId ? levelId : s.data.levels?.[0]?.id }); }}>
            <strong>{s.data.number}</strong>{s.data.name && <small>{s.data.name}</small>}
          </motion.button>
        ))}
      </div>
      {section && (
        <>
          <p className="fieldLabel">Which shelf of {sectionLabel(section)}?</p>
          <div className="levelStack">
            {(section.data.levels || []).map((l, i) => (
              <motion.button key={l.id} whileTap={{ scale: 0.97 }} className={cx('levelBtn', l.id === levelId && 'on')} onClick={() => { buzz(8); onChange({ sectionId, levelId: l.id }); }}>
                <span className="levelNum">{i + 1}</span>{l.name}
                <small>{(ix.boxesByShelf.get(`${sectionId}|${l.id}`) || []).length} boxes</small>
              </motion.button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function MoveShelfSheet({ open, onClose, title = 'Move to…', current, onPick }) {
  const [where, setWhere] = useState(current || {});
  return (
    <Sheet open={open} onClose={onClose} title={title} tall>
      <ShelfChooser sectionId={where.sectionId} levelId={where.levelId} onChange={setWhere} />
      <div className="sheetFoot"><Btn big kind="primary" icon="check" disabled={!where.sectionId || !where.levelId} onClick={() => { onPick(where); onClose(); }}>Move here</Btn></div>
    </Sheet>
  );
}

/** Pick a box (search by number or name) or a bare shelf, for moving an item. */
export function MoveItemSheet({ open, onClose, current, onPick }) {
  const ix = useIndex();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('box');
  const [where, setWhere] = useState({ sectionId: current?.sectionId, levelId: current?.levelId });
  const boxes = useMemo(() => {
    if (!q.trim()) return ix.boxes.filter((b) => !b.data.redacted).slice(0, 60);
    const r = search(ix, q);
    return [r.exact?.kind === 'box' ? r.exact.rec : null, ...r.boxes.map((x) => x.rec)].filter(Boolean);
  }, [ix, q]);
  return (
    <Sheet open={open} onClose={onClose} title="Where does it go now?" tall>
      <div className="segmented two">
        <button className={mode === 'box' ? 'on' : ''} onClick={() => setMode('box')}>Into a box</button>
        <button className={mode === 'shelf' ? 'on' : ''} onClick={() => setMode('shelf')}>Loose on a shelf</button>
      </div>
      {mode === 'box' ? (
        <>
          <div className="bigSearch small"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Box number or name" inputMode="search" /></div>
          <div className="boxGrid scrollable">
            {boxes.map((b) => (
              <div key={b.id} className={cx('boxResult', current?.boxId === b.id && 'current')}>
                <BoxTile box={b} count={(ix.itemsByBox.get(b.id) || []).length} onClick={() => { onPick({ boxId: b.id, sectionId: null, levelId: null }); onClose(); }} />
                <small>{ix.whereIs(b)?.trail?.slice(0, 2).join(' › ')}</small>
              </div>
            ))}
            {!boxes.length && <p className="muted">No box like that.</p>}
          </div>
        </>
      ) : (
        <>
          <ShelfChooser sectionId={where.sectionId} levelId={where.levelId} onChange={setWhere} compact />
          <div className="sheetFoot"><Btn big kind="primary" icon="check" disabled={!where.levelId} onClick={() => { onPick({ boxId: null, ...where }); onClose(); }}>Put it here</Btn></div>
        </>
      )}
    </Sheet>
  );
}

export function OwnerChooser({ value, onChange }) {
  const ix = useIndex();
  return (
    <div className="ownerChooser">
      {ix.profiles.map((p) => (
        <button key={p.id} type="button" className={cx('ownerBtn', value === p.id && 'on')} style={{ '--c': p.data.color }} onClick={() => { buzz(8); onChange(p.id); }}>
          <Avatar profile={p} size={40} /><span>{p.id === ix.me ? 'Me' : p.data.name}</span>
        </button>
      ))}
      <button type="button" className={cx('ownerBtn', value === FAMILY && 'on')} style={{ '--c': '#9aa0a6' }} onClick={() => onChange(FAMILY)}>
        <Avatar id={FAMILY} size={40} /><span>Everyone</span>
      </button>
    </div>
  );
}

export function CategoryChooser({ value, onChange }) {
  const ix = useIndex();
  return (
    <div className="catChips wrap">
      {ix.categories.map((c) => (
        <button key={c.id} type="button" className={cx('catChip', value === c.id && 'on')} onClick={() => { buzz(8); onChange(value === c.id ? '' : c.id); }}><span>{c.emoji}</span>{c.name}</button>
      ))}
    </div>
  );
}
