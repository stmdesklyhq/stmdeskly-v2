/* =========================================================
   STMDESKLY v2 — Shared Desk renderer
   ========================================================= */
(function () {
  'use strict';

  const DEFAULT_ACCENT = '#01764C';

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
    if (clean.length !== 6) return 'rgba(1,118,76,' + alpha + ')';
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function safeAccent(accent) {
    return /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : DEFAULT_ACCENT;
  }

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
    return 'https://wa.me/' + n + text;
  }

  function telLink(number) { return 'tel:' + String(number || '').replace(/[^\d+]/g, ''); }
  function mailLink(email) { return 'mailto:' + String(email || '').trim(); }

  function normalizeUrl(url) {
    let u = String(url || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }

  function buildSection(eyebrow, bodyHtml) {
    const key = String(eyebrow || '').toLowerCase().replace(/\s+/g, '-');
    return '<
