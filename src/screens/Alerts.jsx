import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { answerRequest, cancelRequest, markNotificationsRead, useIndex } from '../lib/store.js';
import { navigate } from '../lib/router.js';
import { Avatar, Btn, Empty, Icon, Page, Segmented, ask } from '../ui/kit.jsx';
import { buzz, chime, cx, timeAgo } from '../lib/util.js';

function linkFor(ix, link) {
  if (!link) return null;
  const rec = ix.get(link.id);
  if (!rec || rec.data?.deletedAt) return null;
  if (link.kind === 'box') return `/b/${rec.data.number}`;
  if (link.kind === 'item') return `/i/${rec.id}`;
  if (link.kind === 'section') return `/s/${rec.data.number}`;
  return null;
}

export default function Alerts() {
  const ix = useIndex();
  const [tab, setTab] = useState(ix.requestsToMe.length ? 'asks' : 'news');

  // Opening the updates tab marks plain updates as seen.
  useEffect(() => {
    if (tab !== 'news') return undefined;
    const t = setTimeout(() => markNotificationsRead(ix.notifications.filter((n) => !n.data.read && !n.data.requestId).map((n) => n.id)), 1500);
    return () => clearTimeout(t);
  }, [tab, ix.notifications]);

  const answer = async (req, yes) => {
    let reply = '';
    if (!yes) {
      const r = await ask({ title: 'Say no?', body: 'Add a short reason if you like.', input: 'e.g. “I still need it”', yes: 'Send no', danger: true });
      if (!r) return;
      reply = r.text?.trim() || '';
    }
    buzz(yes ? 30 : [20, 30, 20]);
    chime(yes ? 'success' : 'soft');
    answerRequest(req.id, yes ? 'approve' : 'deny', reply);
  };

  const pending = ix.requestsToMe;
  const mine = ix.requestsFromMe.slice(0, 30);
  return (
    <Page title="Alerts" kicker="Asks and updates">
      <Segmented value={tab} onChange={setTab} options={[['asks', `Asking you${pending.length ? ` (${pending.length})` : ''}`], ['news', 'Updates'], ['sent', 'You asked']]} />

      <AnimatePresence mode="popLayout">
        {tab === 'asks' && (
          pending.length ? pending.map((req) => {
            const who = ix.profileById.get(req.data.requesterId);
            return (
              <motion.section key={req.id} layout className="card askCard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 120 }}>
                <header><Avatar profile={who} size={52} ring /><div><strong>{who?.data.name || 'Someone'} is asking</strong><small>{timeAgo(req.data.createdAt)}</small></div></header>
                <p className="askText">{req.data.ask ? `Can they ${req.data.ask}?` : req.data.summary}</p>
                {req.data.note && <p className="askNote">“{req.data.note}”</p>}
                {linkFor(ix, req.data.op?.id ? { kind: req.data.op.kind, id: req.data.op.id } : null) && (
                  <button className="linkBtn" onClick={() => navigate(linkFor(ix, { kind: req.data.op.kind, id: req.data.op.id }))}>Take a look first <Icon name="chevron" size={16} /></button>
                )}
                <div className="yesNo">
                  <Btn big kind="primary" icon="check" onClick={() => answer(req, true)}>Yes, OK</Btn>
                  <Btn big kind="soft" icon="close" onClick={() => answer(req, false)}>No</Btn>
                </div>
              </motion.section>
            );
          }) : <Empty key="none" icon="check" title="Nothing waiting on you">When someone wants to change one of your locked things, it shows up here.</Empty>
        )}

        {tab === 'news' && (
          ix.notifications.length ? (
            <motion.ul key="news" className="noteList" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {ix.notifications.slice(0, 80).map((n) => {
                const to = linkFor(ix, n.data.link);
                return (
                  <li key={n.id} className={cx(!n.data.read && 'unread')}>
                    <button onClick={() => { markNotificationsRead([n.id]); if (n.data.requestId && ix.requestsToMe.some((r) => r.id === n.data.requestId)) setTab('asks'); else if (to) navigate(to); }}>
                      <Avatar profile={ix.profileById.get(n.data.actorId)} size={40} />
                      <span>{n.data.text}<small>{timeAgo(n.data.createdAt)}</small></span>
                      {!n.data.read && <i className="dot" />}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          ) : <Empty key="none2" icon="bell" title="All quiet">You’ll hear here when someone moves, takes or changes your things.</Empty>
        )}

        {tab === 'sent' && (
          mine.length ? (
            <motion.ul key="sent" className="noteList" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {mine.map((r) => (
                <li key={r.id}>
                  <div className="sentRow">
                    <span className={cx('stateChip', r.data.status)}>{{ pending: 'Waiting', approved: 'Yes', denied: 'No', cancelled: 'Cancelled' }[r.data.status]}</span>
                    <span>{r.data.ask ? `You asked to ${r.data.ask}` : r.data.summary}{r.data.reply && <em> — “{r.data.reply}”</em>}<small>{ix.nameOf(r.data.approverId)} · {timeAgo(r.data.decidedAt || r.data.createdAt)}</small></span>
                    {r.data.status === 'pending' && <button className="linkBtn" onClick={() => cancelRequest(r.id)}>Cancel</button>}
                  </div>
                </li>
              ))}
            </motion.ul>
          ) : <Empty key="none3" icon="send" title="You haven’t asked for anything">If you try to change someone’s locked thing, we’ll ask them for you.</Empty>
        )}
      </AnimatePresence>
    </Page>
  );
}
