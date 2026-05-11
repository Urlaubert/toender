// sccode.org API client. SuperCollider-Code-Snippets, kuratiert mit Tags.
// Docs: https://sccode.org/api  (Endpunkte /code/CODE_ID/json, /api/tag)
// CORS: sccode.org sendet *manchmal* CORS, aber unstet — durch Proxy-Kaskade.
// Snippets sind Code, nicht Audio — Detail-Sheet zeigt Code + Copy-Button,
// User rendert lokal in SuperCollider.

import { proxiedFetch } from './cors.js';

const API_TAG = 'https://sccode.org/api/tag';
const API_CODE = 'https://sccode.org/api/code';
const VIEW_URL = 'https://sccode.org/1/sf/';

function licenseToken(licStr) {
  if (!licStr) return 'unknown';
  const l = String(licStr).toLowerCase();
  if (l.includes('cc0') || l.includes('public')) return 'CC0';
  if (l.includes('by-nc-sa')) return 'CC-BY-NC-SA';
  if (l.includes('by-nc')) return 'CC-BY-NC';
  if (l.includes('by-sa')) return 'CC-BY-SA';
  if (l.includes('by')) return 'CC-BY';
  return 'unknown';
}

function normalize(raw, theme) {
  const license = licenseToken(raw.license);
  const author = raw.user?.name ?? raw.user?.username ?? 'unknown';
  return {
    id: `sccode:${raw.id}`,
    source: 'sccode',
    sourceId: String(raw.id),
    theme,
    status: 'neu',
    name: raw.title ?? `SC-${raw.id}`,
    author,
    license,
    licenseUrl: raw.license ?? '',
    publishable: false,        // SC-Snippets sind Code — Publishing-Frage ist anders
    attribution: `${raw.title ?? 'SC-' + raw.id} by ${author} (sccode.org, ${license})`,
    duration: 0,                // Code, kein Audio
    tags: raw.tags ?? [],
    url: VIEW_URL + raw.id,
    audioUrl: null,             // KEIN Audio-Preview
    patternCode: raw.code ?? '',
    codeLanguage: 'supercollider',
    description: raw.description ?? '',
  };
}

// sccode.org bietet:
//  GET /api/tag                 → Liste aller Tags
//  GET /api/tag/<name>          → Codes mit diesem Tag
//  GET /api/code/<id>           → Einzel-Code mit Code-Body
//
// Wir suchen primaer per Tag (passt zu Themes). Wenn kein Tag-Match,
// versuchen wir Full-Text-Suche ueber /api/search (falls vorhanden) —
// die API ist nicht voll dokumentiert.

async function fetchTagCodes(tag) {
  const url = `${API_TAG}/${encodeURIComponent(tag)}`;
  try {
    const res = await proxiedFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.codes ?? data.code ?? data ?? [];
  } catch {
    return [];
  }
}

async function fetchCodeDetail(id) {
  const url = `${API_CODE}/${id}`;
  try {
    const res = await proxiedFetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function searchTheme({
  theme, queries, target = 20, pages = null,
}) {
  const seen = new Set();
  const out = [];
  // sccode.org hat Tag-API — wir nutzen jedes Stichwort als Tag-Probe.
  // Wenn das Stichwort als Tag existiert, kriegen wir die Liste; sonst leer.
  for (const q of queries) {
    if (out.length >= target) break;
    // Normalisiere Stichwort: nur ersten Wort verwenden, lowercase
    const tag = String(q).toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9-]/g, '');
    if (!tag) continue;
    const codes = await fetchTagCodes(tag);
    for (const c of codes) {
      if (out.length >= target) break;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      // Wenn Code-Body fehlt, einzeln holen
      let full = c;
      if (!c.code) {
        full = await fetchCodeDetail(c.id);
        if (!full) continue;
      }
      out.push(normalize(full, theme));
    }
  }
  return out;
}
