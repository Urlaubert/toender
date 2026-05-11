// Strudel-Pattern-Loader. Liest /strudel_corpus.json (im public/ Ordner,
// gebaut via scripts/build_strudel_corpus.mjs aus
// Musik/wissen/strudel/gold/). Bei Fehler / leerer Datei: Fallback auf
// 5 hartcodierte Demo-Patterns.
//
// Lizenz: gold-Snippets meist CC BY-NC-SA 4.0 (Felix Roos & community),
// Demo-Fallback CC0.

const STRUDEL_BASE = 'https://strudel.cc';

function encodePattern(code) {
  return btoa(unescape(encodeURIComponent(code)));
}

function patternToEmbedUrl(code) {
  return `${STRUDEL_BASE}/?code=${encodePattern(code)}`;
}

// Fallback wenn strudel_corpus.json fehlt / leer ist.
const DEMO_PATTERNS = [
  { name: 'Tresillo Demo', tags: ['beat', 'demo'], code: `s("bd(3,8)").gain(0.9)` },
  { name: 'Whale-Pad Demo', tags: ['drone', 'demo'], code: `note("c3 eb3 g3").s("sine").slow(8).vib(0.3).room(0.9).gain(0.4)` },
  { name: 'Acid-Bass Demo', tags: ['bass', 'demo'], code: `note("c2 c2 eb2 c2 g2 c2 bb1 c2").s("sawtooth").lpf(sine.range(200,1500).slow(4)).lpq(15)` },
  { name: 'Wind-Whistle Demo', tags: ['atmo', 'demo'], code: `s("white").lpf(sine.range(300,1500).slow(6)).lpq(8).gain(0.3)` },
  { name: 'Noise-Riser Demo', tags: ['fx', 'demo'], code: `s("white").lpf(range(200,8000).fast(0.25)).gain(line(0,0.7).slow(8))` },
];

let cachedCorpus = null;
let corpusPromise = null;

async function loadCorpus() {
  if (cachedCorpus) return cachedCorpus;
  if (corpusPromise) return corpusPromise;
  corpusPromise = (async () => {
    try {
      // Beachte vite-base: '/toender/' im prod build, '/' im dev.
      const baseUrl = import.meta.env?.BASE_URL ?? '/';
      const url = `${baseUrl}strudel_corpus.json`.replace(/\/\//g, '/');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Korpus leer oder nicht array');
      }
      cachedCorpus = data;
      console.info(`strudel-corpus: ${data.length} Snippets geladen`);
      return data;
    } catch (err) {
      console.warn('strudel-corpus konnte nicht geladen werden, nutze Demo-Fallback:', err.message);
      cachedCorpus = DEMO_PATTERNS.map((p, i) => ({
        id: `demo/${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        cluster: 'demo',
        slug: p.name.toLowerCase().replace(/\s+/g, '-'),
        title: p.name,
        source: 'demo',
        tags: p.tags,
        code: p.code,
      }));
      return cachedCorpus;
    }
  })();
  return corpusPromise;
}

export const STRUDEL_THEME_KEY = 'strudel-demo';
export const STRUDEL_THEME = {
  key: STRUDEL_THEME_KEY,
  label: 'Strudel-Library',
  queries: ['strudel'],
  durationMax: 0,
  builtin: false,
  source: 'strudel',
  sources: ['strudel'],
};

export const SCCODE_THEME_KEY = 'sccode-snippets';
export const SCCODE_THEME = {
  key: SCCODE_THEME_KEY,
  label: 'SuperCollider-Snippets',
  queries: ['ambient', 'drone', 'synth', 'rhythm'],
  durationMax: 0,
  builtin: false,
  sources: ['sccode'],
};

function snippetToSample(snippet, theme, idx) {
  const id = `strudel:${snippet.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  return {
    id,
    source: 'strudel',
    sourceId: String(idx),
    theme,
    status: 'neu',
    name: snippet.title || snippet.slug || `Snippet ${idx}`,
    author: snippet.source === 'tunes' || snippet.source === 'examples'
      ? 'strudel.cc (CC BY-NC-SA 4.0)'
      : snippet.source ?? 'toender demo',
    license: snippet.source === 'demo' ? 'CC0' : 'CC BY-NC-SA 4.0',
    publishable: snippet.source === 'demo',
    attribution: snippet.source === 'demo' ? null : 'strudel.cc community',
    duration: 4,
    tags: snippet.tags ?? [],
    url: patternToEmbedUrl(snippet.code),
    audioUrl: null,
    patternCode: snippet.code,
    codeLanguage: 'strudel',
    embedUrl: patternToEmbedUrl(snippet.code),
    description: snippet.code,
    cluster: snippet.cluster,
  };
}

// Synchrone Variante fuer Code-Pfade die nicht warten koennen.
// Liefert Demo-Fallback wenn Korpus noch nicht geladen ist.
export function getStrudelSamples(theme = STRUDEL_THEME_KEY) {
  const corpus = cachedCorpus ?? DEMO_PATTERNS.map((p, i) => ({
    id: `demo/${i}`,
    cluster: 'demo',
    title: p.name,
    source: 'demo',
    tags: p.tags,
    code: p.code,
  }));
  return corpus.map((s, i) => snippetToSample(s, theme, i));
}

// Async-Variante die wartet bis das Korpus geladen ist.
export async function getStrudelSamplesAsync(theme = STRUDEL_THEME_KEY) {
  const corpus = await loadCorpus();
  return corpus.map((s, i) => snippetToSample(s, theme, i));
}

// Kick off background-Load damit der nachste synchron-Aufruf schon
// Korpus-Daten hat.
loadCorpus();
