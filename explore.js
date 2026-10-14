/* =========================================================
   STMDESKLY v2 — Explore
   Search across Desks and Posts. Filter by type.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const queryInput = $('exploreQuery');
  const clearBtn   = $('clearQuery');
  const filtersEl  = $('exploreFilters');
  const resultsEl  = $('exploreResults');
  const emptyEl    = $('exploreEmpty');

  let sb = null;
  let currentFilter = 'all';
  let currentQuery = '';
  let searchTimer = null;

  const CATEGORY_LABELS = {
    gig:      'Gig',
    business: 'Business',
    deal:     'Deal',
    skill:    'Skills'
  };

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

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - then) / 1000));
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  /* ---------- Data ---------- */

  async function searchDesks(q) {
    let query = sb.from('desks').select('id, name, username, role, tagline, avatar_url, location');

    if (q) {
      const like = '%' + q + '%';
      query = query.or(
        'name.ilike.' + like +
        ',role.ilike.' + like +
        ',tagline.ilike.' + like +
        ',location.ilike.' + like
      );
    }

    const res = await query.limit(20);
    if (res.error) { console.warn('searchDesks:', res.error); return []; }
    return res.data || [];
  }

  async function searchPosts(q) {
    let query = sb.from('posts').select('id, category, title, body, photos, location, price, created_at, user_id')
      .order('created_at', { ascending: false });

    if (q) {
      const like = '%' + q + '%';
      query = query.or(
        'title.ilike.' + like +
        ',body.ilike.' + like +
        ',location.ilike.' + like
      );
    }

    const res = await query.limit(20);
    if (res.error) { console.warn('searchPosts:', res.error); return []; }
    return res.data || [];
  }

  async function attachAuthorNames(posts) {
    const ids = [...new Set(posts.map(function (p) { return p.user_id; }).filter(Boolean))];
    if (!ids.length) return posts;

    const res = await sb.from('desks').select('user_id, name, username').in('user_id', ids);
    const map = {};
    if (!res.error && res.data) {
      res.data.forEach(function (d) { map[d.user_id] = d; });
    }

    posts.forEach(function (p) {
      const d = map[p.user_id] || {};
      p.author_name = d.name || 'Someone';
      p.author_username = d.username || '';
    });
    return posts;
  }

  /* ---------- Render ---------- */

  function renderDeskCard(desk) {
    const url = '/profile?u=' + encodeURIComponent(desk.username || '');
    const avatar = desk.avatar_url
      ? '<img src="' + esc(desk.avatar_url) + '" alt="" loading="lazy">'
      : esc(initials(desk.name));

    const role = desk.role || '';
    const tagline = desk.tagline || desk.location || '';

    return '<a class="explore-desk" href="' + url + '">' +
      '<span class="explore-desk-avatar">' + avatar + '</span>' +
      '<span class="explore-desk-copy">' +
        '<strong>' + esc(desk.name || 'Someone') + '</strong>' +
        '<small>' + esc(role + (tagline ? ' · ' + tagline : '')) + '</small>' +
      '</span>' +
      '<svg class="explore-desk-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>' +
    '</a>';
  }

  function renderPostCard(post) {
    const cat = CATEGORY_LABELS[post.category] || post.category;
    const title = post.title ? '<h3 class="explore-post-title">' + esc(post.title) + '</h3>' : '';
    const body = post.body ? '<p class="explore-post-body">' + esc(post.body) + '</p>' : '';

    const metaParts = [];
    if (post.price)    metaParts.push('<span>Price: <strong>' + esc(post.price) + '</strong></span>');
    if (post.location) metaParts.push('<span>' + esc(post.location) + '</span>');
    if (post.author_name) metaParts.push('<span>by <strong>' + esc(post.author_name) + '</strong></span>');
    const meta = metaParts.length ? '<div class="explore-post-meta">' + metaParts.join('') + '</div>' : '';

    let photos = '';
    if (Array.isArray(post.photos) && post.photos.length) {
      const shown = post.photos.slice(0, 3);
      photos = '<div class="explore-post-photos">' +
        shown.map(function (u) { return '<img src="' + esc(u) + '" alt="" loading="lazy">'; }).join('') +
      '</div>';
    }

    const target = post.author_username
      ? '/profile?u=' + encodeURIComponent(post.author_username)
      : '#';

    return '<a class="explore-post" href="' + target + '">' +
      '<div class="explore-post-head">' +
        '<span class="explore-post-cat">' + esc(cat) + '</span>' +
        '<span class="explore-post-time">' + esc(timeAgo(post.created_at)) + '</span>' +
      '</div>' +
      title +
      body +
      meta +
      photos +
    '</a>';
  }

  function renderResults(desks, posts) {
    resultsEl.querySelectorAll('.explore-desk, .explore-post, .explore-section-label, .explore-loading').forEach(function (n) {
      n.remove();
    });

    const hasDesks = desks.length > 0;
    const hasPosts = posts.length > 0;

    if (!hasDesks && !hasPosts) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;

    const frag = document.createDocumentFragment();

    if (hasDesks && (currentFilter === 'all' || currentFilter === 'desk')) {
      const label = document.createElement('span');
      label.className = 'explore-section-label';
      label.textContent = desks.length + ' ' + (desks.length === 1 ? 'Desk' : 'Desks');
      frag.appendChild(label);

      desks.forEach(function (d) {
        const wrap = document.createElement('div');
        wrap.innerHTML = renderDeskCard(d);
        frag.appendChild(wrap.firstChild);
      });
    }

    if (hasPosts && (currentFilter === 'all' || currentFilter === 'post')) {
      const label = document.createElement('span');
      label.className = 'explore-section-label';
      label.textContent = posts.length + ' ' + (posts.length === 1 ? 'Post' : 'Posts');
      frag.appendChild(label);

      posts.forEach(function (p) {
        const wrap = document.createElement('div');
        wrap.innerHTML = renderPostCard(p);
        frag.appendChild(wrap.firstChild);
      });
    }

    resultsEl.appendChild(frag);
  }

  function showLoading() {
    resultsEl.querySelectorAll('.explore-desk, .explore-post, .explore-section-label, .explore-loading').forEach(function (n) {
      n.remove();
    });
    emptyEl.hidden = true;
    const loader = document.createElement('div');
    loader.className = 'explore-loading';
    loader.textContent = 'Searching…';
    resultsEl.appendChild(loader);
  }

  /* ---------- Search run ---------- */

  async function runSearch() {
    if (!sb) return;
    showLoading();

    const q = currentQuery.trim();

    let desks = [];
    let posts = [];

    try {
      if (currentFilter === 'all') {
        const [d, p] = await Promise.all([searchDesks(q), searchPosts(q)]);
        desks = d;
        posts = await attachAuthorNames(p);
      } else if (currentFilter === 'desk') {
        desks = await searchDesks(q);
      } else if (currentFilter === 'post') {
        posts = await attachAuthorNames(await searchPosts(q));
      }
    } catch (err) {
      console.warn('Search failed:', err);
    }

    renderResults(desks, posts);
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 260);
  }

  /* ---------- Events ---------- */

  queryInput.addEventListener('input', function () {
    currentQuery = queryInput.value || '';
    clearBtn.hidden = !currentQuery;
    scheduleSearch();
  });

  clearBtn.addEventListener('click', function () {
    queryInput.value = '';
    currentQuery = '';
    clearBtn.hidden = true;
    runSearch();
  });

  filtersEl.addEventListener('click', function (e) {
    const chip = e.target.closest('.explore-chip');
    if (!chip) return;

    const filter = chip.dataset.filter;
    if (filter === currentFilter) return;

    currentFilter = filter;

    filtersEl.querySelectorAll('.explore-chip').forEach(function (c) {
      const on = c.dataset.filter === filter;
      c.classList.toggle('is-current', on);
      c.setAttribute('aria-pressed', String(on));
    });

    runSearch();
  });

  /* ---------- Boot ---------- */

  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }

    sb = AUTH.sb;
    await runSearch();
  })();
})();
