(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
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

  const accents = {
    forest: '#2F6D50',
    emerald: '#087F5B',
    blue: '#2458A6',
    red: '#B93D45',
    terracotta: '#B85C38',
    plum: '#79518D',
    amber: '#A66A13',
    charcoal: '#34424A'
  };

  const backgrounds = {
    cream: '#F7F6F1',
    white: '#FFFFFF',
    'warm-grey': '#F0EEEA',
    'cool-grey': '#EEF1F3'
  };

  const fonts = {
    modern: '"Poppins", sans-serif',
    classic: 'Georgia, serif',
    editorial: '"Playfair Display", Georgia, serif',
    friendly: '"Trebuchet MS", sans-serif'
  };

  const labels = {
    accent: 'accentSelection',
    background: 'backgroundSelection',
    pattern: 'patternSelection',
    font_pair: 'fontSelection',
    corner_style: 'cornersSelection',
    layout_style: 'layoutSelection',
    photo_layout: 'photoLayoutSelection'
  };

  const groups = {
    accent: 'accent',
    background: 'background',
    pattern: 'pattern',
    font_pair: 'font',
    corner_style: 'corners',
    layout_style: 'layout',
    photo_layout: 'photo-layout'
  };

  function selectControl(key, value) {
    const group = groups[key];

    document.querySelectorAll('[data-group="' + group + '"]')
      .forEach((button) => {
        const selected = button.dataset.value === value;

        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });

    const label = $(labels[key]);

    if (label) {
      const selectedButton = document.querySelector(
        '[data-group="' + group + '"][data-value="' + value + '"]'
      );

      label.textContent = selectedButton
        ? selectedButton.getAttribute('aria-label') ||
          selectedButton.textContent.trim()
        : value;
    }
  }

  function applyPreview() {
    preview.dataset.accent = settings.accent;
    preview.dataset.background = settings.background;
    preview.dataset.pattern = settings.pattern;
    preview.dataset.font = settings.font_pair;
    preview.dataset.corners = settings.corner_style;
    preview.dataset.layout = settings.layout_style;
    preview.dataset.photoLayout = settings.photo_layout;

    preview.style.setProperty(
      '--appearance-accent',
      accents[settings.accent] || accents.forest
    );

    preview.style.setProperty(
      '--appearance-background',
      backgrounds[settings.background] || backgrounds.cream
    );

    preview.style.setProperty(
      '--appearance-font',
      fonts[settings.font_pair] || fonts.modern
    );

    const name = $('appearancePreviewName');

    if (name) {
      name.style.fontFamily =
        fonts[settings.font_pair] || fonts.modern;

      name.style.color =
        accents[settings.accent] || accents.forest;
    }

    document.querySelectorAll('[data-preview-name]')
      .forEach((sample) => {
        sample.style.fontFamily =
          fonts[sample.closest('[data-group="font"]')?.dataset.value] ||
          fonts.modern;
      });

    Object.entries(settings).forEach(([key, value]) => {
      selectControl(key, value);
    });
  }

  function loadSettings(desk) {
    if (!desk) return;

    let accent = desk.accent || '#2F6D50';

    if (accent.startsWith('#')) {
      const match = Object.entries(accents).find(
        ([, hex]) => hex.toLowerCase() === accent.toLowerCase()
      );

      accent = match ? match[0] : 'forest';
    }

    settings.accent = accents[accent] ? accent : 'forest';
    settings.background = backgrounds[desk.background]
      ? desk.background : 'cream';

    settings.pattern = desk.pattern || 'none';
    settings.font_pair = fonts[desk.font_pair]
      ? desk.font_pair : 'modern';

    settings.corner_style =
      desk.corner_style === 'sharp' ? 'sharp' : 'rounded';

    settings.layout_style =
      desk.layout_style === 'compact' ? 'compact' : 'spacious';

    settings.photo_layout = [
      'grid', 'big-first', 'slide', 'mosaic'
    ].includes(desk.photo_layout)
      ? desk.photo_layout
      : 'grid';

    applyPreview();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-group][data-value]');

    if (!button || !preview.contains(button.closest('.appearance-controls'))) {
      return;
    }

    const group = button.dataset.group;
    const value = button.dataset.value;

    const key = Object.keys(groups).find(
      (settingKey) => groups[settingKey] === group
    );

    if (!key) return;

    settings[key] = value;
    applyPreview();

    // Let the existing editor know a change occurred.
    const form = $('editForm') || document.querySelector('form');

    if (form) {
      form.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('change', { bubbles: true }));
    }

    window.dispatchEvent(new CustomEvent('appearance:changed', {
      detail: { ...settings }
    }));
  });

  // Other editor code can read the current settings.
  window.STMDesklyAppearance = {
    getSettings() {
      return {
        ...settings,
        accent: accents[settings.accent] || accents.forest
      };
    },

    loadSettings,
    applyPreview
  };

  applyPreview();

  // Load saved settings once the existing editor has authenticated
  // and populated its desk data.
  let attempts = 0;

  const loader = setInterval(() => {
    attempts++;

    const desk =
      window.AUTH?.currentDesk ||
      window.currentDesk ||
      window.desk;

    if (desk) {
      loadSettings(desk);
      clearInterval(loader);
    }

    if (attempts >= 40) {
      clearInterval(loader);
    }
  }, 250);
})();
