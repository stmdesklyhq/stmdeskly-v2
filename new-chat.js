/* =========================================================
   STMDESKLY v2 — New chat
   Search people by name, username, role, or paste a URL.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const input   = $('ncInput');
  const clearEl = $('ncClear');
  const hintEl  = $('ncHint');
  const resultsEl = $('ncResults');
  const emptyEl   = $('ncEmpty');
  const emptyTitle = $('ncEmptyTitle');
  const emptyBody  = $('ncEmptyBody');

  let me = null;
  let sb = null;
  let searchTimer = null;
  let lastQuery = '';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Extract a username from any URL or plain text
  function extractUsername(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;

    // /u/adele
    let m = s.match(/\/u\/([a-z0-9-]+)/i);
    if (m) return m[1].toLowerCase();

    // ?u=adele
    m = s.match(/[?&]u=([a-z0-9-]+)/i);
    if (m) return m[1].toLowerCase();

    // @adele
    m = s.match(/^@([a-z0-9-]+)$/i);
    if (m) return m[1].toLowerCase();

    // Plain username (letters, numbers, dashes only)
    if (/^[a-z0-9][a-z0-9-]{0,29}$/i.test(s)) return s.toLowerCase();

    return null;
  }

  async function search(query) {
    const q = String(query || '').trim();

    if (!q) {
      resultsEl.innerHTML = '';
      emptyEl.hidden = false;
      emptyTitle.textContent = 'Find someone';
      emptyBody.textContent = 'Type a name, a @username, or paste a Desk link.';
      hintEl.textContent = "Search by name, username, or paste someone's Desk link.";
      return;
    }

    // Check if they pasted a URL
    const extracted = extractUsername(q);
    const looksLikeUrl = /\/|@/.test(q);
    const searchTerm = extracted || q;

    resultsEl.innerHTML = '<div class="nc-loading">Searching…</div>';
    emptyEl.hidden = true;
    hintEl.textContent = '';

    // Build the query — search name, username, role
    const like = '%' + searchTerm + '%';

    let queryBuilder = sb
      .from('desks')
      .select('user_id, name, username, avatar_url, role, location')
      .neq('user_id', me.id)
      .limit(20);

    if (looksLikeUrl && extracted) {
      // If URL extracted, prefer exact username match
      queryBuilder = sb
        .from('desks')
        .select('user_id, name, username, avatar_url, role, location')
        .neq('user_id', me.id)
        .ilike('username', extracted)
        .limit(20);
    } else {
      queryBuilder = queryBuilder.or(
        'name.ilike.' + like +
        ',username.ilike.' + like +
        ',role.ilike.' + like
      );
    }

    const res = await queryBuilder;

    if (res.error) {
      console.warn('search error:', res.error);
      resultsEl.innerHTML = '';
      emptyEl.hidden = false;
      emptyTitle.textContent = 'Search failed';
      emptyBody.textContent = 'Try again.';
      return;
    }

    const people = (res.data || []).filter(function (p) {
      return p.user_id !== me.id;
    });

    if (!people.length) {
      resultsEl.innerHTML = '';
      emptyEl.hidden = false;
      emptyTitle.textContent = 'No one found';
      emptyBody.textContent = 'Try a different name or link.';
      return;
    }

    emptyEl.hidden = true;
    resultsEl.innerHTML = people.map(function (p) {
      const avatar = p.avatar_url
        ? '<img src="' + esc(p.avatar_url) + '" alt="" loading="lazy">'
        : esc(initials(p.name));

      const role = p.role || p.location || '';

      return '<a class="nc-row" href="/chat.html?to=' + encodeURIComponent(p.user_id) + '">' +
        '<span class="nc-row-avatar">' + avatar + '</span>' +
        '<span class="nc-row-copy">' +
          '<span class="nc-row-name">' + esc(p.name || 'Someone') + '</span>' +
          '<span class="nc-row-handle">@' + esc(p.username || '') + '</span>' +
          (role ? '<span class="nc-row-role">' + esc(role) + '</span>' : '') +
        '</span>' +
        '<svg class="nc-row-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>' +
      '</a>';
    }).join('');
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      const q = input.value.trim();
      if (q === lastQuery) return;
      lastQuery = q;
      search(q);
    }, 220);
  }

  /* ---------- Events ---------- */

  input.addEventListener('input', function () {
    clearEl.hidden = !input.value;
    scheduleSearch();
  });

  clearEl.addEventListener('click', function () {
    input.value = '';
    clearEl.hidden = true;
    lastQuery = '';
    search('');
    input.focus();
  });

  /* ---------- Boot ---------- */

  (async function boot() {
    me = await AUTH.currentUser();
    if (!me) { location.replace('/login.html'); return; }
    sb = AUTH.sb;

    // Show empty state on first load
    emptyEl.hidden = false;
    input.focus();
  })();
})();
