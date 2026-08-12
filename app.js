/* ============================================================
   3-2-1 Futbol Kesişim Oyunu — app.js
   ============================================================ */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  players: [],          // { id, name, nationality, clubs: [] }
  clubIndex: new Map(), // normalized club name → Set<playerIndex>
  nationIndex: new Map(), // normalized nationality → Set<playerIndex>
  allClubs: [],         // { name, count } sorted
  allNations: [],       // { name, count } sorted
  clubNormMap: new Map(),   // normalized → original
  nationNormMap: new Map(), // normalized → original

  selA: null,   // { type: 'club'|'nation', value: string (original) }
  selB: null,
  typeA: 'club',
  typeB: 'club',
};

// ─── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const loadingScreen   = $('loadingScreen');
const loadingBarFill  = $('loadingBarFill');
const gameUI          = $('gameUI');
const playerCountEl   = $('playerCount');

const inputA          = $('inputA');
const inputB          = $('inputB');
const suggestionsA    = $('suggestionsA');
const suggestionsB    = $('suggestionsB');
const clearA          = $('clearA');
const clearB          = $('clearB');
const chipA           = $('chipA');
const chipB           = $('chipB');
const chipTextA       = $('chipTextA');
const chipTextB       = $('chipTextB');
const chipIconA       = $('chipIconA');
const chipIconB       = $('chipIconB');
const removeA         = $('removeA');
const removeB         = $('removeB');

const typeToggleA     = $('typeToggleA');
const typeToggleB     = $('typeToggleB');

const warningBanner   = $('warningBanner');
const warningText     = $('warningText');
const resultsSection  = $('resultsSection');
const resultsCount    = $('resultsCount');
const resultsList     = $('resultsList');
const emptyState      = $('emptyState');
const hintArea        = $('hintArea');
const resetBtn        = $('resetBtn');

// ─── Normalization ────────────────────────────────────────────────────────────
const normalize = str =>
  str.toLowerCase()
     .normalize('NFD')
     .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
     .trim();

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split('\n');
  const players = [];
  // skip header (line 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // CSV: player_id,name,nationality,clubs
    // name/nationality may contain commas if quoted — handle naively:
    // Split on first 3 commas only
    const firstComma  = line.indexOf(',');
    if (firstComma === -1) continue;
    const id = line.slice(0, firstComma).trim();

    const rest1      = line.slice(firstComma + 1);
    const secondComma = rest1.indexOf(',');
    if (secondComma === -1) continue;
    const name = rest1.slice(0, secondComma).trim();

    const rest2      = rest1.slice(secondComma + 1);
    const thirdComma = rest2.indexOf(',');
    if (thirdComma === -1) continue;
    const nationality = rest2.slice(0, thirdComma).trim();
    const clubsRaw    = rest2.slice(thirdComma + 1).trim();

    const clubs = clubsRaw.split('|').map(c => c.trim()).filter(Boolean);

    players.push({ id, name, nationality, clubs });
  }
  return players;
}

// ─── Build Indexes ────────────────────────────────────────────────────────────
function buildIndexes(players) {
  const ci = new Map(); // normalized → Set<idx>
  const ni = new Map();
  const cnm = new Map(); // normalized → original (canonical)
  const nnm = new Map();

  players.forEach((p, idx) => {
    // Nationality
    const nn = normalize(p.nationality);
    if (!ni.has(nn)) {
      ni.set(nn, new Set());
      nnm.set(nn, p.nationality);
    }
    ni.get(nn).add(idx);

    // Clubs
    p.clubs.forEach(club => {
      const cn = normalize(club);
      if (!ci.has(cn)) {
        ci.set(cn, new Set());
        cnm.set(cn, club);
      }
      ci.get(cn).add(idx);
    });
  });

  // Sorted arrays for autocomplete
  const allClubs = [...ci.entries()]
    .map(([n, s]) => ({ name: cnm.get(n), norm: n, count: s.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const allNations = [...ni.entries()]
    .map(([n, s]) => ({ name: nnm.get(n), norm: n, count: s.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { ci, ni, cnm, nnm, allClubs, allNations };
}

// ─── Fuzzy/substring match ───────────────────────────────────────────────────
function matchItems(items, query) {
  const q = normalize(query);
  if (!q) return items.slice(0, 30);
  return items
    .filter(item => item.norm.includes(q))
    .sort((a, b) => {
      const aStart = a.norm.startsWith(q);
      const bStart = b.norm.startsWith(q);
      if (aStart && !bStart) return -1;
      if (!aStart && bStart) return  1;
      return b.count - a.count;
    })
    .slice(0, 20);
}

// ─── Highlight match in suggestion ───────────────────────────────────────────
function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const nText = normalize(text);
  const nQ    = normalize(query);
  const idx   = nText.indexOf(nQ);
  if (idx === -1) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx)) +
    '<mark>' + escapeHtml(text.slice(idx, idx + query.length)) + '</mark>' +
    escapeHtml(text.slice(idx + query.length));
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Render Suggestions ───────────────────────────────────────────────────────
let focusedA = -1, focusedB = -1;

function renderSuggestions(listEl, items, query, onSelect, focusedRef) {
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.classList.remove('open');
    return;
  }
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'suggestion-item' + (i === focusedRef.val ? ' focused' : '');
    li.setAttribute('role', 'option');
    li.innerHTML = `
      <span class="suggestion-item-icon">${item.type === 'nation' ? '🌍' : '🏟️'}</span>
      <span class="suggestion-item-name">${highlight(item.name, query)}</span>
      <span class="suggestion-item-count">${item.count}</span>
    `;
    li.addEventListener('mousedown', e => { e.preventDefault(); onSelect(item); });
    listEl.appendChild(li);
  });
  listEl.classList.add('open');
}

// ─── Autocomplete Logic ───────────────────────────────────────────────────────
function getItems(type) {
  return type === 'club'
    ? state.allClubs.map(c => ({ ...c, type: 'club' }))
    : state.allNations.map(n => ({ ...n, type: 'nation' }));
}

function setupAutocomplete(inputEl, suggestEl, clearEl, chipEl, chipTextEl, chipIconEl, removeEl, which) {
  const focusRef = { val: -1 };
  let currentItems = [];

  function openSuggestions() {
    const type = which === 'A' ? state.typeA : state.typeB;
    currentItems = matchItems(getItems(type), inputEl.value);
    renderSuggestions(suggestEl, currentItems, inputEl.value, select, focusRef);
    focusRef.val = -1;
  }

  function closeSuggestions() {
    suggestEl.classList.remove('open');
    focusRef.val = -1;
  }

  function select(item) {
    if (which === 'A') state.selA = { type: item.type, value: item.name };
    else               state.selB = { type: item.type, value: item.name };

    // Show chip
    const icon = item.type === 'nation' ? '🌍' : '🏟️';
    chipIconEl.textContent = icon;
    chipTextEl.textContent = item.name;
    chipEl.style.display = 'flex';
    // Color class
    chipEl.classList.remove('type-club', 'type-nation');
    chipEl.classList.add('type-' + item.type);

    inputEl.value = '';
    clearEl.style.display = 'none';
    inputEl.style.display = 'none';
    closeSuggestions();

    runQuery();
  }

  inputEl.addEventListener('input', () => {
    clearEl.style.display = inputEl.value ? 'block' : 'none';
    openSuggestions();
  });

  inputEl.addEventListener('focus', openSuggestions);

  inputEl.addEventListener('blur', () => setTimeout(closeSuggestions, 150));

  inputEl.addEventListener('keydown', e => {
    const open = suggestEl.classList.contains('open');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openSuggestions();
      focusRef.val = Math.min(focusRef.val + 1, currentItems.length - 1);
      renderSuggestions(suggestEl, currentItems, inputEl.value, select, focusRef);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusRef.val = Math.max(focusRef.val - 1, -1);
      renderSuggestions(suggestEl, currentItems, inputEl.value, select, focusRef);
    } else if (e.key === 'Enter') {
      if (focusRef.val >= 0 && currentItems[focusRef.val]) {
        select(currentItems[focusRef.val]);
      }
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  });

  clearEl.addEventListener('click', () => {
    inputEl.value = '';
    clearEl.style.display = 'none';
    closeSuggestions();
  });

  removeEl.addEventListener('click', () => {
    if (which === 'A') state.selA = null;
    else               state.selB = null;
    chipEl.style.display = 'none';
    inputEl.style.display = '';
    inputEl.focus();
    runQuery();
  });
}

// ─── Type Toggle ──────────────────────────────────────────────────────────────
function setupTypeToggle(toggleEl, which) {
  toggleEl.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      toggleEl.querySelectorAll('.type-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      if (which === 'A') {
        state.typeA = type;
        state.selA = null;
        chipA.style.display = 'none';
        inputA.style.display = '';
        inputA.placeholder = type === 'club' ? 'Kulüp adı yaz…' : 'Milliyet yaz…';
        inputA.value = '';
        clearA.style.display = 'none';
      } else {
        state.typeB = type;
        state.selB = null;
        chipB.style.display = 'none';
        inputB.style.display = '';
        inputB.placeholder = type === 'club' ? 'Kulüp adı yaz…' : 'Milliyet yaz…';
        inputB.value = '';
        clearB.style.display = 'none';
      }
      runQuery();
    });
  });
}

// ─── Query Runner ─────────────────────────────────────────────────────────────
function runQuery() {
  const a = state.selA;
  const b = state.selB;

  // Hide/show hint
  hintArea.style.display = (a || b) ? 'none' : '';

  // Warning: both nations
  if (a && b && a.type === 'nation' && b.type === 'nation') {
    warningBanner.style.display = 'flex';
    warningText.textContent = '⚠️ İki milliyet kombinasyonu anlamsız — bir oyuncunun tek milliyeti olabilir.';
    resultsSection.style.display = 'none';
    return;
  }

  // Same value check
  if (a && b && a.type === b.type && normalize(a.value) === normalize(b.value)) {
    warningBanner.style.display = 'flex';
    warningText.textContent = '⚠️ Aynı ' + (a.type === 'club' ? 'kulübü' : 'milliyeti') + ' iki kez seçtin.';
    resultsSection.style.display = 'none';
    return;
  }

  warningBanner.style.display = 'none';

  if (!a || !b) {
    resultsSection.style.display = 'none';
    return;
  }

  // Intersection
  const setA = getSet(a);
  const setB = getSet(b);
  if (!setA || !setB) { renderResults([], a, b); return; }

  const intersection = [...setA].filter(idx => setB.has(idx));
  const players = intersection.map(idx => state.players[idx])
    .sort((x, y) => x.name.localeCompare(y.name));

  renderResults(players, a, b);
}

function getSet(sel) {
  const n = normalize(sel.value);
  if (sel.type === 'club')   return state.clubIndex.get(n);
  if (sel.type === 'nation') return state.nationIndex.get(n);
  return null;
}

// ─── Render Results ───────────────────────────────────────────────────────────
function renderResults(players, selA, selB) {
  resultsSection.style.display = '';

  const count = players.length;
  resultsCount.innerHTML = `<strong>${count}</strong> oyuncu bulundu`;

  if (count === 0) {
    emptyState.style.display = '';
    resultsList.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';
  resultsList.innerHTML = '';

  const normA = normalize(selA.value);
  const normB = normalize(selB.value);

  players.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.style.animationDelay = `${Math.min(i, 20) * 25}ms`;
    li.setAttribute('role', 'listitem');

    // Build clubs HTML
    const clubsHtml = p.clubs.map(club => {
      const nc = normalize(club);
      let cls = 'club-tag';
      if (selA.type === 'club' && nc === normA) cls += ' match';
      if (selB.type === 'club' && nc === normB) cls += ' match-b';
      return `<span class="${cls}">🏟️ ${escapeHtml(club)}</span>`;
    }).join('');

    // nationality badge
    const isNatA = selA.type === 'nation' && normalize(p.nationality) === normA;
    const isNatB = selB.type === 'nation' && normalize(p.nationality) === normB;
    const natClass = 'meta-badge nationality' + (isNatA || isNatB ? ' highlighted' : '');

    li.innerHTML = `
      <div class="result-rank">${i + 1}</div>
      <div class="result-body">
        <div class="result-name">${escapeHtml(p.name)}</div>
        <div class="result-meta">
          <span class="${natClass}">🌍 ${escapeHtml(p.nationality)}</span>
        </div>
        <div class="result-clubs">${clubsHtml}</div>
      </div>
    `;

    resultsList.appendChild(li);
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetGame() {
  state.selA = null;
  state.selB = null;

  // Reset A
  chipA.style.display = 'none';
  inputA.style.display = '';
  inputA.value = '';
  clearA.style.display = 'none';

  // Reset B
  chipB.style.display = 'none';
  inputB.style.display = '';
  inputB.value = '';
  clearB.style.display = 'none';

  resultsSection.style.display = 'none';
  warningBanner.style.display = 'none';
  hintArea.style.display = '';

  inputA.focus();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    // Fake loading progress animation
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 15, 90);
      loadingBarFill.style.width = progress + '%';
    }, 120);

    const res  = await fetch('players_filtered_v2.csv');
    const text = await res.text();

    clearInterval(progressInterval);
    loadingBarFill.style.width = '100%';

    // Parse
    await new Promise(r => setTimeout(r, 200));
    const players = parseCSV(text);

    // Build indexes
    const { ci, ni, cnm, nnm, allClubs, allNations } = buildIndexes(players);

    state.players     = players;
    state.clubIndex   = ci;
    state.nationIndex = ni;
    state.clubNormMap = cnm;
    state.nationNormMap = nnm;
    state.allClubs    = allClubs;
    state.allNations  = allNations;

    // Update footer
    playerCountEl.textContent = `${players.length.toLocaleString('tr-TR')} oyuncu`;

    // Show UI
    loadingScreen.style.display = 'none';
    gameUI.style.display = '';

    // Setup controls
    setupTypeToggle(typeToggleA, 'A');
    setupTypeToggle(typeToggleB, 'B');
    setupAutocomplete(inputA, suggestionsA, clearA, chipA, chipTextA, chipIconA, removeA, 'A');
    setupAutocomplete(inputB, suggestionsB, clearB, chipB, chipTextB, chipIconB, removeB, 'B');

    resetBtn.addEventListener('click', resetGame);

    inputA.focus();

  } catch (err) {
    console.error('Init error:', err);
    loadingScreen.innerHTML = `
      <div style="text-align:center;color:#ff6584;padding:40px">
        <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
        <div style="font-weight:700;margin-bottom:8px">Veri yüklenemedi</div>
        <div style="font-size:.85rem;color:#8890b8">players_filtered.csv dosyasının aynı klasörde olduğundan emin ol</div>
        <div style="font-size:.75rem;color:#555b80;margin-top:8px">${err.message}</div>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', init);
