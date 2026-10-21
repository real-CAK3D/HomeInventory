import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { getIndex, mutate, useIndex } from '../lib/store.js';
import { back, navigate } from '../lib/router.js';
import { BoxTile, Btn, CameraButton, Icon, PhotoImg, PhotoStrip, Stepper, burst, openViewer } from '../ui/kit.jsx';
import { CategoryChooser, MoveItemSheet, OwnerChooser, ShelfChooser } from '../ui/pickers.jsx';
import { buzz, chime, cx, parseItemLine, timeAgo } from '../lib/util.js';
import { BOX_COLORS, CONTAINERS, newId, sectionLabel, levelLabel } from '../../shared/model.js';
import { setShelfPhoto } from '../lib/shelves.js';

const STEPS = ['where', 'shelf', 'box', 'inside', 'done'];
const nextFreeNumber = (ix) => { let n = 1; while (ix.boxByNumber.has(n)) n += 1; return n; };

export default function Capture({ query }) {
  if (query.mode === 'item' || query.name) return <QuickItem query={query} />;
  return <PackFlow query={query} />;
}

function PackFlow({ query }) {
  const ix = useIndex();
  const [step, setStep] = useState(query.s && query.l ? 'shelf' : 'where');
  const [where, setWhere] = useState({ sectionId: query.s || '', levelId: query.l || '' });
  const blankBox = () => ({ id: newId('box'), number: Number(query.n) || nextFreeNumber(getIndex()), container: 'Box', name: '', color: BOX_COLORS[Math.floor(Math.random() * BOX_COLORS.length)], ownerId: ix.me, categoryId: '', photoIds: [], contentPhotoIds: [] });
  const [box, setBox] = useState(blankBox);
  const [created, setCreated] = useState(false);
  const [list, setList] = useState('');
  const [packed, setPacked] = useState([]);
  const section = ix.sectionById.get(where.sectionId);
  const level = section?.data.levels?.find((l) => l.id === where.levelId);
  const stepNo = STEPS.indexOf(step);
  const go = (s) => { buzz(10); setStep(s); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const parsed = useMemo(() => list.split(/\n|,(?![^(]*\))/).map(parseItemLine).filter(Boolean), [list]);

  const saveBox = () => {
    if (!created) {
      mutate({ type: 'create', kind: 'box', id: box.id, data: { ...box, sectionId: where.sectionId, levelId: where.levelId, locked: false, private: false } }, { quiet: true });
      setCreated(true);
    } else {
      mutate({ type: 'update', kind: 'box', id: box.id, data: { number: box.number, container: box.container, name: box.name, color: box.color, ownerId: box.ownerId, categoryId: box.categoryId, photoIds: box.photoIds } }, { quiet: true });
    }
    go('inside');
  };

  const finishBox = () => {
    mutate({ type: 'update', kind: 'box', id: box.id, data: { contentPhotoIds: box.contentPhotoIds } }, { quiet: true });
    parsed.forEach((p) => mutate({ type: 'create', kind: 'item', data: { name: p.name, qty: p.qty, boxId: box.id, ownerId: box.ownerId, categoryId: box.categoryId, status: 'stored', photoIds: [] } }, { quiet: true }));
    setPacked((list0) => [...list0, { ...box, count: parsed.length }]);
    burst([box.color, '#ffd166', '#ffffff', '#4f9dff']);
    chime('success');
    go('done');
  };

  const nextBox = (sameShelf) => {
    setBox({ ...blankBox(), number: nextFreeNumber(getIndex()), container: box.container, ownerId: box.ownerId, categoryId: '' });
    setCreated(false);
    setList('');
    go(sameShelf ? 'box' : 'where');
  };

  const setLevelPhoto = (photoId) => setShelfPhoto(section, level.id, photoId, { returnTo: `/add?s=${section.id}&l=${level.id}` });

  return (
    <main className="page capturePage">
      <header className="captureHead">
        <button className="iconBtn" onClick={() => (stepNo > 0 && step !== 'done' ? go(STEPS[stepNo - 1]) : back('/'))} aria-label="Back"><Icon name="back" size={28} /></button>
        <div className="progress"><motion.span animate={{ width: `${(Math.min(stepNo, 4) / 4) * 100}%` }} /></div>
        <button className="linkBtn" onClick={() => navigate('/')}>Done</button>
      </header>
      {section && level && step !== 'where' && (
        <button className="captureWhere" onClick={() => go('where')}><Icon name="pin" size={18} /> {sectionLabel(section)} › {level.name} <small>change</small></button>
      )}

      <AnimatePresence mode="wait">
        <motion.section key={step} className="captureStep" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.22 }}>
          {step === 'where' && (
            <>
              <h1>Where is this box going?</h1>
              {!ix.sections.length ? <p className="lead">Set up the shelf sections first (Me › Shelf setup).</p> : <ShelfChooser sectionId={where.sectionId} levelId={where.levelId} onChange={setWhere} />}
              <div className="captureFoot"><Btn big kind="primary" icon="chevron" disabled={!where.levelId} onClick={() => go('shelf')}>Next</Btn></div>
            </>
          )}

          {step === 'shelf' && level && (
            <>
              {!section.data.photoId && (
                <div className="sectionNudge">
                  <span><strong>No photo of {sectionLabel(section)} yet.</strong> Step back and get the whole unit, top to floor.</span>
                  <CameraButton label="Whole section" onPhoto={(photoId) => mutate({ type: 'update', kind: 'section', id: section.id, data: { photoId } }, { message: 'Section photo saved', undo: false })} />
                </div>
              )}
              <h1>{level.photoId ? 'Does the shelf still look like this?' : 'Snap the shelf'}</h1>
              <p className="lead">{level.photoId
                ? <>{ix.nameOf(level.photoBy) !== 'Someone' ? `${ix.nameOf(level.photoBy)} took this` : 'This was taken'} {timeAgo(level.photoAt) || 'earlier'}. If it still matches, skip ahead. If things changed, update it.</>
                : <>A quick photo of <strong>{level.name}</strong> helps everyone spot the right box later.</>}</p>
              {level.photoId ? (
                <div className="bigPhoto" onClick={() => openViewer([level.photoId])}><PhotoImg id={level.photoId} size="f" /><span className="photoTag"><Icon name="check" size={18} /> Shelf photo on file</span></div>
              ) : (
                <CameraButton big className="bigCamera" label="Take shelf photo" onPhoto={setLevelPhoto} />
              )}
              <div className="captureFoot">
                {level.photoId && <CameraButton className="btn soft big" label="Shelf changed? Update photo" onPhoto={setLevelPhoto} />}
                <Btn big kind="primary" icon="chevron" onClick={() => go('box')}>{level.photoId ? 'Looks the same — next' : 'Skip for now'}</Btn>
              </div>
            </>
          )}

          {step === 'box' && (
            <>
              <h1>The {box.container.toLowerCase()}</h1>
              <p className="fieldLabel">What is it?</p>
              <div className="catChips wrap">{CONTAINERS.map((t) => <button key={t} type="button" className={cx('catChip', box.container === t && 'on')} onClick={() => { buzz(8); setBox({ ...box, container: t }); }}>{t}</button>)}</div>
              <div className="boxPreview"><BoxTile box={{ data: box }} size="lg" count={0} /></div>
              <label className="fieldLabel">{box.container} number — write this on it</label>
              <Stepper value={box.number} onChange={(number) => setBox({ ...box, number })} />
              {ix.boxByNumber.get(box.number) && ix.boxByNumber.get(box.number).id !== box.id && <p className="warn"><Icon name="close" size={16} /> Number {box.number} is already used — we’ll use the next free one.</p>}
              <label className="fieldLabel">What’s written on it? (optional)</label>
              <input className="field big" value={box.name} onChange={(e) => setBox({ ...box, name: e.target.value })} placeholder="Kitchen, Christmas, Mom’s books…" />
              <p className="fieldLabel">Color</p>
              <div className="swatches">{BOX_COLORS.map((c) => <button key={c} className={cx('swatch', box.color === c && 'on')} style={{ background: c }} onClick={() => setBox({ ...box, color: c })} aria-label={`Color ${c}`} />)}</div>
              <p className="fieldLabel">Whose box?</p>
              <OwnerChooser value={box.ownerId} onChange={(ownerId) => setBox({ ...box, ownerId })} />
              <p className="fieldLabel">What kind of stuff? (optional)</p>
              <CategoryChooser value={box.categoryId} onChange={(categoryId) => setBox({ ...box, categoryId })} />
              <p className="fieldLabel">Photo of the outside</p>
              <PhotoStrip ids={box.photoIds} addLabel="Snap the box" onAdd={(id) => setBox((b) => ({ ...b, photoIds: [...b.photoIds, id] }))} onRemove={(id) => setBox((b) => ({ ...b, photoIds: b.photoIds.filter((x) => x !== id) }))} />
              <div className="captureFoot"><Btn big kind="primary" icon="chevron" onClick={saveBox}>Next: what’s inside</Btn></div>
            </>
          )}

          {step === 'inside' && (
            <>
              <h1>What’s inside {box.container} {box.number}?</h1>
              <p className="lead">Open it up and snap a photo — that alone is a big help. Then list the main things.</p>
              <PhotoStrip ids={box.contentPhotoIds} addLabel="Snap inside" onAdd={(id) => setBox((b) => ({ ...b, contentPhotoIds: [...b.contentPhotoIds, id] }))} onRemove={(id) => setBox((b) => ({ ...b, contentPhotoIds: b.contentPhotoIds.filter((x) => x !== id) }))} />
              <label className="fieldLabel">One thing per line (or commas)</label>
              <textarea className="field listField" rows={6} value={list} onChange={(e) => setList(e.target.value)} placeholder={'Blender\n4 mugs\nGood knives\nCookie cutters'} />
              {parsed.length > 0 && (
                <div className="parsedChips">{parsed.map((p, i) => <motion.span key={`${p.name}${i}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="parsedChip">{p.qty > 1 && <em>{p.qty}×</em>}{p.name}</motion.span>)}</div>
              )}
              <div className="captureFoot"><Btn big kind="primary" icon="check" onClick={finishBox}>{parsed.length ? `Save ${parsed.length} thing${parsed.length === 1 ? '' : 's'}` : 'Save box'}</Btn></div>
            </>
          )}

          {step === 'done' && (
            <>
              <motion.div className="doneBadge" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}><Icon name="check" size={56} stroke={3} /></motion.div>
              <h1 className="center">{box.container} {box.number} is in!</h1>
              <p className="lead center">{packed.length > 1 ? `${packed.length} boxes packed this round. ` : ''}Write <strong>{box.number}</strong> big on it so it matches.</p>
              <div className="packedRow">{packed.map((b) => <BoxTile key={b.id} box={{ data: b }} size="sm" count={b.count} />)}</div>
              <div className="stackBtns">
                <Btn big kind="primary" icon="plus" onClick={() => nextBox(true)}>Next one on this shelf</Btn>
                <Btn big kind="soft" icon="move" onClick={() => nextBox(false)}>Next one, different shelf</Btn>
                <Btn big kind="ghost" icon="box" onClick={() => navigate(`/b/${box.number}`)}>Open {box.container} {box.number}</Btn>
              </div>
            </>
          )}
        </motion.section>
      </AnimatePresence>
    </main>
  );
}

function QuickItem({ query }) {
  const ix = useIndex();
  const [form, setForm] = useState({ name: query.name || '', qty: 1, categoryId: '', ownerId: ix.me, photoIds: [], boxId: null, sectionId: query.s || '', levelId: query.l || '' });
  const [picking, setPicking] = useState(false);
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const where = form.boxId ? ix.whereIs({ kind: 'item', data: { boxId: form.boxId } }) : form.levelId ? ix.whereIs({ kind: 'item', data: form }) : null;
  const save = () => {
    if (!form.name.trim() || (!form.boxId && !form.levelId)) return;
    const id = newId('itm');
    const r = mutate({ type: 'create', kind: 'item', id, data: { ...form, name: form.name.trim(), status: 'stored' } });
    burst();
    chime('success');
    navigate(r === 'apply' ? `/i/${id}` : '/', { replace: true });
  };
  return (
    <main className="page capturePage">
      <header className="captureHead"><button className="iconBtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" size={28} /></button><h1 className="headTitle">Add a thing</h1></header>
      <section className="captureStep">
        <label className="fieldLabel">What is it?</label>
        <input className="field big" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Winter coat" />
        <label className="fieldLabel">How many?</label>
        <Stepper value={form.qty} onChange={(qty) => set({ qty })} />
        <p className="fieldLabel">Photo</p>
        <PhotoStrip ids={form.photoIds} addLabel="Snap it" onAdd={(id) => setForm((f) => ({ ...f, photoIds: [...f.photoIds, id] }))} onRemove={(id) => set({ photoIds: form.photoIds.filter((x) => x !== id) })} />
        <p className="fieldLabel">Where does it live?</p>
        <button className="pickWhere" onClick={() => setPicking(true)}>
          <Icon name="pin" /> {where?.trail?.length ? where.trail.join(' › ') : 'Choose a box or shelf'} <Icon name="chevron" />
        </button>
        <p className="fieldLabel">Whose is it?</p>
        <OwnerChooser value={form.ownerId} onChange={(ownerId) => set({ ownerId })} />
        <p className="fieldLabel">Kind of thing (optional)</p>
        <CategoryChooser value={form.categoryId} onChange={(categoryId) => set({ categoryId })} />
        <div className="captureFoot"><Btn big kind="primary" icon="check" disabled={!form.name.trim() || (!form.boxId && !form.levelId)} onClick={save}>Save</Btn></div>
      </section>
      <MoveItemSheet open={picking} onClose={() => setPicking(false)} current={form} onPick={(w) => set(w)} />
    </main>
  );
}

export { levelLabel };
