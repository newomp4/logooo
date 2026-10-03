import './style.css';
import { generate, randomSeed, FAMILY_NAMES } from './gen/index.js';
import { INKS, copySvg, copyPng, saveSvg, savePng, faviconHref } from './export.js';
import { meshFor } from './palette.js';

const STORAGE_KEY = 'logooo:v1';
const MAX_HISTORY = 240;
const MAX_SAVED = 500;

const $ = (sel) => document.querySelector(sel);
const tiles = [$('#canvas'), ...document.querySelectorAll('[data-tile]')];
const mesh = $('.mesh');
const colorTile = $('.icon--color');
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
};

function persist() {
  try {
    const { history, saved, mode, ink } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ history, saved, mode, ink }));
  } catch {
    // storage full or blocked; marks just won't survive a reload
  }
}

const idOf = (entry) => (entry.mode === 'all' ? entry.seed : `${entry.mode}.${entry.seed}`);
const find = (id) => state.history.find((e) => idOf(e) === id) ?? state.saved.find((e) => idOf(e) === id);
const current = () => (state.currentId ? find(state.currentId) : undefined);
const visible = () => state[state.view];
const isSaved = (entry) => state.saved.some((e) => idOf(e) === idOf(entry));
const fileName = (entry) => `logooo-${entry.family}-${entry.seed}`;

function build(seed, mode) {
  const mark = generate(seed, mode);
  return mark && { ...mark, mode };
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

  const { base, mesh: gradient } = meshFor(entry.seed);
  colorTile.style.setProperty('--base', base);
  if (mesh.style.getPropertyValue('--mesh') !== gradient) {
    mesh.style.setProperty('--mesh', gradient);
    mesh.classList.remove('is-fresh');
    void mesh.offsetWidth;
    mesh.classList.add('is-fresh');
  }

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
  const items = ['all', ...FAMILY_NAMES].map((name) => ({ value: name, label: titleCase(name) }));
  renderChips($('#families'), items, state.mode, 'data-mode');
}

function renderInks() {
  const items = Object.entries(INKS).map(([name, hex]) => ({ value: name, label: titleCase(name), dot: hex }));
  renderChips($('#inks'), items, state.ink, 'data-ink');
}

// --------------------------------------------------------------- actions

function create() {
  for (let i = 0; i < 6; i++) {
    const entry = build(randomSeed(), state.mode);
    if (!entry) continue;
    state.history = [entry, ...state.history.filter((e) => idOf(e) !== idOf(entry))].slice(0, MAX_HISTORY);
    state.currentId = idOf(entry);
    state.view = 'history';
    persist();
    renderList();
    listEl.querySelector('li')?.classList.add('rise');
    renderStage(true);
    return;
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
  const [mode, seed] = id.includes('.') ? id.split('.') : ['all', id];
  if (!seed || (mode !== 'all' && !FAMILY_NAMES.includes(mode))) return false;
  const entry = build(seed, mode);
  if (!entry) return false;
  state.history = [entry, ...state.history].slice(0, MAX_HISTORY);
  state.currentId = idOf(entry);
  persist();
  return true;
}

renderFamilies();
renderInks();
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
