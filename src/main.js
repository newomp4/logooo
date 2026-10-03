import './style.css';
import { generate, randomSeed, likeness, signatureOf, FAMILY_NAMES, FAMILY_INFO } from './gen/index.js';
import { INKS, copySvg, copyPng, saveSvg, savePng, faviconHref } from './export.js';
import { tintFor } from './palette.js';

const STORAGE_KEY = 'logooo:v1';
const MAX_HISTORY = 240;
const MAX_SAVED = 500;
const MAX_HIDDEN = 300;
// a new mark is rerolled if it overlaps one of the last RECENT this much,
// or is built the same way as one of the last RECENT_KINDS
const RECENT = 40;
const RECENT_KINDS = 18;
const TOO_ALIKE = 0.8;
// anything this close to a hidden mark never shows up again
const HIDDEN_ALIKE = 0.72;
const SIMILAR_COUNT = 8;
const STAGE_BGS = ['dark', 'light', 'tint'];

const $ = (sel) => document.querySelector(sel);
const tiles = [$('#canvas'), ...document.querySelectorAll('[data-tile]')];
const stage = $('#stage');
const listEl = $('#list');

// ------------------------------------------------------------------ state

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

const stored = load();
const state = {
  history: Array.isArray(stored.history) ? stored.history : [],
  saved: Array.isArray(stored.saved) ? stored.saved : [],
  hidden: Array.isArray(stored.hidden) ? stored.hidden : [],
  similar: [],
  findingSimilar: false,
  view: 'history',
  currentId: null,
  mode: stored.mode === 'all' || FAMILY_NAMES.includes(stored.mode) ? stored.mode : 'all',
  ink: INKS[stored.ink] ? stored.ink : 'black',
  strict: stored.strict !== false,
  stageBg: STAGE_BGS.includes(stored.stageBg) ? stored.stageBg : 'dark',
};
if (state.strict && FAMILY_INFO[state.mode]?.loose) state.mode = 'all';

function persist() {
  try {
    const { history, saved, hidden, mode, ink, strict, stageBg } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ history, saved, hidden, mode, ink, strict, stageBg }));
  } catch {
    // storage full or blocked; marks just won't survive a reload
  }
}

// ids double as URL hashes: family.seed, plus .x when asymmetric marks were allowed
const idOf = (entry) => (entry.mode === 'all' ? entry.seed : `${entry.mode}.${entry.seed}${entry.loose ? '.x' : ''}`);
const lists = () => [state.history, state.saved, state.similar];
const find = (id) => lists().flat().find((e) => idOf(e) === id);
const current = () => (state.currentId ? find(state.currentId) : undefined);
const visible = () => state[state.view];
const isSaved = (entry) => state.saved.some((e) => idOf(e) === idOf(entry));
const fileName = (entry) => `logooo-${entry.family}-${entry.seed}`;

function build(seed, mode, loose = false) {
  const mark = generate(seed, mode, { loose });
  return mark && { ...mark, mode, loose };
}

const sigOf = (entry) => (entry.sig ??= signatureOf(entry.d));
// hidden marks are stored as { sig, family } (older ones as a bare sig)
const hiddenSig = (h) => (typeof h === 'string' ? h : h.sig);
const isHidden = (sig) => state.hidden.some((h) => likeness(hiddenSig(h), sig) >= HIDDEN_ALIKE);

// Styles you star come up more, styles you hide come up less. Kept per style
// (not per mark) so a link still rebuilds the exact same mark.
function taste(name) {
  const saves = state.saved.filter((e) => e.family === name).length;
  const hides = state.hidden.filter((h) => typeof h !== 'string' && h.family === name).length;
  return Math.min(3, Math.max(0.3, (1 + 0.5 * saves) / (1 + 0.5 * hides)));
}

// ---------------------------------------------------------------- render

const markSvg = (m) =>
  `<svg class="mark" viewBox="0 0 ${m.width} ${m.height}" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${m.d}"/></svg>`;

function renderStage(animate) {
  const entry = current();
  if (!entry) return;
  const id = idOf(entry);

  tiles.forEach((tile, i) => {
    tile.querySelector('.mark')?.remove();
    tile.insertAdjacentHTML('beforeend', markSvg(entry));
    if (animate) {
      const svg = tile.querySelector('.mark');
      svg.classList.add('rise');
      svg.style.setProperty('--d', `${i * 0.03}s`);
    }
  });

  const tint = tintFor(entry.seed);
  stage.style.setProperty('--tint-bg', tint.bg);
  stage.style.setProperty('--tint-fg', tint.fg);

  $('#info').innerHTML = `<b>${entry.family}</b> · ${entry.symmetry} · ${entry.seed}`;
  const star = $('#save');
  star.setAttribute('aria-pressed', String(isSaved(entry)));
  star.setAttribute('aria-label', isSaved(entry) ? 'Unsave mark' : 'Save mark');

  const list = visible();
  const index = list.findIndex((e) => idOf(e) === id);
  $('#older').disabled = !list.length || index === list.length - 1;
  $('#newer').disabled = !list.length || index === 0;

  $('#favicon').href = faviconHref(entry);
  history.replaceState(null, '', `#${id}`);
  markCurrent();
}

function renderStageBg() {
  stage.dataset.bg = state.stageBg;
  for (const btn of document.querySelectorAll('.previews [data-bg]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.bg === state.stageBg));
  }
}

function markCurrent() {
  for (const btn of listEl.querySelectorAll('.thumb')) {
    btn.setAttribute('aria-current', String(btn.dataset.id === state.currentId));
  }
}

function thumbHtml(entry) {
  const id = idOf(entry);
  const saved = isSaved(entry) ? ' is-saved' : '';
  return `<li><button class="thumb${saved}" type="button" data-id="${id}" aria-label="${entry.family} ${entry.seed}">${markSvg(entry)}</button></li>`;
}

const EMPTY = {
  history: 'Nothing here yet. Press <kbd>space</kbd> for a mark.',
  saved: 'Nothing saved yet. Press <kbd>f</kbd> or the star to keep a mark.',
  similar: 'Finding marks like this one…',
};

function renderList() {
  const list = visible();
  listEl.innerHTML = list.map(thumbHtml).join('');
  const empty = $('#empty');
  empty.hidden = list.length > 0;
  empty.innerHTML = state.view === 'similar' && !state.findingSimilar ? 'Nothing close enough turned up. Try again.' : EMPTY[state.view];
  $('#clear').hidden = state.view !== 'history';
  $('#n-history').textContent = state.history.length;
  $('#n-saved').textContent = state.saved.length;
  $('#n-similar').textContent = state.similar.length || '';
  const similarTab = document.querySelector('.tab[data-view="similar"]');
  similarTab.hidden = !state.similar.length && !state.findingSimilar && state.view !== 'similar';
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
  }
  const unhide = $('#unhide');
  unhide.hidden = !state.hidden.length;
  unhide.textContent = `Hidden ${state.hidden.length} · Show again`;
  markCurrent();
}

function renderChips(el, items, pressed, attr) {
  el.innerHTML = items
    .map(({ value, label, dot }) => {
      const swatch = dot ? `<span class="ink-dot" style="background:${dot}"></span>` : '';
      return `<button class="chip" type="button" ${attr}="${value}" aria-pressed="${value === pressed}">${swatch}${label}</button>`;
    })
    .join('');
}

const titleCase = (s) => s[0].toUpperCase() + s.slice(1);

// the first few styles are the main ones; the rest fold behind "More"
const FEATURED = 9;
let showAllStyles = false;

function renderFamilies() {
  const names = FAMILY_NAMES.filter((name) => !state.strict || !FAMILY_INFO[name].loose);
  const folded = !showAllStyles && names.indexOf(state.mode) < FEATURED;
  const shown = folded ? names.slice(0, FEATURED) : names;
  const items = ['all', ...shown].map((name) => ({ value: name, label: titleCase(name) }));
  renderChips($('#families'), items, state.mode, 'data-mode');
  if (names.length > FEATURED) {
    const label = folded ? `More (${names.length - FEATURED})` : 'Less';
    $('#families').insertAdjacentHTML('beforeend', `<button class="chip chip--more" type="button" data-more>${label}</button>`);
  }
}

function renderStrict() {
  $('#strict').setAttribute('aria-checked', String(state.strict));
}

function renderInks() {
  const items = Object.entries(INKS).map(([name, hex]) => ({ value: name, label: titleCase(name), dot: hex }));
  renderChips($('#inks'), items, state.ink, 'data-ink');
}

// --------------------------------------------------------------- actions

// Weighted pick that backs off styles you've just seen.
function pickFamily() {
  const recent = state.history.slice(0, 6).map((e) => e.family);
  const pool = FAMILY_NAMES.filter((name) => !state.strict || !FAMILY_INFO[name].loose).map((name) => {
    const at = recent.indexOf(name);
    const damp = at === -1 ? 1 : at < 3 ? 0.1 : 0.4;
    return [name, FAMILY_INFO[name].weight * damp * taste(name)];
  });
  let roll = Math.random() * pool.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, w] of pool) {
    roll -= w;
    if (roll < 0) return name;
  }
  return pool[pool.length - 1][0];
}

function show(entry) {
  state.history = [entry, ...state.history.filter((e) => idOf(e) !== idOf(entry))].slice(0, MAX_HISTORY);
  state.currentId = idOf(entry);
  persist();
}

function create() {
  // keep the candidate least like anything recent; usually the first one is fine
  const recent = state.history.slice(0, RECENT).map(sigOf);
  // the same build (piece, layout, cut) as a recent mark reads as a repeat,
  // even when the silhouettes differ
  const recentKinds = state.history.slice(0, RECENT_KINDS).map((e) => e.kind);
  let best = null;
  // look for a fresh mark inside the chosen style before moving on to another,
  // so rejections don't hand extra turns to sparse styles that never overlap much
  search: for (let round = 0; round < 4; round++) {
    const family = state.mode === 'all' ? pickFamily() : state.mode;
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = build(randomSeed(), family, !state.strict);
      if (!candidate || isHidden(candidate.sig)) continue;
      const closest = recent.reduce((max, sig) => Math.max(max, likeness(sig, candidate.sig)), 0);
      const score = closest + (recentKinds.includes(candidate.kind) ? 0.5 : 0);
      if (!best || score < best.score) best = { candidate, score };
      if (score < TOO_ALIKE) break search;
    }
  }
  if (!best) return;
  show({ ...best.candidate, mode: best.candidate.family });
  state.view = 'history';
  renderList();
  listEl.querySelector('li')?.classList.add('rise');
  renderStage(true);
}

// Variations of the current mark: same style, closest silhouettes first.
async function findSimilar() {
  const base = current();
  if (!base || state.findingSimilar) return;
  const baseSig = sigOf(base);
  const button = $('#similar');
  state.findingSimilar = true;
  state.similar = [];
  state.view = 'similar';
  button.setAttribute('aria-busy', 'true');
  renderList();

  const pool = [];
  for (let i = 0; i < 20; i++) {
    const candidate = build(randomSeed(), base.family, base.loose ?? !state.strict);
    if (candidate && !isHidden(candidate.sig)) {
      const near = likeness(baseSig, candidate.sig);
      if (near < 0.94) pool.push({ candidate, near });
    }
    // let the page breathe between batches
    if (i % 4 === 3) await new Promise(requestAnimationFrame);
  }
  pool.sort((a, b) => b.near - a.near);
  const picks = [];
  for (const { candidate } of pool) {
    if (picks.length === SIMILAR_COUNT) break;
    if (picks.every((p) => likeness(p.sig, candidate.sig) < 0.9)) picks.push({ ...candidate, mode: candidate.family });
  }

  state.similar = picks;
  state.findingSimilar = false;
  button.removeAttribute('aria-busy');
  if (state.view === 'similar') renderList();
}

function select(id) {
  if (!id || id === state.currentId) return;
  const entry = find(id);
  if (!entry) return;
  // picking a variation makes it part of history, so it's kept and linkable
  if (!state.history.some((e) => idOf(e) === id)) {
    show(entry);
    renderList();
  }
  state.currentId = id;
  renderStage(true);
}

// ← goes to older marks, → to newer ones, within the open tab
function step(delta) {
  const list = visible();
  if (!list.length) return;
  const index = list.findIndex((e) => idOf(e) === state.currentId);
  const next = index === -1 ? 0 : index + delta;
  if (next >= 0 && next < list.length) select(idOf(list[next]));
}

function toggleSave() {
  const entry = current();
  if (!entry) return;
  const id = idOf(entry);
  state.saved = isSaved(entry) ? state.saved.filter((e) => idOf(e) !== id) : [entry, ...state.saved].slice(0, MAX_SAVED);
  persist();
  renderList();
  renderStage(false);
  const star = $('#save');
  star.classList.remove('pop');
  void star.offsetWidth;
  star.classList.add('pop');
  announce(isSaved(entry) ? 'Saved' : 'Removed from saved');
}

// "Not for me": forget this mark and keep anything like it from coming back.
function hide() {
  const entry = current();
  if (!entry) return;
  const id = idOf(entry);
  state.hidden = [{ sig: sigOf(entry), family: entry.family }, ...state.hidden].slice(0, MAX_HIDDEN);
  state.history = state.history.filter((e) => idOf(e) !== id);
  state.similar = state.similar.filter((e) => idOf(e) !== id);
  persist();
  announce('Hidden. Marks like this won’t come back.');
  create();
}

function setView(view) {
  if (view === state.view) return;
  state.view = view;
  renderList();
  renderStage(false);
}

function setStageBg(bg) {
  state.stageBg = bg;
  persist();
  renderStageBg();
}

function announce(text) {
  $('#status').textContent = text;
}

function flashCopied(button) {
  const [label, done] = button.querySelectorAll('.swap > span');
  button.dataset.copied = 'true';
  label.setAttribute('aria-hidden', 'true');
  done.setAttribute('aria-hidden', 'false');
  clearTimeout(button._timer);
  button._timer = setTimeout(() => {
    button.dataset.copied = 'false';
    label.setAttribute('aria-hidden', 'false');
    done.setAttribute('aria-hidden', 'true');
  }, 1400);
}

async function copy(kind) {
  const entry = current();
  if (!entry) return;
  const color = INKS[state.ink];
  try {
    if (kind === 'svg') await copySvg(entry, color);
    else if (kind === 'png') await copyPng(entry, color);
    else await navigator.clipboard.writeText(location.href);
    flashCopied(document.querySelector(`[data-copy="${kind}"]`));
    announce(`Copied ${kind === 'link' ? 'link' : kind.toUpperCase()}`);
  } catch (err) {
    console.error(err);
    announce(`Couldn't copy ${kind}`);
  }
}

function download(kind) {
  const entry = current();
  if (entry) (kind === 'svg' ? saveSvg : savePng)(entry, INKS[state.ink], fileName(entry));
}

// Two-step buttons: the first press asks, the second within 2.5s does it.
function confirmable(button, question, action) {
  const label = button.textContent;
  button.addEventListener('click', () => {
    if (button.dataset.armed !== 'true') {
      button.dataset.armed = 'true';
      button.dataset.label = button.textContent;
      button.textContent = question;
      clearTimeout(button._timer);
      button._timer = setTimeout(() => {
        button.dataset.armed = 'false';
        button.textContent = button.dataset.label || label;
      }, 2500);
      return;
    }
    clearTimeout(button._timer);
    button.dataset.armed = 'false';
    action();
  });
}

// ---------------------------------------------------------------- events

$('#new').addEventListener('click', create);
$('#similar').addEventListener('click', findSimilar);
$('#older').addEventListener('click', () => step(1));
$('#newer').addEventListener('click', () => step(-1));
$('#save').addEventListener('click', toggleSave);
$('#hide').addEventListener('click', hide);

for (const btn of document.querySelectorAll('.previews [data-bg]')) {
  btn.addEventListener('click', () => setStageBg(btn.dataset.bg));
}

$('#families').addEventListener('click', (e) => {
  if (e.target.closest('[data-more]')) {
    showAllStyles = !showAllStyles;
    renderFamilies();
    return;
  }
  const mode = e.target.closest('[data-mode]')?.dataset.mode;
  if (!mode) return;
  state.mode = mode;
  renderFamilies();
  create();
});

$('#strict').addEventListener('click', () => {
  state.strict = !state.strict;
  if (state.strict && FAMILY_INFO[state.mode]?.loose) state.mode = 'all';
  persist();
  renderStrict();
  renderFamilies();
  create();
});

$('#inks').addEventListener('click', (e) => {
  const ink = e.target.closest('[data-ink]')?.dataset.ink;
  if (!ink) return;
  state.ink = ink;
  persist();
  renderInks();
});

for (const btn of document.querySelectorAll('[data-copy]')) {
  btn.addEventListener('click', () => copy(btn.dataset.copy));
}

for (const btn of document.querySelectorAll('[data-save]')) {
  btn.addEventListener('click', () => download(btn.dataset.save));
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => setView(tab.dataset.view));
}

listEl.addEventListener('click', (e) => select(e.target.closest('.thumb')?.dataset.id));

confirmable($('#clear'), 'Clear history?', () => {
  // saved marks stay; the one on screen stays too
  const entry = current();
  state.history = entry ? [entry] : [];
  $('#clear').textContent = 'Clear';
  persist();
  renderList();
  renderStage(false);
});

confirmable($('#unhide'), 'Show hidden styles again?', () => {
  state.hidden = [];
  persist();
  renderList();
  announce('Hidden marks can show up again.');
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const onControl = e.target.closest?.('button, a, input');
  const key = e.key.toLowerCase();
  if ((key === ' ' || key === 'enter' || key === 'n') && !onControl) {
    e.preventDefault();
    create();
  } else if (key === 'arrowleft') step(1);
  else if (key === 'arrowright') step(-1);
  else if (key === 'v') findSimilar();
  else if (key === 'f') toggleSave();
  else if (key === 'x') hide();
  else if (key === 'c') copy('svg');
  else if (key === 'p') copy('png');
  else if (key === 'l') copy('link');
  else if (key === 's') download('svg');
});

// ------------------------------------------------------------------ boot

// Opens the mark named in the URL hash, rebuilding it from its seed if needed.
function fromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return false;
  if (find(id)) {
    state.currentId = id;
    return true;
  }
  const [mode, seed, flag] = id.includes('.') ? id.split('.') : ['all', id];
  if (!seed || (mode !== 'all' && !FAMILY_NAMES.includes(mode))) return false;
  const entry = build(seed, mode, flag === 'x');
  if (!entry) return false;
  show(entry);
  return true;
}

renderFamilies();
renderInks();
renderStrict();
renderStageBg();
if (fromHash() || state.history.length) {
  state.currentId ??= idOf(state.history[0]);
  renderList();
  renderStage(true);
} else {
  create();
}

window.addEventListener('hashchange', () => {
  if (location.hash.slice(1) !== state.currentId && fromHash()) {
    renderList();
    renderStage(true);
  }
});
