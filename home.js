/* =========================================================
   STMDESKLY v2 — Home (feed)
   Loads posts, filters by category, greets the user.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const greetingEl       = $('greeting');
  const userAvatarEl     = $('userAvatar');
  const composerAvatarEl = $('composerAvatar');
  const feedEl           = $('feed');
  const loadingEl        = $('feedLoading');
  const emptyEl          = $('feedEmpty');
  const categoryNav      = $('categoryNav');

  const CATEGORY_LABELS = {
    gig:      'Gig',
    business: 'Business update',
    deal:     'Market deal',
    skill:    'Skills & work'
  };

  let currentUser = null;
  let currentCategory = 'all';
  let sb = null;

  function firstName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[0] : '';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function paintGreeting() {
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let timeWord = 'Good evening';
    if (hour < 12) timeWord = 'Good morning';
    else if (hour < 17) timeWord = 'Good afternoon';

    const name = firstName(currentUser && currentUser.user_metadata && currentUser.user_metadata.name);
    greetingEl.innerHTML = esc(timeWord) + (name ? ', ' + esc(name) : '') + '<span>.</span>';
  }

  function paintAvatars() {
    const name = (currentUser && currentUser.user_metadata && currentUser.user_metadata.name) || '';
    const ini = initials(name);
    if (userAvatarEl) userAvatarEl.textContent = ini;
    if (composerAvatarEl) composerAvatarEl.textContent = ini;
  }

  function renderPhotoGrid(photos) {
    if (!Array.isArray(photos) || !photos.length) return '';

    const shown = photos.slice(0, 3);
    const extra = photos.length - shown.length;

    const tiles = shown.map(function (url) {
      return '<div class="post-photo-tile"><img src="' + esc(url) + '" alt="" loading="lazy"></div>';
    }).join('');

    const more = extra > 0
      ? '<div class="post-photo-tile post-photo-more">+' + extra + '</div>'
      : '';

    return '<div class="post-photos">' + tiles + more + '</div>';
  }

  function renderPost(post) {
    const photoGrid = renderPhotoGrid(post.photos);
    const categoryLabel = CATEGORY_LABELS[post.category] || post.category;
    const location = post.location
      ? '<span class="location"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>' + esc(post.location) + '</span>'
      : '';

    const title = post.title
      ? '<h3 class="post-title">' + esc(post.title) + '</h3>'
      : '';

    const price = post.price
      ? '<div class="post-price">' + esc(post.price) + '</div>'
      : '';

    return '<article class="post-card" data-id="' + esc(post.id) + '">' +
      '<header class="post-header">' +
        '<span class="avatar post-avatar">' + esc(initials(post.author_name || '·')) + '</span>' +
        '<div class="post-author">' +
          '<strong>' + esc(post.author_name || 'Someone') + '</strong>' +
          '<div class="post-meta">' +
            '<span class="post-category">' + esc(categoryLabel) + '</span>' +
            '<span>' + esc(timeAgo(post.created_at)) + '</span>' +
            location +
          '</div>' +
        '</div>' +
      '</header>' +
      title +
      '<p class="post-body">' + esc(post.body) + '</p>' +
      price +
      photoGrid +
      '<footer class="post-actions">' +
        '<button class="post-action" data-action="like" aria-label="Like"><svg viewBox="0 0 24 24"><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.3 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></button>' +
        '<button class="post-action" data-action="comment" aria-label="Comment"><svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.5-.8L4 20l1.3-4.2a7.5 7.5 0 1 1 14.7-4.3Z"/></svg></button>' +
        '<button class="post-action" data-action="share" aria-label="Share"><svg viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg></button>' +
      '</footer>' +
    '</article>';
  }

  async function loadFeed() {
    if (!feedEl || !sb) return;

    loadingEl.hidden = false;
    emptyEl.hidden = true;

    // Remove existing post cards but keep loading/empty
    feedEl.querySelectorAll('.post-card').forEach(function (n) { n.remove(); });

    let query = sb
      .from('posts')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30);

    if (currentCategory !== 'all') {
      query = query.eq('category', currentCategory);
    }

    const res = await query;

    loadingEl.hidden = true;

    if (res.error) {
      console.error('loadFeed:', res.error);
      feedEl.insertAdjacentHTML('beforeend',
        '<div style="text-align:center;padding:24px 0;color:#B3261E;font-size:12px;">Could not load posts.</div>');
      return;
    }

    const posts = res.data || [];

    if (!posts.length) {
      emptyEl.hidden = false;
      return;
    }

    // Fetch author names in one query
    const userIds = [...new Set(posts.map(function (p) { return p.user_id; }).filter(Boolean))];
    let authorMap = {};
    if (userIds.length) {
      const authorsRes = await sb
        .from('desks')
        .select('user_id, name')
        .in('user_id', userIds);
      if (!authorsRes.error && authorsRes.data) {
        authorsRes.data.forEach(function (d) { authorMap[d.user_id] = d.name; });
      }
    }

    const html = posts.map(function (p) {
      p.author_name = authorMap[p.user_id] || 'Someone';
      return renderPost(p);
    }).join('');

    feedEl.insertAdjacentHTML('afterbegin', html);
  }

  function wireCategoryNav() {
    if (!categoryNav) return;
    categoryNav.addEventListener('click', function (e) {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;

      const cat = chip.dataset.category || 'all';
      if (cat === currentCategory) return;

      currentCategory = cat;

      categoryNav.querySelectorAll('.filter-chip').forEach(function (c) {
        const isActive = c.dataset.category === cat;
        c.classList.toggle('active', isActive);
        c.setAttribute('aria-pressed', String(isActive));
      });

      loadFeed();
    });
  }

  /* ---------- Boot ---------- */
  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }

    currentUser = user;
    sb = AUTH.sb;

    paintGreeting();
    paintAvatars();
    wireCategoryNav();

    await loadFeed();
  })();
})();
