/* =========================================================
   STMDESKLY v2 — Single chat (full: reply, react, delete, photos, presence)
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const chatHead        = $('chatHead');
  const chatAvatar      = $('chatAvatar');
  const chatPresence    = $('chatPresence');
  const chatName        = $('chatName');
  const chatStatus      = $('chatStatus');
  const chatMenu        = $('chatMenu');
  const chatMenuPanel   = $('chatMenuPanel');
  const menuViewProfile = $('menuViewProfile');
  const menuOpenDesk    = $('menuOpenDesk');
  const acceptBar       = $('acceptBar');
  const acceptBtn       = $('acceptBtn');
  const declineBtn      = $('declineBtn');
  const pendingBar      = $('pendingBar');
  const chatMissing     = $('chatMissing');
  const chatLog         = $('chatLog');
  const chatComposer    = $('chatComposer');
  const chatInput       = $('chatInput');
  const sendBtn         = $('sendBtn');
  const replyBar        = $('replyBar');
  const replyName       = $('replyName');
  const replyPreview    = $('replyPreview');
  const replyClose      = $('replyClose');
  const attachBtn       = $('attachBtn');
  const photoInput      = $('photoInput');
  const contextMenu     = $('contextMenu');
  const contextEmojis   = $('contextEmojis');
  const lightbox        = $('chatLightbox');
  const lightboxImg     = $('chatLightboxImg');
  const lightboxClose   = $('chatLightboxClose');

  const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '🙏', '👏'];

  let me = null;
  let thread = null;
  let other = null;
  let allMessages = [];
  let reactionsMap = {};
  let lastNewestId = null;
  let pollTimer = null;
  let typingTimer = null;
  let presenceTimer = null;
  let replyToId = null;
  let contextMessageId = null;

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

    const profileUrl = other.username ? '/profile.html?u=' + encodeURIComponent(other.username) : '#';
    const deskUrl    = other.username ? '/u/' + encodeURIComponent(other.username) : '#';

    chatHead.href = profileUrl;
    menuViewProfile.href = profileUrl;
    menuOpenDesk.href = deskUrl;
  }

  async function updatePresence() {
    if (!other) return;
    const p = await AUTH.getPresence(other.user_id);
    if (p.online) {
      chatPresence.hidden = false;
    } else {
      chatPresence.hidden = true;
    }
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
      } else {
        acceptBar.hidden = true;
        pendingBar.hidden = false;
        chatComposer.hidden = true;
      }
      return;
    }

    if (thread.status === 'accepted') {
      acceptBar.hidden = true;
      pendingBar.hidden = true;
      chatComposer.hidden = false;
      return;
    }

    acceptBar.hidden = true;
    pendingBar.hidden = false;
    pendingBar.innerHTML = '<span>This conversation is closed.</span>';
    chatComposer.hidden = true;
  }

  /* ---------- Messages render ---------- */

  function findMessageById(id) {
    for (let i = 0; i < allMessages.length; i++) {
      if (allMessages[i].id === id) return allMessages[i];
    }
    return null;
  }

  function reactionsHtmlFor(messageId) {
    const map = reactionsMap[messageId];
    if (!map || !Object.keys(map).length) return '';

    return '<div class="chat-reactions">' +
      Object.keys(map).map(function (emoji) {
        const r = map[emoji];
        const cls = r.mine ? ' chat-reaction-chip mine' : ' chat-reaction-chip';
        return '<button type="button" class="' + cls.trim() + '" data-emoji="' + esc(emoji) + '" data-message="' + esc(messageId) + '">' +
          emoji + '<span>' + r.count + '</span>' +
        '</button>';
      }).join('') +
    '</div>';
  }

  function renderMessages() {
    if (!allMessages.length) {
      chatLog.innerHTML = '<div class="chat-intro">Say hi 👋 — this is the start of your chat.</div>';
      return;
    }

    let lastDay = '';
    const html = allMessages.map(function (m) {
      const day = dayLabel(m.created_at);
      let divider = '';
      if (day !== lastDay) {
        divider = '<div class="chat-day">' + esc(day) + '</div>';
        lastDay = day;
      }

      const mine = m.sender_id === me.id;
      const cls = mine ? 'me' : 'them';
      const wrapCls = mine ? 'chat-row mine' : 'chat-row theirs';

      // Reply quote
      let replyHtml = '';
      if (m.reply_to_id) {
        const src = findMessageById(m.reply_to_id);
        const srcName = src
          ? (src.sender_id === me.id ? 'You' : (other.name || 'Them'))
          : 'Message';
        const srcText = src
          ? (src.deleted_at ? 'Message deleted' : (src.body || (src.photo_url ? '📷 Photo' : '')))
          : 'Original not available';
        replyHtml = '<div class="chat-bubble-reply">' +
          '<strong>' + esc(srcName) + '</strong>' +
          '<span>' + esc(srcText) + '</span>' +
        '</div>';
      }

      // Photo
      let photoHtml = '';
      if (m.photo_url && !m.deleted_at) {
        photoHtml = '<img class="chat-bubble-photo" src="' + esc(m.photo_url) + '" alt="" data-src="' + esc(m.photo_url) + '">';
      }

      // Body
      const body = m.deleted_at
        ? '<em>Message deleted</em>'
        : (m.body ? esc(m.body) : '');

      const bodyCls = m.deleted_at ? ' chat-bubble deleted' : '';

      // Time + tick
      const time = timeShort(m.created_at);
      let tick = '';
      if (mine && !m.deleted_at) {
        const read = !!m.read_at;
        tick = '<span class="tick' + (read ? ' read' : '') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="m1 12 5 5L17 6"/>' +
            (read ? '<path d="m8 12 5 5L24 6" transform="translate(-5 0)"/>' : '') +
          '</svg>' +
        '</span>';
      }

      const meta = m.deleted_at ? '' :
        '<div class="chat-bubble-meta"><span>' + esc(time) + '</span>' + tick + '</div>';

      const reactionsHtml = reactionsHtmlFor(m.id);
      const alignRight = mine ? ' align-items: flex-end;' : ' align-items: flex-start;';

      return divider +
        '<div class="' + wrapCls + '">' +
          '<div class="chat-bubble ' + cls + bodyCls + '" data-id="' + esc(m.id) + '" data-sender="' + esc(m.sender_id) + '">' +
            replyHtml +
            photoHtml +
            body +
            meta +
          '</div>' +
          reactionsHtml +
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
    const ids = messages.map(function (m) { return m.id; });
    const rx = await AUTH.getMessageReactions(ids);
    reactionsMap = rx.ok ? rx.data : {};

    const newestId = messages.length ? messages[messages.length - 1].id : null;

    const changed =
      newestId !== lastNewestId ||
      messages.length !== allMessages.length;

    allMessages = messages;

    if (changed) {
      lastNewestId = newestId;
      renderMessages();
    } else {
      // Still refresh reactions display without re-scrolling
      renderMessages();
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

    const res = replyToId
      ? await AUTH.sendReply(thread.id, body, replyToId)
      : await AUTH.sendMessage(thread.id, body);

    chatInput.disabled = false;
    chatInput.value = '';
    cancelReply();
    autoGrow();

    if (!res.ok) {
      alert('Could not send message. Try again.');
      return;
    }

    await refreshMessages();
    chatInput.focus();
  }

  /* ---------- Reply ---------- */

  function startReply(messageId) {
    const m = findMessageById(messageId);
    if (!m) return;
    replyToId = messageId;
    replyName.textContent = m.sender_id === me.id ? 'You' : (other.name || 'Them');
    replyPreview.textContent = m.body || (m.photo_url ? '📷 Photo' : '');
    replyBar.hidden = false;
    chatInput.focus();
  }

  function cancelReply() {
    replyToId = null;
    replyBar.hidden = true;
    replyName.textContent = '';
    replyPreview.textContent = '';
  }

  /* ---------- Context menu ---------- */

  function openContext(messageId) {
    const m = findMessageById(messageId);
    if (!m || m.deleted_at) return;

    contextMessageId = messageId;

    // Emojis row
    contextEmojis.innerHTML = REACTION_EMOJIS.map(function (emoji) {
      return '<button type="button" data-emoji="' + esc(emoji) + '">' + emoji + '</button>';
    }).join('');

    // Show delete-for-everyone only if this is my message and within 24h
    const deleteAllBtn = contextMenu.querySelector('[data-action="delete-all"]');
    const mine = m.sender_id === me.id;
    const within24 = (Date.now() - new Date(m.created_at).getTime()) < 24 * 60 * 60 * 1000;
    if (mine && within24) {
      deleteAllBtn.hidden = false;
    } else {
      deleteAllBtn.hidden = true;
    }

    contextMenu.hidden = false;
  }

  function closeContext() {
    contextMenu.hidden = true;
    contextMessageId = null;
  }

  /* ---------- Events ---------- */

  // Long-press / click on bubble
  chatLog.addEventListener('contextmenu', function (e) {
    const bubble = e.target.closest('.chat-bubble');
    if (!bubble) return;
    e.preventDefault();
    openContext(bubble.dataset.id);
  });

  // Also tap on bubble opens context (short tap)
  let touchTimer = null;
  let touchStart = null;

  chatLog.addEventListener('touchstart', function (e) {
    const bubble = e.target.closest('.chat-bubble');
    const photo = e.target.closest('.chat-bubble-photo');
    if (photo) return;
    if (!bubble) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchTimer = setTimeout(function () {
      openContext(bubble.dataset.id);
      touchTimer = null;
    }, 480);
  }, { passive: true });

  chatLog.addEventListener('touchmove', function (e) {
    if (!touchStart) return;
    const dx = Math.abs(e.touches[0].clientX - touchStart.x);
    const dy = Math.abs(e.touches[0].clientY - touchStart.y);
    if (dx > 8 || dy > 8) {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    }
  }, { passive: true });

  chatLog.addEventListener('touchend', function () {
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    touchStart = null;
  });

  // Click on photo opens lightbox
  chatLog.addEventListener('click', function (e) {
    const photo = e.target.closest('.chat-bubble-photo');
    if (photo) {
      lightboxImg.src = photo.dataset.src || photo.src;
      lightbox.hidden = false;
      return;
    }

    const reactChip = e.target.closest('.chat-reaction-chip');
    if (reactChip) {
      toggleReaction(reactChip.dataset.message, reactChip.dataset.emoji);
    }
  });

  // Emoji click inside context menu
  contextEmojis.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-emoji]');
    if (!btn) return;
    const emoji = btn.dataset.emoji;
    if (!contextMessageId) return;
    toggleReaction(contextMessageId, emoji);
    closeContext();
  });

  // Menu item clicks
  contextMenu.addEventListener('click', async function (e) {
    const item = e.target.closest('.chat-context-item');
    if (!item) return;
    const action = item.dataset.action;
    const msgId = contextMessageId;
    if (!msgId) return;

    const msg = findMessageById(msgId);
    if (!msg) { closeContext(); return; }

    if (action === 'reply') {
      startReply(msgId);
      closeContext();
      return;
    }

    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(msg.body || '');
        closeContext();
      } catch (e) {
        prompt('Copy:', msg.body || '');
        closeContext();
      }
      return;
    }

    if (action === 'delete-me') {
      closeContext();
      await AUTH.deleteMessageForMe(msgId);
      await refreshMessages();
      return;
    }

    if (action === 'delete-all') {
      if (!confirm('Delete this message for everyone?')) {
        closeContext();
        return;
      }
      closeContext();
      const res = await AUTH.deleteMessageForEveryone(msgId);
      if (!res.ok) {
        alert('Could not delete. Try again.');
        return;
      }
      await refreshMessages();
      return;
    }
  });

  async function toggleReaction(messageId, emoji) {
    const res = await AUTH.toggleMessageReaction(messageId, emoji);
    if (!res.ok) return;
    // Optimistic local update + refresh
    await refreshMessages();
  }

  // Close context when tapping outside
  document.addEventListener('click', function (e) {
    if (contextMenu.hidden) return;
    if (!contextMenu.contains(e.target) && !e.target.closest('.chat-bubble')) {
      closeContext();
    }
  });

  // Composer events
  chatInput.addEventListener('input', function () {
    autoGrow();
    broadcastTyping();
  });

  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatComposer.requestSubmit();
    }
  });

  chatComposer.addEventListener('submit', handleSend);

  replyClose.addEventListener('click', cancelReply);

  attachBtn.addEventListener('click', function () { photoInput.click(); });

  photoInput.addEventListener('change', async function (e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !thread) return;
    if (file.size > 5 * 1024 * 1024) { alert('Max 5 MB.'); return; }

    attachBtn.disabled = true;
    const res = await AUTH.sendPhotoMessage(thread.id, file);
    attachBtn.disabled = false;

    if (!res.ok) { alert('Could not send photo. Try again.'); return; }
    await refreshMessages();
  });

  // Lightbox close
  lightboxClose.addEventListener('click', function () {
    lightbox.hidden = true;
    lightboxImg.src = '';
  });
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) {
      lightbox.hidden = true;
      lightboxImg.src = '';
    }
  });

  // Accept/decline
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

  // Menu
  chatMenu.addEventListener('click', function (e) {
    e.stopPropagation();
    if (chatMenuPanel.hidden) chatMenuPanel.hidden = false;
    else chatMenuPanel.hidden = true;
  });

  document.addEventListener('click', function (e) {
    if (!chatMenuPanel.hidden && !chatMenuPanel.contains(e.target) && e.target !== chatMenu) {
      chatMenuPanel.hidden = true;
    }
  });

  /* ---------- Typing via Realtime broadcast ---------- */

  let typingChannel = null;

  function broadcastTyping() {
    if (!typingChannel || !thread) return;
    if (typingTimer) clearTimeout(typingTimer);
    typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: me.id, threadId: thread.id }
    });
    typingTimer = setTimeout(function () {
      typingTimer = null;
    }, 2500);
  }

  function initTyping() {
    try {
      typingChannel = AUTH.sb.channel('typing-' + thread.id, {
        config: { broadcast: { self: false } }
      });

      typingChannel.on('broadcast', { event: 'typing' }, function (payload) {
        if (!payload || !payload.payload) return;
        if (payload.payload.userId === me.id) return;
        showTypingIndicator();
      });

      typingChannel.subscribe();
    } catch (err) {
      console.warn('typing channel failed:', err);
    }
  }

  let typingHideTimer = null;
  function showTypingIndicator() {
    chatStatus.textContent = 'typing…';
    chatStatus.classList.add('is-typing');
    if (typingHideTimer) clearTimeout(typingHideTimer);
    typingHideTimer = setTimeout(function () {
      chatStatus.textContent = other.role || '';
      chatStatus.classList.remove('is-typing');
    }, 3000);
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
    updatePresence();
    initTyping();

    if (thread.status === 'accepted') {
      chatInput.focus();
    }

    pollTimer = setInterval(refreshMessages, 2000);
    presenceTimer = setInterval(function () {
      AUTH.touchPresence();
      updatePresence();
    }, 30000);
    AUTH.touchPresence();
  })();

  window.addEventListener('beforeunload', function () {
    if (pollTimer) clearInterval(pollTimer);
    if (presenceTimer) clearInterval(presenceTimer);
    if (typingChannel) {
      try { typingChannel.unsubscribe(); } catch (e) {}
    }
  });
})();
