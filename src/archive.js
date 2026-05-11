// Internet Archive search client. Audio Collection.
// Docs: https://archive.org/help/aboutsearch.htm
// API: https://archive.org/advancedsearch.php?q=...&output=json
// Audio-URL pro Item: https://archive.org/download/{identifier}/{file}.mp3

const SEARCH = 'https://archive.org/advancedsearch.php';
const METADATA = 'https://archive.org/metadata';

function licenseToken(licUrl) {
  if (!licUrl) return 'unknown';
  const l = licUrl.toLowerCase();
  if (l.includes('publicdomain') || l.includes('cc0')) return 'CC0';
  if (l.includes('by-nc-sa')) return 'CC-BY-NC-SA';
  if (l.includes('by-nc')) return 'CC-BY-NC';
  if (l.includes('by-sa')) return 'CC-BY-SA';
  if (l.includes('by/') || l.includes('/by-')) return 'CC-BY';
  return 'unknown';
}

function isPublishable(token) {
  return ['CC0', 'CC-BY'].includes(token);
}

// Suche im audio-Mediatype, returnt nur Liste der Identifier + Titel.
// Audio-File-URL pro Item kommt erst beim Laden.
async function searchIds({ query, durationMax, publishable, page = 1, rows = 20 }) {
  const parts = [`mediatype:audio`, `(${query})`];
  if (publishable) parts.push('(licenseurl:*creativecommons*by* OR licenseurl:*publicdomain*)');
  const q = parts.join(' AND ');

  const params = new URLSearchParams({
    q,
    output: 'json',
    rows: String(rows),
    page: String(page),
    sort: 'downloads desc',
  });
  params.append('fl[]', 'identifier');
  params.append('fl[]', 'title');
  params.append('fl[]', 'creator');
  params.append('fl[]', 'licenseurl');
  params.append('fl[]', 'description');
  params.append('fl[]', 'length');     // manchmal vorhanden

  const url = `${SEARCH}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Archive ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.response?.docs ?? [];
}

// Holt Metadata-File-Liste fuer ein Item, gibt erste MP3 zurueck.
async function getAudioFile(identifier) {
  const res = await fetch(`${METADATA}/${identifier}`);
  if (!res.ok) return null;
  const data = await res.json();
  const files = data.files ?? [];
  // Praeferiere mp3 mit "VBR" oder ohne "ogg"; sonst irgendwas mit .mp3/.ogg/.wav
  const audio = files.find((f) => /\.mp3$/i.test(f.name) && f.format !== 'Ogg Vorbis')
            ?? files.find((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f.name));
  if (!audio) return null;
  const length = audio.length ? parseLengthSeconds(audio.length) : 0;
  return {
    url: `https://archive.org/download/${identifier}/${encodeURIComponent(audio.name)}`,
    duration: length,
    format: audio.format ?? '',
  };
}

function parseLengthSeconds(str) {
  if (!str) return 0;
  if (!isNaN(Number(str))) return Number(str);
  const parts = String(str).split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function normalizeShallow(doc, theme) {
  const license = licenseToken(doc.licenseurl);
  return {
    id: `archive:${doc.identifier}`,
    source: 'archive',
    sourceId: doc.identifier,
    theme,
    status: 'neu',
    name: doc.title ?? doc.identifier,
    author: doc.creator ?? 'unknown',
    license,
    licenseUrl: doc.licenseurl ?? '',
    publishable: isPublishable(license),
    attribution: license === 'CC0'
      ? null
      : `${doc.title ?? doc.identifier} by ${doc.creator ?? 'unknown'} (Internet Archive, ${license})`,
    duration: 0,
    tags: [],
    url: `https://archive.org/details/${doc.identifier}`,
    audioUrl: null,         // wird im zweiten Call gefuellt
    description: doc.description ?? '',
    _needsFile: true,
  };
}

export async function searchTheme({
  theme, queries, durationMax, publishable,
  target = 20, pages = null,
}) {
  const seen = new Set();
  const out = [];
  const pagesMap = pages ?? new Map();
  for (const q of queries) {
    if (out.length >= target) break;
    const page = (pagesMap.get(q) ?? 0) + 1;
    pagesMap.set(q, page);
    try {
      const docs = await searchIds({ query: q, durationMax, publishable, page, rows: 10 });
      for (const doc of docs) {
        if (out.length >= target) break;
        if (seen.has(doc.identifier)) continue;
        seen.add(doc.identifier);
        out.push({ ...normalizeShallow(doc, theme) });
      }
    } catch (err) {
      if (err.status === 429) throw err;
      console.warn(`Archive-Suche fehlgeschlagen "${q}" (page ${page}):`, err.message);
    }
  }
  // Audio-File-URLs nachladen — parallel, max 5 gleichzeitig.
  await fillAudioUrls(out, durationMax);
  // Items ohne Audio aus Resultat raus.
  return out.filter((s) => s.audioUrl);
}

async function fillAudioUrls(items, durationMax) {
  const CONCURRENCY = 5;
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const it = items[i];
      try {
        const file = await getAudioFile(it.sourceId);
        if (file) {
          it.audioUrl = file.url;
          it.duration = file.duration || 0;
          if (durationMax && it.duration > durationMax * 4) {
            // Item-Track ist viel laenger als Theme-durationMax → user-Hinweis statt skip
            // (Internet Archive hat oft volle Alben, nicht Snippets)
            it.tags.push('long');
          }
        }
        delete it._needsFile;
      } catch {
        // ignore
      }
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker);
  await Promise.all(workers);
}
