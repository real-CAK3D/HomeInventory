import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useIndex } from '../lib/store.js';
import { search, listenOnce, voiceSupported } from '../lib/search.js';
import { navigate } from '../lib/router.js';
import { Avatar, BoxTile, Icon, PhotoImg, Trail, showOnWall } from '../ui/kit.jsx';
import { buzz, cx, greeting, timeAgo } from '../lib/util.js';
import { boxLabel, sectionLabel } from '../../shared/model.js';

function CountUp({ value }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (document.documentElement.dataset.motion === 'calm') { setN(value); return undefined; }
    let raf, start;
    const step = (t) => {
      start = start || t;
      const p = Math.min(1, (t - start) / 700);
      setN(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

export function ItemRow({ ix, item, onClick, inBox = false }) {
  const where = ix.whereIs(item);
  const d = item.data;
  const owner = ix.profileById.get(d.ownerId);
  return (
    <motion.button layout className="resultRow" onClick={onClick || (() => navigate(`/i/${item.id}`))} whileTap={{ scale: 0.98 }}>
      <span className="resultThumb">{d.photoIds?.[0] ? <PhotoImg id={d.photoIds[0]} /> : <span className="emojiThumb">{ix.categoryById.get(d.categoryId)?.emoji || '📦'}</span>}</span>
      <span className="resultBody">
        <strong>{d.qty > 1 && <em className="qty">{d.qty}×</em>}{d.name}{d.status === 'out' && <span className="outChip">Taken out</span>}{d.locked && <Icon name="lock" size={15} className="inlineIcon" />}</strong>
        {inBox ? <small className="muted">{[ix.categoryById.get(d.categoryId)?.name, d.notes].filter(Boolean).join(' · ') || (d.photoIds?.length ? `${d.photoIds.length} photo${d.photoIds.length === 1 ? '' : 's'}` : 'Tap to add a photo or notes')}</small> : <Trail where={where} compact />}
      </span>
      {owner && <Avatar profile={owner} size={30} />}
    </motion.button>
  );
}

export default function Find() {
  const ix = useIndex();
  const [q, setQ] = useState(() => { try { return sessionStorage.getItem('hi-find') || ''; } catch { return ''; } });
  const [listening, setListening] = useState(false);
  const stopRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => { try { sessionStorage.setItem('hi-find', q); } catch { /* private mode */ } }, [q]);

  const results = useMemo(() => search(ix, q), [ix, q]);
  const hasResults = results.exact || results.items.length || results.boxes.length || results.places.length;

  const mic = () => {
    if (listening) { stopRef.current?.(); setListening(false); return; }
    buzz(15);
    setListening(true);
    stopRef.current = listenOnce((text) => setQ(text.replace(/[.?!]$/, '')), () => setListening(false));
  };

  const outItems = ix.items.filter((i) => i.data.status === 'out');
  const recent = [...ix.items].sort((a, b) => (b.data.createdAt || '').localeCompare(a.data.createdAt || '')).slice(0, 6);
  const mineCount = ix.items.filter((i) => i.data.ownerId === ix.me).length;
  const usedCats = ix.categories.filter((c) => ix.items.some((i) => i.data.categoryId === c.id) || ix.boxes.some((b) => b.data.categoryId === c.id));

  return (
    <main className="page findPage">
      <section className="findHero">
        <motion.p className="kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{greeting()}, {ix.mine?.data?.name}</motion.p>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>What are you looking for?</motion.h1>
        <div className={cx('bigSearch', q && 'typing', listening && 'listening')}>
          <Icon name="search" size={28} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “blender”, “box 12”, or “section 3”" enterKeyHint="search" aria-label="Search everything" autoComplete="off" />
          {q && <button className="clearBtn" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Clear search"><Icon name="close" /></button>}
          {voiceSupported() && (
            <button className={cx('micBtn', listening && 'on')} onClick={mic} aria-label={listening ? 'Stop listening' : 'Search by talking'}>
              <Icon name="mic" size={26} />
              {listening && <span className="micWaves" />}
            </button>
          )}
        </div>
        {listening && <p className="listeningHint">Listening… say what you’re looking for</p>}
      </section>

      <AnimatePresence mode="wait">
        {q.trim() ? (
          <motion.section key="results" className="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {results.exact?.kind === 'box' && (
              <motion.button className="exactCard" onClick={() => navigate(`/b/${results.exact.rec.data.number}`)} initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
                <BoxTile box={results.exact.rec} count={(ix.itemsByBox.get(results.exact.rec.id) || []).length} size="lg" />
                <span><strong>{boxLabel(results.exact.rec)}</strong><Trail where={ix.whereIs(results.exact.rec)} onShow={() => showOnWall(results.exact.rec)} /></span>
              </motion.button>
            )}
            {results.exact?.kind === 'section' && (
              <motion.button className="exactCard" onClick={() => navigate(`/s/${results.exact.rec.data.number}`)} initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
                <span className="sectionBadge big">{results.exact.rec.data.number}</span>
                <span><strong>{sectionLabel(results.exact.rec)}</strong><small>{(results.exact.rec.data.levels || []).length} shelves · tap to open</small></span>
              </motion.button>
            )}
            {results.items.length > 0 && <h2 className="groupHead">Things <span>{results.items.length}</span></h2>}
            {results.items.map(({ rec }) => <ItemRow key={rec.id} ix={ix} item={rec} />)}
            {results.boxes.length > 0 && <h2 className="groupHead">Boxes <span>{results.boxes.length}</span></h2>}
            <div className="boxGrid">
              {results.boxes.map(({ rec }) => (
                <div key={rec.id} className="boxResult">
                  <BoxTile box={rec} count={(ix.itemsByBox.get(rec.id) || []).length} onClick={() => navigate(`/b/${rec.data.number}`)} />
                  <Trail where={ix.whereIs(rec)} compact />
                </div>
              ))}
            </div>
            {results.places.length > 0 && <h2 className="groupHead">Places</h2>}
            {results.places.map(({ rec }) => (
              <button key={rec.id} className="resultRow" onClick={() => navigate(`/s/${rec.data.number}`)}>
                <span className="sectionBadge">{rec.data.number}</span><span className="resultBody"><strong>{sectionLabel(rec)}</strong></span>
              </button>
            ))}
            {!hasResults && (
              <div className="noResults">
                <p className="lead">Nothing called “{q}” yet.</p>
                <p className="muted">Check the spelling, try a shorter word, or add it now.</p>
                <button className="btn primary big" onClick={() => navigate(`/add?name=${encodeURIComponent(q)}`)}><Icon name="plus" /> Add “{q}”</button>
              </div>
            )}
          </motion.section>
        ) : (
          <motion.section key="home" className="homeBlocks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!ix.sections.length && (
              <button className="setupCallout" onClick={() => navigate(ix.isAdmin ? '/setup' : '/wall')}>
                <Icon name="sparkle" size={30} />
                <span><strong>{ix.isAdmin ? 'Let’s set up your shelves' : 'Shelves aren’t set up yet'}</strong><small>{ix.isAdmin ? 'Tell the app how many shelf sections you have — takes 30 seconds.' : 'Ask Andrew to finish setup.'}</small></span>
                <Icon name="chevron" />
              </button>
            )}
            <div className="statRow">
              <button className="stat" onClick={() => navigate('/wall')}><strong><CountUp value={ix.sections.length} /></strong><span>sections</span></button>
              <button className="stat" onClick={() => navigate('/wall')}><strong><CountUp value={ix.boxes.length} /></strong><span>boxes</span></button>
              <button className="stat" onClick={() => navigate('/wall')}><strong><CountUp value={ix.items.reduce((n, i) => n + (Number(i.data.qty) || 1), 0)} /></strong><span>things</span></button>
            </div>

            <div className="quickGrid">
              <button className="quick wallQuick" onClick={() => navigate('/wall')}><Icon name="wall" size={30} /><strong>See the shelves</strong><small>Walk the whole wall</small></button>
              <button className="quick packQuick" onClick={() => navigate('/add')}><Icon name="camera" size={30} /><strong>Pack a box</strong><small>Photos + what’s inside</small></button>
            </div>

            {ix.requestsToMe.length > 0 && (
              <button className="askBanner" onClick={() => navigate('/alerts')}>
                <span className="askPulse"><Icon name="hand" size={26} /></span>
                <span><strong>{ix.requestsToMe.length} {ix.requestsToMe.length === 1 ? 'person is' : 'people are'} asking you</strong><small>Tap to say yes or no</small></span>
                <Icon name="chevron" />
              </button>
            )}

            {outItems.length > 0 && (
              <section className="card">
                <h2 className="cardTitle"><Icon name="out" /> Taken out right now</h2>
                {outItems.slice(0, 5).map((item) => (
                  <ItemRow key={item.id} ix={ix} item={item} />
                ))}
              </section>
            )}

            {usedCats.length > 0 && (
              <section>
                <h2 className="groupHead">Browse by kind</h2>
                <div className="catChips">
                  {usedCats.map((c) => <button key={c.id} className="catChip" onClick={() => setQ(c.name)}><span>{c.emoji}</span>{c.name}</button>)}
                  {mineCount > 0 && <button className="catChip" onClick={() => navigate('/wall?mine=1')}><span>⭐</span>My things</button>}
                </div>
              </section>
            )}

            {recent.length > 0 && (
              <section className="card">
                <h2 className="cardTitle"><Icon name="sparkle" /> Just added</h2>
                {recent.map((item) => <ItemRow key={item.id} ix={ix} item={item} />)}
              </section>
            )}

            {ix.activity.length > 0 && (
              <section className="card">
                <h2 className="cardTitle"><Icon name="history" /> What’s been happening <button className="linkBtn" onClick={() => navigate('/activity')}>See all</button></h2>
                <ul className="feed">
                  {ix.activity.slice(0, 4).map((a) => (
                    <li key={a.id}><Avatar profile={ix.profileById.get(a.data.actorId)} size={32} /><span>{a.data.summary}<small>{timeAgo(a.data.at)}</small></span></li>
                  ))}
                </ul>
              </section>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
