/* =========================================================
   STMDESKLY v2 — Chats inbox
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

  /* ---------- Load ---------- */

  async function loadThreads() {
    const asA = await sb.from('chat_threads').select('*').eq('user_a', me.id);
    const asB = await sb.from('chat_threads').select('*').eq('user_b', me.id);

    if (asA.error) console.warn('threadsA:', asA.error);
    if (asB.error) console.warn('threadsB:', asB.error);

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
        if (!lastByThread[m.thread_id]) {
          lastByThread[m.thread_id] = m;
        }
        if (m.sender_id !== me.id && !lastIncomingByThread[m.thread_id]) {
          lastIncomingByThread[m.thread_id] = m;
        }
        if (!m.read_at && m.sender_id !== me.id) {
          unreadByThread[m.thread_id] = (unreadByThread[m.thread_id] || 0) + 1;
        }
      });
    }

    return threads.map(t => {
      const otherId = t.user_a === me.id ? t.user_b : t.user_a;
      const other = deskMap[otherId] || { name: 'Someone' };
      return {
        thread: t,
        other,
        lastMessage: lastByThread[t.id],
        lastIncoming: lastIncomingByThread[t.id],
        unread: unreadByThread[t.id] || 0,
        muted: mutedThreadIds.has(t.id)
      };
    });
  }

  /* ---------- Filter ---------- */

  function applyFilters(rows) {
    let out = rows;

    if (currentTab === 'unread') {
      out = out.filter(r => r.unread > 0);
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

    return out;
  }

  /* ---------- Render ---------- */

  function rowHtml(row) {
    const other = row.other;
    const t = row.thread;
    const isPending = t.status === 'pending';
    const waitingOnMe = isPending && t.initiated_by && t.initiated_by !== me.id;
    const isUnread = row.unread > 0 && !isPending;

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
    } else if (isUnread && row.lastIncoming) {
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
      (row.muted ? ' is-muted' : '');

    const rightBadge = isUnread
      ? '<span class="chat-row-count">' +
          (row.unread > 9 ? '9+' : String(row.unread)) +
        '</span>'
      : '';

    const muteMark = row.muted
      ? '<span class="chat-row-muted" aria-label="Muted">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>' +
            '<path d="M10 21h4"/>' +
            '<line x1="3" y1="3" x2="21" y2="21"/>' +
          '</svg>' +
        '</span>'
      : '';

    return '<a class="' + cls + '" href="/chat.html?id=' + encodeURIComponent(t.id) + '">' +
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
      r.unread > 0 && r.thread.status !== 'pending' && !r.muted
    ).length;
    const requests = allRows.filter(r =>
      r.thread.status === 'pending' && r.thread.initiated_by !== me.id
    ).length;

    if (unread > 0) {
      tabCountUnread.hidden = false;
      tabCountUnread.textContent = unread > 9 ? '9+' : String(unread);
      totalEl.hidden = false;
      totalEl.textContent = unread > 9 ? '9+' : String(unread);
    } else {
      tabCountUnread.hidden = true;
      totalEl.hidden = true;
    }

    if (requests > 0) {
      tabCountReqs.hidden = false;
      tabCountReqs.textContent = requests > 9 ? '9+' : String(requests);
    } else {
      tabCountReqs.hidden = true;
    }
  }

  async function refresh() {
    try {
      mutedThreadIds = new Set();
      try {
        const m = await AUTH.getMutedThreads();
        if (m.ok) mutedThreadIds = new Set(m.data);
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

  /* ---------- Events ---------- */

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

  searchEl.addEventListener('input', () => {
    currentQuery = searchEl.value.trim();
    clearEl.hidden = !currentQuery;
    render();
  });

  clearEl.addEventListener('click', () => {
    searchEl.value = '';
    currentQuery = '';
    clearEl.hidden = true;
    render();
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
