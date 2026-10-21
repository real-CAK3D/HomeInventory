// Tiny IndexedDB wrapper: the phone keeps a full copy of the inventory so it works in a basement with no signal.
const DB_NAME = 'home-inventory-v2';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('kv');
        request.result.createObjectStore('photos');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      console.warn('Offline storage unavailable', error);
      return null;
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idb = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)).catch(() => undefined),
  set: (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key)).catch((e) => console.warn(e)),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)).catch(() => undefined),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()).catch(() => undefined)
};
