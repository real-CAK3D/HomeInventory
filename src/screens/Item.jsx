import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { mutate, useIndex } from '../lib/store.js';
import { back, navigate } from '../lib/router.js';
import { Avatar, Btn, Empty, Icon, Page, PhotoImg, PhotoStrip, Sheet, Stepper, Toggle, Trail, ask, burst, openViewer, showOnWall } from '../ui/kit.jsx';
import { CategoryChooser, MoveItemSheet, OwnerChooser } from '../ui/pickers.jsx';
import { timeAgo, chime } from '../lib/util.js';
import { FAMILY } from '../../shared/model.js';

export default function Item({ params }) {
  const ix = useIndex();
  const item = ix.get(params.id);
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!item || item.kind !== 'item' || item.data.deletedAt) {
    return <Page back={() => back('/')} title="Not here"><Empty icon="search" title="We can’t find that one">It may have been removed. Check the trash in your settings.</Empty></Page>;
  }
  const d = item.data;
  const where = ix.whereIs(item);
  const owner = ix.profileById.get(d.ownerId);
  const mine = d.ownerId === ix.me;
  const out = d.status === 'out';
  const history = ix.activity.filter((a) => a.data.entityId === item.id).slice(0, 8);
  const cat = ix.categoryById.get(d.categoryId);
  const update = (data, opts) => mutate({ type: 'update', kind: 'item', id: item.id, data }, opts);

  const takeOut = async () => {
    const answer = await ask({ title: `Taking out ${d.name}?`, body: 'Add a note so everyone knows where it went (optional).', input: 'e.g. “In the kitchen”', yes: 'Take it out' });
    if (!answer) return;
    const r = update({ status: 'out', outBy: ix.me, outAt: new Date().toISOString(), outNote: answer.text?.trim() || '' });
    if (r === 'apply') chime('soft');
  };
  const putBack = () => { update({ status: 'stored', outBy: null, outAt: null, outNote: '' }); burst(); chime('success'); };
  const remove = async () => {
    if (await ask({ title: `Remove ${d.name}?`, body: 'It goes to the trash, so you can bring it back later.', yes: 'Remove it', danger: true })) {
      if (mutate({ type: 'delete', kind: 'item', id: item.id }) === 'apply') back('/');
    }
  };
  const allPhotos = [...(d.photoIds || [])];

  return (
    <Page back={() => back('/')} className="itemPage">
      <motion.section className="itemHero" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <button className="itemPhoto" onClick={() => allPhotos.length && openViewer(allPhotos)}>
          {allPhotos[0] ? <PhotoImg id={allPhotos[0]} size="f" /> : <span className="bigEmoji">{cat?.emoji || '📦'}</span>}
          {out && <span className="outStamp">Taken out</span>}
        </button>
        <div className="itemTitle">
          <p className="kicker">{cat ? `${cat.emoji} ${cat.name}` : 'Thing'}</p>
          <h1>{d.qty > 1 && <span className="qtyBig">{d.qty}×</span>} {d.name}</h1>
          <p className="ownerLine"><Avatar profile={owner} id={d.ownerId} size={28} /> {d.ownerId === FAMILY ? 'Belongs to everyone' : mine ? 'Yours' : `${owner?.data.name}’s`}{d.locked && <span className="badge lock"><Icon name="lock" size={14} /> Locked</span>}</p>
        </div>
      </motion.section>

      <section className="card whereCard">
        <p className="fieldLabel">Where it is</p>
        <Trail where={where} onShow={() => showOnWall(item)} />
        {where.box && <Btn kind="soft" icon="box" onClick={() => navigate(`/b/${where.box.data.number}`)}>Open {where.box.data.name || `Box ${where.box.data.number}`}</Btn>}
      </section>

      {out ? (
        <section className="card outCard">
          <p className="lead"><strong>{ix.nameOf(d.outBy)}</strong> took it out {timeAgo(d.outAt)}{d.outNote && <> — “{d.outNote}”</>}</p>
          <Btn big kind="primary" icon="in" onClick={putBack}>I put it back</Btn>
        </section>
      ) : (
        <Btn big kind="soft" className="wide" icon="out" onClick={takeOut}>I’m taking this out</Btn>
      )}

      <section className="card">
        <h2 className="cardTitle"><Icon name="camera" /> Photos</h2>
        <PhotoStrip ids={d.photoIds || []} addLabel="Add photo" onAdd={(id) => update({ photoIds: [...(d.photoIds || []), id] }, { message: 'Photo added' })} onRemove={(id) => update({ photoIds: (d.photoIds || []).filter((x) => x !== id) })} />
      </section>

      {d.notes && <section className="card"><p className="fieldLabel">Notes</p><p className="notes">{d.notes}</p></section>}

      <div className="rowBtns big">
        <Btn icon="move" kind="soft" onClick={() => setMoving(true)}>Move</Btn>
        <Btn icon="edit" kind="soft" onClick={() => setEditing(true)}>Edit</Btn>
      </div>

      {mine && (
        <section className="card">
          <Toggle icon="lock" label="Lock it" hint="Others must ask you before moving, changing or removing it." checked={d.locked} onChange={(v) => update({ locked: v })} />
          <Toggle icon="eyeoff" label="Keep it private" hint="Only you can see it in the app." checked={d.private} onChange={(v) => update({ private: v })} />
        </section>
      )}

      {history.length > 0 && (
        <section className="card">
          <h2 className="cardTitle"><Icon name="history" /> History</h2>
          <ul className="feed">{history.map((a) => <li key={a.id}><Avatar profile={ix.profileById.get(a.data.actorId)} size={30} /><span>{a.data.summary}<small>{timeAgo(a.data.at)}</small></span></li>)}</ul>
        </section>
      )}

      <div className="dangerZone"><Btn kind="dangerGhost" icon="trash" onClick={remove}>Remove {d.name}</Btn></div>

      <MoveItemSheet open={moving} onClose={() => setMoving(false)} current={{ boxId: d.boxId, sectionId: where.section?.id, levelId: where.levelId }} onPick={(w) => update(w)} />
      <ItemEditor open={editing} onClose={() => setEditing(false)} item={item} />
    </Page>
  );
}

function ItemEditor({ open, onClose, item }) {
  const d = item.data;
  const [form, setForm] = useState(d);
  useEffect(() => { if (open) setForm(d); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = () => {
    if (!form.name?.trim()) return;
    const patch = {};
    for (const k of ['name', 'qty', 'categoryId', 'notes', 'ownerId']) if (form[k] !== d[k]) patch[k] = typeof form[k] === 'string' ? form[k].trim() : form[k];
    if (Object.keys(patch).length) mutate({ type: 'update', kind: 'item', id: item.id, data: patch });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Edit" tall>
      <label className="fieldLabel">What is it?</label>
      <input className="field big" value={form.name || ''} onChange={(e) => set({ name: e.target.value })} />
      <label className="fieldLabel">How many?</label>
      <Stepper value={Number(form.qty) || 1} onChange={(qty) => set({ qty })} />
      <p className="fieldLabel">Kind of thing</p>
      <CategoryChooser value={form.categoryId} onChange={(categoryId) => set({ categoryId })} />
      <p className="fieldLabel">Whose is it?</p>
      <OwnerChooser value={form.ownerId} onChange={(ownerId) => set({ ownerId })} />
      <label className="fieldLabel">Notes</label>
      <textarea className="field" rows={3} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Color, size, who gave it…" />
      <div className="sheetFoot"><Btn big kind="primary" icon="check" onClick={save}>Save</Btn></div>
    </Sheet>
  );
}

export { PhotoImg };
