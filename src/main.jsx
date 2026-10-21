import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import '@fontsource-variable/nunito';
import './styles.css';
import { boot, getIndex, onNotification, pendingCount, status, toast, useIndex, useVersion } from './lib/store.js';
import { matchRoute, navigate, usePath } from './lib/router.js';
import { AskHost, Icon, PhotoViewer, Toasts } from './ui/kit.jsx';
import { buzz, chime, cx } from './lib/util.js';
import Login from './screens/Login.jsx';
import Find from './screens/Find.jsx';
import Wall from './screens/Wall.jsx';
import Section from './screens/Section.jsx';
import Box from './screens/Box.jsx';
import Item from './screens/Item.jsx';
import Capture from './screens/Capture.jsx';
import Alerts from './screens/Alerts.jsx';
import Me, { People, Activity, Trash } from './screens/Me.jsx';
import Setup from './screens/Setup.jsx';
import Tags, { Labels } from './screens/Tags.jsx';
import Help from './screens/Help.jsx';

const NAV = [
  ['find', '/', 'search', 'Find'],
  ['wall', '/wall', 'wall', 'Shelves'],
  ['add', '/add', 'plus', 'Pack'],
  ['alerts', '/alerts', 'bell', 'Alerts'],
  ['me', '/me', 'user', 'Me']
];

function useLook(ix) {
  const prefs = ix.prefs;
  useEffect(() => {
    const root = document.documentElement;
    const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.text = prefs.textSize;
    root.dataset.motion = prefs.motion;
    root.style.setProperty('--me', ix.mine?.data?.color || '#4f9dff');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#14121c' : '#f7f2ea');
  }, [prefs.theme, prefs.textSize, prefs.motion, ix.mine?.data?.color]);
}

function Screen({ route }) {
  switch (route.name) {
    case 'wall': return <Wall query={route.query} />;
    case 'section': return <Section params={route.params} />;
    case 'box': return <Box params={route.params} />;
    case 'item': return <Item params={route.params} />;
    case 'add': return <Capture query={route.query} />;
    case 'alerts': return <Alerts />;
    case 'me': return <Me />;
    case 'people': return <People />;
    case 'activity': return <Activity />;
    case 'trash': return <Trash />;
    case 'setup': return <Setup />;
    case 'tags': return <Tags />;
    case 'labels': return <Labels query={route.query} />;
    case 'help': return <Help />;
    default: return <Find />;
  }
}

function Shell() {
  const ix = useIndex();
  const path = usePath();
  const route = matchRoute(path);
  useLook(ix);

  useEffect(() => onNotification((note) => {
    const prefs = getIndex().prefs;
    if (prefs.sound) chime(note.data.requestId ? 'alert' : 'soft');
    buzz(note.data.requestId ? [40, 60, 40] : 25);
    toast(note.data.text, { tone: 'info', icon: note.data.requestId ? 'hand' : 'bell' });
    if (prefs.phoneAlerts && document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then((reg) => reg.showNotification('Home Inventory', { body: note.data.text, icon: '/icon.svg', badge: '/icon.svg', tag: note.id, data: { url: note.data.requestId ? '/alerts' : '/' } })).catch(() => {});
    }
  }), []);

  const tab = { find: 'find', wall: 'wall', section: 'wall', box: 'wall', item: 'find', add: 'add', alerts: 'alerts', me: 'me', people: 'me', activity: 'me', trash: 'me', setup: 'me', tags: 'me', labels: 'me', help: 'me' }[route.name] || 'find';
  const badge = ix.requestsToMe.length + ix.notifications.filter((n) => !n.data.read && !n.data.requestId).length;
  const hideNav = route.name === 'add' || route.name === 'labels';

  if (!ix.mine) {
    return <main className="page"><div className="loadingBox"><span className="spinner" /><p className="lead">Opening your inventory…</p></div></main>;
  }

  return (
    <MotionConfig reducedMotion={ix.prefs.motion === 'calm' ? 'always' : 'user'}>
      <div className={cx('shell', hideNav && 'noNav')}>
        <div className="aurora" aria-hidden="true"><span /><span /><span /></div>
        <AnimatePresence>
          {!status.online && (
            <motion.div className="offlineBar" initial={{ y: -40 }} animate={{ y: 0 }} exit={{ y: -40 }}>
              <Icon name="wifioff" size={18} /> No signal — still saving on this phone{pendingCount() ? ` (${pendingCount()} waiting)` : ''}
            </motion.div>
          )}
        </AnimatePresence>
        <Screen key={path.split('?')[0]} route={route} />
        {!hideNav && (
          <nav className="tabBar" aria-label="Main">
            {NAV.map(([id, to, icon, label]) => (
              <button key={id} className={cx('tab', id === 'add' && 'addTab', tab === id && 'on')} onClick={() => { buzz(8); navigate(to); }} aria-current={tab === id ? 'page' : undefined}>
                {id === 'add' ? (
                  <motion.span className="addOrb" whileTap={{ scale: 0.85, rotate: 90 }}><Icon name="plus" size={34} stroke={3} /></motion.span>
                ) : (
                  <span className="tabIcon"><Icon name={icon} size={27} />{id === 'alerts' && badge > 0 && <motion.b key={badge} initial={{ scale: 0 }} animate={{ scale: 1 }} className="badgeDot">{badge > 9 ? '9+' : badge}</motion.b>}</span>
                )}
                <span className="tabLabel">{label}</span>
                {tab === id && id !== 'add' && <motion.span layoutId="tabGlow" className="tabGlow" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              </button>
            ))}
          </nav>
        )}
      </div>
    </MotionConfig>
  );
}

function App() {
  useVersion();
  if (!status.ready) return <main className="splash"><div className="splashBox"><Icon name="box" size={56} /></div></main>;
  return (
    <>
      {status.signedIn ? <Shell /> : <Login />}
      <Toasts />
      <AskHost />
      <PhotoViewer />
    </>
  );
}

// Legacy NFC links (/tag/001, /shelf/001/mid, /box/023) are understood by the router.
// Guarded so a dev hot-reload of this file doesn't start a second app on the same page.
if (!window.__homeInventoryRoot) {
  boot();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.navigate) navigate(e.data.navigate); });
  }
  window.__homeInventoryRoot = createRoot(document.getElementById('root'));
}
window.__homeInventoryRoot.render(<App />);
