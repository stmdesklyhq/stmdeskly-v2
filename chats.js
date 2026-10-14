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
            '<path d="M10 21h4"/>'
