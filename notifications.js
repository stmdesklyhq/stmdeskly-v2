/* notifications.js — v1 — 15 Oct 2026 */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const loadingEl = $('loading');
  const listEl    = $('list');
  const emptyEl   = $('empty');
  const olderEl   = $('older');
  const topbar    = $('topbar');

  let lastSeen = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function isNew(iso) {
    if (!lastSeen) return true;
    return new Date(iso).getTime() > new Date(lastSeen).getTime();
  }

  function avatarHtml(actor) {
    if (actor && actor.avatar_url) {
      return '<span class="row-avatar"><img src="' + esc(actor.avatar_url) + '" alt=""></span>';
    }
    return '<span class="row-avatar">' + esc(initials(actor && actor.name)) + '</span>';
  }

  /* ---------- Row shapes ---------- */

  function rowChatRequest(item) {
    const name = (item.actor && item.actor.name) || 'Someone';
    return {
      href: '/chat.html?id=' + encodeURIComponent(item.thread_id),
      isNew: isNew(item.created_at),
      html:
        avatarHtml(item.actor) +
        '<div class="row-text"><b>' + esc(name) + '</b> started a chat with you</div>' +
        '<span class="row-time">' + esc(timeAgo(item.created_at)) + '</span>'
    };
  }

  function rowLike(item) {
    const name = (item.actor && item.actor.name) || 'Someone';
    return {
      href: '/home.html#post-' + encodeURIComponent(item.post_id),
      isNew: isNew(item.created_at),
      html:
        avatarHtml(item.actor) +
        '<div class="row-text"><b>' + esc(name) + '</b> liked your post</div>' +
        '<span class="row-time">' + esc(timeAgo(item.created_at)) + '</span>'
    };
  }

  function rowReply(item) {
    const name = (item.actor && item.actor.name) || 'Someone';
    return {
      href: '/home.html#post-' + encodeURIComponent(item.post_id),
      isNew: isNew(item.created_at),
      html:
        avatarHtml(item.actor) +
        '<div class="row-text"><b>' + esc(name) + '</b> replied to your post</div>' +
        '<span class="row-time">' + esc(timeAgo(item.created_at)) + '</span>'
    };
  }

  /* ---------- Section ---------- */

  function section(label, rows, rowFn) {
    if (!rows || !rows.length) return '';

    const body = rows.map(function (item) {
      const r = rowFn(item);
      return '<a class="row' + (r.isNew ? ' is-new' : '') + '" href="' + esc(r.href) + '">' +
        r.html +
      '</a>';
    }).join('');

    return '<section class="section">' +
      '<div class="section-label">' + esc(label) + '</div>' +
      '<div class="rows">' + body + '</div>' +
    '</section>';
  }

  /* ---------- Boot ---------- */

  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }

    // Snapshot last_seen BEFORE we clear it, so the dots still render this visit
    const desk = await AUTH.currentDesk();
    lastSeen = (desk && desk.last_seen_notifications_at) || null;

    const res = await AUTH.getNotifications();

    loadingEl.hidden = true;

    if (!res.ok) {
      loadingEl.hidden = false;
      loadingEl.textContent = 'Could not load notifications.';
      return;
    }

    const data = res.data || {};
    const chatRequests = data.chatRequests || [];
    const likes        = data.likes || [];
    const replies      = data.replies || [];
    const total = chatRequests.length + likes.length + replies.length;

    if (!total) {
      emptyEl.hidden = false;
    } else {
      listEl.innerHTML =
        section('Chat requests', chatRequests, rowChatRequest) +
        section('Likes',         likes,        rowLike) +
        section('Replies',       replies,      rowReply);
      listEl.hidden = false;
      if (data.truncated) olderEl.hidden = false;
    }

    // Clear unread state now that the page is open
    AUTH.markNotificationsSeen().catch(function () {});
  })();

  /* ---------- Topbar scroll-hide ---------- */

  (function () {
    let lastY = 0;
    let ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        if (y > 24 && y > lastY) topbar.classList.add('is-hidden');
        else topbar.classList.remove('is-hidden');
        lastY = y;
        ticking = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true });
  })();
})();
