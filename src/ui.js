// UI: render top card from queue, attach pointer-based swipe gestures,
// expose a vote() that accepts a status from buttons or swipes.

import { findCrossThemeMarker } from './memory.js';

const SWIPE_THRESHOLD = 100;        // px to trigger commit
const SWIPE_VELOCITY = 0.6;         // px/ms backup trigger
const MAX_TILT = 18;                // deg

const VOTE_FOR_DIR = {
  left: 'raus',
  right: 'gut',
  up: 'stern',
  down: 'mittel',
};

let onVoteCallback = null;

export function onVote(handler) {
  onVoteCallback = handler;
}

export async function renderTopCard(stack, sample, theme) {
  stack.innerHTML = '';
  if (!sample) return;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = sample.id;

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = sample.name;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.appendChild(makeBadge(sample.license, 'license'));
  if (!sample.publishable) meta.appendChild(makeBadge('nicht publishable', 'warn'));
  meta.appendChild(makeBadge(`${sample.duration.toFixed(2)} s`));
  meta.appendChild(makeBadge(sample.author));

  // Cross-theme marker
  try {
    const cross = await findCrossThemeMarker(sample.sourceId, theme);
    for (const m of cross) {
      meta.appendChild(makeBadge(`schon in ${m.theme}`, m.status === 'stern' ? 'heard-star' : 'heard-good'));
    }
  } catch {
    // memory not ready; ignore
  }

  const art = document.createElement('div');
  art.className = 'card-art';
  art.textContent = '~';

  const progress = document.createElement('div');
  progress.className = 'card-progress';
  const progressBar = document.createElement('span');
  progress.appendChild(progressBar);

  const hintLeft = makeHint('Raus', 'left');
  const hintRight = makeHint('Gut', 'right');
  const hintUp = makeHint('Stern', 'up');
  const hintDown = makeHint('Mittel', 'down');

  card.append(title, meta, art, progress, hintLeft, hintRight, hintUp, hintDown);
  stack.appendChild(card);

  attachSwipe(card, { hintLeft, hintRight, hintUp, hintDown });

  return { card, progressBar };
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

function attachSwipe(card, hints) {
  let startX = 0, startY = 0, startT = 0;
  let dx = 0, dy = 0;
  let pointerId = null;

  function onDown(ev) {
    if (pointerId !== null) return;
    pointerId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    startT = performance.now();
    dx = 0;
    dy = 0;
    card.classList.add('dragging');
    card.setPointerCapture(pointerId);
  }

  function onMove(ev) {
    if (pointerId !== ev.pointerId) return;
    dx = ev.clientX - startX;
    dy = ev.clientY - startY;
    const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, dx / 12));
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`;
    showHints(hints, dx, dy);
  }

  function onUp(ev) {
    if (pointerId !== ev.pointerId) return;
    const dt = Math.max(1, performance.now() - startT);
    const vx = dx / dt, vy = dy / dt;
    const dir = decideDirection(dx, dy, vx, vy);

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

function flyOff(card, dir) {
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
