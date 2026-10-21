export const cx = (...parts) => parts.filter(Boolean).join(' ');

export function buzz(pattern = 12) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* not supported */ }
}

let audio = null;
export function chime(kind = 'soft') {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'success' ? [660, 880, 1320] : kind === 'alert' ? [880, 660] : [740];
    notes.forEach((freq, i) => {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = audio.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch { /* audio blocked */ }
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}

export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** "3 mugs" / "mugs x3" / "2x plates" → { name, qty } */
export function parseItemLine(line) {
  let text = line.trim().replace(/^[-*•]\s*/, '');
  let qty = 1;
  let m = text.match(/^(\d{1,4})\s*(?:x|×)?\s+(.+)$/i) || text.match(/^(\d{1,4})(?:x|×)\s*(.+)$/i);
  if (m) { qty = Number(m[1]); text = m[2]; }
  else if ((m = text.match(/^(.+?)\s*(?:x|×)\s*(\d{1,4})$/i)) || (m = text.match(/^(.+?)\s*\((\d{1,4})\)$/))) { qty = Number(m[2]); text = m[1]; }
  text = text.trim();
  return text ? { name: text.charAt(0).toUpperCase() + text.slice(1), qty: Math.max(1, qty) } : null;
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
