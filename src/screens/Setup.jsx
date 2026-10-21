import React, { useState } from 'react';
import { motion } from 'motion/react';
import { mutate, useIndex } from '../lib/store.js';
import { back, navigate } from '../lib/router.js';
import { Btn, Empty, Icon, Page, Stepper, burst } from '../ui/kit.jsx';
import { DEFAULT_LEVELS, newId } from '../../shared/model.js';

export default function Setup() {
  const ix = useIndex();
  const existing = ix.sections.length;
  const [count, setCount] = useState(existing || 15);
  const [levels, setLevels] = useState(DEFAULT_LEVELS);
  const [area, setArea] = useState('');
  const [home, setHome] = useState(ix.settings.data.householdName || 'Our Home');
  if (!ix.isAdmin) return <Page back={() => back('/me')} title="Shelf setup"><Empty icon="lock" title="Only an admin can change the shelves" /></Page>;

  const highest = ix.sections.reduce((n, s) => Math.max(n, Number(s.data.number) || 0), 0);
  const toAdd = Math.max(0, count - existing);

  const build = () => {
    if (home.trim() !== ix.settings.data.householdName) mutate({ type: 'update', kind: 'settings', id: 'settings', data: { householdName: home.trim() || 'Our Home', setupDone: true } }, { quiet: true });
    for (let i = 1; i <= toAdd; i++) {
      mutate({ type: 'create', kind: 'section', data: { number: highest + i, name: '', area: area.trim(), levels: levels.filter((l) => l.trim()).map((name) => ({ id: newId('lvl'), name: name.trim() })) } }, { quiet: true });
    }
    burst();
    navigate('/wall');
  };

  return (
    <Page back={() => back('/me')} title="Shelf setup" kicker="Build your wall" className="setupPage">
      <section className="card">
        <label className="fieldLabel">What do you call this place?</label>
        <input className="field big" value={home} onChange={(e) => setHome(e.target.value)} placeholder="Our Home" />
      </section>

      <section className="card">
        <h2 className="cardTitle"><Icon name="wall" /> How many shelf sections?</h2>
        <p className="muted">A section is one shelving unit, from floor to top. Number them left to right — put that number on each one.</p>
        <Stepper value={count} min={Math.max(1, existing)} max={60} onChange={setCount} />
        {existing > 0 && <p className="muted small">You already have {existing}. {toAdd ? `This adds ${toAdd} more (numbers ${highest + 1}–${highest + toAdd}).` : 'Raise the number to add more.'}</p>}
        <div className="miniWall" aria-hidden="true">
          {Array.from({ length: Math.min(count, 30) }, (_, i) => (
            <motion.span key={i} className={i < existing ? 'old' : ''} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.02 }}>
              {levels.map((l, j) => <i key={j} />)}<b>{i + 1}</b>
            </motion.span>
          ))}
        </div>
      </section>

      {toAdd > 0 && (
        <section className="card">
          <h2 className="cardTitle"><Icon name="layers" /> Shelves in each new section</h2>
          <p className="muted">Top to bottom. Most units have 3 shelves plus the floor.</p>
          {levels.map((l, i) => (
            <div className="levelEditRow" key={i}>
              <span className="levelNum">{i + 1}</span>
              <input className="field" value={l} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? e.target.value : x)))} />
              {levels.length > 1 && <button className="iconBtn" onClick={() => setLevels(levels.filter((_, j) => j !== i))} aria-label="Remove shelf"><Icon name="trash" /></button>}
            </div>
          ))}
          <Btn icon="plus" kind="ghost" onClick={() => setLevels([...levels.slice(0, -1), `Shelf ${levels.length}`, ...levels.slice(-1)])}>Add a shelf</Btn>
          <label className="fieldLabel">Room (optional, you can change each later)</label>
          <input className="field" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Garage, basement…" />
        </section>
      )}

      <div className="captureFoot">
        <Btn big kind="primary" icon="sparkle" disabled={!toAdd && home.trim() === ix.settings.data.householdName} onClick={build}>{toAdd ? `Build ${toAdd} section${toAdd === 1 ? '' : 's'}` : 'Save'}</Btn>
      </div>
    </Page>
  );
}
