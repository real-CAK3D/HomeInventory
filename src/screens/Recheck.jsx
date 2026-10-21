import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { mutate, useIndex } from '../lib/store.js';
import { back, navigate } from '../lib/router.js';
import { Avatar, BoxTile, Btn, Empty, Icon, Page, PhotoImg, Sheet, ask, burst, openViewer } from '../ui/kit.jsx';
import { MoveShelfSheet } from '../ui/pickers.jsx';
import { BoxEditor } from './Box.jsx';
import { search } from '../lib/search.js';
import { buzz, chime, cx, timeAgo } from '../lib/util.js';
import { boxLabel, sectionLabel, thingLabel } from '../../shared/model.js';

/** Drag the handle to wipe between the old and new shelf photo. */
function BeforeAfter({ before, after }) {
  const [pos, setPos] = useState(50);
  const frame = useRef(null);
  const drag = (clientX) => {
    const r = frame.current.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div className="beforeAfter" ref={frame}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons) drag(e.clientX); }}>
      <PhotoImg id={after} size="f" className="baImg" />
      <div className="baBefore" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}><PhotoImg id={before} size="f" className="baImg" /></div>
      <span className="baTag left">Before</span><span className="baTag right">Now</span>
      <span className="baHandle" style={{ left: `${pos}%` }}><span><Icon name="move" size={20} /></span></span>
      <input className="baRange" type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Compare the old and new photo" />
    </div>
  );
}

export default function Recheck({ query }) {
  const ix = useIndex();
  const section = ix.sectionById.get(query.s);
  const level = section?.data.levels?.find((l) => l.id === query.l);
  const [marks, setMarks] = useState({}); // id → 'here' | 'moved' | 'gone'
  const [moving, setMoving] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  // Remember who was on this shelf when the check started, so moved boxes stay in the list.
  const startList = useRef(null);
  const key = `${query.s}|${query.l}`;
  const nowOnShelf = [...(ix.boxesByShelf.get(key) || []), ...(ix.looseByShelf.get(key) || [])];
  if (!startList.current && section) startList.current = nowOnShelf.map((r) => r.id);
  const rows = useMemo(() => {
    const ids = [...new Set([...(startList.current || []), ...nowOnShelf.map((r) => r.id)])];
    return ids.map((id) => ix.get(id)).filter(Boolean);
  }, [ix, nowOnShelf.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!section || !level) return <Page back={() => back('/wall')} title="Shelf check"><Empty icon="wall" title="That shelf isn’t here anymore" /></Page>;

  const before = level.photoHistory?.[0]?.photoId;
  const doneTo = query.back || `/s/${section.data.number}/${section.data.levels.indexOf(level) + 1}`;
  const mark = (id, value) => { buzz(10); setMarks((m) => ({ ...m, [id]: value })); };
  const checked = rows.filter((r) => marks[r.id] || r.data.deletedAt || r.data.levelId !== level.id || r.data.sectionId !== section.id).length;

  const gone = async (rec) => {
    const choice = await ask({
      title: `${thingLabel(rec)} isn’t on this shelf`,
      body: 'Do you know where it went?',
      choices: [['move', 'It’s somewhere else — let me pick', 'primary'], ['removed', 'It was emptied or thrown out', 'danger']]
    });
    if (choice === 'move') setMoving(rec);
    if (choice === 'removed' && mutate({ type: 'delete', kind: rec.kind, id: rec.id }) !== 'deny') mark(rec.id, 'gone');
  };

  const finish = () => {
    burst();
    chime('success');
    navigate(doneTo, { replace: true });
  };

  return (
    <Page back={() => back(doneTo)} kicker={`${sectionLabel(section)} · shelf check`} title={level.name} className="recheckPage">
      {before && level.photoId ? (
        <section className="card">
          <h2 className="cardTitle"><Icon name="image" /> Before and now</h2>
          <BeforeAfter before={before} after={level.photoId} />
          <p className="muted small">Drag across the photo to compare. Old photo from {timeAgo(level.photoHistory[0].at) || 'before'}{level.photoHistory[0].by ? ` by ${ix.nameOf(level.photoHistory[0].by)}` : ''}.</p>
        </section>
      ) : level.photoId && (
        <button className="bigPhoto" onClick={() => openViewer([level.photoId])}><PhotoImg id={level.photoId} size="f" /></button>
      )}

      <section className="card">
        <h2 className="cardTitle"><Icon name="check" /> What was on this shelf <span className="count">{checked}/{rows.length}</span></h2>
        <p className="muted">Check each one against the new photo. Owners hear about anything that moved.</p>
        <AnimatePresence initial={false}>
          {rows.map((rec) => {
            const movedAway = rec.data.sectionId !== section.id || rec.data.levelId !== level.id;
            const state = rec.data.deletedAt ? 'gone' : movedAway ? 'moved' : marks[rec.id];
            const where = movedAway && !rec.data.deletedAt ? ix.whereIs(rec)?.trail?.slice(0, 2).join(' › ') : null;
            const owner = ix.profileById.get(rec.data.ownerId);
            return (
              <motion.div key={rec.id} layout className={cx('recheckRow', state)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="recheckWho">
                  {rec.kind === 'box' ? <BoxTile box={rec} size="xs" /> : <span className="emojiThumb">{ix.categoryById.get(rec.data.categoryId)?.emoji || '📦'}</span>}
                  <span><strong>{rec.kind === 'box' ? boxLabel(rec) : thingLabel(rec)}</strong>
                    <small>{state === 'moved' ? (where ? `Now on ${where}` : `Waiting for ${owner?.data.name || 'the owner'} to OK the move`) : state === 'gone' ? 'Removed' : state === 'here' ? 'Still here' : owner ? `${owner.data.name}’s` : 'Everyone’s'}{rec.data.locked && ' · locked'}</small></span>
                  {owner && <Avatar profile={owner} size={28} />}
                </div>
                {!rec.data.deletedAt && (
                  <div className="recheckBtns">
                    <button className={cx(state === 'here' && 'on')} onClick={() => mark(rec.id, 'here')}><Icon name="check" size={18} /> Still here</button>
                    <button className={cx(state === 'moved' && 'on')} onClick={() => setMoving(rec)}><Icon name="move" size={18} /> Moved</button>
                    <button onClick={() => gone(rec)}><Icon name="close" size={18} /> Gone</button>
                    {rec.kind === 'box' && <button onClick={() => setEditing(rec)} aria-label="Change type or name"><Icon name="edit" size={18} /></button>}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!rows.length && <p className="muted center">Nothing was listed on this shelf yet.</p>}
      </section>

      <section className="card">
        <h2 className="cardTitle"><Icon name="plus" /> Anything new on this shelf?</h2>
        <div className="rowBtns">
          <Btn kind="soft" icon="move" onClick={() => setAdding(true)}>Move a box here</Btn>
          <Btn kind="soft" icon="camera" onClick={() => navigate(`/add?s=${section.id}&l=${level.id}`)}>Pack a new one</Btn>
        </div>
      </section>

      <div className="captureFoot">
        <Btn big kind="primary" icon="check" onClick={finish}>{checked < rows.length ? `Done (${rows.length - checked} not checked)` : 'All checked — done'}</Btn>
      </div>

      <MoveShelfSheet open={Boolean(moving)} onClose={() => setMoving(null)} title={moving ? `Where is ${thingLabel(moving)} now?` : ''}
        current={{ sectionId: section.id, levelId: level.id }}
        onPick={(w) => {
          if (w.sectionId === section.id && w.levelId === level.id) { mark(moving.id, 'here'); return; }
          if (mutate({ type: 'update', kind: moving.kind, id: moving.id, data: { sectionId: w.sectionId, levelId: w.levelId } }) !== 'deny') mark(moving.id, 'moved');
        }} />
      {editing && <BoxEditor open onClose={() => setEditing(null)} box={ix.get(editing.id) || editing} />}
      <MoveHereSheet open={adding} onClose={() => setAdding(false)} section={section} level={level} />
    </Page>
  );
}

function MoveHereSheet({ open, onClose, section, level }) {
  const ix = useIndex();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const elsewhere = (b) => !b.data.redacted && !(b.data.sectionId === section.id && b.data.levelId === level.id);
    if (!q.trim()) return ix.boxes.filter(elsewhere).slice(0, 40);
    const r = search(ix, q);
    return [r.exact?.kind === 'box' ? r.exact.rec : null, ...r.boxes.map((x) => x.rec)].filter((b) => b && elsewhere(b));
  }, [ix, q, section.id, level.id]);
  return (
    <Sheet open={open} onClose={onClose} title={`Which box is on ${level.name} now?`} tall>
      <div className="bigSearch small"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number or name" inputMode="search" /></div>
      <div className="boxGrid scrollable">
        {list.map((b) => (
          <div key={b.id} className="boxResult">
            <BoxTile box={b} count={(ix.itemsByBox.get(b.id) || []).length} onClick={() => { mutate({ type: 'update', kind: 'box', id: b.id, data: { sectionId: section.id, levelId: level.id } }); onClose(); }} />
            <small>{ix.whereIs(b)?.trail?.slice(0, 2).join(' › ')}</small>
          </div>
        ))}
        {!list.length && <p className="muted">No box like that.</p>}
      </div>
    </Sheet>
  );
}
