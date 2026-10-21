// Production storage: one Postgres table of JSON records plus a private photo bucket.
// Only this server code holds the service-role key; the browser never sees it.

const PAGE = 1000;

export function createSupabaseStore({ url, key, bucket = 'home-inventory', table = 'hi_records' }) {
  const base = url.replace(/\/$/, '');
  const headers = (extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra });

  async function rest(path, init = {}) {
    const response = await fetch(`${base}/rest/v1/${path}`, { ...init, headers: headers(init.headers) });
    if (!response.ok) throw new Error(`Database ${response.status}: ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }

  async function paged(query) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const page = await rest(`${table}?${query}`, { headers: { 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` } });
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  const objectUrl = (path) => `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`;

  return {
    name: 'supabase',
    listSince(since) {
      const filter = since ? `&updated_at=gt.${encodeURIComponent(since)}` : '';
      return paged(`select=id,kind,data,updated_at&order=updated_at.asc,id.asc${filter}`);
    },
    listKind(kind) {
      return paged(`select=id,kind,data,updated_at&kind=eq.${encodeURIComponent(kind)}&order=id.asc`);
    },
    async getMany(ids) {
      const out = new Map();
      const unique = [...new Set(ids.filter(Boolean))];
      for (let i = 0; i < unique.length; i += 100) {
        const list = unique.slice(i, i + 100).map((id) => `"${id.replace(/"/g, '')}"`).join(',');
        for (const row of await rest(`${table}?select=id,kind,data,updated_at&id=in.(${encodeURIComponent(list)})`)) out.set(row.id, row);
      }
      return out;
    },
    async put(rows) {
      if (!rows.length) return [];
      return rest(table, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(rows.map(({ id, kind, data }) => ({ id, kind, data })))
      });
    },
    async putPhoto(path, buffer, type) {
      const response = await fetch(objectUrl(path), {
        method: 'POST',
        headers: headers({ 'Content-Type': type, 'x-upsert': 'true', 'cache-control': '31536000' }),
        body: buffer
      });
      if (!response.ok) throw new Error(`Photo upload ${response.status}: ${await response.text()}`);
    },
    async getPhoto(path) {
      const response = await fetch(objectUrl(path), { headers: headers() });
      if (response.status === 400 || response.status === 404) return null;
      if (!response.ok) throw new Error(`Photo read ${response.status}`);
      return { buffer: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') || 'image/jpeg' };
    },
    async ping() {
      await rest(`${table}?select=id&limit=1`);
      return true;
    }
  };
}
