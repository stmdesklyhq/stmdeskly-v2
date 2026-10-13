/* =========================================================
   STMDESKLY v2 — Profile (in-app view)
   Reads ?u=username. Same content as Desk, plus Message + posts.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const loadingEl  = $('loading');
  const missingEl  = $('missing');
  const shellEl    = $('profileShell');
  const contentEl  = $('content');
  const markEl     = $('mark');
  const nameEl     = $('name');
  const roleEl     = $('role');
  const tagEl      = $('tagline');
  const messageBtn = $('messageBtn');
  const postsList  = $('postsList');
  const topbarTitle = $('topbarTitle');
  const backBtn    = $('backBtn');

  const CATEGORY_LABELS = {
    gig:      'Gig',
    business: 'Business',
    deal:     'Deal',
    skill:    'Skills'
  };

  let currentUser = null;
  let desk = null;
  let sb = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

  function applyAccent(accent) {
    const a = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : '#01764C';
    document.body.style.setProperty('--desk-accent', a);

    const hex = a.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    document.body.style.setProperty('--desk-accent-soft', 'rgba(' + r + ',' + g + ',' + b + ',0.10)');
  }

  async function loadPosts() {
    if (!postsList || !desk) return;

    const res = await sb
      .from('posts')
      .select('id, category, title, body, photos, price, created_at')
      .eq('user_id', desk.user_id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (res.error || !res.data || !res.data.length) {
      postsList.innerHTML = '<div class="profile-posts-empty">No posts yet.</div>';
      return;
    }

    postsList.innerHTML = res.data.map(function (p) {
      const cat = CATEGORY_LABELS[p.category] || p.category;
      const title = p.title ? '<h3 class="profile-post-title">' + esc(p.title) + '</h3>' : '';
      const price = p.price ? '<div class="profile-post-price">' + esc(p.price) + '</div>' : '';

      let photosHtml = '';
      if (Array.isArray(p.photos) && p.photos.length) {
        const shown = p.photos.slice(0, 3);
        const extra = p.photos.length - shown.length;
        const tiles = shown.map(function (u) {
          return '<img src="' + esc(u) + '" alt="" loading="lazy">';
        }).join('');
        const more = extra > 0
          ? '<div style="position:relative"><img src="' + esc(shown[0]) + '" alt="" style="visibility:hidden"><div style="position:absolute;inset:0;display:grid;place-items:center;background:rgba(7,17,25,.6);border-radius:8px;color:#fff;font-size:14px;font-weight:700;border-radius:8px">+' + extra + '</div></div>'
          : '';
        photosHtml = '<div class="profile-post-photos">' + tiles + '</div>';
      }

      return '<article class="profile-post">' +
        '<div class="profile-post-head">' +
          '<span class="profile-post-cat">' + esc(cat) + '</span>' +
          '<span class="profile-post-time">' + esc(timeAgo(p.created_at)) + '</span>' +
        '</div>' +
        title +
        '<p class="profile-post-body">' + esc(p.body) + '</p>' +
        price +
        photosHtml +
      '</article>';
    }).join('');
  }

  function renderProfile() {
    applyAccent(desk.accent);

    // Brand band
    if (desk.avatar_url) {
      markEl.innerHTML = '<img src="' + esc(desk.avatar_url) + '" alt="">';
    } else {
      markEl.textContent = (function (n) {
        const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '·';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      })(desk.name);
    }

    nameEl.textContent = desk.name || '';
    topbarTitle.textContent = desk.name || 'Profile';
    document.title = (desk.name || 'Profile') + ' — STMDeskly';

    if (desk.role) { roleEl.textContent = desk.role; roleEl.hidden = false; }
    if (desk.tagline) { tagEl.textContent = desk.tagline; tagEl.hidden = false; }

    // Content sections — reuse the shared renderer
    if (window.DESK_RENDER) {
      const parts = [
        window.DESK_RENDER.renderOffer(desk.services),
        window.DESK_RENDER.renderAbout(desk.about),
        window.DESK_RENDER.renderWork(desk.photos),
        window.DESK_RENDER.renderDetails(desk),
        window.DESK_RENDER.renderContact(desk),
      ].filter(Boolean);
      contentEl.innerHTML = parts.join('');
    }

    // Hide message button if viewing your own profile
    if (currentUser && currentUser.id === desk.user_id) {
      messageBtn.disabled = true;
      messageBtn.querySelector('span').textContent = 'This is you';
    } else {
      messageBtn.disabled = false;
      messageBtn.querySelector('span').textContent = 'Message';
    }

    loadingEl.hidden = true;
    shellEl.hidden = false;
  }

  function showMissing() {
    loadingEl.hidden = true;
    missingEl.hidden = false;
  }

  /* ---------- Events ---------- */
  backBtn.addEventListener('click', function () {
    if (window.history.length > 1) history.back();
    else location.href = '/home.html';
  });

  messageBtn.addEventListener('click', function () {
    if (!desk) return;
    if (currentUser && currentUser.id === desk.user_id) return;
    location.href = '/chat.html?to=' + encodeURIComponent(desk.user_id);
  });

  /* ---------- Boot ---------- */
  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }
    currentUser = user;
    sb = AUTH.sb;

    const params = new URLSearchParams(location.search);
    let username = (params.get('u') || '').trim().toLowerCase();
    if (!username) {
      const m = location.pathname.match(/^\/@([^\/?#]+)/);
      if (m) username = decodeURIComponent(m[1]).toLowerCase();
    }

    if (!username) return showMissing();

    const res = await sb.from('desks').select('*').eq('username', username).maybeSingle();
    if (res.error || !res.data) return showMissing();

    desk = res.data;
    renderProfile();
    loadPosts();
  })();
})();
