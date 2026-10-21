// Forgiving search: understands "box 12", "12", "section 3", "s3", "3-2", typos and plurals.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const stem = (w) => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'of', 'where', 'is', 'are', 'find', 'some', 'any', 'for', 'and']);

function near(a, b) {
  // Allows one typo (insert, delete, swap or change) for longer words.
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; continue; }
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function scoreText(tokens, text) {
  const words = norm(text).split(' ').filter(Boolean).map(stem);
  if (!words.length) return 0;
  const joined = words.join(' ');
  let total = 0;
  for (const t of tokens) {
    let best = 0;
    for (const w of words) {
      if (w === t) best = Math.max(best, 5);
      else if (w.startsWith(t)) best = Math.max(best, 4);
      else if (t.length >= 4 && near(t, w)) best = Math.max(best, 2);
    }
    if (!best && t.length >= 3 && joined.includes(t)) best = 2.5;
    if (!best) return 0;
    total += best;
  }
  return total;
}

export function parseQuery(q) {
  const n = norm(q);
  let m;
  if ((m = n.match(/^(?:box|bin|b|tote|crate|bag|basket|case|drawer|suitcase|number|no)\s*(\d{1,4})$/)) || (m = n.match(/^(\d{1,4})$/))) return { box: Number(m[1]) };
  if ((m = n.match(/^(?:section|sec|s|unit|rack)\s*(\d{1,3})(?:\s*(?:shelf|level|l|row)?\s*(\d{1,2}))?$/))) return { section: Number(m[1]), level: m[2] ? Number(m[2]) : null };
  if ((m = n.match(/^(\d{1,3})\s+(\d{1,2})$/)) && q.match(/\d\s*[-/.]\s*\d/)) return { section: Number(m[1]), level: Number(m[2]) };
  return null;
}

export function search(ix, q, { limit = 60 } = {}) {
  const raw = q.trim();
  const out = { exact: null, items: [], boxes: [], places: [] };
  if (!raw) return out;
  const parsed = parseQuery(raw);
  if (parsed?.box && ix.boxByNumber.has(parsed.box)) out.exact = { kind: 'box', rec: ix.boxByNumber.get(parsed.box) };
  if (parsed?.section && ix.sectionByNumber.has(parsed.section)) {
    const section = ix.sectionByNumber.get(parsed.section);
    const level = parsed.level ? section.data.levels?.[parsed.level - 1] : null;
    out.exact = { kind: 'section', rec: section, levelId: level?.id || null };
  }
  const tokens = norm(raw).split(' ').filter((t) => t && !STOP.has(t)).map(stem);
  if (!tokens.length) return out;

  for (const item of ix.items) {
    const d = item.data;
    const box = d.boxId ? ix.boxById.get(d.boxId) : null;
    const s = scoreText(tokens, d.name) * 2 + scoreText(tokens, `${d.notes || ''} ${ix.categoryById.get(d.categoryId)?.name || ''} ${box?.data?.name || ''}`) * 0.6;
    if (s > 0) out.items.push({ rec: item, score: s + (d.status === 'out' ? -0.1 : 0) });
  }
  for (const box of ix.boxes) {
    const d = box.data;
    if (d.redacted) continue;
    const s = scoreText(tokens, `${d.name || ''}`) * 2 + scoreText(tokens, `box ${d.number} ${d.notes || ''} ${ix.categoryById.get(d.categoryId)?.name || ''}`) * 0.8;
    if (s > 0) out.boxes.push({ rec: box, score: s });
  }
  for (const section of ix.sections) {
    const d = section.data;
    const s = scoreText(tokens, `${d.name || ''} section ${d.number} ${d.area || ''}`);
    if (s > 0) out.places.push({ rec: section, score: s });
  }
  for (const list of [out.items, out.boxes, out.places]) list.sort((a, b) => b.score - a.score);
  out.items = out.items.slice(0, limit);
  out.boxes = out.boxes.slice(0, 20);
  out.places = out.places.slice(0, 10);
  return out;
}

export function listenOnce(onText, onEnd) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return null;
  const rec = new Rec();
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => onText(Array.from(e.results).map((r) => r[0].transcript).join(' '), e.results[e.results.length - 1].isFinal);
  rec.onend = onEnd;
  rec.onerror = onEnd;
  rec.start();
  return () => rec.abort();
}

export const voiceSupported = () => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
