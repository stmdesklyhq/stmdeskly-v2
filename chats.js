/* =========================================================
   STMDESKLY v2 — Chats inbox
   Pin, archive, mark unread, mute, all five tabs.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const tabsEl         = $('chatsTabs');
  const listEl         = $('chatsList');
  const loadingEl      = $('chatsLoading');
  const emptyEl        = $('chatsEmpty');
  const emptyTitle     = $('chatsEmptyTitle');
  const emptyBody      = $('chatsEmptyBody');
  const searchEl       = $('chatsSearch');
  const clearEl        = $('chatsClear');
  const totalEl        = $('chatsTotal');
  const tabCountUnread = $('tabCountUnread');
  const tabCountReqs   = $('tabCountRequests');

  let me = null;
  let sb = null;
  let allRows = [];
  let currentTab = 'all';
  let currentQuery = '';
  let mutedThreadIds = new Set();
  let pinnedThreadIds = new Set();
  let archivedThreadIds = new Set();
  let forcedUnreadThreadIds = new Set();

  let actionSheet = null;
  let actionThreadId = null;
  let actionOther = null;

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
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();

    if (sameDay) {
      const h = d.getHours();
      const m = d.getMinutes();
      const hh = h % 12 === 0 ? 12 : h % 12;
      const mm = m < 10 ? '0' + m : m;
      return hh + ':' + mm + (h < 12 ? 'am' : 'pm');
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

    const days = Math.floor((now - d) / 86400000);
    if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });

    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  async function loadThreads() {
    const asA = await sb.from('chat_threads').select('*').eq('user_a', me.id);
    const asB = await sb.from('chat_threads').select('*').eq('user_b', me.id);

    const threads = [...(asA.data || []), ...(asB.data || [])]
      .sort((x, y) => new Date(y.last_message_at || 0) - new Date(x.last_message_at || 0));

    if (!threads.length) return [];

    const otherIds = threads.map(t => t.user_a === me.id ? t.user_b : t.user_a);
    const uniqueOtherIds = [...new Set(otherIds)];

    const dRes = await sb
      .from('desks')
      .select('user_id, name, username, avatar_url, role')
      .in('user_id', uniqueOtherIds);

    const deskMap = {};
    if (!dRes.error && dRes.data) {
      dRes.data.forEach(d => { deskMap[d.user_id] = d; });
    }

    const threadIds = threads.map(t => t.id);
    const mRes = await sb
      .from('chat_messages')
      .select('thread_id, body, photo_url, sender_id, created_at, read_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false });

    const lastByThread = {};
    const lastIncomingByThread = {};
    const unreadByThread = {};

    if (!mRes.error && mRes.data) {
      mRes.data.forEach(m => {
        if (!lastByThread[m.thread_id]) lastByThread[m.thread_id] = m;
        if (m.sender_id !== me.id && !lastIncomingByThread[m.thread_id]) lastIncomingByThread[m.thread_id] = m;
        if (!m.read_at && m.sender_id !== me.id) {
          unreadByThread[m.thread_id] = (unreadByThread[m.thread_id] || 0) + 1;
        }
      });
    }

    return threads.map(t => {
      const otherId = t.user_a === me.id ? t.user_b : t.user_a;
      const other = deskMap[otherId] || { name: 'Someone' };
      const forced = forcedUnreadThreadIds.has(t.id);
      const realUnread = unreadByThread[t.id] || 0;

      return {
        thread: t,
        other,
        lastMessage: lastByThread[t.id],
        lastIncoming: lastIncomingByThread[t.id],
        unread: realUnread,
        forcedUnread: forced,
        muted: mutedThreadIds.has(t.id),
        pinned: pinnedThreadIds.has(t.id),
        archived: archivedThreadIds.has(t.id)
      };
    });
  }

  function applyFilters(rows) {
    let out = rows;

    if (currentTab === 'archived') {
      out = out.filter(r => r.archived);
    } else {
      out = out.filter(r => !r.archived);
    }

    if (currentTab === 'unread') {
      out = out.filter(r => r.unread > 0 || r.forcedUnread);
    } else if (currentTab === 'requests') {
      out = out.filter(r => r.thread.status === 'pending');
    }

    if (currentQuery) {
      const q = currentQuery.toLowerCase();
      out = out.filter(r => {
        const name = String(r.other.name || '').toLowerCase();
        const role = String(r.other.role || '').toLowerCase();
        const body = r.lastMessage && r.lastMessage.body
          ? r.lastMessage.body.toLowerCase()
          : '';
        return name.includes(q) || role.includes(q) || body.includes(q);
      });
    }

    out.sort(function (a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (b.pinned && !a.pinned) return 1;
      const ta = new Date(a.thread.last_message_at || 0).getTime();
      const tb = new Date(b.thread.last_message_at || 0).getTime();
      return tb - ta;
    });

    return out;
  }

  function rowHtml(row) {
    const other = row.other;
    const t = row.thread;
    const isPending = t.status === 'pending';
    const waitingOnMe = isPending && t.initiated_by && t.initiated_by !== me.id;
    const isUnread = (row.unread > 0 || row.forcedUnread) && !isPending;

    const avatarInner = other.avatar_url
      ? '<img src="' + esc(other.avatar_url) + '" alt="">'
      : esc(initials(other.name));

    const dot = isUnread
      ? '<span class="chat-row-unread-dot" aria-hidden="true"></span>'
      : '';

    let badge = '';
    let preview = '';

    if (isPending) {
      badge = waitingOnMe
        ? '<span class="chat-row-badge">Request</span>'
        : '<span class="chat-row-badge">Pending</span>';
      preview = waitingOnMe
        ? 'Wants to chat with you.'
        : 'Waiting for them to accept.';
    } else if (row.unread > 0 && row.lastIncoming) {
      const lm = row.lastIncoming;
      const who = other.name ? esc(String(other.name).split(/\s+/)[0]) : 'Them';
      const body = lm.body ? esc(lm.body) : '📷 Photo';
      preview = '<span class="chat-row-from">' + who + ':</span> ' + body;
    } else if (row.lastMessage) {
      const lm = row.lastMessage;
      const who = lm.sender_id === me.id ? '<strong>You:</strong> ' : '';
      const body = lm.body ? esc(lm.body) : '📷 Photo';
      preview = who + body;
    } else {
      preview = 'Say hi 👋';
    }

    const cls = 'chat-row' +
      (isPending ? ' is-pending' : '') +
      (isUnread ? ' is-unread' : '') +
      (row.muted ? ' is-muted' : '') +
      (row.pinned ? ' is-pinned' : '');

    const rightBadge = (isUnread && row.unread > 0)
      ? '<span class="chat-row-count">' + (row.unread > 9 ? '9+' : String(row.unread)) + '</span>'
      : (isUnread && row.forcedUnread
        ? '<span class="chat-row-count">•</span>'
        : '');

    const muteMark = row.muted
      ? '<span class="chat-row-muted" aria-label="Muted">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>' +
            '<path d="M10 21h4"/>' +
          '</svg>' +
        '</span>'
      : '';

    const pinMark = row.pinned
      ? '<span class="chat-row-pinned" aria-label="Pinned">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 17v5"/>' +
            '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/>' +
          '</svg>' +
        '</span>'
      : '';

    return '<a class="' + cls + '" href="/chat.html?id=' + encodeURIComponent(t.id) + '" data-thread-id="' + esc(t.id) + '">' +
      '<span class="chat-row-avatar">' +
        '<span class="chat-row-avatar-img">' + avatarInner + '</span>' +
        dot +
      '</span>' +
      '<span class="chat-row-copy">' +
        '<span class="chat-row-top">' +
          '<span class="chat-row-name">' + esc(other.name || 'Someone') + '</span>' +
          badge +
        '</span>' +
        '<span class="chat-row-preview">' + preview + '</span>' +
      '</span>' +
      '<span class="chat-row-right">' +
        '<span class="chat-row-time">' + esc(timeShort(t.last_message_at)) + '</span>' +
        pinMark +
        muteMark +
        rightBadge +
      '</span>' +
    '</a>';
  }

  function render() {
    const filtered = applyFilters(allRows);

    listEl.querySelectorAll('.chat-row').forEach(n => n.remove());

    if (!filtered.length) {
      emptyEl.hidden = false;
      if (currentQuery) {
        emptyTitle.textContent = 'No chats found';
        emptyBody.textContent = 'Try a different word.';
      } else if (currentTab === 'requests') {
        emptyTitle.textContent = 'No requests';
        emptyBody.textContent = 'When someone wants to chat, it lands here.';
      } else if (currentTab === 'unread') {
        emptyTitle.textContent = 'All caught up';
        emptyBody.textContent = 'Nothing unread.';
      } else if (currentTab === 'archived') {
        emptyTitle.textContent = 'No archived chats';
        emptyBody.textContent = 'Long-press a chat and tap Archive to hide it here.';
      } else {
        emptyTitle.textContent = 'No chats yet';
        emptyBody.textContent = 'Find someone on Explore and tap Chat on their profile.';
      }
      return;
    }

    emptyEl.hidden = true;

    const frag = document.createDocumentFragment();
    filtered.forEach(r => {
      const wrap = document.createElement('div');
      wrap.innerHTML = rowHtml(r);
      frag.appendChild(wrap.firstChild);
    });
    listEl.appendChild(frag);
  }

  function paintCounts() {
    const unread = allRows.filter(r =>
      !r.archived && (r.unread > 0 || r.forcedUnread) && r.thread.status !== 'pending' && !r.muted
    ).length;
    const requests = allRows.filter(r =>
      !r.archived && r.thread.status === 'pending' && r.thread.initiated_by !== me.id
    ).length;

    if (unread > 0) {
      if (tabCountUnread) { tabCountUnread.hidden = false; tabCountUnread.textContent = unread > 9 ? '9+' : String(unread); }
      if (totalEl) { totalEl.hidden = false; totalEl.textContent = unread > 9 ? '9+' : String(unread); }
    } else {
      if (tabCountUnread) tabCountUnread.hidden = true;
      if (totalEl) totalEl.hidden = true;
    }

    if (requests > 0) {
      if (tabCountReqs) { tabCountReqs.hidden = false; tabCountReqs.textContent = requests > 9 ? '9+' : String(requests); }
    } else {
      if (tabCountReqs) tabCountReqs.hidden = true;
    }
  }

  async function refresh() {
    try {
      mutedThreadIds = new Set();
      try {
        const m = await AUTH.getMutedThreads();
        if (m.ok) mutedThreadIds = new Set(m.data);
      } catch (e) {}

      pinnedThreadIds = new Set();
      try {
        const p = await AUTH.getPinnedThreads();
        if (p.ok) pinnedThreadIds = new Set(p.data.map(function (r) { return r.thread_id; }));
      } catch (e) {}

      archivedThreadIds = new Set();
      try {
        const a = await AUTH.getArchivedThreads();
        if (a.ok) archivedThreadIds = new Set(a.data);
      } catch (e) {}

      forcedUnreadThreadIds = new Set();
      try {
        const u = await AUTH.getForcedUnreadThreads();
        if (u.ok) forcedUnreadThreadIds = new Set(u.data);
      } catch (e) {}

      allRows = await loadThreads();
      loadingEl.hidden = true;
      paintCounts();
      render();

      AUTH.markMessagesDelivered();
    } catch (err) {
      console.warn('refresh:', err);
      loadingEl.hidden = true;
      emptyEl.hidden = false;
      emptyTitle.textContent = 'Could not load chats';
      emptyBody.textContent = 'Pull down to try again.';
    }
  }

  /* ---------- Action sheet ---------- */

  function buildActionSheet() {
    if (actionSheet) return actionSheet;

    const overlay = document.createElement('div');
    overlay.className = 'chat-action-overlay';
    overlay.hidden = true;

    const sheet = document.createElement('div');
    sheet.className = 'chat-action-sheet';

    sheet.innerHTML =
      '<div class="chat-action-head"><span id="actionName">Chat</span></div>' +
      '<button type="button" class="chat-action-row" data-do="pin">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>' +
        '<span id="pinLabel">Pin</span>' +
      '</button>' +
      '<button type="button" class="chat-action-row" data-do="unread">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>' +
        '<span id="unreadLabel">Mark as unread</span>' +
      '</button>' +
      '<button type="button" class="chat-action-row" data-do="archive">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>' +
        '<span id="archiveLabel">Archive</span>' +
      '</button>' +
      '<button type="button" class="chat-action-row danger" data-do="mute">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>' +
        '<span id="muteLabel">Mute</span>' +
      '</button>';

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeActionSheet();
    });

    sheet.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-do]');
      if (!btn || !actionThreadId) return;
      const action = btn.dataset.do;
      await runRowAction(action);
    });

    actionSheet = { overlay, sheet };
    return actionSheet;
  }

  function openActionSheet(threadId, other) {
    const s = buildActionSheet();
    actionThreadId = threadId;
    actionOther = other;

    const row = allRows.find(function (r) { return r.thread.id === threadId; });
    if (!row) return;

    s.sheet.querySelector('#actionName').textContent = other.name || 'Chat';
    s.sheet.querySelector('#pinLabel').textContent = row.pinned ? 'Unpin' : 'Pin';
    s.sheet.querySelector('#unreadLabel').textContent =
      (row.unread > 0 || row.forcedUnread) ? 'Mark as read' : 'Mark as unread';
    s.sheet.querySelector('#archiveLabel').textContent = row.archived ? 'Unarchive' : 'Archive';
    s.sheet.querySelector('#muteLabel').textContent = row.muted ? 'Unmute' : 'Mute';

    s.overlay.hidden = false;
  }

  function closeActionSheet() {
    if (actionSheet) actionSheet.overlay.hidden = true;
    actionThreadId = null;
    actionOther = null;
  }

  async function runRowAction(action) {
    const row = allRows.find(function (r) { return r.thread.id === actionThreadId; });
    if (!row) { closeActionSheet(); return; }

    if (action === 'pin') {
      const res = row.pinned
        ? await AUTH.unpinThread(actionThreadId)
        : await AUTH.pinThread(actionThreadId);
      if (!res.ok) { alert('Could not update pin.'); closeActionSheet(); return; }
    } else if (action === 'unread') {
      const wasUnread = (row.unread > 0 || row.forcedUnread);
      if (wasUnread) {
        await AUTH.clearThreadUnread(actionThreadId);
        await AUTH.markMessagesRead(actionThreadId);
      } else {
        await AUTH.markThreadUnread(actionThreadId);
      }
    } else if (action === 'archive') {
      const res = row.archived
        ? await AUTH.unarchiveThread(actionThreadId)
        : await AUTH.archiveThread(actionThreadId);
      if (!res.ok) { alert('Could not update archive.'); closeActionSheet(); return; }
    } else if (action === 'mute') {
      const res = row.muted
        ? await AUTH.unmuteThread(actionThreadId)
        : await AUTH.muteThread(actionThreadId);
      if (!res.ok) { alert('Could not update mute.'); closeActionSheet(); return; }
    }

    closeActionSheet();
    await refresh();
  }

  /* ---------- Long press on rows ---------- */

  let rowTouchTimer = null;
  let rowTouchStart = null;

  listEl.addEventListener('touchstart', function (e) {
    const row = e.target.closest('.chat-row');
    if (!row) return;
    rowTouchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    rowTouchTimer = setTimeout(function () {
      const threadId = row.dataset.threadId;
      const data = allRows.find(function (r) { return r.thread.id === threadId; });
      if (data) openActionSheet(threadId, data.other);
      rowTouchTimer = null;
    }, 500);
  }, { passive: true });

  listEl.addEventListener('touchmove', function (e) {
    if (!rowTouchStart) return;
    const dx = Math.abs(e.touches[0].clientX - rowTouchStart.x);
    const dy = Math.abs(e.touches[0].clientY - rowTouchStart.y);
    if (dx > 8 || dy > 8) {
      if (rowTouchTimer) { clearTimeout(rowTouchTimer); rowTouchTimer = null; }
    }
  }, { passive: true });

  listEl.addEventListener('touchend', function () {
    if (rowTouchTimer) { clearTimeout(rowTouchTimer); rowTouchTimer = null; }
    rowTouchStart = null;
  });

  listEl.addEventListener('contextmenu', function (e) {
    const row = e.target.closest('.chat-row');
    if (!row) return;
    e.preventDefault();
    const threadId = row.dataset.threadId;
    const data = allRows.find(function (r) { return r.thread.id === threadId; });
    if (data) openActionSheet(threadId, data.other);
  });

  tabsEl.addEventListener('click', e => {
    const tab = e.target.closest('.chats-tab');
    if (!tab) return;
    const t = tab.dataset.tab;
    if (t === currentTab) return;

    currentTab = t;
    tabsEl.querySelectorAll('.chats-tab').forEach(c => {
      const on = c.dataset.tab === t;
      c.classList.toggle('is-current', on);
      c.setAttribute('aria-pressed', String(on));
    });
    render();
  });

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      currentQuery = searchEl.value.trim();
      if (clearEl) clearEl.hidden = !currentQuery;
      render();
    });
  }

  if (clearEl) {
    clearEl.addEventListener('click', () => {
      searchEl.value = '';
      currentQuery = '';
      clearEl.hidden = true;
      render();
    });
  }

  (async function boot() {
    me = await AUTH.currentUser();
    if (!me) { location.replace('/login.html'); return; }
    sb = AUTH.sb;
    await refresh();

    setInterval(refresh, 8000);
  })();
})();
