// Liest Musik/wissen/strudel/gold/-Cluster und erzeugt
// public/strudel_corpus.json fuer den Toender-Strudel-Theme.
//
// Wird vor `vite build` und `vite dev` aufgerufen.
//
// Nachbarschaft: Das Musik-Repo liegt zwei Ebenen ueber Toender
// (../../Musik/wissen/strudel/gold/). Falls das Layout abweicht,
// fallbacks ins eigene Repo (toender/src/strudel_corpus.json) wenn
// vorhanden, sonst leeres Array.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOENDER_ROOT = resolve(__dirname, '..');
const MUSIK_GOLD = resolve(TOENDER_ROOT, '..', 'Musik', 'wissen', 'strudel', 'gold');
const OUT_PATH = join(TOENDER_ROOT, 'public', 'strudel_corpus.json');

function readSnippet(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  // Header sind die ersten 3 Zeilen `// title`, `// source`, `// tags`
  const lines = content.split('\n');
  const titleLine = lines[0] || '';
  const sourceLine = lines[1] || '';
  const tagsLine = lines[2] || '';

  const title = titleLine.replace(/^\/\/\s*/, '').trim();
  const source = sourceLine.replace(/^\/\/\s*source:\s*/, '').trim();
  const tagsRaw = tagsLine.replace(/^\/\/\s*tags:\s*/, '').trim();
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

  // Body = Zeilen nach dem Header (separator: leere Zeile nach Zeile 3)
  let bodyStart = 3;
  while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart++;
  const code = lines.slice(bodyStart).join('\n').trim();

  return { title, source, tags, code };
}

function main() {
  if (!existsSync(MUSIK_GOLD)) {
    console.warn(`Musik-Gold-Pfad nicht gefunden: ${MUSIK_GOLD}`);
    console.warn('Schreibe leeres Korpus.');
    writeJson([]);
    return;
  }

  const clusters = readdirSync(MUSIK_GOLD, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const corpus = [];
  for (const cluster of clusters) {
    const clusterDir = join(MUSIK_GOLD, cluster);
    const files = readdirSync(clusterDir).filter((f) => f.endsWith('.strudel'));
    for (const file of files) {
      const filePath = join(clusterDir, file);
      try {
        const snippet = readSnippet(filePath);
        const slug = file.replace(/\.strudel$/, '');
        corpus.push({
          id: `gold/${cluster}/${slug}`,
          cluster,
          slug,
          title: snippet.title,
          source: snippet.source,
          tags: [cluster, ...snippet.tags],
          code: snippet.code,
        });
      } catch (err) {
        console.error(`Fehler beim Lesen von ${filePath}:`, err.message);
      }
    }
  }

  // Dedupe by code: belldub ist in zwei Clustern, holyflute auch
  const seen = new Map();
  for (const entry of corpus) {
    if (!seen.has(entry.code)) {
      seen.set(entry.code, entry);
    } else {
      // Merge cluster tags
      const existing = seen.get(entry.code);
      existing.tags = [...new Set([...existing.tags, ...entry.tags])];
    }
  }
  const deduped = [...seen.values()];

  writeJson(deduped);
  console.log(`build_strudel_corpus: ${deduped.length} unique snippets aus ${clusters.length} clustern → ${OUT_PATH}`);
}

function writeJson(data) {
  const dir = dirname(OUT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

main();
