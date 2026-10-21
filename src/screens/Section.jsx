import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { mutate, useIndex } from '../lib/store.js';
import { back, navigate } from '../lib/router.js';
import { BoxTile, Btn, CameraButton, Empty, Icon, Page, PhotoImg, Sheet, ask, openViewer } from '../ui/kit.jsx';
import { ItemRow } from './Find.jsx';
import { setShelfPhoto } from '../lib/shelves.js';
import { cx, timeAgo } from '../lib/util.js';
import { FAMILY, newId, sectionLabel } from '../../shared/model.js';

export default function Section({ params }) {
  const ix = useIndex();
  const section = ix.sectionByNumber.get(params.number);
  const [editing, setEditing] = useState(false);
  const focusLevel = params.level ? (typeof params.level === 'number' ? section?.data.levels?.[params.level - 1]?.id : section?.data.levels?.find((l) => l.name.toLowerCase().startsWith(String(params.level)))?.id) : null;

  useEffect(() => {
    if (!focusLevel) return;
    const t = setTimeout(() => document.getElementById(`lvl-${focusLevel}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    return () => clearTimeout(t);
  }, [focusLevel]);

  if (!section) {
    return <Page back={() => back('/wall')} title={`Section ${params.number}`}><Empty icon="wall" title="That section isn’t set up">This tag points to section {params.number}, which doesn’t exist yet.{ix.isAdmin && ' You can add more sections from the setup page.'}</Empty></Page>;
  }
  const d = section.data;
  const levels = d.levels || [];
  const setLevelPhoto = (levelId, photoId) => setShelfPhoto(section, levelId, photoId);
  const boxCount = levels.reduce((n, l) => n + (ix.boxesByShelf.get(`${section.id}|${l.id}`) || []).length, 0);

  return (
    <Page back={() => back('/wall')} kicker={d.area || ix.settings.data.householdName} title={sectionLabel(section)} className="sectionPage"
      actions={<Btn icon="edit" kind="soft" onClick={() => setEditing(true)}>Edit</Btn>}>
      <section className="sectionHero">
        {d.photoId ? (
          <button className="heroPhoto" onClick={() => openViewer([d.photoId])}><PhotoImg id={d.photoId} size="f" /><span className="heroBadge">{d.number}</span></button>
        ) : (
          <CameraButton big className="heroCamera" label="Snap the whole section" onPhoto={(photoId) => mutate({ type: 'update', kind: 'section', id: section.id, data: { photoId } }, { message: 'Section photo saved' })} />
        )}
        <div className="heroFacts">
          <span><strong>{levels.length}</strong> shelves</span>
          <span><strong>{boxCount}</strong> boxes</span>
          <button className="linkBtn" onClick={() => navigate(`/wall?find=${section.id}`)}><Icon name="wall" size={18} /> On the wall</button>
        </div>
      </section>

      {levels.map((level, i) => {
        const key = `${section.id}|${level.id}`;
        const boxes = ix.boxesByShelf.get(key) || [];
        const loose = ix.looseByShelf.get(key) || [];
        return (
          <motion.section key={level.id} id={`lvl-${level.id}`} className={cx('card levelCard', focusLevel === level.id && 'focus')} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <header className="levelHead">
              <span className="levelNum">{i + 1}</span>
              <h2>{level.name}</h2>
              {level.photoId ? (
                <button className="levelPhoto" onClick={() => openViewer([level.photoId, ...(level.photoHistory || []).map((h) => h.photoId)])} aria-label="See shelf photos">
                  <PhotoImg id={level.photoId} />
                  {level.photoHistory?.length > 0 && <span className="historyCount">{level.photoHistory.length + 1}</span>}
                </button>
              ) : (
                <CameraButton className="mini" label="Photo" onPhoto={(id) => setLevelPhoto(level.id, id)} />
              )}
            </header>
            <div className="levelBoxes">
              {boxes.map((box) => (
                <BoxTile key={box.id} box={box} count={(ix.itemsByBox.get(box.id) || []).length} ownerColor={box.data.ownerId === FAMILY ? '#9aa0a6' : ix.profileById.get(box.data.ownerId)?.data.color} onClick={() => navigate(`/b/${box.data.number}`)} />
              ))}
              <button className="addBoxTile" onClick={() => navigate(`/add?s=${section.id}&l=${level.id}`)}><Icon name="plus" size={30} /><span>Box here</span></button>
            </div>
            {loose.length > 0 && <div className="looseList"><p className="fieldLabel">Not in a box</p>{loose.map((item) => <ItemRow key={item.id} ix={ix} item={item} />)}</div>}
            <div className="levelFoot">
              <button className="linkBtn" onClick={() => navigate(`/add?mode=item&s=${section.id}&l=${level.id}`)}><Icon name="plus" size={18} /> Add a loose thing</button>
              {level.photoId && <CameraButton className="linkBtn" label="Update photo" onPhoto={(id) => setLevelPhoto(level.id, id)} />}
            </div>
            {level.photoId && (
              <div className="levelMeta">
                <small className="muted">Photo {level.photoAt ? `${timeAgo(level.photoAt)}${level.photoBy ? ` by ${ix.nameOf(level.photoBy)}` : ''}` : 'saved'}</small>
                {(boxes.length + loose.length) > 0 && <button className="linkBtn" onClick={() => navigate(`/recheck?s=${section.id}&l=${level.id}`)}><Icon name="check" size={16} /> Check this shelf</button>}
              </div>
            )}
          </motion.section>
        );
      })}

      <p className="muted center small">{d.nfcWrittenAt ? `NFC tag written ${timeAgo(d.nfcWrittenAt)}` : 'No NFC tag on this section yet'} · <button className="linkBtn" onClick={() => navigate('/tags')}>Tags</button></p>

      <SectionEditor open={editing} onClose={() => setEditing(false)} section={section} isAdmin={ix.isAdmin} ix={ix} />
    </Page>
  );
}

function SectionEditor({ open, onClose, section, isAdmin, ix }) {
  const [name, setName] = useState(section.data.name || '');
  const [area, setArea] = useState(section.data.area || '');
  const [levels, setLevels] = useState(section.data.levels || []);
  useEffect(() => { if (open) { setName(section.data.name || ''); setArea(section.data.area || ''); setLevels(section.data.levels || []); } }, [open, section]);
  const save = () => {
    mutate({ type: 'update', kind: 'section', id: section.id, data: { name: name.trim(), area: area.trim(), levels: levels.filter((l) => l.name.trim()) } }, { message: 'Section saved' });
    onClose();
  };
  const removeLevel = async (level) => {
    const used = (ix.boxesByShelf.get(`${section.id}|${level.id}`) || []).length + (ix.looseByShelf.get(`${section.id}|${level.id}`) || []).length;
    if (used) { await ask({ title: 'That shelf has things on it', body: 'Move the boxes off this shelf first, then you can remove it.', yes: 'OK', no: 'Close' }); return; }
    setLevels(levels.filter((l) => l.id !== level.id));
  };
  const removeSection = async () => {
    const hasStuff = (section.data.levels || []).some((l) => (ix.boxesByShelf.get(`${section.id}|${l.id}`) || []).length);
    if (hasStuff) { await ask({ title: 'This section still has boxes', body: 'Move the boxes somewhere else first.', yes: 'OK' }); return; }
    if (await ask({ title: `Remove ${sectionLabel(section)}?`, body: 'You can bring it back from the trash later.', yes: 'Remove it', danger: true })) {
      mutate({ type: 'delete', kind: 'section', id: section.id });
      onClose();
      navigate('/wall', { replace: true });
    }
  };
  const areas = [...new Set(ix.sections.map((s) => s.data.area).filter(Boolean))];
  return (
    <Sheet open={open} onClose={onClose} title={`Edit section ${section.data.number}`} tall>
      <label className="fieldLabel">Nickname (optional)</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Section ${section.data.number}`} />
      <label className="fieldLabel">Room or area</label>
      <input className="field" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Garage, basement…" list="areas" />
      <datalist id="areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
      <p className="fieldLabel">Shelves, top to bottom</p>
      {levels.map((l, i) => (
        <div className="levelEditRow" key={l.id}>
          <span className="levelNum">{i + 1}</span>
          <input className="field" value={l.name} onChange={(e) => setLevels(levels.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))} />
          <button className="iconBtn" onClick={() => removeLevel(l)} aria-label={`Remove ${l.name}`}><Icon name="trash" /></button>
        </div>
      ))}
      <Btn icon="plus" kind="ghost" onClick={() => setLevels([...levels.slice(0, -1), { id: newId('lvl'), name: `Shelf ${levels.length}` }, ...levels.slice(-1)])}>Add a shelf</Btn>
      <div className="sheetFoot">
        <Btn big kind="primary" icon="check" onClick={save}>Save</Btn>
        {isAdmin && <Btn kind="dangerGhost" icon="trash" onClick={removeSection}>Remove this section</Btn>}
      </div>
    </Sheet>
  );
}
