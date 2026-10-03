import './style.css';
import { generate, randomSeed, likeness, signatureOf, FAMILY_NAMES, FAMILY_INFO } from './gen/index.js';
import { INKS, copySvg, copyPng, saveSvg, savePng, faviconHref } from './export.js';
import { tintFor } from './palette.js';

const STORAGE_KEY = 'logooo:v1';
const MAX_HISTORY = 240;
const MAX_SAVED = 500;
// a new mark is rerolled if it overlaps one of the last RECENT this much
const RECENT = 40;
const TOO_ALIKE = 0.8;

const $ = (sel) => document.querySelector(sel);
const tiles = [$('#canvas'), ...document.querySelectorAll('[data-tile]')];
const tintTile = $('.icon--tint');
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
  view: 'history',
  currentId: null,
  mode: stored.mode === 'all' || FAMILY_NAMES.includes(stored.mode) ? stored.mode : 'all',
  ink: INKS[stored.ink] ? stored.ink : 'black',
  strict: stored.strict !== false,
};
if (state.strict && FAMILY_INFO[state.mode]?.loose) state.mode = 'all';

function persist() {
  try {
    const { history, saved, mode, ink, strict } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ history, saved, mode, ink, strict }));
  } catch {
    // storage full or blocked; marks just won't survive a reload
  }
}

// ids double as URL hashes: family.seed, plus .x when asymmetric marks were allowed
const idOf = (entry) => (entry.mode === 'all' ? entry.seed : `${entry.mode}.${entry.seed}${entry.loose ? '.x' : ''}`);
const find = (id) => state.history.find((e) => idOf(e) === id) ?? state.saved.find((e) => idOf(e) === id);
const current = () => (state.currentId ? find(state.currentId) : undefined);
const visible = () => state[state.view];
const isSaved = (entry) => state.saved.some((e) => idOf(e) === idOf(entry));
const fileName = (entry) => `logooo-${entry.family}-${entry.seed}`;

function build(seed, mode, loose = false) {
  const mark = generate(seed, mode, { loose });
  return mark && { ...mark, mode, loose };
}

const sigOf = (entry) => (entry.sig ??= signatureOf(entry.d));

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
  tintTile.style.setProperty('--tint-bg', tint.bg);
  tintTile.style.setProperty('--tint-fg', tint.fg);

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

function renderList() {
  const list = visible();
  listEl.innerHTML = list.map(thumbHtml).join('');
  $('#empty').hidden = list.length > 0;
  $('#clear').hidden = state.view !== 'history';
  $('#n-history').textContent = state.history.length;
  $('#n-saved').textContent = state.saved.length;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
  }
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

function renderFamilies() {
  const names = FAMILY_NAMES.filter((name) => !state.strict || !FAMILY_INFO[name].loose);
  const items = ['all', ...names].map((name) => ({ value: name, label: titleCase(name) }));
  renderChips($('#families'), items, state.mode, 'data-mode');
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
  const recent = state.history.slice(0, 5).map((e) => e.family);
  const pool = FAMILY_NAMES.filter((name) => !state.strict || !FAMILY_INFO[name].loose).map((name) => {
    const at = recent.indexOf(name);
    const damp = at === -1 ? 1 : at < 2 ? 0.15 : 0.5;
    return [name, FAMILY_INFO[name].weight * damp];
  });
  let roll = Math.random() * pool.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, w] of pool) {
    roll -= w;
    if (roll < 0) return name;
  }
  return pool[pool.length - 1][0];
}

function create() {
  // keep the candidate least like anything recent; usually the first one is fine
  const recent = state.history.slice(0, RECENT).map(sigOf);
  let best = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const family = state.mode === 'all' ? pickFamily() : state.mode;
    const candidate = build(randomSeed(), family, !state.strict);
    if (!candidate) continue;
    const closest = recent.reduce((max, sig) => Math.max(max, likeness(sig, candidate.sig)), 0);
    if (!best || closest < best.closest) best = { candidate, closest };
    if (closest < TOO_ALIKE) break;
  }
  if (best) {
    const entry = { ...best.candidate, mode: best.candidate.family };
    state.history = [entry, ...state.history.filter((e) => idOf(e) !== idOf(entry))].slice(0, MAX_HISTORY);
    state.currentId = idOf(entry);
    state.view = 'history';
    persist();
    renderList();
    listEl.querySelector('li')?.classList.add('rise');
    renderStage(true);
  }
}

function select(id) {
  if (!id || id === state.currentId || !find(id)) return;
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

function setView(view) {
  if (view === state.view) return;
  state.view = view;
  renderList();
  renderStage(false);
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

// ---------------------------------------------------------------- events

$('#new').addEventListener('click', create);
$('#older').addEventListener('click', () => step(1));
$('#newer').addEventListener('click', () => step(-1));
$('#save').addEventListener('click', toggleSave);

$('#families').addEventListener('click', (e) => {
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

const clearBtn = $('#clear');
clearBtn.addEventListener('click', () => {
  if (clearBtn.dataset.armed !== 'true') {
    clearBtn.dataset.armed = 'true';
    clearBtn.textContent = 'Clear history?';
    clearTimeout(clearBtn._timer);
    clearBtn._timer = setTimeout(() => {
      clearBtn.dataset.armed = 'false';
      clearBtn.textContent = 'Clear';
    }, 2500);
    return;
  }
  clearBtn.dataset.armed = 'false';
  clearBtn.textContent = 'Clear';
  // saved marks stay; the one on screen stays too
  const entry = current();
  state.history = entry ? [entry] : [];
  persist();
  renderList();
  renderStage(false);
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
  else if (key === 'f') toggleSave();
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
  state.history = [entry, ...state.history].slice(0, MAX_HISTORY);
  state.currentId = idOf(entry);
  persist();
  return true;
}

renderFamilies();
renderInks();
renderStrict();
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
