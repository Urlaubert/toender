// Freesound API client.
// Uses Client API Key (Token auth). Returns a normalized sample shape.
// Docs: https://freesound.org/docs/api/

const API = 'https://freesound.org/apiv2';

const FIELDS = 'id,name,username,license,previews,tags,duration,url,description';

function authHeaders(key) {
  return { Authorization: `Token ${key}` };
}

// License mapping from Freesound's "license" URL to a short token.
function licenseToken(licenseUrl) {
  if (!licenseUrl) return 'unknown';
  if (licenseUrl.includes('publicdomain')) return 'CC0';
  if (licenseUrl.includes('by-nc')) return 'CC-BY-NC';
  if (licenseUrl.includes('by-sa')) return 'CC-BY-SA';
  if (licenseUrl.includes('by/'))   return 'CC-BY';
  return 'unknown';
}

function isPublishable(token) {
  return ['CC0', 'CC-BY'].includes(token);
}

// Build a Freesound query that prefers publishable licenses when requested.
function buildFilter({ theme, durationMax, publishable }) {
  const parts = [];
  if (durationMax) parts.push(`duration:[0 TO ${durationMax}]`);
  if (publishable) {
    // Freesound 'license' field uses canonical strings. Server-side filter saves bandwidth.
    parts.push('(license:"Creative Commons 0" OR license:"Attribution")');
  }
  return parts.join(' ');
}

function normalize(raw, theme) {
  const license = licenseToken(raw.license);
  return {
    id: `freesound:${raw.id}`,
    source: 'freesound',
    sourceId: String(raw.id),
    theme,
    status: 'neu',
    name: raw.name,
    author: raw.username,
    license,
    licenseUrl: raw.license,
    publishable: isPublishable(license),
    attribution: license === 'CC-BY'
      ? `${raw.name} by ${raw.username} (Freesound, ${license})`
      : license === 'CC0'
        ? null
        : `${raw.name} by ${raw.username} (Freesound, ${license})`,
    duration: raw.duration,
    tags: raw.tags ?? [],
    url: raw.url,
    audioUrl: raw.previews?.['preview-hq-mp3'] ?? raw.previews?.['preview-lq-mp3'],
    description: raw.description,
  };
}

export async function search({ key, query, theme, durationMax, publishable, page = 1, pageSize = 20 }) {
  if (!key) throw new Error('Freesound API-Key fehlt');
  const params = new URLSearchParams({
    query,
    fields: FIELDS,
    page: String(page),
    page_size: String(pageSize),
    sort: 'rating_desc',
  });
  const filter = buildFilter({ theme, durationMax, publishable });
  if (filter) params.set('filter', filter);

  const res = await fetch(`${API}/search/text/?${params}`, { headers: authHeaders(key) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Freesound ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return (data.results ?? []).map((r) => normalize(r, theme));
}

// Convenience: run several queries, dedupe by sourceId, cap to N.
// Auth-Errors (401/403) und Rate-Limits (429) werden sofort hochgeworfen — sonst
// schluckt der Per-Query-Try/Catch den Fehler und der User sieht nur "0 Samples".
export async function searchTheme({ key, theme, queries, durationMax, publishable, target = 20 }) {
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    if (out.length >= target) break;
    try {
      const batch = await search({
        key,
        query: q,
        theme,
        durationMax,
        publishable,
        pageSize: Math.max(10, target),
      });
      for (const s of batch) {
        if (seen.has(s.sourceId)) continue;
        seen.add(s.sourceId);
        out.push(s);
        if (out.length >= target) break;
      }
    } catch (err) {
      // Auth- und Rate-Limit-Fehler treffen alle Queries — sofort eskalieren.
      if (err.status === 401 || err.status === 403 || err.status === 429) {
        throw err;
      }
      console.warn(`Suche fehlgeschlagen fuer "${q}":`, err.message);
    }
  }
  return out;
}
