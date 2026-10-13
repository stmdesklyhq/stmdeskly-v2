/* =========================================================
   STMDESKLY v2 — In-app Profile
   Same content as the public Desk + quicknav + recent posts.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const loadingEl     = $('loading');
  const missingEl     = $('missing');
  const deskEl        = $('desk');
  const contentEl     = $('content');
  const markEl        = $('mark');
  const nameEl        = $('name');
  const roleEl        = $('role');
  const tagEl         = $('tagline');
  const coverEl       = $('heroCover');
  const profileTitle  = $('profileTitle');
  const backBtn       = $('backBtn');
  const pillOffer     = $('pillOffer');
  const pillAbout     = $('pillAbout');
  const pillContact   = $('pillContact');
  const chatPill      = $('chatPill');
  const profilePosts  = $('profilePosts');
  const postsList     = $('postsList');
  const lightbox      = $('lightbox');
  const lightboxImg   = $('lightboxImage');
  const lightboxClose = $('lightboxClose');

  const R = window.DESK_RENDER;
  if (!R) { console.error('desk-render.js is required'); return; }

  const CATEGORY_LABELS = {
    gig:      'Gig',
    business: 'Business',
    deal:     'Deal',
    skill:    'Skills'
  };

  let currentUser = null;
  let desk = null;
  let sb = null;

  /* ---------- Lightbox ---------- */

  function openLightbox(src) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    if (!lightbox || !lightboxImg) return;
    lightbox.hidden = true;
    lightboxImg.src = '';
    document.body.style.overflow = '';
  }
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightbox) {
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lightbox && !lightbox.hidden) closeLightbox();
  });

  /* ---------- Appearance ---------- */

  function applyAppearance(d) {
    const accent = R.safeAccent(d.accent);
    document.body.style.setProperty('--desk-accent', accent);
    document.body.style.setProperty('--desk-accent-soft', R.hexToRgba(accent, 0.10));

    const bgMap = {
      cream: '#F7F6F1',
      white: '#FFFFFF',
      'warm-grey': '#EEEAE3',
      'cool-grey': '#E9EDF0'
    };
    const bg = bgMap[d.background] || bgMap.cream;
    document.body.style.setProperty('--desk-bg', bg);

    document.body.dataset.background = d.background || 'cream';
    document.body.dataset.pattern = d.pattern || 'none';
    document.body.dataset.font = d.font_pair || 'modern';
    document.body.dataset.corners = d.corner_style || 'rounded';
    document.body.dataset.layout = d.layout_style || 'spacious';
    document.body.dataset.photoLayout = d.photo_layout || 'grid';

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bg);
  }

  /* ---------- Recent posts ---------- */

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

  function escHtml(s) { return R.escapeHtml(s); }

  async function loadRecentPosts() {
    if (!desk || !profilePosts || !postsList) return;

    const res = await sb
      .from('posts')
      .select('id, category, title, body, photos, price, created_at')
      .eq('user_id', desk.user_id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (res.error || !res.data || !res.data.length) {
      profilePosts.hidden = true;
      return;
    }

    profilePosts.hidden = false;

    postsList.innerHTML = res.data.map(function (p) {
      const cat = CATEGORY_LABELS[p.category] || p.category;
      const title = p.title ? '<h3 class="profile-post-title">' + escHtml(p.title) + '</h3>' : '';
      const price = p.price ? '<div class="profile-post-price">' + escHtml(p.price) + '</div>' : '';

      let photosHtml = '';
      if (Array.isArray(p.photos) && p.photos.length) {
        const shown = p.photos.slice(0, 3);
        photosHtml = '<div class="profile-post-photos">' +
          shown.map(function (u) { return '<img src="' + escHtml(u) + '" alt="" loading="lazy">'; }).join('') +
        '</div>';
      }

      return '<article class="profile-post">' +
        '<div class="profile-post-head">' +
          '<span class="profile-post-cat">' + escHtml(cat) + '</span>' +
          '<span class="profile-post-time">' + escHtml(timeAgo(p.created_at)) + '</span>' +
        '</div>' +
        title +
        '<p class="profile-post-body">' + escHtml(p.body) + '</p>' +
        price +
        photosHtml +
      '</article>';
    }).join('');
  }

  /* ---------- Render ---------- */

  function renderProfile() {
    applyAppearance(desk);

    // Cover
    if (coverEl && desk.cover_url) {
      coverEl.style.backgroundImage = 'url(' + desk.cover_url + ')';
      document.body.classList.add('has-cover');
    } else {
      document.body.classList.remove('has-cover');
    }

    // Avatar
    markEl.innerHTML = R.buildMarkHtml(desk);

    // Name + role + tagline
    nameEl.textContent = desk.name || '';
    profileTitle.textContent = desk.name || 'Profile';
    document.title = (desk.name || 'Profile') + ' — STMDeskly';

    if (desk.role) { roleEl.textContent = desk.role; roleEl.hidden = false; }
    if (desk.tagline) { tagEl.textContent = desk.tagline; tagEl.hidden = false; }

    // Quicknav pill visibility
    const hasOffer   = String(desk.services || '').trim().length > 0;
    const hasAbout   = String(desk.about || '').trim().length > 0;
    const hasContact = !!(desk.whatsapp || desk.email || desk.phone || desk.website);

    if (pillOffer)   pillOffer.hidden   = !hasOffer;
    if (pillAbout)   pillAbout.hidden   = !hasAbout;
    if (pillContact) pillContact.hidden = !hasContact;

    // Chat pill — hide if viewing yourself
    if (chatPill) {
      const isMe = currentUser && currentUser.id === desk.user_id;
      chatPill.hidden = isMe;
      if (!isMe) {
        chatPill.addEventListener('click', function () {
          location.href = '/chat.html?to=' + encodeURIComponent(desk.user_id);
        });
      }
    }

    // Content sections
    contentEl.innerHTML = R.buildAllSections(desk);

    // Attach IDs to the inserted sections so anchor links work
    const offerSection   = contentEl.querySelector('[data-section="what-we-offer"]');
    const aboutSection   = contentEl.querySelector('[data-section="about"]');
    const contactSection = contentEl.querySelector('[data-section="contact"]');
    if (offerSection)   offerSection.id = 'section-offer';
    if (aboutSection)   aboutSection.id = 'section-about';
    if (contactSection) contactSection.id = 'section-contact';

    // If a section doesn't exist, hide the corresponding pill
    if (pillOffer && !offerSection)     pillOffer.hidden = true;
    if (pillAbout && !aboutSection)     pillAbout.hidden = true;
    if (pillContact && !contactSection) pillContact.hidden = true;

    // Lightbox
    contentEl.addEventListener('click', function (e) {
      const tile = e.target.closest('.desk-work-photo');
      if (tile) openLightbox(tile.dataset.src);
    });

    loadingEl.hidden = true;
    deskEl.hidden = false;
  }

  function showMissing() {
    loadingEl.hidden = true;
    missingEl.hidden = false;
  }

  /* ---------- Back button ---------- */

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      if (window.history.length > 1) history.back();
      else location.href = '/home.html';
    });
  }

  /* ---------- Boot ---------- */

  (async function () {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }
    currentUser = user;
    sb = AUTH.sb;

    const params = new URLSearchParams(location.search);
    const username = (params.get('u') || '').trim().toLowerCase();

    if (!username) return showMissing();

    const res = await sb.from('desks').select('*').eq('username', username).maybeSingle();
    if (res.error || !res.data) return showMissing();

    desk = res.data;
    renderProfile();
    loadRecentPosts();
  })();
})();
