// One place for changing a shelf's photo, so the Section page and Pack mode behave the same:
// the old photo is kept in history, and if things moved the person is taken to the shelf check.
import { mutate, getIndex } from './store.js';
import { navigate } from './router.js';
import { ask } from '../ui/kit.jsx';
import { nowIso } from '../../shared/model.js';

const HISTORY_KEEP = 12;

export async function setShelfPhoto(section, levelId, photoId, { returnTo } = {}) {
  const level = section.data.levels?.find((l) => l.id === levelId);
  if (!level) return;
  const hadPhoto = Boolean(level.photoId);
  const hasStuff = (getIndex().boxesByShelf.get(`${section.id}|${levelId}`) || []).length + (getIndex().looseByShelf.get(`${section.id}|${levelId}`) || []).length > 0;
  let reorganized = false;
  if (hadPhoto && hasStuff) {
    const answer = await ask({
      title: 'Did anything on this shelf move around?',
      body: 'If boxes were moved, swapped, added or taken away, we’ll help you check each one so everyone can still find their things.',
      choices: [['same', 'No — same boxes, same spots', 'soft'], ['moved', 'Yes — things were moved', 'primary']]
    });
    if (answer === false) return; // closed without choosing: keep the old photo
    reorganized = answer === 'moved';
  }
  const me = getIndex().me;
  const levels = section.data.levels.map((l) => (l.id !== levelId ? l : {
    ...l,
    photoId,
    photoAt: nowIso(),
    photoBy: me,
    photoHistory: hadPhoto ? [{ photoId: l.photoId, at: l.photoAt || null, by: l.photoBy || null }, ...(l.photoHistory || [])].slice(0, HISTORY_KEEP) : l.photoHistory || []
  }));
  mutate({ type: 'update', kind: 'section', id: section.id, data: { levels }, announce: hadPhoto ? { levelId, reorganized } : undefined },
    { message: reorganized ? 'New photo saved — now let’s check the boxes' : 'Shelf photo saved', undo: !reorganized });
  if (reorganized) {
    const back = returnTo ? `&back=${encodeURIComponent(returnTo)}` : '';
    navigate(`/recheck?s=${encodeURIComponent(section.id)}&l=${encodeURIComponent(levelId)}${back}`);
  }
}
