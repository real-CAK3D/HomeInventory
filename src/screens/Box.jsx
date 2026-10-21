import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { mutate, useIndex } from '../lib/store.js';
import { back, navigate } from '../lib/router.js';
import { Avatar, Btn, Empty, Icon, Page, PhotoStrip, Sheet, Stepper, Toggle, Trail, ask, burst, showOnWall } from '../ui/kit.jsx';
import { CategoryChooser, MoveShelfSheet, OwnerChooser } from '../ui/pickers.jsx';
import { ItemRow } from './Find.jsx';
import { buzz, chime, cx, parseItemLine } from '../lib/util.js';
import { BOX_COLORS, FAMILY, boxLabel } from '../../shared/model.js';

export default function Box({ params }) {
  const ix = useIndex();
  const box = ix.boxByNumber.get(params.number);
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState('');
  const [opened, setOpened] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOpened(true), 120); return () => clearTimeout(t); }, [params.number]);

  if (!box) {
    return (
      <Page back={() => back('/wall')} title={`Box ${params.number}`}>
        <Empty icon="box" title={`No Box ${params.number} yet`} action={<Btn big kind="primary" icon="plus" onClick={() => navigate(`/add?n=${params.number}`)}>Make Box {params.number}</Btn>}>
          This number isn’t used yet. You can create it now.
        </Empty>
      </Page>
    );
  }
  const d = box.data;
  const where = ix.whereIs(box);
  const owner = ix.profileById.get(d.ownerId);
  const mine = d.ownerId === ix.me;
  const items = ix.itemsByBox.get(box.id) || [];
  const total = items.reduce((n, i) => n + (Number(i.data.qty) || 1), 0);

  if (d.redacted) {
    return (
      <Page back={() => back('/wall')} title={`Box ${d.number}`}>
        <Empty icon="eyeoff" title={`${owner?.data.name || 'Someone'}’s private box`}>It’s on <strong>{where.trail.slice(0, 2).join(', ')}</strong>. What’s inside is just for them.</Empty>
      </Page>
    );
  }

  const update = (data, opts) => mutate({ type: 'update', kind: 'box', id: box.id, data }, opts);
  const addLines = (text) => {
    const lines = text.split(/\n|,(?![^(]*\))/).map(parseItemLine).filter(Boolean);
    if (!lines.length) return;
    lines.forEach((line, i) => {
      const opts = i > 0 ? { quiet: true } : lines.length > 1 ? { message: `Added ${lines.length} things to Box ${d.number}`, undo: false } : {};
      mutate({ type: 'create', kind: 'item', data: { name: line.name, qty: line.qty, boxId: box.id, ownerId: d.ownerId || ix.me, categoryId: d.categoryId || '', status: 'stored', photoIds: [] } }, opts);
    });
    setAdding('');
    buzz(15);
    chime('soft');
  };
  const remove = async () => {
    const choice = await ask({
      title: `Remove Box ${d.number}?`,
      body: items.length ? `It has ${items.length} thing${items.length === 1 ? '' : 's'} inside.` : 'It’s empty.',
      choices: items.length ? [['all', 'Remove the box and everything in it', 'danger'], ['keep', 'Remove the box, keep the things on the shelf', 'soft']] : [['all', 'Remove it', 'danger']]
    });
    if (!choice) return;
    if (choice === 'keep') for (const item of items) mutate({ type: 'update', kind: 'item', id: item.id, data: { boxId: null, sectionId: d.sectionId, levelId: d.levelId } }, { quiet: true });
    const result = mutate({ type: 'delete', kind: 'box', id: box.id });
    if (result === 'apply') navigate(where.section ? `/s/${where.section.data.number}` : '/wall', { replace: true });
  };

  return (
    <Page back={() => back('/wall')} className="boxPage">
      <motion.section className={cx('boxHero', opened && 'open')} style={{ '--box': d.color || '#c8955a' }} initial={{ scale: 0.9, rotate: -2, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
        <span className="flap left" /><span className="flap right" />
        <div className="boxFace">
          <span className="marker">{d.number}</span>
          <div className="boxFaceText">
            <h1>{d.name || `Box ${d.number}`}</h1>
            <p>{total} thing{total === 1 ? '' : 's'} inside{d.categoryId && ` · ${ix.categoryById.get(d.categoryId)?.emoji || ''} ${ix.categoryById.get(d.categoryId)?.name || ''}`}</p>
          </div>
          <div className="boxBadges">
            {d.locked && <span className="badge lock"><Icon name="lock" size={16} /> Locked</span>}
            {d.private && <span className="badge"><Icon name="eyeoff" size={16} /> Private</span>}
            <span className="badge owner"><Avatar profile={owner} id={d.ownerId} size={24} /> {d.ownerId === FAMILY ? 'Everyone’s' : mine ? 'Yours' : `${owner?.data.name}’s`}</span>
          </div>
        </div>
      </motion.section>

      <section className="card whereCard">
        <p className="fieldLabel">Where it is</p>
        <Trail where={where} onShow={() => showOnWall(box)} />
        <div className="rowBtns">
          <Btn icon="move" kind="soft" onClick={() => setMoving(true)}>Move box</Btn>
          <Btn icon="edit" kind="soft" onClick={() => setEditing(true)}>Edit</Btn>
          <Btn icon="print" kind="soft" onClick={() => navigate(`/labels?boxes=${d.number}`)}>Label</Btn>
        </div>
      </section>

      <section className="card">
        <h2 className="cardTitle"><Icon name="camera" /> Photos</h2>
        <p className="fieldLabel">Outside of the box</p>
        <PhotoStrip ids={d.photoIds || []} addLabel="Box photo" onAdd={(id) => update({ photoIds: [...(d.photoIds || []), id] }, { message: 'Photo added' })} onRemove={(id) => update({ photoIds: (d.photoIds || []).filter((x) => x !== id) })} />
        <p className="fieldLabel">Inside the box</p>
        <PhotoStrip ids={d.contentPhotoIds || []} addLabel="What’s inside" onAdd={(id) => update({ contentPhotoIds: [...(d.contentPhotoIds || []), id] }, { message: 'Photo added' })} onRemove={(id) => update({ contentPhotoIds: (d.contentPhotoIds || []).filter((x) => x !== id) })} />
      </section>

      <section className="card">
        <h2 className="cardTitle"><Icon name="layers" /> What’s inside <span className="count">{items.length}</span></h2>
        <form className="quickAdd" onSubmit={(e) => { e.preventDefault(); addLines(adding); }}>
          <textarea rows={adding.includes('\n') ? 4 : 1} value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a thing…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addLines(adding); } }} enterKeyHint="done" />
          <Btn kind="primary" icon="plus" disabled={!adding.trim()} onClick={() => addLines(adding)}>Add</Btn>
        </form>
        <p className="muted small">Tip: separate things with commas to add several at once.</p>
        <div className="itemList">
          {items.map((item) => <ItemRow key={item.id} ix={ix} item={item} inBox />)}
          {!items.length && <p className="muted center">Nothing listed yet. Add a photo of the inside, or type what’s in it.</p>}
        </div>
      </section>

      {d.notes && <section className="card"><p className="fieldLabel">Notes</p><p className="notes">{d.notes}</p></section>}

      <section className="card">
        <h2 className="cardTitle"><Icon name="lock" /> Who can change it</h2>
        {mine ? (
          <>
            <Toggle icon="lock" label="Lock this box" hint="Others have to ask you before changing or removing anything in it." checked={d.locked} onChange={(v) => update({ locked: v })} />
            <Toggle icon="eyeoff" label="Keep it private" hint="Others only see that a box is here, not what’s in it." checked={d.private} onChange={(v) => update({ private: v })} />
          </>
        ) : (
          <p className="lead small">{d.locked ? `${owner?.data.name || 'The owner'} locked this box. If you change something, they’ll get asked first.` : d.ownerId === FAMILY ? 'This box belongs to everyone, so anyone can change it.' : `${owner?.data.name || 'The owner'} will hear about any changes you make.`}</p>
        )}
        <p className="fieldLabel">Whose box is it?</p>
        <OwnerChooser value={d.ownerId} onChange={(ownerId) => update({ ownerId })} />
      </section>

      <div className="dangerZone"><Btn kind="dangerGhost" icon="trash" onClick={remove}>Remove this box</Btn></div>

      <MoveShelfSheet open={moving} onClose={() => setMoving(false)} title={`Move Box ${d.number} to…`} current={{ sectionId: d.sectionId, levelId: d.levelId }}
        onPick={(w) => { update(w); burst(); }} />
      <BoxEditor open={editing} onClose={() => setEditing(false)} box={box} />
    </Page>
  );
}

export function BoxEditor({ open, onClose, box }) {
  const d = box.data;
  const [form, setForm] = useState(d);
  useEffect(() => { if (open) setForm(d); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = () => {
    const patch = {};
    for (const k of ['name', 'number', 'color', 'categoryId', 'notes']) if (form[k] !== d[k]) patch[k] = typeof form[k] === 'string' ? form[k].trim() : form[k];
    if (Object.keys(patch).length) mutate({ type: 'update', kind: 'box', id: box.id, data: patch }, { message: `${boxLabel({ data: { ...d, ...patch } })} saved` });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Edit Box ${d.number}`} tall>
      <label className="fieldLabel">Box number</label>
      <Stepper value={Number(form.number) || 1} onChange={(number) => set({ number })} />
      <label className="fieldLabel">Name on the box (optional)</label>
      <input className="field" value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="Kitchen — fragile" />
      <p className="fieldLabel">Color</p>
      <div className="swatches">{BOX_COLORS.map((c) => <button key={c} className={cx('swatch', form.color === c && 'on')} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Color ${c}`} />)}</div>
      <p className="fieldLabel">What kind of stuff?</p>
      <CategoryChooser value={form.categoryId} onChange={(categoryId) => set({ categoryId })} />
      <label className="fieldLabel">Notes</label>
      <textarea className="field" rows={3} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Fragile, heavy, open this side…" />
      <div className="sheetFoot"><Btn big kind="primary" icon="check" onClick={save}>Save</Btn></div>
    </Sheet>
  );
}
