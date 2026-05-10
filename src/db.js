// Single source of truth fuer die IndexedDB-Connection.
// V1: samples-Store (S-087)
// V2: + themes-Store (S-088, custom themes)
// Beide Module (memory.js, themes.js) holen sich die DB hier.

import { openDB } from 'idb';

export const DB_NAME = 'toender';
export const DB_VERSION = 2;
export const STORE_SAMPLES = 'samples';
export const STORE_THEMES = 'themes';

let dbp = null;

export function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        if (!d.objectStoreNames.contains(STORE_SAMPLES)) {
          const store = d.createObjectStore(STORE_SAMPLES, { keyPath: 'id' });
          store.createIndex('status', 'status');
          store.createIndex('theme', 'theme');
          store.createIndex('sourceId', 'sourceId');
        }
        if (!d.objectStoreNames.contains(STORE_THEMES)) {
          d.createObjectStore(STORE_THEMES, { keyPath: 'key' });
        }
      },
    });
  }
  return dbp;
}
