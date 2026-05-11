// Theme store. Built-in themes (Kiesel/Wind/Wasser) + user-created themes
// persisted in IndexedDB (store "themes"). Custom themes can be created via
// the search sheet (UC 16) or the Themes-Tab FAB.

import { db, STORE_THEMES } from './db.js';

export const BUILTINS = {
  kiesel: {
    label: 'Kiesel',
    queries: ['pebble impact', 'stone hit', 'rock click', 'gravel'],
    tags: ['foley', 'percussion'],
    durationMax: 4,
    sources: ['freesound', 'archive'],
    builtin: true,
  },
  wind: {
    label: 'Wind',
    queries: ['wind howl', 'wind gust', 'breeze ambience'],
    tags: ['ambience', 'field-recording'],
    durationMax: 15,
    sources: ['freesound', 'archive'],
    builtin: true,
  },
  wasser: {
    label: 'Wasser',
    queries: ['water drop', 'stream creek', 'wave splash', 'rain on surface'],
    tags: ['water', 'field-recording'],
    durationMax: 8,
    sources: ['freesound', 'archive'],
    builtin: true,
  },
};

// In-Memory-Cache aller bekannten Themes (Built-Ins gemerged mit Custom).
let cache = null;

export async function loadThemes() {
  const d = await db();
  const customRows = await d.getAll(STORE_THEMES);
  const merged = { ...BUILTINS };
  for (const row of customRows) {
    merged[row.key] = { ...row, builtin: false };
  }
  cache = merged;
  return merged;
}

export function getTheme(key) {
  if (!cache) return BUILTINS[key] ?? BUILTINS.kiesel;
  return cache[key] ?? BUILTINS[key] ?? BUILTINS.kiesel;
}

export function allThemes() {
  return cache ?? BUILTINS;
}

// Backwards-Compat fuer Code der das alte THEMES-Object importiert.
export const THEMES = new Proxy({}, {
  get(_, key) {
    const all = allThemes();
    return all[key];
  },
  ownKeys() { return Object.keys(allThemes()); },
  getOwnPropertyDescriptor(_, key) {
    const all = allThemes();
    if (key in all) return { enumerable: true, configurable: true, value: all[key] };
    return undefined;
  },
});

export function slugify(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || `theme-${Date.now()}`;
}

// Speichert ein Custom-Theme. Gibt key zurueck.
export async function saveCustomTheme({ key, label, queries, durationMax = 8, tags = [], sources = null }) {
  const d = await db();
  const k = key ?? slugify(label);
  const existing = await d.get(STORE_THEMES, k);
  const row = {
    key: k,
    label: label ?? k,
    queries: Array.isArray(queries) ? queries : [queries],
    durationMax,
    tags,
    sources: sources ?? existing?.sources ?? null,   // null = alle aktiven Quellen
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await d.put(STORE_THEMES, row);
  // Cache neu laden
  await loadThemes();
  return k;
}

// Loescht ein Custom-Theme (Built-Ins koennen nicht geloescht werden).
export async function deleteCustomTheme(key) {
  if (BUILTINS[key]) return false;
  const d = await db();
  await d.delete(STORE_THEMES, key);
  await loadThemes();
  return true;
}
