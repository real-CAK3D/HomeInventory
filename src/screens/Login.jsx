import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { login, loginProfiles, useVersion } from '../lib/store.js';
import { Icon } from '../ui/kit.jsx';
import { buzz, chime, greeting } from '../lib/util.js';

function Face({ p, size = 96 }) {
  // Before sign-in the photo may not load (photos need a session), so fall back to the emoji.
  const [broken, setBroken] = useState(false);
  return (
    <span className="avatar" style={{ width: size, height: size, '--c': p.color, fontSize: size * 0.46 }}>
      {p.photoId && !broken ? <img src={`/api/photo?id=${encodeURIComponent(p.photoId)}&s=t`} alt="" onError={() => setBroken(true)} /> : <span>{p.emoji || p.name.slice(0, 1)}</span>}
    </span>
  );
}

export default function Login() {
  useVersion();
  const profiles = loginProfiles();
  const [who, setWho] = useState(null);
  const [step, setStep] = useState('pin'); // pin | new | confirm
  const [pin, setPin] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [who]);
  const person = profiles.find((p) => p.id === who);
  const reset = () => { setPin(''); setNewPin(''); setOldPin(''); setStep('pin'); setError(''); };

  const fail = (msg) => { setError(msg); setShake((n) => n + 1); buzz([40, 60, 40]); setPin(''); };

  const submit = async (code) => {
    if (busy) return;
    if (step === 'pin') {
      setBusy(true);
      const r = await login(who, code);
      setBusy(false);
      if (r.ok) { chime('success'); buzz(30); return; }
      if (r.needsNewPin) { setOldPin(code); setPin(''); setStep('new'); setError(''); return; }
      fail(r.error);
    } else if (step === 'new') {
      if (code === '0000') return fail('Pick something other than 0000.');
      setNewPin(code); setPin(''); setStep('confirm'); setError('');
    } else {
      if (code !== newPin) { setStep('new'); setNewPin(''); return fail('Those didn’t match. Let’s try again.'); }
      setBusy(true);
      const r = await login(who, oldPin, code);
      setBusy(false);
      if (r.ok) { chime('success'); return; }
      fail(r.error || 'Could not save that PIN.');
    }
  };

  const press = (digit) => {
    buzz(10);
    setError('');
    setPin((p) => {
      if (p.length >= 4) return p;
      const next = p + digit;
      if (next.length === 4) setTimeout(() => submit(next), 120);
      return next;
    });
  };

  useEffect(() => {
    if (!who) return undefined;
    const key = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Escape') { setWho(null); reset(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const prompt = step === 'pin'
    ? (person && !person.pinSet ? 'First time? Type 0000' : 'Type your 4-number PIN')
    : step === 'new' ? 'Now make your own PIN' : 'Type it once more';

  return (
    <main className="login">
      <div className="loginGlow" aria-hidden="true" />
      <AnimatePresence mode="wait">
        {!person ? (
          <motion.section key="pick" className="loginPick" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.18 }}>
            <div className="loginLogo"><Icon name="box" size={40} /></div>
            <p className="kicker">{greeting()}!</p>
            <h1>Who’s here?</h1>
            <div className="faces">
              {profiles.map((p, i) => (
                <motion.button key={p.id} className="faceBtn" onClick={() => { buzz(12); setWho(p.id); reset(); }}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.06 * i, type: 'spring', stiffness: 260, damping: 18 }}
                  whileHover={{ y: -6 }} whileTap={{ scale: 0.94 }}>
                  <Face p={p} />
                  <strong>{p.name}</strong>
                </motion.button>
              ))}
            </div>
            {!profiles.length && <p className="muted">Connecting… If this takes a while, check the Wi-Fi.</p>}
          </motion.section>
        ) : (
          <motion.section key="pin" className="loginPin" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.18 }}>
            <button className="linkBtn" onClick={() => { setWho(null); reset(); }}><Icon name="back" /> Not {person.name}?</button>
            <Face p={person} size={110} />
            <h1>Hi, {person.name}!</h1>
            <p className="lead">{prompt}</p>
            <motion.div className="pinDots" key={shake} animate={shake ? { x: [0, -16, 16, -10, 10, 0] } : {}} transition={{ duration: 0.4 }}>
              {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
            </motion.div>
            <p className="pinError" role="alert">{error || ' '}</p>
            <div className="pinPad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <motion.button key={d} whileTap={{ scale: 0.88 }} onClick={() => press(d)}>{d}</motion.button>)}
              <span />
              <motion.button whileTap={{ scale: 0.88 }} onClick={() => press('0')}>0</motion.button>
              <motion.button whileTap={{ scale: 0.88 }} className="padBack" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete"><Icon name="back" size={30} /></motion.button>
            </div>
            {step !== 'pin' && <p className="muted small">Pick 4 numbers you’ll remember. You’ll stay signed in on this phone.</p>}
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
