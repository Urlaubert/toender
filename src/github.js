// GitHub Contents-API client. Pushes a starred sample as a file under
// samples/kept/<theme>/<source>-<id>.<ext> plus a JSON sidecar.
// Token: fine-grained, scope `contents:write` on this repo only.

const API = 'https://api.github.com';

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function arrayBufferToBase64(buffer) {
  // chunked to avoid call-stack overflow on big buffers
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function buildMeta(sample) {
  return {
    id: sample.id,
    source: sample.source,
    sourceId: sample.sourceId,
    theme: sample.theme,
    name: sample.name,
    author: sample.author,
    license: sample.license,
    licenseUrl: sample.licenseUrl,
    publishable: sample.publishable,
    attribution: sample.attribution,
    duration: sample.duration,
    sourceUrl: sample.url,
    description: sample.description,
    patternCode: sample.patternCode ?? null,
    starredAt: new Date().toISOString(),
  };
}

function inferExtension(url) {
  try {
    const u = new URL(url);
    const pathname = u.pathname.toLowerCase();
    if (pathname.endsWith('.mp3')) return 'mp3';
    if (pathname.endsWith('.ogg')) return 'ogg';
    if (pathname.endsWith('.wav')) return 'wav';
  } catch {}
  return 'mp3';
}

async function putFile({ token, repo, path, contentBase64, message }) {
  // Need to look up SHA if file already exists.
  let sha;
  try {
    const head = await fetch(`${API}/repos/${repo}/contents/${path}`, { headers: authHeaders(token) });
    if (head.ok) {
      const data = await head.json();
      sha = data.sha;
    }
  } catch { /* ignore */ }

  const body = {
    message,
    content: contentBase64,
    branch: 'main',
  };
  if (sha) body.sha = sha;

  const res = await fetch(`${API}/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`GitHub PUT ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

// Loescht ein gesterntes Sample aus dem Repo (audio + meta).
export async function deleteStarSample({ token, repo, sample }) {
  if (!token) throw new Error('GitHub-Token fehlt');
  if (!repo)  throw new Error('GitHub-Repo fehlt');

  const ext = inferExtension(sample.audioUrl);
  const safeName = sample.sourceId.replace(/[^a-z0-9_-]/gi, '');
  const audioPath = `samples/kept/${sample.theme}/${sample.source}-${safeName}.${ext}`;
  const metaPath  = `samples/kept/${sample.theme}/${sample.source}-${safeName}.json`;

  async function deletePath(path) {
    const head = await fetch(`${API}/repos/${repo}/contents/${path}`, { headers: authHeaders(token) });
    if (head.status === 404) return;
    if (!head.ok) throw new Error(`GitHub GET ${head.status}`);
    const data = await head.json();
    const res = await fetch(`${API}/repos/${repo}/contents/${path}`, {
      method: 'DELETE',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `toender: unstar ${sample.source}-${safeName}`, sha: data.sha, branch: 'main' }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`GitHub DELETE ${res.status}: ${err.slice(0, 200)}`);
    }
  }

  await deletePath(audioPath);
  await deletePath(metaPath);
  return { audioPath, metaPath };
}

export async function pushStarSample({ token, repo, sample }) {
  if (!token) throw new Error('GitHub-Token fehlt');
  if (!repo)  throw new Error('GitHub-Repo fehlt');

  const safeName = sample.sourceId.replace(/[^a-z0-9_-]/gi, '');
  const metaPath  = `samples/kept/${sample.theme}/${sample.source}-${safeName}.json`;

  // Strudel-Pattern: kein Audio-Download, sondern .strudel-Code-File
  if (sample.source === 'strudel' && sample.patternCode) {
    const codePath = `samples/kept/${sample.theme}/${sample.source}-${safeName}.strudel`;
    const codeB64 = btoa(unescape(encodeURIComponent(sample.patternCode)));
    const meta = buildMeta(sample);
    const metaB64 = btoa(unescape(encodeURIComponent(JSON.stringify(meta, null, 2))));
    await putFile({ token, repo, path: codePath, contentBase64: codeB64, message: `toender: stern strudel ${safeName}` });
    await putFile({ token, repo, path: metaPath, contentBase64: metaB64, message: `toender: meta ${sample.source}-${safeName}` });
    return { audioPath: codePath, metaPath };
  }

  if (!sample.audioUrl) throw new Error('Sample hat keine audioUrl');

  const ext = inferExtension(sample.audioUrl);
  const audioPath = `samples/kept/${sample.theme}/${sample.source}-${safeName}.${ext}`;

  const audioRes = await fetch(sample.audioUrl);
  if (!audioRes.ok) throw new Error(`Audio-Fetch ${audioRes.status}`);
  const buf = await audioRes.arrayBuffer();
  const audioB64 = await arrayBufferToBase64(buf);

  const meta = buildMeta(sample);
  const metaB64 = btoa(unescape(encodeURIComponent(JSON.stringify(meta, null, 2))));

  await putFile({
    token, repo,
    path: audioPath,
    contentBase64: audioB64,
    message: `toender: stern ${sample.source}-${safeName}`,
  });
  await putFile({
    token, repo,
    path: metaPath,
    contentBase64: metaB64,
    message: `toender: meta ${sample.source}-${safeName}`,
  });

  return { audioPath, metaPath };
}
