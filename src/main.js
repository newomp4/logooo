import './style.css';
import { generate, randomSeed, FAMILY_NAMES } from './gen/index.js';
import { INKS, copySvg, copyPng, saveSvg, savePng, faviconHref } from './export.js';
import { meshFor } from './palette.js';

const STORAGE_KEY = 'logooo:v1';
const MAX_HISTORY = 240;

const $ = (sel) => document.querySelector(sel);
const tiles = [...document.querySelectorAll('[data-tile]')];
const mesh = $('.mesh');
const colorTile = $('.icon--color');
const historyEl = $('#history');

// ------------------------------------------------------------------ state

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

const saved = load();
const state = {
  history: Array.isArray(saved.history) ? saved.history : [],
  index: 0,
  mode: saved.mode === 'all' || FAMILY_NAMES.includes(saved.mode) ? saved.mode : 'all',
  ink: INKS[saved.ink] ? saved.ink : 'black',
};

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ history: state.history, mode: state.mode, ink: state.ink }));
  } catch {
    // storage full or blocked; history just won't survive a reload
  }
}

const current = () => state.history[state.index];
const idOf = (entry) => (entry.mode === 'all' ? entry.seed : `${entry.mode}.${entry.seed}`);
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
  tiles.forEach((tile, i) => {
    tile.querySelector('.mark')?.remove();
    tile.insertAdjacentHTML('beforeend', markSvg(entry));
    if (animate) {
      const svg = tile.querySelector('.mark');
      svg.classList.add('rise');
      svg.style.setProperty('--d', `${i * 0.04}s`);
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
  $('#older').disabled = state.index >= state.history.length - 1;
  $('#newer').disabled = state.index <= 0;
  $('#favicon').href = faviconHref(entry);
  history.replaceState(null, '', `#${idOf(entry)}`);

  for (const btn of historyEl.querySelectorAll('.thumb')) {
    btn.setAttribute('aria-current', String(btn.dataset.id === idOf(entry)));
  }
}

function thumbHtml(entry) {
  return `<li><button class="thumb" type="button" data-id="${idOf(entry)}" aria-label="${entry.family} ${entry.seed}">${markSvg(entry)}</button></li>`;
}

function renderHistory() {
  historyEl.innerHTML = state.history.map(thumbHtml).join('');
  renderCount();
}

function renderCount() {
  const n = state.history.length;
  $('#count').textContent = `${n} ${n === 1 ? 'mark' : 'marks'}`;
}

function renderFamilies() {
  const names = ['all', ...FAMILY_NAMES];
  $('#families').innerHTML = names
    .map((name) => `<button class="chip" type="button" data-mode="${name}" aria-pressed="${name === state.mode}">${name[0].toUpperCase()}${name.slice(1)}</button>`)
    .join('');
}

function renderInks() {
  $('#inks').innerHTML = Object.entries(INKS)
    .map(([name, hex]) => `<button class="chip" type="button" data-ink="${name}" aria-pressed="${name === state.ink}"><span class="ink-dot" style="background:${hex}"></span>${name[0].toUpperCase()}${name.slice(1)}</button>`)
    .join('');
}

// --------------------------------------------------------------- actions

function add(entry, animate = true) {
  state.history = [entry, ...state.history.filter((e) => idOf(e) !== idOf(entry))].slice(0, MAX_HISTORY);
  state.index = 0;
  persist();
  renderHistory();
  renderStage(animate);
  const first = historyEl.querySelector('li');
  first?.classList.add('rise');
}

function create() {
  for (let i = 0; i < 6; i++) {
    const entry = build(randomSeed(), state.mode);
    if (entry) return add(entry);
  }
}

function show(index) {
  if (index < 0 || index >= state.history.length || index === state.index) return;
  state.index = index;
  renderStage(true);
}

function announce(text) {
  $('#status').textContent = text;
}

function flashCopied(button) {
  button.dataset.copied = 'true';
  button.querySelector('.swap > span:first-child')?.setAttribute('aria-hidden', 'true');
  button.querySelector('.swap > span:last-child')?.setAttribute('aria-hidden', 'false');
  clearTimeout(button._timer);
  button._timer = setTimeout(() => {
    button.dataset.copied = 'false';
    button.querySelector('.swap > span:first-child')?.setAttribute('aria-hidden', 'false');
    button.querySelector('.swap > span:last-child')?.setAttribute('aria-hidden', 'true');
  }, 1400);
}

async function copy(kind) {
  const entry = current();
  if (!entry) return;
  const button = document.querySelector(`[data-copy="${kind}"]`);
  try {
    await (kind === 'svg' ? copySvg : copyPng)(entry, INKS[state.ink]);
    flashCopied(button);
    announce(`Copied ${kind.toUpperCase()}`);
  } catch (err) {
    console.error(err);
    announce(`Couldn't copy ${kind.toUpperCase()}`);
  }
}

function download(kind) {
  const entry = current();
  if (entry) (kind === 'svg' ? saveSvg : savePng)(entry, INKS[state.ink], fileName(entry));
}

// ---------------------------------------------------------------- events

$('#new').addEventListener('click', create);
$('#older').addEventListener('click', () => show(state.index + 1));
$('#newer').addEventListener('click', () => show(state.index - 1));

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
  btn.querySelector('.copy-icon').innerHTML =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3V2.5A1 1 0 0 0 9.5 1.5h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1H3"/></svg><span class="tick">✓</span>';
  btn.addEventListener('click', () => copy(btn.dataset.copy));
}

for (const btn of document.querySelectorAll('[data-save]')) {
  btn.addEventListener('click', () => download(btn.dataset.save));
}

historyEl.addEventListener('click', (e) => {
  const id = e.target.closest('.thumb')?.dataset.id;
  if (id) show(state.history.findIndex((entry) => idOf(entry) === id));
});

const clearBtn = $('#clear');
clearBtn.addEventListener('click', () => {
  if (clearBtn.dataset.armed !== 'true') {
    clearBtn.dataset.armed = 'true';
    clearBtn.textContent = 'Clear all?';
    clearTimeout(clearBtn._timer);
    clearBtn._timer = setTimeout(() => {
      clearBtn.dataset.armed = 'false';
      clearBtn.textContent = 'Clear';
    }, 2500);
    return;
  }
  clearBtn.dataset.armed = 'false';
  clearBtn.textContent = 'Clear';
  // keep the mark on screen, drop everything else
  state.history = current() ? [current()] : [];
  state.index = 0;
  persist();
  renderHistory();
  renderStage(false);
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const onControl = e.target.closest?.('button, a, input');
  const key = e.key.toLowerCase();
  if ((key === ' ' || key === 'enter' || key === 'n') && !onControl) {
    e.preventDefault();
    create();
  } else if (key === 'arrowleft') {
    show(state.index + 1);
  } else if (key === 'arrowright') {
    show(state.index - 1);
  } else if (key === 'c') {
    copy('svg');
  } else if (key === 'p') {
    copy('png');
  } else if (key === 's') {
    download('svg');
  }
});

// ------------------------------------------------------------------ boot

function fromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return false;
  const known = state.history.findIndex((entry) => idOf(entry) === id);
  if (known >= 0) {
    state.index = known;
    return true;
  }
  const [mode, seed] = id.includes('.') ? id.split('.') : ['all', id];
  if (!seed || (mode !== 'all' && !FAMILY_NAMES.includes(mode))) return false;
  const entry = build(seed, mode);
  if (!entry) return false;
  state.history = [entry, ...state.history].slice(0, MAX_HISTORY);
  state.index = 0;
  persist();
  return true;
}

renderFamilies();
renderInks();
if (fromHash() || state.history.length) {
  renderHistory();
  renderStage(true);
} else {
  create();
}

window.addEventListener('hashchange', () => {
  if (location.hash.slice(1) !== (current() && idOf(current())) && fromHash()) {
    renderHistory();
    renderStage(true);
  }
});
