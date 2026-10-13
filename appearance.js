/* =========================================================
   STMDESKLY v2 — Appearance controls
   Taps update a live preview and dispatch a change event.
   edit.js reads the values on save.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const preview = $('appearancePreview');
  if (!preview) return;

  const settings = {
    accent: 'forest',
    background: 'cream',
    pattern: 'none',
    font_pair: 'modern',
    corner_style: 'rounded',
    layout_style: 'spacious',
    photo_layout: 'grid'
  };

  const ACCENT_HEX = {
    forest: '#2F6D50',
    emerald: '#087F5B',
    blue: '#2458A6',
    red: '#B93D45',
    terracotta: '#B85C38',
    plum: '#79518D',
    amber: '#A66A13',
    charcoal: '#34424A'
  };

  const BACKGROUND_HEX = {
    cream: '#F7F6F1',
    white: '#FFFFFF',
    'warm-grey': '#EEEAE3',
    'cool-grey': '#E9EDF0'
  };

  const FONT_STACK = {
    modern: '"Poppins", sans-serif',
    classic: 'Georgia, "Times New Roman", serif',
    editorial: '"Times New Roman", Georgia, serif',
    friendly: '"Trebuchet MS", sans-serif'
  };

  const LABEL_IDS = {
    accent: 'accentSelection',
    background: 'backgroundSelection',
    pattern: 'patternSelection',
    font_pair: 'fontSelection',
    corner_style: 'cornersSelection',
    layout_style: 'layoutSelection',
    photo_layout: 'photoLayoutSelection'
  };

  // Maps setting key → data-group value used in HTML
  const GROUPS = {
    accent: 'accent',
    background: 'background',
    pattern: 'pattern',
    font_pair: 'font',
    corner_style: 'corners',
    layout_style: 'layout',
    photo_layout: 'photo-layout'
  };

  function niceLabel(button, fallback) {
    if (!button) return fallback;
    const aria = button.getAttribute('aria-label');
    if (aria) return aria;
    // Use the strong/span label inside the button if present
    const strong = button.querySelector('strong');
    if (strong) return strong.textContent.trim();
    const span = button.querySelector('span:not(.colour-dot):not(.background-swatch):not(.pattern-tile)');
    if (span && span.textContent.trim()) return span.textContent.trim();
    return fallback;
  }

  function paintSelection(key, value) {
    const group = GROUPS[key];
    if (!group) return;

    document.querySelectorAll('[data-group="' + group + '"][data-value]')
      .forEach(function (btn) {
        const on = btn.dataset.value === value;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-pressed', String(on));
      });

    const labelEl = $(LABEL_IDS[key]);
    if (labelEl) {
      const selected = document.querySelector(
        '[data-group="' + group + '"][data-value="' + value + '"]'
      );
      labelEl.textContent = niceLabel(selected, value);
    }
  }

  function paintPreview() {
    preview.dataset.accent = settings.accent;
    preview.dataset.background = settings.background;
    preview.dataset.pattern = settings.pattern;
    preview.dataset.font = settings.font_pair;
    preview.dataset.corners = settings.corner_style;
    preview.dataset.layout = settings.layout_style;
    preview.dataset.photoLayout = settings.photo_layout;

    // Update the name and role in the preview to match the form
    const nameEl = $('appearancePreviewName');
    const roleEl = $('appearancePreviewRole');
    const nameInput = $('name');
    const roleInput = $('role');

    if (nameEl) {
      nameEl.textContent = (nameInput && nameInput.value.trim()) || 'Your name';
    }
    if (roleEl) {
      roleEl.textContent = (roleInput && roleInput.value.trim()) || 'What you do';
    }
  }

  function applyAll() {
    Object.keys(settings).forEach(function (key) {
      paintSelection(key, settings[key]);
    });
    paintPreview();
  }

  function notifyChange() {
    const form = $('editForm');
    if (form) {
      form.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.dispatchEvent(new CustomEvent('appearance:changed', {
      detail: getSettings()
    }));
  }

  function getSettings() {
    return {
      accent: settings.accent,
      background: settings.background,
      pattern: settings.pattern,
      font_pair: settings.font_pair,
      corner_style: settings.corner_style,
      layout_style: settings.layout_style,
      photo_layout: settings.photo_layout
    };
  }

  function loadFromDesk(desk) {
    if (!desk) return;

    // Accent may be stored as hex or as key. Normalise.
    let accentKey = 'forest';
    const rawAccent = desk.accent || '';
    if (rawAccent && rawAccent.startsWith('#')) {
      const found = Object.keys(ACCENT_HEX).find(function (k) {
        return ACCENT_HEX[k].toLowerCase() === rawAccent.toLowerCase();
      });
      accentKey = found || 'forest';
    } else if (ACCENT_HEX[rawAccent]) {
      accentKey = rawAccent;
    }
    settings.accent = accentKey;

    settings.background = BACKGROUND_HEX[desk.background] ? desk.background : 'cream';
    settings.pattern = desk.pattern || 'none';
    settings.font_pair = FONT_STACK[desk.font_pair] ? desk.font_pair : 'modern';
    settings.corner_style = desk.corner_style === 'sharp' ? 'sharp' : 'rounded';
    settings.layout_style = desk.layout_style === 'compact' ? 'compact' : 'spacious';
    settings.photo_layout = ['grid', 'big-first', 'slide', 'mosaic'].indexOf(desk.photo_layout) !== -1
      ? desk.photo_layout
      : 'grid';

    applyAll();
  }

  /* ---------- Tap handling ---------- */
  document.addEventListener('click', function (event) {
    const btn = event.target.closest('[data-group][data-value]');
    if (!btn) return;

    // Only respond to buttons inside the appearance section
    if (!btn.closest('#appearance')) return;

    const group = btn.dataset.group;
    const value = btn.dataset.value;

    const key = Object.keys(GROUPS).find(function (k) {
      return GROUPS[k] === group;
    });
    if (!key) return;

    settings[key] = value;
    paintSelection(key, value);
    paintPreview();
    notifyChange();
  });

  /* ---------- Live preview reacts to name/role typing ---------- */
  const nameInput = $('name');
  const roleInput = $('role');
  if (nameInput) nameInput.addEventListener('input', paintPreview);
  if (roleInput) roleInput.addEventListener('input', paintPreview);

  /* ---------- Public API ---------- */
  window.APPEARANCE = {
    get: getSettings,
    load: loadFromDesk,
    refresh: applyAll
  };

  /* ---------- Initial paint ---------- */
  applyAll();
})();
