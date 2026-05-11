// Story-Preset "Unterwasser-Insel-Bogen" — 21 Themes als Bulk-Import.
// Jedes Theme hat 'sources': Whitelist welche Quellen es nutzen soll.
// xenocanto: Tier-Aufnahmen (Voegel, Wal, Insekten)
// freesound: Foley, Drums, Synth, Sprache, alles andere
// archive: Field-Recordings, alte Aufnahmen, lange Tracks

export const STORY_THEMES = [
  // --- Atmo / Drone-Bett ---
  {
    key: 'unterwasser-tiefe',
    label: 'Unterwasser-Tiefe',
    queries: ['underwater hum', 'submarine ambience', 'deep water rumble', 'hydrophone drone'],
    durationMax: 30,
    sources: ['freesound', 'archive'],
  },
  {
    key: 'brandung',
    label: 'Brandung',
    queries: ['ocean wave shore', 'beach surf', 'wave crash', 'foam hiss'],
    durationMax: 15,
    sources: ['freesound', 'archive'],
  },
  {
    key: 'wind-sand',
    label: 'Wind & Sand',
    queries: ['wind dune', 'sand wind howl', 'beach wind', 'dry wind whistle'],
    durationMax: 20,
    sources: ['freesound', 'archive'],
  },
  {
    key: 'inselnacht',
    label: 'Inselnacht',
    queries: ['night cicada tropical', 'jungle night ambience', 'distant ocean night', 'palm rustle wind'],
    durationMax: 30,
    sources: ['freesound', 'archive', 'xenocanto'],
  },
  {
    key: 'schiff-metall',
    label: 'Schiff & Metall',
    queries: ['ship hull groan', 'harbor creak', 'metal stress underwater', 'rope creak'],
    durationMax: 15,
    sources: ['freesound', 'archive'],
  },

  // --- Tonale Texturen / Tier-Sounds ---
  {
    key: 'wal',
    label: 'Wal',
    queries: ['humpback whale song', 'whale call', 'cetacean'],
    durationMax: 30,
    sources: ['xenocanto', 'freesound', 'archive'],
  },
  {
    key: 'voegel',
    label: 'Voegel',
    queries: ['bird singing', 'songbird call', 'dawn chorus', 'tropical bird'],
    durationMax: 8,
    sources: ['xenocanto', 'freesound'],
  },
  {
    key: 'delphin-orca',
    label: 'Delphin & Orca',
    queries: ['dolphin click', 'orca call', 'dolphin whistle'],
    durationMax: 8,
    sources: ['xenocanto', 'freesound'],
  },
  {
    key: 'wasser-tropfen',
    label: 'Wasser-Tropfen',
    queries: ['water drop deep', 'drip cave', 'drop reverb', 'splash short'],
    durationMax: 4,
    sources: ['freesound'],
  },
  {
    key: 'glas-unterwasser',
    label: 'Glas Unterwasser',
    queries: ['glass underwater', 'bottle clink water', 'submerged bell'],
    durationMax: 8,
    sources: ['freesound'],
  },
  {
    key: 'industrial-hall',
    label: 'Industrial-Hall',
    queries: ['factory drone hall', 'big room rumble', 'concrete hall echo', 'pipe metal hit'],
    durationMax: 20,
    sources: ['freesound', 'archive'],
  },

  // --- Beat / Drums / Percussion (Freesound-only) ---
  {
    key: 'kick-material',
    label: 'Kick-Material',
    queries: ['kick acoustic punch', 'sub kick boom', 'boom drum hit', 'body hit chest'],
    durationMax: 3,
    sources: ['freesound'],
  },
  {
    key: 'snare-clap-body',
    label: 'Snare/Clap-Body',
    queries: ['clap hand short', 'snap finger', 'wood snap', 'slap percussion'],
    durationMax: 2,
    sources: ['freesound'],
  },
  {
    key: 'hihat-shaker',
    label: 'Hihat & Shaker',
    queries: ['hihat acoustic close', 'shaker sand', 'gravel shaker', 'dry shake'],
    durationMax: 3,
    sources: ['freesound'],
  },
  {
    key: 'metall-perc',
    label: 'Metall-Perc',
    queries: ['metal scrape rhythm', 'anvil hit small', 'can hit metal', 'pipe ping'],
    durationMax: 4,
    sources: ['freesound'],
  },
  {
    key: 'holz-perc',
    label: 'Holz-Perc',
    queries: ['wood block hit', 'stick wood', 'plank thud', 'log thud'],
    durationMax: 3,
    sources: ['freesound'],
  },
  {
    key: 'stein-perc',
    label: 'Stein-Perc',
    queries: ['pebble impact', 'stone hit close', 'rock click sharp', 'gravel'],
    durationMax: 3,
    sources: ['freesound'],
  },

  // --- Mensch & Stimme ---
  {
    key: 'atem-stoehnen',
    label: 'Atem & Stoehnen',
    queries: ['breath close', 'exhale deep', 'breath underwater', 'sigh low'],
    durationMax: 6,
    sources: ['freesound'],
  },
  {
    key: 'wort-schnipsel',
    label: 'Wort-Schnipsel',
    queries: ['voice phoneme', 'syllable speech', 'word fragment', 'throat'],
    durationMax: 3,
    sources: ['freesound'],
  },
  {
    key: 'foley-schritte',
    label: 'Foley Schritte',
    queries: ['footsteps sand', 'walking shore', 'step wet', 'step stone'],
    durationMax: 5,
    sources: ['freesound', 'archive'],
  },

  // --- Synthetisches Material ---
  {
    key: 'sub-bass',
    label: 'Sub-Bass',
    queries: ['sub bass tone', 'low sine pad', 'deep bass note', 'woofer test'],
    durationMax: 8,
    sources: ['freesound'],
  },
  {
    key: 'noise-sweep',
    label: 'Noise-Sweep',
    queries: ['noise sweep down', 'white noise riser', 'filter sweep down', 'atmospheric sweep'],
    durationMax: 12,
    sources: ['freesound'],
  },
];
