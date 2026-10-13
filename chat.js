/* =========================================================
   STMDESKLY v2 — Single chat
   Opens from ?to=USER_ID (starts a thread) or ?id=THREAD_ID
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const chatAvatar = $('chatAvatar');
  const chatName   = $('chatName');
  const chatStatus = $('chatStatus');
  const chatMenu   = $('chatMenu');
  const acceptBar  = $('acceptBar');
  const acceptPreview = $('acceptPreview');
  const acceptBtn  = $('acceptBtn');
  const declineBtn = $('declineBtn');
  const pendingBar = $('pendingBar');
  const chatMissing = $('chatMissing');
  const chatLog    = $('chatLog');
  const chatComposer = $('chatComposer');
  const chatInput  = $('chatInput');
  const sendBtn    = $('sendBtn');

  let me = null;
  let thread = null;
  let other = null;
  let pollTimer = null;

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
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function paintHeader() {
    if (other) {
      chatAvatar.innerHTML = other.avatar_url
        ? '<img src="' + esc(other.avatar_url) + '" alt="">'
        : esc(initials(other.name));
      chatName.textContent = other.name || 'Someone';
      chatAvatar.href = other.username ? '/profile.html?u=' + encodeURIComponent(other.username) : '#';
      chatName.href = chatAvatar.href;
      chatMenu.hidden = false;
      chatStatus.textContent = other.role || '';
    }
  }

  function paintBanners() {
    if (!thread) return;
    const isRecipient = thread.initiated_by && thread.initiated_by !== me.id;

    if (thread.status === 'pending') {
      if (isRecipient) {
        acceptBar.hidden = false;
        pendingBar.hidden = true;
      } else {
        acceptBar.hidden = true;
        pendingBar.hidden = false;
      }
      chatComposer.hidden = true;
    } else if (thread.status === 'accepted') {
      acceptBar.hidden = true;
      pendingBar.hidden = true;
      chatComposer.hidden = false;
    } else {
      // declined or blocked
      acceptBar.hidden = true;
      pendingBar.hidden = false;
      pendingBar.textContent = 'This conversation is closed.';
      chatComposer.hidden = true;
    }
  }

  function renderMessages(messages) {
    if (!messages.length) {
      chatLog.innerHTML = '<div class="chat-day">Say hi 👋</div>';
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
      const time = timeShort(m.created_at);
      const tick = mine ? '<span>· ' + (m.read_at ? 'Read' : 'Sent') + '</span>' : '';

      const body = m.deleted_at
        ? '<em>Message deleted</em>'
        : esc(m.body || '');

      return divider +
        '<div class="chat-bubble ' + cls + '">' +
          body +
          '<div class="chat-bubble-meta"><span>' + esc(time) + '</span>' + tick + '</div>' +
        '</div>';
    }).join('');

    chatLog.innerHTML = html;
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  async function refreshMessages() {
    if (!thread) return;
    const res = await AUTH.loadMessages(thread.id, 50);
    if (!res.ok) return;
    renderMessages(res.data);
    if (thread.status === 'accepted') {
      AUTH.markMessagesRead(thread.id);
    }
  }

  function autoGrow() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(140, chatInput.scrollHeight) + 'px';
    sendBtn.disabled = !chatInput.value.trim();
  }

  async function handleSend(e) {
    e.preventDefault();
    const body = chatInput.value.trim();
    if (!body || !thread) return;

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
  }

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
      thread = res.thread;
      // Reload thread to get full record + other user
      const full = await AUTH.loadThread(thread.id);
      if (!full.ok) { chatMissing.hidden = false; return; }
      thread = full.thread;
      other = full.other;
    } else {
      chatMissing.hidden = false;
      return;
    }

    paintHeader();
    paintBanners();

    chatLog.hidden = false;
    await refreshMessages();

    // Poll for new messages every 4 seconds (Stage 2 — realtime comes in Stage 4)
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
