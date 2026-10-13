/* =========================================================
   STMDESKLY v2 — Public Desk page
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
  const heroActions   = $('heroActions');
  const lightbox      = $('lightbox');
  const lightboxImg   = $('lightboxImage');
  const lightboxClose = $('lightboxClose');

  const R = window.DESK_RENDER;
  if (!R) {
    console.error('desk-render.js is required');
    return;
  }

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

  function applyAppearance(desk) {
    const accent = R.safeAccent(desk.accent);
    document.body.style.setProperty('--desk-accent', accent);
    document.body.style.setProperty('--desk-accent-soft', R.hexToRgba(accent, 0.10));

    const bgMap = {
      cream: '#F7F6F1',
      white: '#FFFFFF',
      'warm-grey': '#EEEAE3',
      'cool-grey': '#E9EDF0'
    };
    const bg = bgMap[desk.background] || bgMap.cream;
    document.body.style.setProperty('--desk-bg', bg);

    document.body.dataset.background = desk.background || 'cream';
    document.body.dataset.pattern = desk.pattern || 'none';
    document.body.dataset.font = desk.font_pair || 'modern';
    document.body.dataset.corners = desk.corner_style || 'rounded';
    document.body.dataset.layout = desk.layout_style || 'spacious';
    document.body.dataset.photoLayout = desk.photo_layout || 'grid';

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bg);
  }

  /* ---------- OG tags ---------- */

  function updateOGTags(desk) {
    const title = (desk.name || 'Desk') + ' — STMDeskly';
    const desc  = desk.tagline || (desk.role ? desk.role + ' on STMDeskly' : 'A Desk on STMDeskly');
    document.title = title;

    function setMeta(selector, attrName, attrValue, content) {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrValue);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    }

    setMeta('meta[property="og:title"]',       'property', 'og:title',       title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', desc);

    const ogImage = desk.cover_url || desk.avatar_url;
    if (ogImage) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', ogImage);
    }
  }

  /* ---------- Render ---------- */

  function renderDesk(desk) {
    applyAppearance(desk);
    updateOGTags(desk);

    // Cover — set as background image if present
    if (coverEl && desk.cover_url) {
      coverEl.style.backgroundImage = 'url(' + desk.cover_url + ')';
    }

    // Hide topbar when a cover exists — cover carries the branding
    if (desk.cover_url) {
      document.body.classList.add('has-cover');
    } else {
      document.body.classList.remove('has-cover');
    }

    // Avatar / mark
    markEl.innerHTML = R.buildMarkHtml(desk);

    // Name + role
    nameEl.textContent = desk.name || '';
    if (desk.role) {
      roleEl.textContent = desk.role;
      roleEl.hidden = false;
    }

    // Tagline
    if (desk.tagline) {
      tagEl.textContent = desk.tagline;
      tagEl.hidden = false;
    }

    // Hero action (WhatsApp button)
    if (heroActions) {
      heroActions.innerHTML = R.buildHeroActionsHtml(desk);
    }

    // Content sections
    contentEl.innerHTML = R.buildAllSections(desk);

    // Photo lightbox
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

  /* ---------- Boot ---------- */

  (async function () {
    const params = new URLSearchParams(location.search);
    let username = (params.get('u') || '').trim().toLowerCase();

    if (!username) {
      const m = location.pathname.match(/^\/u\/([^\/?#]+)/);
      if (m) username = decodeURIComponent(m[1]).toLowerCase();
    }

    if (!username) return showMissing();

    if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url) {
      console.error('config.js is missing or wrong');
      return showMissing();
    }

    try {
      const sb = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
      );

      const res = await sb
        .from('desks')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (res.error || !res.data) return showMissing();
      renderDesk(res.data);
    } catch (err) {
      console.error('Desk load failed:', err);
      showMissing();
    }
  })();
})();
