/* =========================================================
   STMDESKLY v2 — Profile
   Public. Anyone with a link sees the profile.
   No login required to view. Login only for chat.
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

    if (coverEl && desk.cover_url) {
      coverEl.style.backgroundImage = 'url(' + desk.cover_url + ')';
      document.body.classList.add('has-cover');
    } else {
      document.body.classList.remove('has-cover');
    }

    markEl.innerHTML = R.buildMarkHtml(desk);

    nameEl.textContent = desk.name || '';
    profileTitle.textContent = desk.name || 'Profile';
    document.title = (desk.name || 'Profile') + ' — STMDeskly';

    if (desk.role) { roleEl.textContent = desk.role; roleEl.hidden = false; }
    if (desk.tagline) { tagEl.textContent = desk.tagline; tagEl.hidden = false; }

    const hasOffer   = String(desk.services || '').trim().length > 0;
    const hasAbout   = String(desk.about || '').trim().length > 0;
    const hasContact = !!(desk.whatsapp || desk.email || desk.phone || desk.website);

    if (pillOffer)   pillOffer.hidden   = !hasOffer;
    if (pillAbout)   pillAbout.hidden   = !hasAbout;
    if (pillContact) pillContact.hidden = !hasContact;

    if (chatPill) {
      const isMe = currentUser && currentUser.id === desk.user_id;
      const canChat = !!currentUser && !isMe;
      chatPill.hidden = !canChat;
      if (canChat) {
        chatPill.addEventListener('click', function () {
          location.href = '/chat.html?to=' + encodeURIComponent(desk.user_id);
        });
      }
    }

    contentEl.innerHTML = R.buildAllSections(desk);

    const offerSection   = contentEl.querySelector('[data-section="what-we-offer"]');
    const aboutSection   = contentEl.querySelector('[data-section="about"]');
    const contactSection = contentEl.querySelector('[data-section="contact"]');
    if (offerSection)   offerSection.id = 'section-offer';
    if (aboutSection)   aboutSection.id = 'section-about';
    if (contactSection) contactSection.id = 'section-contact';

    if (pillOffer && !offerSection)     pillOffer.hidden = true;
    if (pillAbout && !aboutSection)     pillAbout.hidden = true;
    if (pillContact && !contactSection) pillContact.hidden = true;

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

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      if (window.history.length > 1) history.back();
      else location.href = '/home';
    });
  }

  /* =========================================================
     BOOT — read URL first, load profile, check auth LAST
     ========================================================= */

  (async function boot() {
    try {
      sb = AUTH.sb;

      const params = new URLSearchParams(location.search);
      let username = (params.get('u') || '').trim().toLowerCase();

      if (!username) {
        const m = location.pathname.match(/^\/u\/([^\/?#]+)/);
        if (m) username = decodeURIComponent(m[1]).toLowerCase();
      }

      /* Load the desk row FIRST. Public data. No auth needed. */
      if (!username) {
        /* No ?u= in URL. Try to figure out who the viewer is. */
        try {
          currentUser = await AUTH.currentUser();
        } catch (e) {
          currentUser = null;
        }

        if (currentUser) {
          try {
            const own = await AUTH.currentDesk();
            if (own && own.username) username = String(own.username).toLowerCase();
          } catch (e) {}
          if (!username) {
            const meta = currentUser.user_metadata || {};
            if (meta.username) username = String(meta.username).toLowerCase();
          }
        }

        if (!username) {
          /* No ?u=, no logged-in user, nothing to show */
          showMissing();
          return;
        }
      }

      const res = await sb
        .from('desks')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (res.error || !res.data) {
        showMissing();
        return;
      }

      desk = res.data;

      /* Now check auth — only for owner features */
      try {
        currentUser = await AUTH.currentUser();
      } catch (e) {
        currentUser = null;
      }

      renderProfile();
      loadRecentPosts();

    } catch (err) {
      console.error('Profile load failed:', err);
      showMissing();
    }
  })();
})();
