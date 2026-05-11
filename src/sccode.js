// sccode.org SuperCollider-Snippet-Source.
//
// Stand S-089 (2026-05-11): Statt Live-API (CORS-Proxy-unzuverlaessig)
// liefert dieser Modul jetzt eine statische Korpus-JSON aus
// public/sccode_corpus.json (gebaut via scripts/build_sccode_corpus.mjs
// aus Musik/wissen/sc/gold/-Cluster). 37 kuratierte Snippets in 7 Clustern.
//
// Vorher (S-088): Live-API mit Proxy-Kaskade. Problem: sccode.org sendet
// keine CORS-Header → fetch im Browser failt direkt, beide CORS-Proxies
// (allorigins, corsproxy.io) unzuverlaessig. Plus: API liefert nur
// Listing-Endpoint, kein Code-Body.
//
// Jetzt: 100% statisch, ueber GitHub-Pages-Cache verfuegbar, Code-Body
// drin, sccode.org-Attribution erhalten, Author + Cluster + Beschreibung
// im Sample, Detail-Sheet zeigt vollen Code.

let cachedCorpus = null;
let corpusPromise = null;

async function loadCorpus() {
  if (cachedCorpus) return cachedCorpus;
  if (corpusPromise) return corpusPromise;
  corpusPromise = (async () => {
    try {
      const baseUrl = import.meta.env?.BASE_URL ?? '/';
      const url = `${baseUrl}sccode_corpus.json`.replace(/\/\//g, '/');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Korpus leer oder kein Array');
      }
      cachedCorpus = data;
      console.info(`sccode-corpus: ${data.length} Snippets geladen`);
      return data;
    } catch (err) {
      console.warn('sccode-corpus konnte nicht geladen werden:', err.message);
      cachedCorpus = [];
      return cachedCorpus;
    }
  })();
  return corpusPromise;
}

function normalize(item, theme, queries) {
  const isOwn = item.author?.startsWith('Johannes');
  return {
    id: `sccode:${item.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    source: 'sccode',
    sourceId: item.slug,
    theme,
    status: 'neu',
    name: item.title,
    author: item.author,
    license: isOwn ? 'CC0' : 'sccode.org community (Lizenz pro Snippet pruefen)',
    licenseUrl: '',
    publishable: isOwn,
    attribution: isOwn ? null : `${item.title} by ${item.author} (sccode.org)`,
    duration: 0,
    tags: item.tags ?? [],
    url: isOwn ? null : `https://sccode.org/`,
    audioUrl: null,
    patternCode: item.code,
    codeLanguage: 'supercollider',
    embedUrl: null,
    description: item.description || `SuperCollider snippet from sccode.org, cluster: ${item.cluster}`,
    cluster: item.cluster,
  };
}

// Stichwort-Filter: queries gegen title/author/cluster/description/tags/code matchen.
// Falls 0 Stichworte oder nur breit-passende Default-Queries vorhanden sind,
// liefer den ganzen Korpus — damit das SuperCollider-Theme nicht auf 5 Snippets
// schrumpft nur weil "synth"/"rhythm" in keinem Titel stehen.
function matchesQueries(item, queries) {
  if (!queries || queries.length === 0) return true;
  const haystack = [
    item.title, item.author, item.cluster, item.description,
    ...(item.tags ?? []),
    item.code?.slice(0, 200),
  ].join(' ').toLowerCase();
  return queries.some((q) => haystack.includes(String(q).toLowerCase()));
}

export async function searchTheme({
  theme, queries, target = 20, pages = null,
}) {
  // pages = Map<themeKey, offset>. Beim ersten Aufruf 0, dann blaettern wir
  // durch den statischen Korpus damit der zweite Reload nicht dieselben
  // Snippets liefert. KEIN Wrap-around — wenn am Ende, gib weniger zurueck
  // damit der Queue-Dedup im main.js nicht doppelt schluckt.
  try {
    const corpus = await loadCorpus();
    const matched = corpus.filter((item) => matchesQueries(item, queries));
    // Default-SCCODE-Queries (ambient/drone/synth/rhythm) treffen nur 5 von 37
    // Snippets — das ist zu eng. Wenn die Trefferquote <50% ist und queries
    // breit sind (>=3), nimm den ganzen Korpus. Sonst nutze den Match.
    const isBroadDefaultQuery = queries && queries.length >= 3
      && queries.every((q) => String(q).length < 10);
    const useFullCorpus = matched.length === 0
      || (isBroadDefaultQuery && matched.length < corpus.length / 2);
    const pool = useFullCorpus ? corpus : matched;
    const offsetKey = '__sccode_offset__';
    const pagesMap = pages ?? new Map();
    const offset = pagesMap.get(offsetKey) ?? 0;
    const slice = pool.slice(offset, offset + target);
    pagesMap.set(offsetKey, offset + slice.length);
    // Wenn am Ende: Reset, damit naechster Reload wieder von vorn anfaengt
    // (der Queue-Dedup verhindert dann tatsaechliche Duplikate).
    if (offset + slice.length >= pool.length) {
      pagesMap.set(offsetKey, 0);
    }
    return slice.map((i) => normalize(i, theme, queries));
  } catch (err) {
    console.warn('sccode searchTheme failed:', err.message);
    return [];
  }
}

// Kick off background-Load.
loadCorpus();
