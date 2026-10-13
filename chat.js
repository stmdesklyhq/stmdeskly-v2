/* =========================================================
   STMDESKLY v2 — Inbox list
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const filtersEl      = $('chatsFilters');
  const listEl         = $('chatsList');
  const loadingEl      = $('chatsLoading');
  const emptyEl        = $('chatsEmpty');
  const emptyTitle     = $('chatsEmptyTitle');
  const emptyBody      = $('chatsEmptyBody');
  const inboxBadge     = $('inboxBadge');
  const requestsBadge  = $('requestsBadge');

  let me = null;
  let sb = null;
  let allRows = [];
  let currentFilter = 'all';

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeShort(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - then) / 1000));
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  /* ---------- Load threads ---------- */

  async function loadThreads() {
    // Two clean queries — more reliable than .or() with UUIDs
    const asA = await sb
      .from('chat_threads')
      .select('*')
      .eq('user_a', me.id);

    const asB = await sb
      .from('chat_threads')
      .select('*')
      .eq('user_b', me.id);

    if (asA.error) { console.warn('threads asA:', asA.error); }
    if (asB.error) { console.warn('threads asB:', asB.error); }

    const threads = [...(asA.data || []), ...(asB.data || [])]
      .sort(function (x, y) {
        return new Date(y.last_message_at || 0) - new Date(x.last_message_at || 0);
      });

    if (!threads.length) return [];

    // Other user ids
    const otherIds = threads.map(function (t) {
      return t.user_a === me.id ? t.user_b : t.user_a;
    });
    const uniqueOtherIds = [...new Set(otherIds)];

    // Fetch other users' desk info
    const dRes = await sb
      .from('desks')
      .select('user_id, name, username, avatar_url, role')
      .in('user_id', uniqueOtherIds);

    const deskMap = {};
    if (!dRes.error && dRes.data) {
      dRes.data.forEach(function (d) { deskMap[d.user_id] = d; });
    }

    // Fetch last message per thread
    const threadIds = threads.map(function (t) { return t.id; });
    const mRes = await sb
      .from('chat_messages')
      .select('thread_id, body, photo_url, sender_id, created_at, read_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false });

    const lastByThread = {};
    const unreadByThread = {};

    if (!mRes.error && mRes.data) {
      mRes.data.forEach(function (m) {
        if (!lastByThread[m.thread_id]) lastByThread[m.thread_id] = m;
        if (!m.read_at && m.sender_id !== me.id) {
          unreadByThread[m.thread_id] = (unreadByThread[m.thread_id] || 0) + 1;
        }
      });
    }

    return threads.map(function (t) {
      const otherId = t.user_a === me.id ? t.user_b : t.user_a;
      const other = deskMap[otherId] || { name: 'Someone' };
      const lastMsg = lastByThread[t.id];
      const unread = unreadByThread[t.id] || 0;
      return {
        thread: t,
        other: other,
        lastMessage: lastMsg,
        unread: unread
      };
    });
  }

  /* ---------- Render ---------- */

  function rowHtml(row) {
    const other = row.other;
    const t = row.thread;
    const isPending = t.status === 'pending';
    const waitingOnMe = isPending && t.initiated_by && t.initiated_by !== me.id;

    const avatar = other.avatar_url
      ? '<img src="' + esc(other.avatar_url) + '" alt="">'
      : esc(initials(other.name));

    const dot = (row.unread > 0 && !isPending)
      ? '<span class="chat-row-dot" aria-hidden="true"></span>'
      : '';

    let previewHtml = '';
    let tag = '';

    if (isPending) {
      tag = waitingOnMe
        ? '<span class="chat-row-tag">Request</span>'
        : '<span class="chat-row-tag">Pending</span>';
      previewHtml = waitingOnMe
        ? 'Wants to chat with you.'
        : 'Waiting for them to accept.';
    } else if (row.lastMessage) {
      const lm = row.lastMessage;
      const who = lm.sender_id === me.id ? 'You: ' : '';
      const body = lm.body ? esc(lm.body) : '📷 Photo';
      previewHtml = who + body;
    } else {
      previewHtml = 'Say hi 👋';
    }

    const badge = (row.unread > 0 && !isPending)
      ? '<span class="chat-row-badge">' + row.unread + '</span>'
      : '';

    const cls = 'chat-row' + (isPending ? ' is-pending' : '');

    return '<a class="' + cls + '" href="/chat.html?id=' + encodeURIComponent(t.id) + '">' +
      '<span class="chat-row-avatar">' + avatar + dot + '</span>' +
      '<span class="chat-row-copy">' +
        '<span class="chat-row-name">' + esc(other.name || 'Someone') + '</span>' +
        '<span class="chat-row-preview">' + tag + previewHtml + '</span>' +
      '</span>' +
      '<span class="chat-row-meta">' +
        '<span class="chat-row-time">' + esc(timeShort(t.last_message_at)) + '</span>' +
        badge +
      '</span>' +
    '</a>';
  }

  function applyFilter() {
    let rows = allRows;

    if (currentFilter === 'inbox') {
      rows = allRows.filter(function (r) { return r.thread.status === 'accepted'; });
    } else if (currentFilter === 'requests') {
      rows = allRows.filter(function (r) { return r.thread.status === 'pending'; });
    }

    listEl.querySelectorAll('.chat-row').forEach(function (n) { n.remove(); });

    if (!rows.length) {
      emptyEl.hidden = false;
      if (currentFilter === 'requests') {
        emptyTitle.textContent = 'No pending requests.';
        emptyBody.textContent = 'Requests you receive or send will show here.';
      } else if (currentFilter === 'inbox') {
        emptyTitle.textContent = 'Your inbox is empty.';
        emptyBody.textContent = 'Start a chat from someone\'s profile.';
      } else {
        emptyTitle.textContent = 'No conversations yet.';
        emptyBody.textContent = 'Open someone\'s profile and tap Chat to start one.';
      }
      return;
    }
    emptyEl.hidden = true;

    const frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      const wrap = document.createElement('div');
      wrap.innerHTML = rowHtml(r);
      frag.appendChild(wrap.firstChild);
    });
    listEl.appendChild(frag);
  }

  function paintBadges() {
    const requestsCount = allRows.filter(function (r) {
      return r.thread.status === 'pending' && r.thread.initiated_by !== me.id;
    }).length;

    const unreadTotal = allRows.reduce(function (sum, r) { return sum + (r.unread || 0); }, 0);

    if (requestsCount > 0) {
      requestsBadge.hidden = false;
      requestsBadge.textContent = requestsCount > 9 ? '9+' : String(requestsCount);
    } else {
      requestsBadge.hidden = true;
    }

    if (unreadTotal > 0) {
      inboxBadge.hidden = false;
      inboxBadge.textContent = unreadTotal > 9 ? '9+' : String(unreadTotal);
    } else {
      inboxBadge.hidden = true;
    }
  }

  async function refresh() {
    try {
      loadingEl.hidden = false;
      allRows = await loadThreads();
      loadingEl.hidden = true;
      paintBadges();
      applyFilter();
    } catch (err) {
      loadingEl.hidden = true;
      console.warn('refresh error:', err);
    }
  }

  /* ---------- Events ---------- */

  filtersEl.addEventListener('click', function (e) {
    const chip = e.target.closest('.chats-chip');
    if (!chip) return;
    const filter = chip.dataset.filter;
    if (filter === currentFilter) return;
    currentFilter = filter;
    filtersEl.querySelectorAll('.chats-chip').forEach(function (c) {
      const on = c.dataset.filter === filter;
      c.classList.toggle('is-current', on);
      c.setAttribute('aria-pressed', String(on));
    });
    applyFilter();
  });

  /* ---------- Boot ---------- */

  (async function boot() {
    me = await AUTH.currentUser();
    if (!me) { location.replace('/login.html'); return; }
    sb = AUTH.sb;
    await refresh();

    setInterval(refresh, 8000);
  })();
})();
