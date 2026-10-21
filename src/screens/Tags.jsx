import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import qrcode from 'qrcode-generator';
import { mutate, toast, useIndex } from '../lib/store.js';
import { back, navigate } from '../lib/router.js';
import { BoxTile, Btn, Empty, Icon, Page, Segmented, Sheet, Stepper, burst } from '../ui/kit.jsx';
import { nfcSupported, readTag, writeTag } from '../lib/nfc.js';
import { buzz, chime, cx, timeAgo } from '../lib/util.js';
import { sectionLabel } from '../../shared/model.js';

const origin = () => window.location.origin;
const sectionUrl = (s, levelIndex) => `${origin()}/s/${s.data.number}${levelIndex ? `/${levelIndex}` : ''}`;
const boxUrl = (n) => `${origin()}/b/${n}`;

export function Qr({ text, className }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [text]);
  return <span className={cx('qr', className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function Tags() {
  const ix = useIndex();
  const tagCount = ix.settings.data.nfcTagCount || 30;
  const [mode, setMode] = useState(ix.settings.data.nfcMode || 'section');
  const [writing, setWriting] = useState(null);
  const [checking, setChecking] = useState(false);
  const [spareBox, setSpareBox] = useState(1);
  const sections = ix.sections;
  const levelsTotal = sections.reduce((n, s) => n + (s.data.levels || []).length, 0);
  const need = mode === 'section' ? sections.length : levelsTotal;
  const spare = tagCount - need;

  const saveSetting = (data) => mutate({ type: 'update', kind: 'settings', id: 'settings', data }, { quiet: true });
  const copy = async (url) => {
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url, { tone: 'info' }); }
  };
  const markWritten = (target) => {
    if (target.boxNumber) {
      const box = ix.boxByNumber.get(target.boxNumber);
      if (box) mutate({ type: 'update', kind: 'box', id: box.id, data: { nfcWrittenAt: new Date().toISOString() } }, { quiet: true });
      return;
    }
    const s = target.section;
    if (target.levelIndex) {
      mutate({ type: 'update', kind: 'section', id: s.id, data: { levels: s.data.levels.map((l, i) => (i + 1 === target.levelIndex ? { ...l, nfcWrittenAt: new Date().toISOString() } : l)) } }, { quiet: true });
    } else {
      mutate({ type: 'update', kind: 'section', id: s.id, data: { nfcWrittenAt: new Date().toISOString() } }, { quiet: true });
    }
  };

  if (!sections.length) return <Page back={() => back('/me')} title="NFC tags"><Empty icon="nfc" title="Set up your shelves first">Then come back here to write a tag for each one.</Empty></Page>;

  const rows = mode === 'section'
    ? sections.map((s) => ({ key: s.id, section: s, url: sectionUrl(s), label: sectionLabel(s), sub: `${(s.data.levels || []).length} shelves`, written: s.data.nfcWrittenAt }))
    : sections.flatMap((s) => (s.data.levels || []).map((l, i) => ({ key: `${s.id}${l.id}`, section: s, levelIndex: i + 1, url: sectionUrl(s, i + 1), label: `${sectionLabel(s)} · ${l.name}`, sub: '', written: l.nfcWrittenAt })));
  const doneCount = rows.filter((r) => r.written).length;

  return (
    <Page back={() => back('/me')} title="NFC tags" kicker="Tap a phone, see the shelf">
      <section className="card planCard">
        <div className="planTop">
          <span className="planIcon"><Icon name="nfc" size={34} /></span>
          <div>
            <h2>Our plan for your tags</h2>
            <p>Stick <strong>one tag on each section</strong> at about chest height. Tapping it opens that section with all {sections[0]?.data.levels?.length || 4} shelves and every box on them. That uses <strong>{sections.length}</strong> of your tags.</p>
          </div>
        </div>
        <div className="planMath">
          <span><strong>{tagCount}</strong> tags you have</span>
          <span><strong>{need}</strong> needed</span>
          <span className={spare < 0 ? 'bad' : 'good'}><strong>{Math.abs(spare)}</strong> {spare < 0 ? 'short' : 'spare'}</span>
        </div>
        {spare > 0 && mode === 'section' && <p className="muted small">Use the {spare} spares on the boxes you open most (holiday decorations, important papers) — or keep a few for replacements.</p>}
        {spare < 0 && <p className="warn">One tag per shelf needs {need} tags. With {tagCount}, stick with one per section.</p>}
        <p className="fieldLabel">Tags you own</p>
        <Stepper value={tagCount} onChange={(n) => saveSetting({ nfcTagCount: n })} />
        <p className="fieldLabel">Tag each…</p>
        <Segmented value={mode} onChange={(m) => { setMode(m); saveSetting({ nfcMode: m }); }} options={[['section', 'Section (best)'], ['shelf', 'Shelf']]} />
      </section>

      {!nfcSupported && (
        <section className="card hintCard">
          <h2 className="cardTitle"><Icon name="sparkle" /> Writing tags from this device</h2>
          <p>To write tags straight from the app, open it in <strong>Chrome on an Android phone</strong>. On an iPhone or computer: copy the link, then use the free <strong>NFC Tools</strong> app → Write → Add a record → URL, paste it, and hold the phone to the tag.</p>
        </section>
      )}

      <section className="card">
        <h2 className="cardTitle"><Icon name="check" /> {doneCount} of {rows.length} written</h2>
        <div className="progressBar"><motion.span animate={{ width: `${(doneCount / Math.max(1, rows.length)) * 100}%` }} /></div>
        <ul className="tagList">
          {rows.map((r) => (
            <li key={r.key} className={cx(r.written && 'done')}>
              <span className="sectionBadge">{r.section.data.number}{r.levelIndex ? <small>·{r.levelIndex}</small> : null}</span>
              <span className="tagInfo"><strong>{r.label}</strong><code>{r.url.replace(/^https?:\/\//, '')}</code><small>{r.written ? `Written ${timeAgo(r.written)}` : 'Not written yet'}</small></span>
              <span className="tagBtns">
                {nfcSupported && <Btn kind={r.written ? 'soft' : 'primary'} icon="nfc" onClick={() => setWriting(r)}>{r.written ? 'Rewrite' : 'Write'}</Btn>}
                <Btn kind="ghost" icon="copy" onClick={() => copy(r.url)} aria-label="Copy link" />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="cardTitle"><Icon name="box" /> Put a spare tag on a box</h2>
        <p className="muted">Tapping it opens that box’s list and photos.</p>
        <div className="inlineForm">
          <Stepper value={spareBox} onChange={setSpareBox} />
          {ix.boxByNumber.get(spareBox) ? <BoxTile box={ix.boxByNumber.get(spareBox)} size="xs" /> : <span className="muted small">No box {spareBox}</span>}
        </div>
        <div className="rowBtns">
          {nfcSupported && <Btn kind="primary" icon="nfc" disabled={!ix.boxByNumber.get(spareBox)} onClick={() => setWriting({ url: boxUrl(spareBox), label: `Box ${spareBox}`, boxNumber: spareBox })}>Write box tag</Btn>}
          <Btn kind="soft" icon="copy" onClick={() => copy(boxUrl(spareBox))}>Copy link</Btn>
        </div>
      </section>

      <div className="rowBtns big">
        {nfcSupported && <Btn kind="soft" icon="search" onClick={() => setChecking(true)}>Check a tag</Btn>}
        <Btn kind="soft" icon="print" onClick={() => navigate('/labels')}>Print labels & signs</Btn>
      </div>

      <WriteSheet target={writing} onClose={() => setWriting(null)} onDone={(t) => { markWritten(t); setWriting(null); }} />
      <CheckSheet open={checking} onClose={() => setChecking(false)} />
    </Page>
  );
}

function WriteSheet({ target, onClose, onDone }) {
  const [state, setState] = useState('ready'); // ready | waiting | done | error
  const [error, setError] = useState('');
  const abort = useRef(null);
  const start = async () => {
    setState('waiting');
    setError('');
    abort.current = new AbortController();
    try {
      await writeTag(target.url, abort.current.signal);
      buzz([30, 50, 80]);
      chime('success');
      burst();
      setState('done');
      setTimeout(() => { onDone(target); setState('ready'); }, 1400);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e.name === 'NotAllowedError' ? 'The phone needs permission to use NFC. Tap Write again and choose Allow.' : e.message || 'Could not write. Hold the phone still on the tag and try again.');
      setState('error');
    }
  };
  const close = () => { abort.current?.abort(); setState('ready'); onClose(); };
  return (
    <Sheet open={Boolean(target)} onClose={close} title={target ? `Tag for ${target.label}` : ''}>
      <div className="nfcStage">
        <motion.div className={cx('nfcPhone', state)} animate={state === 'waiting' ? { y: [0, -10, 0] } : { y: 0 }} transition={{ repeat: state === 'waiting' ? Infinity : 0, duration: 1.6 }}>
          <Icon name={state === 'done' ? 'check' : 'nfc'} size={64} stroke={2.4} />
          {state === 'waiting' && <><span className="ripple r1" /><span className="ripple r2" /><span className="ripple r3" /></>}
        </motion.div>
        <p className="lead center">
          {state === 'ready' && 'Make sure NFC is on in your phone settings, then tap Start.'}
          {state === 'waiting' && 'Now hold the back of your phone flat against the tag…'}
          {state === 'done' && 'Done! That tag now opens this spot.'}
          {state === 'error' && error}
        </p>
        <code className="urlChip">{target?.url.replace(/^https?:\/\//, '')}</code>
      </div>
      <div className="stackBtns">
        {(state === 'ready' || state === 'error') && <Btn big kind="primary" icon="nfc" onClick={start}>Start</Btn>}
        <Btn big kind="ghost" onClick={close}>{state === 'done' ? 'Close' : 'Cancel'}</Btn>
      </div>
    </Sheet>
  );
}

function CheckSheet({ open, onClose }) {
  const [result, setResult] = useState(null);
  const abort = useRef(null);
  const start = async () => {
    setResult({ waiting: true });
    abort.current = new AbortController();
    try {
      const r = await readTag(abort.current.signal);
      abort.current.abort();
      buzz(30);
      setResult(r);
    } catch (e) {
      if (e.name !== 'AbortError') setResult({ error: e.message });
    }
  };
  const close = () => { abort.current?.abort(); setResult(null); onClose(); };
  const path = result?.url ? (() => { try { return new URL(result.url).pathname; } catch { return null; } })() : null;
  return (
    <Sheet open={open} onClose={close} title="Check a tag">
      <div className="nfcStage">
        <motion.div className={cx('nfcPhone', result?.waiting && 'waiting')}><Icon name="nfc" size={64} />{result?.waiting && <><span className="ripple r1" /><span className="ripple r2" /></>}</motion.div>
        <p className="lead center">
          {!result && 'Tap Start, then hold the phone on a tag to see where it points.'}
          {result?.waiting && 'Hold the phone on the tag…'}
          {result?.url && <>This tag opens <strong>{path}</strong></>}
          {result?.empty && 'This tag is blank.'}
          {result?.text && <>This tag says “{result.text}”</>}
          {result?.error}
        </p>
      </div>
      <div className="stackBtns">
        {path && <Btn big kind="primary" icon="chevron" onClick={() => { close(); navigate(path); }}>Open it</Btn>}
        {!result?.waiting && <Btn big kind="soft" icon="nfc" onClick={start}>{result ? 'Check another' : 'Start'}</Btn>}
        <Btn big kind="ghost" onClick={close}>Close</Btn>
      </div>
    </Sheet>
  );
}

export function Labels({ query }) {
  const ix = useIndex();
  const max = ix.boxes.reduce((n, b) => Math.max(n, Number(b.data.number) || 0), 0) || 1;
  const initial = String(query.boxes || '').split('-').map(Number);
  const [kind, setKind] = useState(query.boxes ? 'boxes' : 'boxes');
  const [from, setFrom] = useState(initial[0] || 1);
  const [to, setTo] = useState(initial[1] || initial[0] || Math.min(max, 24));
  const [blank, setBlank] = useState(false);
  const home = ix.settings.data.householdName;
  const numbers = [];
  for (let n = Math.min(from, to); n <= Math.max(from, to) && numbers.length < 200; n++) numbers.push(n);

  return (
    <Page back={() => back('/tags')} title="Print labels" kicker="Labels & signs" className="labelsPage">
      <section className="card noPrint">
        <Segmented value={kind} onChange={setKind} options={[['boxes', 'Box labels'], ['sections', 'Section signs']]} />
        {kind === 'boxes' && (
          <>
            <div className="rangeRow">
              <div><p className="fieldLabel">From box</p><Stepper value={from} onChange={setFrom} /></div>
              <div><p className="fieldLabel">To box</p><Stepper value={to} onChange={setTo} /></div>
            </div>
            <label className="checkRow"><input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} /> Include numbers that don’t have a box yet (to stick on before packing)</label>
          </>
        )}
        <p className="muted small">Each label has a QR code — point any phone camera at it to open that box or section.</p>
        <Btn big kind="primary" icon="print" onClick={() => window.print()}>Print</Btn>
      </section>

      <div className={cx('printSheet', kind)}>
        {kind === 'boxes' && numbers.filter((n) => blank || ix.boxByNumber.has(n)).map((n) => {
          const box = ix.boxByNumber.get(n);
          const where = box ? ix.whereIs(box) : null;
          return (
            <div className="label" key={n} style={{ '--box': box?.data.color || '#c8955a' }}>
              <div className="labelNum">{n}</div>
              <div className="labelText">
                <strong>{box?.data.name || `Box ${n}`}</strong>
                <span>{where?.trail?.slice(0, 2).join(' · ') || home}</span>
              </div>
              <Qr text={boxUrl(n)} />
            </div>
          );
        })}
        {kind === 'sections' && ix.sections.map((s) => (
          <div className="sign" key={s.id}>
            <div className="signNum">{s.data.number}</div>
            <div className="signText"><strong>{sectionLabel(s)}</strong><span>{(s.data.levels || []).map((l, i) => `${i + 1}. ${l.name}`).join('   ')}</span><small>Tap the tag or scan the code to see what’s here</small></div>
            <Qr text={sectionUrl(s)} />
          </div>
        ))}
      </div>
    </Page>
  );
}
