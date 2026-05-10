// UI rendering + gestures.
// Audition card: swipe (Backup), Tap-Pad = Replay, Hold ≥350ms = Loop, Wave-Strip = Replay-from-Position.
// Kept items: Tap = Loop/Stop, Long-Press = Action-Sheet.

import { findCrossThemeMarker } from './memory.js';

const SWIPE_THRESHOLD = 100;
const SWIPE_VELOCITY = 0.6;
const MAX_TILT = 18;
const HOLD_LOOP_MS = 350;
const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD_PX = 10;

const VOTE_FOR_DIR = {
  left: 'raus',
  right: 'gut',
  up: 'stern',
  down: 'mittel',
};

const STATUS_GLYPH = {
  stern: '★',
  gut: '+',
  mittel: '~',
  raus: 'x',
};

let onVoteCallback = null;
let onTapPadCallback = null;
let onHoldStartCallback = null;
let onHoldEndCallback = null;
let onWaveClickCallback = null;
let onKeptTapCallback = null;
let onKeptLongPressCallback = null;

export function onVote(handler) { onVoteCallback = handler; }
export function onTapPad(handler) { onTapPadCallback = handler; }
export function onHoldStart(handler) { onHoldStartCallback = handler; }
export function onHoldEnd(handler) { onHoldEndCallback = handler; }
export function onWaveClick(handler) { onWaveClickCallback = handler; }
export function onKeptTap(handler) { onKeptTapCallback = handler; }
export function onKeptLongPress(handler) { onKeptLongPressCallback = handler; }

export async function renderTopCard(stack, sample, theme) {
  stack.innerHTML = '';
  if (!sample) return null;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = sample.id;

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = sample.name;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  appendDnaMarkers(meta, sample);

  // Status-Badge wenn schon bewertet (Re-Anzeige-als-Marker-Fix)
  if (sample.status && sample.status !== 'neu') {
    meta.appendChild(makeBadge(`bereits ${sample.status}`, 'heard-' + statusToBadge(sample.status)));
  }

  // Cross-theme marker
  try {
    const cross = await findCrossThemeMarker(sample.sourceId, theme);
    for (const m of cross) {
      meta.appendChild(makeBadge(`schon in ${m.theme}`, m.status === 'stern' ? 'heard-star' : 'heard-good'));
    }
  } catch {
    // memory not ready; ignore
  }

  // Tap-Pad: Tap = Replay, Hold ≥350ms = Loop
  const art = document.createElement('div');
  art.className = 'card-art';
  art.textContent = '♪';
  const artHint = document.createElement('div');
  artHint.className = 'card-art-hint';
  artHint.textContent = 'Tap = Replay · Hold = Loop';
  art.appendChild(artHint);
  attachTapPad(art);

  // Wave-Strip mit Click-to-Position
  const wave = document.createElement('div');
  wave.className = 'card-wave';
  wave.dataset.role = 'wave-strip';
  wave.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  wave.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (!onWaveClickCallback) return;
    const rect = wave.getBoundingClientRect();
    const ratio = (ev.clientX - rect.left) / rect.width;
    onWaveClickCallback(Math.max(0, Math.min(1, ratio)));
  });

  const progress = document.createElement('div');
  progress.className = 'card-progress';
  const progressBar = document.createElement('span');
  progress.appendChild(progressBar);

  const hintLeft = makeHint('Raus', 'left');
  const hintRight = makeHint('Gut', 'right');
  const hintUp = makeHint('Stern', 'up');
  const hintDown = makeHint('Mittel', 'down');

  card.append(title, meta, art, wave, progress, hintLeft, hintRight, hintUp, hintDown);
  stack.appendChild(card);

  attachSwipe(card, { hintLeft, hintRight, hintUp, hintDown });

  return { card, art, progressBar, wave };
}

function statusToBadge(status) {
  return ({ stern: 'star', gut: 'good', mittel: 'mid', raus: 'out' })[status] ?? '';
}

function appendDnaMarkers(meta, sample) {
  // Lizenz
  meta.appendChild(makeBadge(sample.license, 'license dna'));
  // Publishable-Warnung
  if (!sample.publishable) meta.appendChild(makeBadge('NC', 'warn dna'));
  // Dauer-Bucket
  const dur = sample.duration ?? 0;
  const durLabel = dur < 1 ? '◦ <1s' : dur < 3 ? '● <3s' : dur < 10 ? '◐ <10s' : '◑ lang';
  meta.appendChild(makeBadge(durLabel, 'dna'));
  // Quelle (immer freesound bis 2b)
  if (sample.source) meta.appendChild(makeBadge(sample.source, 'dna'));
  // Author
  if (sample.author) meta.appendChild(makeBadge('@' + sample.author));
}

function makeBadge(text, cls) {
  const b = document.createElement('span');
  b.className = 'badge' + (cls ? ' ' + cls : '');
  b.textContent = text;
  return b;
}

function makeHint(text, dir) {
  const el = document.createElement('div');
  el.className = `swipe-hint ${dir}`;
  el.textContent = text;
  return el;
}

function attachTapPad(art) {
  let pressTimer = null;
  let holding = false;
  let downX = 0, downY = 0;
  let started = false;

  function onDown(ev) {
    started = true;
    downX = ev.clientX;
    downY = ev.clientY;
    holding = false;
    pressTimer = setTimeout(() => {
      holding = true;
      art.classList.add('looping');
      if (onHoldStartCallback) onHoldStartCallback();
    }, HOLD_LOOP_MS);
  }
  function onMove(ev) {
    if (!started) return;
    const dx = Math.abs(ev.clientX - downX);
    const dy = Math.abs(ev.clientY - downY);
    if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
      // Wisch faengt an — Tap/Hold abbrechen, Karte handhabt
      clearTimeout(pressTimer);
      pressTimer = null;
      started = false;
    }
  }
  function onUp() {
    if (!started) return;
    started = false;
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (holding) {
      art.classList.remove('looping');
      if (onHoldEndCallback) onHoldEndCallback();
      holding = false;
    } else {
      if (onTapPadCallback) onTapPadCallback();
    }
  }

  art.addEventListener('pointerdown', onDown);
  art.addEventListener('pointermove', onMove);
  art.addEventListener('pointerup', onUp);
  art.addEventListener('pointercancel', onUp);
  art.addEventListener('pointerleave', () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (holding) { art.classList.remove('looping'); if (onHoldEndCallback) onHoldEndCallback(); holding = false; }
    started = false;
  });
}

function attachSwipe(card, hints) {
  let startX = 0, startY = 0, startT = 0;
  let dx = 0, dy = 0;
  let pointerId = null;
  let isSwipe = false;

  function onDown(ev) {
    // Tap-Pad und Wave-Strip handhaben selbst — nicht weiterleiten
    if (ev.target.closest('.card-art') || ev.target.closest('.card-wave')) return;
    if (pointerId !== null) return;
    pointerId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    startT = performance.now();
    dx = 0;
    dy = 0;
    isSwipe = false;
    card.setPointerCapture(pointerId);
  }

  function onMove(ev) {
    if (pointerId !== ev.pointerId) return;
    dx = ev.clientX - startX;
    dy = ev.clientY - startY;
    if (!isSwipe && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
      isSwipe = true;
      card.classList.add('dragging');
    }
    if (isSwipe) {
      const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, dx / 12));
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`;
      showHints(hints, dx, dy);
    }
  }

  function onUp(ev) {
    if (pointerId !== ev.pointerId) return;
    const dt = Math.max(1, performance.now() - startT);
    const vx = dx / dt, vy = dy / dt;
    const dir = isSwipe ? decideDirection(dx, dy, vx, vy) : null;

    card.classList.remove('dragging');
    try { card.releasePointerCapture(pointerId); } catch {}
    pointerId = null;

    if (dir) {
      flyOff(card, dir);
      const status = VOTE_FOR_DIR[dir];
      if (onVoteCallback) onVoteCallback(status);
    } else {
      card.style.transform = '';
      hideHints(hints);
    }
    isSwipe = false;
  }

  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);
}

function decideDirection(dx, dy, vx, vy) {
  const horiz = Math.abs(dx) > Math.abs(dy);
  if (horiz) {
    if (dx >  SWIPE_THRESHOLD || vx >  SWIPE_VELOCITY) return 'right';
    if (dx < -SWIPE_THRESHOLD || vx < -SWIPE_VELOCITY) return 'left';
  } else {
    if (dy < -SWIPE_THRESHOLD || vy < -SWIPE_VELOCITY) return 'up';
    if (dy >  SWIPE_THRESHOLD || vy >  SWIPE_VELOCITY) return 'down';
  }
  return null;
}

function showHints(hints, dx, dy) {
  const horiz = Math.abs(dx) > Math.abs(dy);
  if (horiz) {
    hints.hintLeft.style.opacity  = dx < 0 ? Math.min(1, -dx / SWIPE_THRESHOLD) : 0;
    hints.hintRight.style.opacity = dx > 0 ? Math.min(1,  dx / SWIPE_THRESHOLD) : 0;
    hints.hintUp.style.opacity    = 0;
    hints.hintDown.style.opacity  = 0;
  } else {
    hints.hintUp.style.opacity   = dy < 0 ? Math.min(1, -dy / SWIPE_THRESHOLD) : 0;
    hints.hintDown.style.opacity = dy > 0 ? Math.min(1,  dy / SWIPE_THRESHOLD) : 0;
    hints.hintLeft.style.opacity  = 0;
    hints.hintRight.style.opacity = 0;
  }
}

function hideHints(hints) {
  for (const k of Object.keys(hints)) hints[k].style.opacity = 0;
}

export function flyOff(card, dir) {
  const distance = 1500;
  const map = {
    left:  `translate(${-distance}px, 0) rotate(-30deg)`,
    right: `translate(${distance}px, 0) rotate(30deg)`,
    up:    `translate(0, ${-distance}px) rotate(0)`,
    down:  `translate(0, ${distance}px) rotate(0)`,
  };
  card.style.transition = 'transform 0.3s ease-in, opacity 0.3s';
  card.style.transform = map[dir];
  card.style.opacity = 0;
}

export function statusToFlyDir(status) {
  return ({ raus: 'left', gut: 'right', stern: 'up', mittel: 'down' })[status];
}

export function setProgress(progressBar, ratio) {
  if (!progressBar) return;
  progressBar.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

export function showToast(message, duration = 2000) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => { t.hidden = true; }, duration);
}

// ===== Behalten-Liste =====

export function renderKeptList(container, items, currentlyPlayingId = null) {
  container.innerHTML = '';
  if (!items.length) return false;
  for (const item of items) {
    container.appendChild(renderKeptItem(item, currentlyPlayingId));
  }
  return true;
}

function renderKeptItem(sample, currentlyPlayingId) {
  const el = document.createElement('div');
  el.className = 'kept-item' + (sample.id === currentlyPlayingId ? ' playing' : '');
  el.dataset.id = sample.id;

  const row = document.createElement('div');
  row.className = 'kept-item-row';
  const name = document.createElement('div');
  name.className = 'kept-item-name';
  name.textContent = sample.name;
  const status = document.createElement('div');
  status.className = 'kept-item-status';
  status.style.color = sample.status === 'stern' ? 'var(--star)' : sample.status === 'gut' ? 'var(--good)' : 'var(--mid)';
  status.textContent = STATUS_GLYPH[sample.status] ?? '';
  row.append(name, status);

  const meta = document.createElement('div');
  meta.className = 'kept-item-meta';
  meta.textContent = `${sample.theme} · ${sample.license} · ${sample.duration?.toFixed(2)}s · @${sample.author}`;

  el.append(row, meta);

  attachKeptItemGestures(el, sample);
  return el;
}

function attachKeptItemGestures(el, sample) {
  let pressTimer = null;
  let longPressed = false;
  let downX = 0, downY = 0;
  let started = false;

  function onDown(ev) {
    started = true;
    longPressed = false;
    downX = ev.clientX;
    downY = ev.clientY;
    pressTimer = setTimeout(() => {
      longPressed = true;
      if (navigator.vibrate) navigator.vibrate(40);
      if (onKeptLongPressCallback) onKeptLongPressCallback(sample);
    }, LONG_PRESS_MS);
  }
  function onMove(ev) {
    if (!started) return;
    const dx = Math.abs(ev.clientX - downX);
    const dy = Math.abs(ev.clientY - downY);
    if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      started = false;
    }
  }
  function onUp() {
    if (!started) return;
    started = false;
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (!longPressed && onKeptTapCallback) onKeptTapCallback(sample);
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

// ===== Themes-Liste =====

export function renderThemesList(container, themes, activeKey) {
  container.innerHTML = '';
  for (const [key, theme] of Object.entries(themes)) {
    const el = document.createElement('div');
    el.className = 'theme-item' + (key === activeKey ? ' active' : '');
    el.dataset.key = key;
    const name = document.createElement('div');
    name.className = 'theme-item-name';
    name.textContent = theme.label;
    const m = document.createElement('div');
    m.className = 'theme-item-meta';
    m.textContent = (theme.queries ?? []).join(' · ');
    el.append(name, m);
    container.appendChild(el);
  }
}
