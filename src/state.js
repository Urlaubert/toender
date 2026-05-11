// Plain Pub/Sub store. Keys are top-level fields; subscribers receive (newValue, key).

const target = new EventTarget();
const data = {
  view: 'audition',     // 'themes' | 'audition' | 'behalten' | 'du'
  theme: 'kiesel',
  queue: [],            // Array of sample objects pending audition
  current: null,        // Currently displayed sample
  lastVote: null,       // { sampleId, prevStatus } for Undo
  stackFilter: 'neu',   // 'neu' | 'mittel' | 'all'
  behaltenFilter: 'all',// 'all' | 'stern' | 'gut' | 'mittel'
  behaltenSearch: '',
  busy: false,
  settings: {
    freesoundKey: '',
    xenoCantoKey: '',
    githubToken: '',
    githubRepo: '',
    loudnessNormalize: true,
    licensePublishable: true,
    sourceFreesound: true,
    sourceXenoCanto: true,
    sourceArchive: false,    // langsam (zwei API-Calls pro Treffer), default aus
    sourceSccode: true,      // sccode.org SuperCollider-Snippets, kein Key
  },
  stats: { neu: 0, raus: 0, mittel: 0, gut: 0, stern: 0 },
};

export function get(key) {
  return key === undefined ? data : data[key];
}

export function set(key, value) {
  data[key] = value;
  target.dispatchEvent(new CustomEvent(key, { detail: value }));
}

export function patch(key, partial) {
  data[key] = { ...data[key], ...partial };
  target.dispatchEvent(new CustomEvent(key, { detail: data[key] }));
}

export function on(key, handler) {
  const wrapped = (ev) => handler(ev.detail, key);
  target.addEventListener(key, wrapped);
  return () => target.removeEventListener(key, wrapped);
}
