/* =========================================================
   STMDESKLY v2 — Desk page
   Loads a public Desk by ?u=username. Renders only filled sections.
   ========================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const loadingEl = $('loading');
  const missingEl = $('missing');
  const deskEl    = $('desk');
  const contentEl = $('content');
  const markEl    = $('mark');
  const nameEl    = $('name');
  const roleEl    = $('role');
  const tagEl     = $('tagline');

  const DEFAULT_ACCENT = '#01764C';
  const DEFAULT_INK    = '#172B3A';

  /* ---------- Helpers ---------- */

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function hexToRgba(hex, alpha) {
    const clean = String(hex || '').replace('#', '');
    if (clean.length !== 6) return `rgba(1,118,76,${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // WhatsApp number → wa.me friendly format (no +, no spaces)
  function waNumber(raw) {
    let n = String(raw || '').replace(/[^\d+]/g, '');
    if (n.startsWith('+')) n = n.slice(1);
    if (n.startsWith('0')) n = '234' + n.slice(1);
    if (!n.startsWith('234') && n.length === 10) n = '234' + n;
    return n;
  }

  function waLink(number, message) {
    const n = waNumber(number);
    const text = message ? '?text=' + encodeURIComponent(message) : '';
    return `https://wa.me/${n}${text}`;
  }

  function telLink(number) {
    return 'tel:' + String(number || '').replace(/[^\d+]/g, '');
  }

  function mailLink(email) {
    return 'mailto:' + String(email || '').trim();
  }

  function normalizeUrl(url) {
    let u = String(url || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }

  /* ---------- Section builders ---------- */

  function buildSection(eyebrow, bodyHtml) {
    const s = document.createElement('section');
    s.className = 'desk-section';
    s.innerHTML = `
      <span class="desk-section-eyebrow">${escapeHtml(eyebrow)}</span>
      ${bodyHtml}
    `;
    return s;
  }

  function renderOffer(services) {
    const items = String(services || '')
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!items.length) return null;

    const list = items.map((s) => `
      <div class="desk-offer-item">
        <span class="desk-offer-dot"></span>
        <span>${escapeHtml(s)}</span>
      </div>
    `).join('');

    return buildSection('What we offer', `<div class="desk-offer-list">${list}</div>`);
  }

  function renderAbout(about) {
    const text = String(about || '').trim();
    if (!text) return null;

    return buildSection('About', `<div class="desk-about">${escapeHtml(text)}</div>`);
  }

  function renderWork(photos) {
    let arr = [];
    try {
      arr = Array.isArray(photos) ? photos : (photos ? JSON.parse(photos) : []);
    } catch (e) { arr = []; }
    arr = arr.filter(Boolean);

    if (!arr.length) return null;

    const items = arr.map((url) => `
      <div class="desk-work-photo" data-src="${escapeHtml(url)}">
        <img src="${escapeHtml(url)}" alt="" loading="lazy">
      </div>
    `).join('');

    return buildSection('Work', `<div class="desk-work-grid">${items}</div>`);
  }

  function renderDetails(desk) {
    const rows = [];

    if (desk.location)      rows.push(['Location', desk.location]);
    if (desk.opening_hours) rows.push(['Hours', desk.opening_hours]);
    if (desk.service_times) rows.push(['Times', desk.service_times]);

    if (!rows.length) return null;

    const html = rows.map(([label, value]) => `
      <div class="desk-detail">
        <span class="desk-detail-label">${escapeHtml(label)}</span>
        <span class="desk-detail-value">${escapeHtml(value)}</span>
      </div>
    `).join('');

    return buildSection('Details', `<div class="desk-details">${html}</div>`);
  }

  function renderContact(desk) {
    if (!desk.whatsapp && !desk.email && !desk.phone && !desk.website) return null;

    const secondary = [];

    if (desk.email) {
      secondary.push(`
        <a class="desk-contact-chip" href="${escapeHtml(mailLink(desk.email))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
          Email
        </a>
      `);
    }

    if (desk.phone) {
      secondary.push(`
        <a class="desk-contact-chip" href="${escapeHtml(telLink(desk.phone))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/></svg>
          Call
        </a>
      `);
    }

    if (desk.website) {
      secondary.push(`
        <a class="desk-contact-chip" href="${escapeHtml(normalizeUrl(desk.website))}" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
          Website
        </a>
      `);
    }

    const primary = desk.whatsapp ? `
      <a class="desk-contact-primary" href="${escapeHtml(waLink(desk.whatsapp))}" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.9 11.9L4 20l4.2-1.1a7.93 7.93 0 0 0 3.84.98h.01a7.94 7.94 0 0 0 5.55-13.56zM12.05 18.53a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.49.65.66-2.43-.16-.25a6.6 6.6 0 0 1 10.27-8.15 6.58 6.58 0 0 1-4.68 11.24zm3.62-4.94c-.2-.1-1.17-.58-1.35-.64-.18-.07-.31-.1-.44.1-.13.2-.5.64-.62.77-.11.13-.23.14-.43.05a5.4 5.4 0 0 1-1.6-.98 6 6 0 0 1-1.1-1.37c-.12-.2 0-.31.09-.41l.3-.35c.1-.11.13-.19.2-.32a.36.36 0 0 0 0-.34c-.05-.1-.44-1.06-.6-1.45-.16-.38-.32-.33-.44-.33l-.37-.01a.72.72 0 0 0-.52.24 2.18 2.18 0 0 0-.68 1.62 3.8 3.8 0 0 0 .8 2 8.68 8.68 0 0 0 3.32 2.93c.47.2.83.32 1.11.41.47.15.9.13 1.23.08.38-.06 1.17-.48 1.33-.94.16-.46.16-.85.11-.94-.05-.1-.18-.15-.38-.25z"/></svg>
        Message on WhatsApp
      </a>
    ` : '';

    return buildSection(
      'Contact',
      `<div class="desk-contact-actions">
         ${primary}
         ${secondary.length ? `<div class="desk-contact-secondary">${secondary.join('')}</div>` : ''}
       </div>`
    );
  }

  /* ---------- Photo lightbox ---------- */

  function openLightbox(src) {
    const box = document.createElement('div');
    box.className = 'desk-lightbox';
    box.innerHTML = `
      <button class="desk-lightbox-close" aria-label="Close">×</button>
      <img src="${escapeHtml(src)}" alt="">
    `;
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.classList.contains('desk-lightbox-close')) {
        box.remove();
      }
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', onEsc); }
    });
    document.body.appendChild(box);
  }

  /* ---------- Render ---------- */

  function applyAccent(accent) {
    const a = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : DEFAULT_ACCENT;
    document.body.style.setProperty('--desk-accent', a);
    document.body.style.setProperty('--desk-accent-soft', hexToRgba(a, 0.10));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', a);
  }

  function renderMark(desk) {
    if (desk.avatar_url) {
      markEl.innerHTML = `<img src="${escapeHtml(desk.avatar_url)}" alt="">`;
    } else {
      markEl.textContent = initials(desk.name);
    }
  }

  function updateOGTags(desk) {
    const title = (desk.name || 'Desk') + ' — STMDeskly';
    const desc  = desk.tagline || (desk.role ? desk.role + ' on STMDeskly' : 'A Desk on STMDeskly');

    document.title = title;

    const setMeta = (sel, attr, value) => {
      let el = document.querySelector(sel);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr.split('=')[0], attr.split('=')[1].replace(/"/g, ''));
        document.head.appendChild(el);
      }
      el.setAttribute('content', value);
    };

    setMeta('meta[property="og:title"]',       'property="og:title"',       title);
    setMeta('meta[property="og:description"]', 'property="og:description"', desc);

    if (desk.avatar_url) {
      setMeta('meta[property="og:image"]', 'property="og:image"', desk.avatar_url);
    }
  }

  function renderDesk(desk) {
    applyAccent(desk.accent);
    updateOGTags(desk);

    renderMark(desk);

    nameEl.textContent = desk.name || '';

    if (desk.role) {
      roleEl.textContent = desk.role;
      roleEl.hidden = false;
    }

    if (desk.tagline) {
      tagEl.textContent = desk.tagline;
      tagEl.hidden = false;
    }

    // Build content sections — only those with data appear
    const sections = [
      renderOffer(desk.services),
      renderAbout(desk.about),
      renderWork(desk.photos),
      renderDetails(desk),
      renderContact(desk),
    ].filter(Boolean);

    contentEl.innerHTML = '';
    sections.forEach((s) => contentEl.appendChild(s));

    // Lightbox handler
    contentEl.addEventListener('click', (e) => {
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

    // Also support /u/username via path (once _redirects is set up)
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

      const { data, error } = await sb
        .from('desks')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (error || !data) return showMissing();
      renderDesk(data);
    } catch (err) {
      console.error('Desk load failed:', err);
      showMissing();
    }
  })();
})();