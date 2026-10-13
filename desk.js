/* =========================================================
   STMDESKLY v2 — Public Desk page
   Loads a Desk by ?u=username or /u/username.
   Applies the owner's appearance settings.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const loadingEl = $('loading');
  const missingEl = $('missing');
  const deskEl    = $('desk');
  const contentEl = $('content');
  const markEl    = $('mark');
  const nameEl    = $('name');
  const roleEl    = $('role');
  const tagEl     = $('tagline');

  const R = window.DESK_RENDER;
  if (!R) {
    console.error('desk-render.js is required');
    return;
  }

  /* ---------- Lightbox ---------- */

  function openLightbox(src) {
    const box = document.createElement('div');
    box.className = 'desk-lightbox';
    box.innerHTML =
      '<button class="desk-lightbox-close" aria-label="Close">×</button>' +
      '<img src="' + R.escapeHtml(src) + '" alt="">';
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.classList.contains('desk-lightbox-close')) {
        box.remove();
      }
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') {
        box.remove();
        document.removeEventListener('keydown', onEsc);
      }
    });
    document.body.appendChild(box);
  }

  /* ---------- Appearance ---------- */

  function applyAppearance(desk) {
    const accent = R.safeAccent(desk.accent);
    document.body.style.setProperty('--desk-accent', accent);
    document.body.style.setProperty('--desk-accent-soft', R.hexToRgba(accent, 0.10));

    // Page background
    const bgMap = {
      cream: '#F7F6F1',
      white: '#FFFFFF',
      'warm-grey': '#EEEAE3',
      'cool-grey': '#E9EDF0'
    };
    const bg = bgMap[desk.background] || bgMap.cream;
    document.body.style.setProperty('--desk-bg', bg);

    // Data attributes for CSS-driven changes
    document.body.dataset.pattern = desk.pattern || 'none';
    document.body.dataset.corners = desk.corner_style || 'rounded';
    document.body.dataset.layout = desk.layout_style || 'spacious';
    document.body.dataset.photoLayout = desk.photo_layout || 'grid';

    // Font pair
    const fontMap = {
      modern: '"Poppins", sans-serif',
      classic: 'Georgia, "Times New Roman", serif',
      editorial: '"Times New Roman", Georgia, serif',
      friendly: '"Trebuchet MS", sans-serif'
    };
    const font = fontMap[desk.font_pair] || fontMap.modern;
    document.body.style.setProperty('--desk-font', font);

    // Theme colour
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

    if (desk.avatar_url) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', desk.avatar_url);
    }
  }

  /* ---------- Render ---------- */

  function renderDesk(desk) {
    applyAppearance(desk);
    updateOGTags(desk);

    markEl.innerHTML = R.buildMarkHtml(desk);
    nameEl.textContent = desk.name || '';

    if (desk.role) {
      roleEl.textContent = desk.role;
      roleEl.hidden = false;
    }

    if (desk.tagline) {
      tagEl.textContent = desk.tagline;
      tagEl.hidden = false;
    }

    contentEl.innerHTML = R.buildAllSections(desk);

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
