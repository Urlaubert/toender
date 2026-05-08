// IndexedDB-backed memory of every sample we've seen, via the `idb` promise wrapper.
// Schema:
//   samples: { id, source, sourceId, status, theme, heardAt, url, license, attribution, meta }
//   indices: status, theme, sourceId

import { openDB } from 'idb';

const DB_NAME = 'toender';
const DB_VERSION = 1;
const STORE = 'samples';

let dbp = null;

function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          const store = d.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('status', 'status');
          store.createIndex('theme', 'theme');
          store.createIndex('sourceId', 'sourceId');
        }
      },
    });
  }
  return dbp;
}

export async function rememberSample(sample) {
  const d = await db();
  const existing = await d.get(STORE, sample.id);
  const merged = { ...existing, ...sample, heardAt: existing?.heardAt ?? Date.now() };
  await d.put(STORE, merged);
  return merged;
}

export async function setStatus(id, status) {
  const d = await db();
  const sample = await d.get(STORE, id);
  if (!sample) return null;
  sample.status = status;
  sample.heardAt = Date.now();
  await d.put(STORE, sample);
  return sample;
}

export async function getSample(id) {
  const d = await db();
  return d.get(STORE, id);
}

export async function getByStatus(status) {
  const d = await db();
  return d.getAllFromIndex(STORE, 'status', status);
}

export async function findCrossThemeMarker(sourceId, currentTheme) {
  const d = await db();
  const matches = await d.getAllFromIndex(STORE, 'sourceId', sourceId);
  return matches.filter((m) => m.theme !== currentTheme && ['gut', 'stern'].includes(m.status));
}

export async function getAll() {
  const d = await db();
  return d.getAll(STORE);
}

export async function getStats(theme) {
  const all = await getAll();
  const filtered = theme ? all.filter((s) => s.theme === theme) : all;
  const stats = { neu: 0, raus: 0, mittel: 0, gut: 0, stern: 0 };
  for (const s of filtered) {
    stats[s.status] = (stats[s.status] ?? 0) + 1;
  }
  return stats;
}
