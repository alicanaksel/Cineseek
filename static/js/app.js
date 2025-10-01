/**
 * Cineseek frontend (final)
 * - Autocomplete search
 * - Spotlight (hero)
 * - Discover grid with Watchlist toggle (Add / Watchlisted)
 * - Dedicated /watchlist page with Remove & Clear
 *
 * Notes:
 *  - On the homepage we NEVER show "Remove". We show an Add button that turns
 *    into a disabled "Watchlisted" state after adding.
 *  - On /watchlist we show "Remove" to delete entries.
 */
(function () {
  // ====== DOM REFS ======
  const $q = document.getElementById('q');
  const $suggest = document.getElementById('suggest');

  const $discover = document.getElementById('discoverGrid');
  const $refreshDiscover = document.getElementById('refreshDiscover');

  // Spotlight (Hero)
  const $spotTitle = document.getElementById('spotlightTitle');
  const $spotMeta  = document.getElementById('spotlightMeta');
  const $spotPlot  = document.getElementById('spotlightPlot');
  const $spotBtn   = document.getElementById('spotlightBtn');
  const $spotBg    = document.getElementById('spotlightBg');

  // Chips (quick seeds)
  const $chips = document.getElementById('chips');

  // Watchlist Page refs (only exist on /watchlist)
  const $wlGrid  = document.getElementById('watchlistGrid');
  const $wlEmpty = document.getElementById('watchlistEmpty');
  const $wlClear = document.getElementById('clearWatchlist');

  // ====== UTIL ======
  const LS_KEY = 'cineseek_watchlist';

  function loadWL() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
  }
  function saveWL(items) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
  }
  function inWL(id) {
    return loadWL().some(x => x.id === id);
  }
  function setSuggestOpen(isOpen) {
    if (!$suggest) return;
    $suggest.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
  function escapeHtml(s='') {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---- Card templates ----
  function discoverCardHTML(item) {
    const id = item.id;
    const title = escapeHtml(item.title || '');
    const poster = item.poster
      ? `<img loading="lazy" src="${item.poster}" alt="${title} poster" width="360" height="540">`
      : `<img loading="lazy" src="/static/img/no-poster.svg" alt="No poster" width="360" height="540">`;

    // Add button (disabled if already added)
    const added = inWL(id);
    const action = added
      ? `<button class="btn outline small is-checked" type="button" disabled>Watchlisted</button>`
      : `<button class="btn outline small" type="button" data-action="wl-add" data-id="${id}" data-title="${title}">Add to Watchlist</button>`;

    return `
      <div class="card pretty">
        <a href="/title/${id}">
          <div class="poster">
            ${poster}
            <div class="poster-fade"></div>
          </div>
          <div class="titleline">
            <span class="t">${title}</span>
            <span class="y">${item.year || ''}</span>
          </div>
        </a>
        <div class="card-actions">${action}</div>
      </div>
    `;
  }

  function watchlistCardHTML(item) {
    const id = item.id;
    const title = escapeHtml(item.title || '');
    const poster = item.poster
      ? `<img loading="lazy" src="${item.poster}" alt="${title} poster" width="360" height="540">`
      : `<img loading="lazy" src="/static/img/no-poster.svg" alt="No poster" width="360" height="540">`;
    return `
      <div class="card pretty">
        <a href="/title/${id}">
          <div class="poster">
            ${poster}
            <div class="poster-fade"></div>
          </div>
          <div class="titleline">
            <span class="t">${title}</span>
            <span class="y">${item.year || ''}</span>
          </div>
        </a>
        <div class="card-actions">
          <button class="btn outline small" data-action="wl-remove" data-id="${id}">Remove</button>
        </div>
      </div>
    `;
  }

  // ====== SEARCH INPUT ======
  // Focus with '/'
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $q) {
      e.preventDefault();
      $q?.focus();
    }
  });

  // Enter -> results page
  $q?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = $q.value.trim();
      if (v.length >= 1) {
        window.location.href = `/results?q=${encodeURIComponent(v)}`;
        e.preventDefault();
      }
    }
  });

  // Autocomplete (debounced + abortable)
  let acAborter = null;
  let acTimer = null;

  function renderSuggest(items) {
    if (!$suggest) return;
    if (!items.length) {
      $suggest.innerHTML = '';
      setSuggestOpen(false);
      return;
    }
    $suggest.innerHTML = items.map((it) => `
      <a class="sg-item" role="option" href="/title/${it.id}">
        ${it.poster ? `<img src="${it.poster}" alt="" width="32" height="48" loading="lazy">` : ''}
        <span class="t">${it.title}</span>
        <span class="y">${it.year || ''}</span>
        <span class="badge">${(it.type || '').toUpperCase()}</span>
      </a>
    `).join('');
    setSuggestOpen(true);
  }

  function clearSuggest() { renderSuggest([]); }

  $q?.addEventListener('input', () => {
    const v = $q.value.trim();
    if (acTimer) clearTimeout(acTimer);
    if (!v) {
      clearSuggest();
      return;
    }
    acTimer = setTimeout(async () => {
      try {
        acAborter?.abort();
        acAborter = new AbortController();
        const res = await fetch(`/api/search?q=${encodeURIComponent(v)}`, { signal: acAborter.signal });
        const data = await res.json();
        renderSuggest(data.results || []);
      } catch { /* ignore transient errors */ }
    }, 150);
  });

  document.addEventListener('click', (e) => {
    if (!($suggest?.contains(e.target) || e.target === $q)) {
      clearSuggest();
    }
  });

  // ====== SPOTLIGHT (HERO) ======
  async function loadSpotlight() {
    if (!($spotTitle && $spotBtn && $spotBg)) return;
    try {
      const res = await fetch('/api/spotlight');
      const s = await res.json();
      if (!s || !s.id) {
        $spotTitle.textContent = 'Welcome to Cineseek';
        $spotPlot && ($spotPlot.textContent = 'Search or explore trending picks below.');
        $spotMeta && ($spotMeta.textContent = '');
        $spotBtn.href = '#';
        return;
      }
      $spotTitle.textContent = `${s.title} ${s.year ? `(${s.year})` : ''}`;
      $spotMeta && ($spotMeta.textContent = [s.type?.toUpperCase(), s.genre].filter(Boolean).join(' • '));
      $spotPlot && ($spotPlot.textContent = s.plot || '');
      $spotBtn.href = `/title/${s.id}`;
      if (s.poster) {
        $spotBg.style.setProperty('--bg-url', `url("${s.poster}")`);
        $spotBg.classList.add('has-img');
      }
    } catch {
      $spotTitle.textContent = 'Welcome to Cineseek';
      $spotPlot && ($spotPlot.textContent = 'Search or explore trending picks below.');
      $spotMeta && ($spotMeta.textContent = '');
      $spotBtn.href = '#';
    }
  }

  // ====== DISCOVER GRID ======
  let currentSeed = '';

  async function loadDiscover(seed = '') {
    if (!$discover) return;
    $discover.classList.add('skeleton');
    try {
      const url = seed ? `/api/discover?seed=${encodeURIComponent(seed)}` : '/api/discover';
      const res = await fetch(url);
      const data = await res.json();
      const items = data.results || [];
      $discover.innerHTML = items.map(it => discoverCardHTML({
        id: it.id, title: it.title, year: it.year, poster: it.poster
      })).join('');
    } catch {
      $discover.innerHTML = '<p class="muted">Could not load discover.</p>';
    } finally {
      $discover.classList.remove('skeleton');
    }
  }

  // Chips click -> set seed
  $chips?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    [...$chips.querySelectorAll('.chip')].forEach(c => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    currentSeed = btn.dataset.seed || '';
    loadDiscover(currentSeed);
  });

  // Shuffle respects current seed
  $refreshDiscover?.addEventListener('click', (e) => {
    e.preventDefault();
    loadDiscover(currentSeed);
  });

  // ====== WATCHLIST: Add / Remove ======
  document.addEventListener('click', (e) => {
    // Add (from homepage Discover cards)
    const addBtn = e.target.closest('[data-action="wl-add"]');
    if (addBtn) {
      e.preventDefault();
      const id = addBtn.dataset.id;
      const title = addBtn.dataset.title || 'Unknown';
      if (!id) return;
      const items = loadWL();
      if (!items.find(x => x.id === id)) {
        items.push({ id, title });
        saveWL(items);
      }
      // Turn into disabled "Watchlisted"
      addBtn.textContent = 'Watchlisted';
      addBtn.classList.add('is-checked');
      addBtn.setAttribute('disabled', 'disabled');
      return;
    }

    // Remove (from /watchlist page)
    const rmBtn = e.target.closest('[data-action="wl-remove"]');
    if (rmBtn) {
      const id = rmBtn.dataset.id;
      const items = loadWL().filter(x => x.id !== id);
      saveWL(items);
      renderWLPage(); // refresh list
    }
  });

  // ====== WATCHLIST PAGE RENDER ======
  async function renderWLPage() {
    if (!$wlGrid) return; // not on /watchlist
    const items = loadWL();
    if (!items.length) {
      $wlGrid.innerHTML = '';
      $wlEmpty && ($wlEmpty.hidden = false);
      return;
    }
    $wlEmpty && ($wlEmpty.hidden = true);
    $wlGrid.innerHTML = '';

    // Fetch minimal info per saved ID (sequential -> simplest & API-friendly)
    for (const it of items) {
      try {
        const res = await fetch(`/api/title_min/${encodeURIComponent(it.id)}`);
        const d = await res.json();
        const card = d.ok ? {
          id: d.id, title: d.title || it.title, year: d.year, poster: d.poster
        } : { id: it.id, title: it.title, year: '', poster: null };
        $wlGrid.insertAdjacentHTML('beforeend', watchlistCardHTML(card));
      } catch {
        $wlGrid.insertAdjacentHTML('beforeend', watchlistCardHTML({ id: it.id, title: it.title, year: '', poster: null }));
      }
    }
  }

  // Clear all on /watchlist
  $wlClear?.addEventListener('click', () => {
    saveWL([]);
    renderWLPage();
  });

  // ====== INIT ======
  loadSpotlight();
  loadDiscover('');
  renderWLPage(); // runs only on /watchlist
})();
