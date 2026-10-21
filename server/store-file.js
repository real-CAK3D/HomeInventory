// Local storage for development and for running on the NukeBox: a JSON file plus a photo folder.
import fs from 'node:fs';
import path from 'node:path';

export function createFileStore(dir) {
  const file = path.join(dir, 'records.json');
  const photoDir = path.join(dir, 'photos');
  fs.mkdirSync(photoDir, { recursive: true });
  let records = new Map();
  try {
    for (const row of JSON.parse(fs.readFileSync(file, 'utf8'))) records.set(row.id, row);
  } catch { /* first run */ }

  let lastStamp = 0;
  const stamp = () => {
    // Strictly increasing so delta sync never misses a write made in the same millisecond.
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };
  let writeTimer = null;
  const flush = () => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...records.values()]));
    fs.renameSync(tmp, file);
  };
  const scheduleWrite = () => {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flush, 150);
  };
  const clone = (row) => JSON.parse(JSON.stringify(row));

  return {
    name: 'file',
    secretFile: path.join(dir, 'session-secret.txt'),
    async listSince(since) {
      return [...records.values()].filter((r) => !since || r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).map(clone);
    },
    async listKind(kind) {
      return [...records.values()].filter((r) => r.kind === kind).map(clone);
    },
    async getMany(ids) {
      const out = new Map();
      for (const id of ids) if (records.has(id)) out.set(id, clone(records.get(id)));
      return out;
    },
    async put(rows) {
      const saved = rows.map(({ id, kind, data }) => ({ id, kind, data: clone(data), updated_at: stamp() }));
      for (const row of saved) records.set(row.id, row);
      scheduleWrite();
      return saved.map(clone);
    },
    async putPhoto(name, buffer) {
      fs.writeFileSync(path.join(photoDir, name.replace(/[\\/]/g, '_')), buffer);
    },
    async getPhoto(name) {
      const target = path.join(photoDir, name.replace(/[\\/]/g, '_'));
      if (!fs.existsSync(target)) return null;
      return { buffer: fs.readFileSync(target), type: 'image/jpeg' };
    },
    async ping() { return true; }
  };
}
