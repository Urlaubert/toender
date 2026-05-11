// Liest Musik/wissen/sc/gold/-Cluster und erzeugt
// public/sccode_corpus.json fuer den Toender-SuperCollider-Theme.
//
// Analog zu build_strudel_corpus.mjs. Wird vor `vite build` und `vite dev`
// aufgerufen.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOENDER_ROOT = resolve(__dirname, '..');
const MUSIK_GOLD = resolve(TOENDER_ROOT, '..', 'Musik', 'wissen', 'sc', 'gold');
const OUT_PATH = join(TOENDER_ROOT, 'public', 'sccode_corpus.json');

function parseHeader(content) {
  // sccode-Snippets haben das sccode-Header-Format:
  //   // title: <title>
  //   // author: <author>
  //   // description: ...
  //   // code:
  const lines = content.split('\n');
  let title = '';
  let author = '';
  let description = [];
  let inDescription = false;
  let codeStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\/\/\s*(title|author|description|license|code):\s*(.*)/i);
    if (m) {
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      if (key === 'title') title = value.replace(/^"|"$/g, '');
      else if (key === 'author') author = value;
      else if (key === 'description') {
        inDescription = true;
        if (value) description.push(value);
      } else if (key === 'code') {
        inDescription = false;
        codeStartLine = i + 1;
        break;
      }
    } else if (inDescription && line.startsWith('//')) {
      const txt = line.replace(/^\/\/\s?/, '').trim();
      if (txt) description.push(txt);
    } else if (!line.startsWith('//') && line.trim() !== '') {
      // Erste Nicht-Kommentar-Zeile = Code-Start, falls // code: fehlt
      if (codeStartLine === 0) codeStartLine = i;
      break;
    }
  }

  const code = lines.slice(codeStartLine).join('\n').trim();
  return { title, author, description: description.join(' '), code };
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
    const files = readdirSync(clusterDir).filter((f) => f.endsWith('.scd'));
    for (const file of files) {
      const filePath = join(clusterDir, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const { title, author, description, code } = parseHeader(content);
        const slug = file.replace(/\.scd$/, '');
        corpus.push({
          id: `gold/${cluster}/${slug}`,
          cluster,
          slug,
          title: title || slug.replace(/_/g, ' '),
          author: author || 'unbekannt',
          description: description.slice(0, 240),
          tags: [cluster],
          code,
        });
      } catch (err) {
        console.error(`Fehler beim Lesen von ${filePath}:`, err.message);
      }
    }
  }

  writeJson(corpus);
  console.log(`build_sccode_corpus: ${corpus.length} snippets aus ${clusters.length} clustern → ${OUT_PATH}`);
}

function writeJson(data) {
  const dir = dirname(OUT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

main();
