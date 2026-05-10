// IndexedDB-backed memory of every sample we've seen.
// DB-Connection wird in db.js zentral verwaltet (V2 mit samples + themes).

import { db, STORE_SAMPLES as STORE } from './db.js';

export async function rememberSample(sample) {
  const d = await db();
  const existing = await d.get(STORE, sample.id);
  // Bestehenden Status NIE ueberschreiben mit dem Default 'neu' aus Freesound-Refresh.
  const merged = {
    ...sample,
    ...(existing ?? {}),
    name: sample.name ?? existing?.name,
    audioUrl: sample.audioUrl ?? existing?.audioUrl,
    heardAt: existing?.heardAt ?? Date.now(),
  };
  await d.put(STORE, merged);
  return merged;
}

export async function setStatus(id, status) {
  const d = await db();
  const sample = await d.get(STORE, id);
  if (!sample) return null;
  const prevStatus = sample.status;
  sample.status = status;
  sample.heardAt = Date.now();
  await d.put(STORE, sample);
  return { sample, prevStatus };
}

export async function getSample(id) {
  const d = await db();
  return d.get(STORE, id);
}

export async function getByStatus(status) {
  const d = await db();
  return d.getAllFromIndex(STORE, 'status', status);
}

export async function getByTheme(theme) {
  const d = await db();
  return d.getAllFromIndex(STORE, 'theme', theme);
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

// Behalten-Liste mit Filter + Suche.
export async function getKept({ filter = 'all', search = '', theme = null } = {}) {
  const all = await getAll();
  let result = all.filter((s) => ['gut', 'stern', 'mittel'].includes(s.status));
  if (theme) result = result.filter((s) => s.theme === theme);
  if (filter !== 'all') result = result.filter((s) => s.status === filter);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((s) =>
      (s.name ?? '').toLowerCase().includes(q) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }
  // Stern oben, Gut, dann Mittel
  const order = { stern: 0, gut: 1, mittel: 2 };
  result.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.heardAt - a.heardAt));
  return result;
}

// Mittel-Eimer fuer Re-Audition (zufaellige Auswahl).
export async function getMittelForReAudition(theme, n = 20) {
  const all = await getAll();
  const candidates = all.filter((s) =>
    s.status === 'mittel' && (theme ? s.theme === theme : true)
  );
  // Status zurueck auf 'neu' setzen wenn re-auditioniert — passiert beim showNext.
  // Hier nur zufaellig waehlen.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, n);
}
