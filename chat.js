/* =========================================================
   STMDESKLY v2 — Single chat
   Reply, react, delete, photos, presence, typing, delivery.
   Realtime via Supabase channels.
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
  let typingTimer = null;
  let presenceTimer = null;
  let replyToId = null;
  let contextMessageId = null;

  let messagesChannel = null;
  let typingChannel = null;

  let refreshDebounce = null;
  let refreshInFlight = false;
  let refreshQueued = false;

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

  function timeAgo(iso) {
    if (!iso) return 'a while ago';
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return 'a while ago';
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
    if (!other || !chatStatus) return;
    const p = await AUTH.getPresence(other.user_id);
    chatPresence.hidden = !p.online;

    const role = other.role || '';
    let presenceText;
    if (p.online) {
      presenceText = 'Active now';
    } else if (p.lastSeen) {
      presenceText = 'Active ' + timeAgo(p.lastSeen);
    } else {
      presenceText = 'Away';
    }

    chatStatus.textContent = role ? (role + ' · ' + presenceText) : presenceText;
    chatStatus.classList.toggle('is-online', p.online);
    chatStatus.classList.toggle('is-away', !p.online);
  }

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
        const cls = 'chat-reaction-chip' + (r.mine ? ' mine' : '');
        return '<button type="button" class="' + cls + '" data-emoji="' + esc(emoji) + '" data-message="' + esc(messageId) + '">' +
          emoji + '<span>' + r.count + '</span>' +
        '</button>';
      }).join('') +
    '</div>';
  }

  function dotHtml(m) {
    if (m.__failed)     return '<span class="dot failed" title="Tap to retry">!</span>';
    if (m.__pending)    return '<span class="dot sent"></span>';
    if (m.read_at)      return '<span class="dot seen" title="Seen"></span>';
    if (m.delivered_at) return '<span class="dot delivered" title="Delivered"></span>';
    return '<span class="dot sent" title="Sent"></span>';
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

      let replyHtml = '';
      if (m.reply_to_id) {
        const src = findMessageById(m.reply_to_id);
        const srcName = src ? (src.sender_id === me.id ? 'You' : (other.name || 'Them')) : 'Message';
        const srcText = src
          ? (src.deleted_at ? 'Message deleted' : (src.body || (src.photo_url ? '📷 Photo' : '')))
          : 'Original not available';
        replyHtml = '<div class="chat-bubble-reply">' +
          '<strong>' + esc(srcName) + '</strong>' +
          '<span>' + esc(srcText) + '</span>' +
        '</div>';
      }

      let photoHtml = '';
      const hasPhoto = !!m.photo_url && !m.deleted_at;
      if (hasPhoto) {
        photoHtml = '<img class="chat-bubble-photo" src="' + esc(m.photo_url) + '" alt="" data-src="' + esc(m.photo_url) + '">';
      }

      const body = m.deleted_at
        ? '<em>Message deleted</em>'
        : (m.body ? esc(m.body) : '');

      const bodyCls = m.deleted_at ? ' chat-bubble deleted' : '';
      const photoCls = hasPhoto ? ' has-photo' : '';
      const stateCls = m.__failed ? ' is-failed' : (m.__pending ? ' is-pending' : '');

      const time = timeShort(m.created_at);
      const dot = (mine && !m.deleted_at) ? dotHtml(m) : '';
      const meta = m.deleted_at ? '' :
        '<div class="chat-bubble-meta"><span>' + esc(time) + '</span>' + dot + '</div>';

      const reactionsHtml = (m.__pending || m.__failed) ? '' : reactionsHtmlFor(m.id);

      return divider +
        '<div class="' + wrapCls + '">' +
          '<div class="chat-bubble ' + cls + bodyCls + photoCls + stateCls + '" data-id="' + esc(m.id) + '" data-sender="' + esc(m.sender_id) + '">' +
            replyHtml +
            photoHtml +
            body +
            meta +
          '</div>' +
          reactionsHtml +
        '</div>';
    }).join('');

    chatLog.innerHTML = html;
  }

  async function refreshMessages() {
    if (!thread) return;

    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }
    refreshInFlight = true;

    try {
      const prevNewest = allMessages.length
        ? allMessages[allMessages.length - 1].id
        : null;

      const wasAtBottom =
        (chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight) < 80;

      const res = await AUTH.loadMessages(thread.id, 100);
      if (!res.ok) return;

      const messages = res.data;

      const localOnly = allMessages.filter(function (m) {
        return m.__pending || m.__failed;
      });

      const ids = messages.map(function (m) { return m.id; });
      const rx = await AUTH.getMessageReactions(ids);
      reactionsMap = rx.ok ? rx.data : {};

      const newestId = messages.length
        ? messages[messages.length - 1].id
        : null;
      const hasNew = newestId && newestId !== prevNewest;

      const prevScrollTop = chatLog.scrollTop;

      allMessages = messages.concat(localOnly);
      lastNewestId = newestId;
      renderMessages();

      if (hasNew || wasAtBottom) {
        chatLog.scrollTop = chatLog.scrollHeight;
      } else {
        chatLog.scrollTop = prevScrollTop;
      }

      if (thread.status === 'accepted') {
        AUTH.markMessagesDelivered(thread.id);
        AUTH.markMessagesRead(thread.id);
      }
    } finally {
      refreshInFlight = false;
      if (refreshQueued) {
        refreshQueued = false;
        refreshMessages();
      }
    }
  }

  function scheduleRefresh(delay) {
    if (refreshDebounce) clearTimeout(refreshDebounce);
    refreshDebounce = setTimeout(function () {
      refreshDebounce = null;
      refreshMessages();
    }, delay || 120);
  }

  function autoGrow() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(140, chatInput.scrollHeight) + 'px';
    sendBtn.disabled = !chatInput.value.trim();
  }

  function makeTempMessage(body, replyId) {
    return {
      id: 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      sender_id: me.id,
      body: body,
      photo_url: null,
      read_at: null,
      delivered_at: null,
      created_at: new Date().toISOString(),
      reply_to_id: replyId || null,
      deleted_at: null,
      deleted_for: null,
      __pending: true
    };
  }

  async function actuallySend(tempId, body, replyId) {
    let res;
    try {
      res = replyId
        ? await AUTH.sendReply(thread.id, body, replyId)
        : await AUTH.sendMessage(thread.id, body);
    } catch (err) {
      res = { ok: false, error: err };
    }

    let idx = -1;
    for (let i = 0; i < allMessages.length; i++) {
      if (allMessages[i].id === tempId) { idx = i; break; }
    }
    if (idx === -1) return;

    if (!res.ok) {
      allMessages[idx].__pending = false;
      allMessages[idx].__failed = true;
      renderMessages();
      return;
    }

    allMessages[idx] = res.message;
    renderMessages();
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  async function handleSend(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!thread) return;

    const body = chatInput.value.trim();
    if (!body) return;

    const savedReplyId = replyToId;
    const temp = makeTempMessage(body, savedReplyId);

    allMessages.push(temp);
    renderMessages();
    chatLog.scrollTop = chatLog.scrollHeight;

    chatInput.value = '';
    cancelReply();
    autoGrow();

    actuallySend(temp.id, body, savedReplyId);
  }

  function retryMessage(messageId) {
    const m = findMessageById(messageId);
    if (!m || !m.__failed) return;

    m.__failed = false;
    m.__pending = true;
    renderMessages();

    actuallySend(m.id, m.body, m.reply_to_id);
  }

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

  function openContext(messageId) {
    const m = findMessageById(messageId);
    if (!m || m.deleted_at || m.__pending) return;
    contextMessageId = messageId;

    contextEmojis.innerHTML = REACTION_EMOJIS.map(function (emoji) {
      return '<button type="button" data-emoji="' + esc(emoji) + '">' + emoji + '</button>';
    }).join('');

    const deleteAllBtn = contextMenu.querySelector('[data-action="delete-all"]');
    const mine = m.sender_id === me.id;
    const within24 = (Date.now() - new Date(m.created_at).getTime()) < 24 * 60 * 60 * 1000;
    const sendable = !m.__failed && !String(m.id).startsWith('temp-');
    deleteAllBtn.hidden = !(mine && within24 && sendable);

    contextMenu.hidden = false;
  }

  function closeContext() {
    contextMenu.hidden = true;
    contextMessageId = null;
  }

  /* ---------- Inline reply from notification ---------- */

  async function flushPendingReplies() {
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('stmdeskly-sw', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (!db.objectStoreNames.contains('pending-replies')) {
        db.close();
        return;
      }

      const tx = db.transaction('pending-replies', 'readwrite');
      const store = tx.objectStore('pending-replies');

      const all = await new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      let sent = 0;
      for (const item of all) {
        if (item.threadId !== thread.id) continue;
        const res = await AUTH.sendMessage(thread.id, item.body);
        if (res.ok) {
          sent++;
          store.delete(item.id);
        }
      }

      db.close();

      if (sent > 0) {
        await refreshMessages();
        chatLog.scrollTop = chatLog.scrollHeight;
      }
    } catch (e) {
      console.warn('[chat] pending replies failed:', e);
    }
  }

  /* Events */

  chatLog.addEventListener('contextmenu', function (e) {
    const bubble = e.target.closest('.chat-bubble');
    if (!bubble) return;
    e.preventDefault();
    openContext(bubble.dataset.id);
  });

  let touchTimer = null;
  let touchStart = null;

  chatLog.addEventListener('touchstart', function (e) {
    const bubble = e.target.closest('.chat-bubble');
    const photo = e.target.closest('.chat-bubble-photo');
    if (photo || !bubble) return;
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
      return;
    }

    const failedBubble = e.target.closest('.chat-bubble.is-failed');
    if (failedBubble) {
      retryMessage(failedBubble.dataset.id);
    }
  });

  contextEmojis.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-emoji]');
    if (!btn) return;
    if (!contextMessageId) return;
    toggleReaction(contextMessageId, btn.dataset.emoji);
    closeContext();
  });

  contextMenu.addEventListener('click', async function (e) {
    const item = e.target.closest('.chat-context-item');
    if (!item) return;
    const action = item.dataset.action;
    const msgId = contextMessageId;
    if (!msgId) return;
    const msg = findMessageById(msgId);
    if (!msg) { closeContext(); return; }

    if (action === 'reply') { startReply(msgId); closeContext(); return; }

    if (action === 'copy') {
      try { await navigator.clipboard.writeText(msg.body || ''); closeContext(); }
      catch (err) { prompt('Copy:', msg.body || ''); closeContext(); }
      return;
    }

    if (action === 'delete-me') {
      closeContext();
      await AUTH.deleteMessageForMe(msgId);
      await refreshMessages();
      return;
    }

    if (action === 'delete-all') {
      if (!confirm('Delete this message for everyone?')) { closeContext(); return; }
      closeContext();
      const res = await AUTH.deleteMessageForEveryone(msgId);
      if (!res.ok) { alert('Could not delete. Try again.'); return; }
      await refreshMessages();
      return;
    }
  });

  async function toggleReaction(messageId, emoji) {
    const res = await AUTH.toggleMessageReaction(messageId, emoji);
    if (!res.ok) return;
    await refreshMessages();
  }

  document.addEventListener('click', function (e) {
    if (contextMenu.hidden) return;
    if (!contextMenu.contains(e.target) && !e.target.closest('.chat-bubble')) closeContext();
  });

  chatInput.addEventListener('input', function () {
    autoGrow();
    broadcastTyping();
  });

  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
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
    chatLog.scrollTop = chatLog.scrollHeight;
  });

  lightboxClose.addEventListener('click', function () {
    lightbox.hidden = true;
    lightboxImg.src = '';
  });
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) { lightbox.hidden = true; lightboxImg.src = ''; }
  });

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

  chatMenu.addEventListener('click', function (e) {
    e.stopPropagation();
    chatMenuPanel.hidden = !chatMenuPanel.hidden;
  });

  document.addEventListener('click', function (e) {
    if (!chatMenuPanel.hidden && !chatMenuPanel.contains(e.target) && e.target !== chatMenu) {
      chatMenuPanel.hidden = true;
    }
  });

  /* ---------- Realtime: messages ---------- */

  function initMessagesRealtime() {
    try {
      messagesChannel = AUTH.sb
        .channel('chat-' + thread.id)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: 'thread_id=eq.' + thread.id
        }, function () {
          scheduleRefresh(120);
        })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            console.info('[chat] realtime subscribed');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[chat] realtime error, will retry');
          }
        });
    } catch (err) {
      console.warn('[chat] realtime failed:', err);
    }
  }

  /* ---------- Realtime: typing ---------- */

  function broadcastTyping() {
    if (!typingChannel || !thread) return;
    if (typingTimer) clearTimeout(typingTimer);
    typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: me.id, threadId: thread.id }
    });
    typingTimer = setTimeout(function () { typingTimer = null; }, 2500);
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
    } catch (err) { console.warn('typing channel failed:', err); }
  }

  let typingHideTimer = null;
  function showTypingIndicator() {
    chatStatus.textContent = 'typing…';
    chatStatus.classList.add('is-typing');
    if (typingHideTimer) clearTimeout(typingHideTimer);
    typingHideTimer = setTimeout(function () {
      chatStatus.classList.remove('is-typing');
      updatePresence();
    }, 3000);
  }

  /* Boot */

  (async function boot() {
    try {
      me = await AUTH.currentUser();
      if (!me) { location.replace('/login.html'); return; }

      const params = new URLSearchParams(location.search);
      const threadId = params.get('id');
      const toUserId = params.get('to');

      if (threadId) {
        const res = await AUTH.loadThread(threadId);
        if (!res.ok) {
          alert('loadThread failed: ' + JSON.stringify(res.error || res));
          chatMissing.hidden = false;
          return;
        }
        thread = res.thread;
        other = res.other;
      } else if (toUserId) {
        const res = await AUTH.startThread(toUserId);
        if (!res.ok) {
          alert('startThread failed: ' + JSON.stringify(res.error || res));
          chatMissing.hidden = false;
          return;
        }
        const full = await AUTH.loadThread(res.thread.id);
        if (!full.ok) {
          alert('loadThread after start failed: ' + JSON.stringify(full.error || full));
          chatMissing.hidden = false;
          return;
        }
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
      chatLog.scrollTop = chatLog.scrollHeight;

      autoGrow();
      updatePresence();
      initTyping();
      initMessagesRealtime();

      await flushPendingReplies();

      if (thread.status === 'accepted') chatInput.focus();

      presenceTimer = setInterval(function () {
        AUTH.touchPresence();
        updatePresence();
      }, 30000);
      AUTH.touchPresence();
    } catch (err) {
      alert('BOOT ERROR: ' + (err && err.message ? err.message : String(err)));
    }
  })();

  window.addEventListener('beforeunload', function () {
    if (presenceTimer) clearInterval(presenceTimer);
    if (refreshDebounce) clearTimeout(refreshDebounce);
    try { if (messagesChannel) AUTH.sb.removeChannel(messagesChannel); } catch (e) {}
    try { if (typingChannel) typingChannel.unsubscribe(); } catch (e) {}
  });
})();
