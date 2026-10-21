import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { mutate, useIndex } from '../lib/store.js';
import { navigate } from '../lib/router.js';
import { Avatar, BoxTile, Empty, Icon, PhotoImg, PhotoStrip, Btn } from '../ui/kit.jsx';
import { buzz, cx } from '../lib/util.js';
import { FAMILY, sectionLabel, levelLabel, boxLabel, thingLabel } from '../../shared/model.js';

export default function Wall({ query }) {
  const ix = useIndex();
  const [who, setWho] = useState(query.mine ? ix.me : 'all');
  const scroller = useRef(null);
  const rackRefs = useRef(new Map());

  // What are we pointing at?
  const target = useMemo(() => {
    if (!query.find) return null;
    const rec = ix.get(query.find);
    if (!rec) return null;
    const where = ix.whereIs(rec.kind === 'box' || rec.kind === 'item' ? rec : null);
    if (rec.kind === 'section') return { rec, sectionId: rec.id };
    return { rec, sectionId: where?.section?.id, levelId: where?.levelId, boxId: rec.kind === 'box' ? rec.id : where?.box?.id || null, itemId: rec.kind === 'item' ? rec.id : null, where };
  }, [query.find, ix]);

  useEffect(() => {
    if (!target?.sectionId) return;
    const el = rackRefs.current.get(target.sectionId);
    const t = setTimeout(() => {
      el?.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'calm' ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
      buzz([20, 40, 20]);
    }, 250);
    return () => clearTimeout(t);
  }, [target?.sectionId]);

  const jump = (id) => {
    buzz(8);
    rackRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  if (!ix.sections.length) {
    return (
      <main className="page">
        <Empty icon="wall" title="No shelves yet" action={ix.isAdmin && <Btn big kind="primary" icon="sparkle" onClick={() => navigate('/setup')}>Set up shelves</Btn>}>
          {ix.isAdmin ? 'Tell the app how many shelf sections you have and it will build the wall.' : 'Andrew needs to set up the shelf sections first.'}
        </Empty>
      </main>
    );
  }

  const ownerColor = (id) => (id === FAMILY ? '#9aa0a6' : ix.profileById.get(id)?.data?.color);
  const matchesWho = (rec) => who === 'all' || rec.data.ownerId === who;

  return (
    <main className="page wallPage">
      <header className="pageHead">
        <div className="pageTitle"><p className="kicker">{ix.settings.data.householdName}</p><h1>The shelves</h1></div>
        <div className="pageActions"><Btn icon="plus" kind="soft" onClick={() => navigate('/add')}>Pack</Btn></div>
      </header>

      {target && (
        <motion.button className="findBanner" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          onClick={() => navigate(target.itemId ? `/i/${target.itemId}` : target.boxId ? `/b/${ix.boxById.get(target.boxId)?.data.number}` : `/s/${ix.sectionById.get(target.sectionId)?.data.number}`)}>
          <span className="findPin"><Icon name="pin" size={28} /></span>
          <span>
            <strong>{target.rec.kind === 'section' ? sectionLabel(target.rec) : `${thingLabel(target.rec)} is here`}</strong>
            <small>{target.where?.trail?.join(' › ') || 'Tap to open'}</small>
          </span>
          <Icon name="chevron" />
        </motion.button>
      )}

      {!target && (
        <section className="card areaCard">
          <h2 className="cardTitle"><Icon name="camera" /> The whole storage area</h2>
          <PhotoStrip ids={ix.settings.data.areaPhotoIds || []} addLabel="Snap the area"
            onAdd={(id) => mutate({ type: 'update', kind: 'settings', id: 'settings', data: { areaPhotoIds: [...(ix.settings.data.areaPhotoIds || []), id] } }, { message: 'Area photo saved', undo: false })}
            onRemove={(id) => mutate({ type: 'update', kind: 'settings', id: 'settings', data: { areaPhotoIds: (ix.settings.data.areaPhotoIds || []).filter((x) => x !== id) } })} />
        </section>
      )}

      <div className="wallTools">
        <div className="whoChips" role="radiogroup" aria-label="Whose things">
          <button className={cx('whoChip', who === 'all' && 'on')} onClick={() => setWho('all')}>Everyone</button>
          {ix.profiles.map((p) => (
            <button key={p.id} className={cx('whoChip', who === p.id && 'on')} onClick={() => setWho(p.id)} style={{ '--c': p.data.color }}>
              <Avatar profile={p} size={24} /> {p.id === ix.me ? 'Mine' : p.data.name}
            </button>
          ))}
        </div>
        <div className="scrubber" aria-label="Jump to section">
          {ix.sections.map((s) => (
            <button key={s.id} className={cx(target?.sectionId === s.id && 'on')} onClick={() => jump(s.id)}>{s.data.number}</button>
          ))}
        </div>
      </div>

      <div className="wallScroller" ref={scroller}>
        <div className="wallFloorGlow" aria-hidden="true" />
        {ix.sections.map((section, si) => {
          const levels = section.data.levels || [];
          const isTarget = target?.sectionId === section.id;
          return (
            <motion.article key={section.id} ref={(el) => el && rackRefs.current.set(section.id, el)} className={cx('rack', isTarget && 'targetRack', target && !isTarget && 'fade')}
              initial={{ opacity: 0, y: 30, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: Math.min(si, 8) * 0.04, type: 'spring', stiffness: 200, damping: 22 }}>
              <button className="rackHead" onClick={() => navigate(`/s/${section.data.number}`)}>
                <span className="sectionBadge">{section.data.number}</span>
                <span className="rackTitle"><strong>{sectionLabel(section)}</strong>{section.data.area && <small>{section.data.area}</small>}</span>
                {section.data.photoId && <span className="rackPhoto"><PhotoImg id={section.data.photoId} /></span>}
              </button>
              <div className="rackBody">
                <span className="post left" /><span className="post right" />
                {levels.map((level, li) => {
                  const key = `${section.id}|${level.id}`;
                  const boxes = ix.boxesByShelf.get(key) || [];
                  const loose = ix.looseByShelf.get(key) || [];
                  const isFloor = li === levels.length - 1 && /floor|ground/i.test(level.name);
                  const levelHit = isTarget && target.levelId === level.id;
                  return (
                    <div key={level.id} className={cx('plank', isFloor && 'floor', levelHit && 'levelHit')} onClick={() => navigate(`/s/${section.data.number}/${li + 1}`)} role="button" tabIndex={0}
                      aria-label={`${sectionLabel(section)}, ${level.name}: ${boxes.length} boxes`}>
                      <span className="plankLabel">{level.name}</span>
                      <div className="plankStuff">
                        {boxes.map((box) => (
                          <span key={box.id} onClick={(e) => e.stopPropagation()}>
                            <BoxTile box={box} size="sm" count={(ix.itemsByBox.get(box.id) || []).length} ownerColor={ownerColor(box.data.ownerId)}
                              highlight={target?.boxId === box.id} dim={(target?.boxId && target.boxId !== box.id) || !matchesWho(box)}
                              onClick={() => navigate(`/b/${box.data.number}`)} />
                          </span>
                        ))}
                        {loose.map((item) => (
                          <button key={item.id} className={cx('looseDot', target?.itemId === item.id && 'hit', !matchesWho(item) && 'dim')} onClick={(e) => { e.stopPropagation(); navigate(`/i/${item.id}`); }} title={item.data.name}>
                            {ix.categoryById.get(item.data.categoryId)?.emoji || '•'}
                            <span>{item.data.name}</span>
                          </button>
                        ))}
                        {!boxes.length && !loose.length && <span className="plankEmpty">empty</span>}
                      </div>
                      <span className="plankEdge" />
                    </div>
                  );
                })}
              </div>
            </motion.article>
          );
        })}
        <div className="rackSpacer" />
      </div>
      <p className="wallHint muted"><Icon name="hand" size={18} /> Swipe sideways to walk along the shelves. Tap a box to open it.</p>
    </main>
  );
}

export { levelLabel, boxLabel };
