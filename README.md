# Toender

Wisch-basiertes Audition-Tool fuer Samples. Mobile-first PWA, gehostet auf
GitHub Pages, vollstaendig serverlos. "Tinder fuer Samples".

## Konzept

Siehe `KONZEPT.md` (im Musik-Workspace unter `projekte/toender/`).

## Stack

- Vanilla JS + Vite (kein Framework)
- Wavesurfer.js v7 fuer Waveform-Visualisierung
- Web Audio API fuer Playback + FX (Pitch, Speed, Reverse, Highpass, Trim, Loudness-Normalize)
- IndexedDB via `idb` fuer Memory pro Sample
- Freesound API als Live-Quelle
- PWA-Manifest + Service-Worker fuer App-Shell-Cache
- GitHub Contents-API fuer Stern-Sample-Sync zurueck ins Repo

## Entwicklung

```bash
npm install
npm run dev      # http://localhost:5173/toender/
npm run build    # Output nach docs/ (GitHub-Pages-Quelle)
```

## Deployment

GitHub Pages liest direkt aus `main:/docs/`. Build commiten + pushen reicht.

```bash
npm run build
git add docs
git commit -m "build"
git push
```

## API-Keys

In der App via Setup-Drawer einzugeben, gespeichert in `localStorage`:

- **Freesound API-Key** — Client API Key von <https://freesound.org/apiv2/apply/>
- **GitHub Token** — Fine-grained PAT mit `contents:write`-Scope NUR auf dieses
  Repo. Optional, nur fuer Stern-Sync noetig.
- **GitHub Repo** — `Urlaubert/toender` (oder dein Fork)

## Status

Stufe 1+ Build (Session 1). Folge-APs: RNNoise-Denoise, Audio-Cache,
Mic-Aufnahme, Auto-Slicing, Internet-Archive/Xeno-Canto-Quellen,
Strudel-Integration. Siehe KONZEPT.md.
