/* =========================================================
   STMDESKLY v2 — Single chat
   Opens from ?to=USER_ID (starts a thread) or ?id=THREAD_ID
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const chatHead        = $('chatHead');
  const chatAvatar      = $('chatAvatar');
  const chatName        = $('chatName');
  const chatStatus      = $('chatStatus');
  const chatMenu        = $('chatMenu');
  const chatMenuPanel   = $('chatMenuPanel');
  const menuViewProfile = $('menuViewProfile');
  const menuOpenDesk    = $('menuOpenDesk');
  const acceptBar       = $('acceptBar');
  const acceptPreview   = $('acceptPreview');
  const acceptBtn       = $('acceptBtn');
  const declineBtn      = $('declineBtn');
  const pendingBar      = $('pendingBar');
  const chatMissing     = $('chatMissing');
  const chatLog         = $('chatLog');
  const chatComposer    = $('chatComposer');
  const chatInput       = $('chatInput');
  const sendBtn         = $('sendBtn');

  let me = null;
  let thread = null;
  let other = null;
  let pollTimer = null;
  let lastMessageId = null;

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
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes();
    const hh = h % 12 === 0 ? 12 : h % 12;
    const mm = m < 10 ? '0' + m : m;
    return hh + ':' + mm + (h < 12 ? 'am' : 'pm');
  }

  function dayLabel(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    const days = Math.floor((now - d) / 86400000);
    if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ---------- Header ---------- */

  function paintHeader() {
    if (!other) return;

    chatAvatar.innerHTML = other.avatar_url
      ? '<img src="' + esc(other.avatar_url) + '" alt="">'
      : esc(initials(other.name));

    chatName.textContent = other.name || 'Someone';
    chatStatus.textContent = other.role || '';

    const profileUrl = other.username
      ? '/profile.html?u=' + encodeURIComponent(other.username)
      : '#';
    const deskUrl = other.username
      ? '/u/' + encodeURIComponent(other.username)
      : '#';

    chatHead.href = profileUrl;
    menuViewProfile.href = profileUrl;
    menuOpenDesk.href = deskUrl;
  }

  /* ---------- Banners ---------- */

  function paintBanners() {
    if (!thread) return;
    const isRecipient = thread.initiated_by && thread.initiated_by !== me.id;

    if (thread.status === 'pending') {
      if (isRecipient) {
        acceptBar.hidden = false;
        pendingBar.hidden = true;
        chatComposer.hidden = true;
        chatLog.hidden = false;
      } else {
        acceptBar.hidden = true;
        pendingBar.hidden = false;
        chatComposer.hidden = true;
        chatLog.hidden = false;
      }
      return;
    }

    if (thread.status === 'accepted') {
      acceptBar.hidden = true;
      pendingBar.hidden = true;
      chatComposer.hidden = false;
      chatLog.hidden = false;
      return;
    }

    // declined / blocked / anything else
    acceptBar.hidden = true;
    pendingBar.hidden = false;
    pendingBar.innerHTML = '<span>This conversation is closed.</span>';
    chatComposer.hidden = true;
    chatLog.hidden = false;
  }

  /* ---------- Messages ---------- */

  function renderMessages(messages) {
    if (!messages.length) {
      chatLog.innerHTML = '<div class="chat-intro">Say hi 👋 — this is the start of your chat.</div>';
      return;
    }

    let lastDay = '';
    const html = messages.map(function (m) {
      const day = dayLabel(m.created_at);
      let divider = '';
      if (day !== lastDay) {
        divider = '<div class="chat-day">' + esc(day) + '</div>';
        lastDay = day;
      }

      const mine = m.sender_id === me.id;
      const cls = mine ? 'me' : 'them';
      const wrapCls = mine ? 'chat-row mine' : 'chat-row theirs';

      const time = timeShort(m.created_at);

      let tick = '';
      if (mine) {
        const read = !!m.read_at;
        tick = '<span class="tick' + (read ? ' read' : '') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="m1 12 5 5L17 6"/>' +
            (read ? '<path d="m8 12 5 5L24 6" transform="translate(-5 0)"/>' : '') +
          '</svg>' +
        '</span>';
      }

      const body = m.deleted_at
        ? 'Message deleted'
        : esc(m.body || '');

      const bodyCls = m.deleted_at ? ' chat-bubble deleted' : '';

      return divider +
        '<div class="' + wrapCls + '">' +
          '<div class="chat-bubble ' + cls + bodyCls + '">' +
            body +
            '<div class="chat-bubble-meta">' +
              '<span>' + esc(time) + '</span>' +
              tick +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    chatLog.innerHTML = html;
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  async function refreshMessages() {
    if (!thread) return;
    const res = await AUTH.loadMessages(thread.id, 100);
    if (!res.ok) return;

    const messages = res.data;
    const newest = messages.length ? messages[messages.length - 1].id : null;

    // Skip re-render if nothing changed
    if (newest !== lastMessageId) {
      lastMessageId = newest;
      renderMessages(messages);
    }

    if (thread.status === 'accepted') {
      AUTH.markMessagesRead(thread.id);
    }
  }

  /* ---------- Composer ---------- */

  function autoGrow() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(140, chatInput.scrollHeight) + 'px';
    sendBtn.disabled = !chatInput.value.trim();
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!thread) return;

    const body = chatInput.value.trim();
    if (!body) return;

    sendBtn.disabled = true;
    chatInput.disabled = true;

    const res = await AUTH.sendMessage(thread.id, body);

    chatInput.disabled = false;
    chatInput.value = '';
    autoGrow();

    if (!res.ok) {
      alert('Could not send message. Try again.');
      return;
    }

    await refreshMessages();
    chatInput.focus();
  }

  /* ---------- Menu ---------- */

  function openMenu() {
    chatMenuPanel.hidden = false;
  }
  function closeMenu() {
    chatMenuPanel.hidden = true;
  }

  chatMenu.addEventListener('click', function (e) {
    e.stopPropagation();
    if (chatMenuPanel.hidden) openMenu();
    else closeMenu();
  });

  document.addEventListener('click', function (e) {
    if (!chatMenuPanel.hidden && !chatMenuPanel.contains(e.target) && e.target !== chatMenu) {
      closeMenu();
    }
  });

  /* ---------- Boot ---------- */

  (async function boot() {
    me = await AUTH.currentUser();
    if (!me) { location.replace('/login.html'); return; }

    const params = new URLSearchParams(location.search);
    const threadId = params.get('id');
    const toUserId = params.get('to');

    if (threadId) {
      const res = await AUTH.loadThread(threadId);
      if (!res.ok) { chatMissing.hidden = false; return; }
      thread = res.thread;
      other = res.other;
    } else if (toUserId) {
      const res = await AUTH.startThread(toUserId);
      if (!res.ok) { chatMissing.hidden = false; return; }

      const full = await AUTH.loadThread(res.thread.id);
      if (!full.ok) { chatMissing.hidden = false; return; }
      thread = full.thread;
      other = full.other;
    } else {
      chatMissing.hidden = false;
      return;
    }

    paintHeader();
    paintBanners();
    await refreshMessages();

    autoGrow();

    if (thread.status === 'accepted') {
      chatInput.focus();
    }

    // Poll for new messages
    pollTimer = setInterval(refreshMessages, 4000);
  })();

  /* ---------- Events ---------- */

  chatInput.addEventListener('input', autoGrow);

  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatComposer.requestSubmit();
    }
  });

  chatComposer.addEventListener('submit', handleSend);

  acceptBtn.addEventListener('click', async function () {
    acceptBtn.disabled = true;
    declineBtn.disabled = true;
    const res = await AUTH.acceptThread(thread.id);
    acceptBtn.disabled = false;
    declineBtn.disabled = false;
    if (!res.ok) { alert('Could not accept. Try again.'); return; }
    thread.status = 'accepted';
    paintBanners();
    autoGrow();
    chatInput.focus();
  });

  declineBtn.addEventListener('click', async function () {
    acceptBtn.disabled = true;
    declineBtn.disabled = true;
    const res = await AUTH.declineThread(thread.id);
    acceptBtn.disabled = false;
    declineBtn.disabled = false;
    if (!res.ok) { alert('Could not decline. Try again.'); return; }
    thread.status = 'declined';
    paintBanners();
  });

  window.addEventListener('beforeunload', function () {
    if (pollTimer) clearInterval(pollTimer);
  });
})();
