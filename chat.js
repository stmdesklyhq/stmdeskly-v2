/* =========================================================
   STMDESKLY v2 — Single chat
   Tap-to-record voice notes with IndexedDB persistence,
   wall-clock progress bar, scroll-to-bottom button.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const chatHead        = $('chatHead');
  const chatAvatar      = $('chatAvatar');
  const chatPresence    = $('chatPresence');
  const chatName        = $('chatName');
  const chatMuteIcon    = $('chatMuteIcon');
  const chatStatus      = $('chatStatus');
  const chatMenu        = $('chatMenu');
  const chatMenuPanel   = $('chatMenuPanel');
  const menuViewProfile = $('menuViewProfile');
  const menuOpenDesk    = $('menuOpenDesk');
  const menuStarred     = $('menuStarred');
  const menuMute        = $('menuMute');
  const menuMuteIcon    = $('menuMuteIcon');
  const menuMuteLabel   = $('menuMuteLabel');
  const menuReport      = $('menuReport');
  const menuBlock       = $('menuBlock');
  const menuBlockLabel  = $('menuBlockLabel');
  const acceptBar       = $('acceptBar');
  const acceptBtn       = $('acceptBtn');
  const declineBtn      = $('declineBtn');
  const pendingBar      = $('pendingBar');
  const chatMissing     = $('chatMissing');
  const chatLog         = $('chatLog');
  const chatComposer    = $('chatComposer');
  const chatInput       = $('chatInput');
  const sendBtn         = $('sendBtn');
  const micBtn          = $('micBtn');
  const composerInner   = $('composerInner');
  const chatRecorder    = $('chatRecorder');
  const recCancel       = $('recCancel');
  const recSend         = $('recSend');
  const recTimer        = $('recTimer');
  const recWave         = $('recWave');
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
  const blockedBanner   = $('blockedBanner');
  const blockedBannerText = $('blockedBannerText');
  const blockedUnblock  = $('blockedUnblock');
  const starLabel       = $('starLabel');

  const scrollBottomBtn = $('chatScrollBottom');
  const scrollBadge     = $('chatScrollBadge');

  const quickBtn      = $('quickBtn');
  const quickOverlay  = $('quickOverlay');
  const quickClose    = $('quickClose');
  const quickList     = $('quickList');
  const quickAdd      = $('quickAdd');
  const quickDeskLink = $('quickDeskLink');
  const quickLocation = $('quickLocation');

  const chatSearchBtn  = $('chatSearchBtn');
  const searchOverlay  = $('searchOverlay');
  const searchClose    = $('searchClose');
  const searchInput    = $('searchInput');
  const searchCount    = $('searchCount');
  const searchResults  = $('searchResults');
  const starredOverlay = $('starredOverlay');
  const starredClose   = $('starredClose');
  const starredList    = $('starredList');

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

  let isMuted = false;
  let blockedState = { me: false, them: false };
  let quickRepliesCache = [];

  let newMsgCount = 0;

  /* ---------- Voice recording state ---------- */
  const REC_MAX_SECONDS = 120;
  const REC_MIN_SECONDS = 1;
  const REC_WAVE_BARS = 26;

  let recState = null;

  /* ---------- Audio playback state ---------- */
  const audioEl = new Audio();
  audioEl.preload = 'metadata';
  let playingMsgId = null;

  // Wall-clock playback tracking (bypasses broken currentTime on Android)
  let playStartedAt = 0;   // Date.now() when playback began (or resumed)
  let playStartOffset = 0; // seconds already elapsed at play/resume
  let playTotalDur = 0;    // seconds, from data-duration
  let progressRaf = null;

  /* =========================================================
     IndexedDB — persist failed voice notes across reloads
     ========================================================= */

  const VOICE_DB = 'stmdeskly-chat';
  const VOICE_DB_VERSION = 1;
  const VOICE_STORE = 'failed-voice';

  function openVoiceDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('no-indexeddb')); return; }
      const req = indexedDB.open(VOICE_DB, VOICE_DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(VOICE_STORE)) {
          db.createObjectStore(VOICE_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function saveFailedVoice(record) {
    return openVoiceDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(VOICE_STORE, 'readwrite');
        tx.objectStore(VOICE_STORE).put(record);
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    }).catch(function (e) { console.warn('saveFailedVoice', e); });
  }

  function deleteFailedVoice(id) {
    return openVoiceDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(VOICE_STORE, 'readwrite');
        tx.objectStore(VOICE_STORE).delete(id);
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    }).catch(function (e) { console.warn('deleteFailedVoice', e); });
  }

  function loadFailedVoice(threadId) {
    return openVoiceDb().then(function (db) {
      return new Promise(function (resolve) {
        const tx = db.transaction(VOICE_STORE, 'readonly');
        const store = tx.objectStore(VOICE_STORE);
        const req = store.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
        tx.oncomplete = function () { db.close(); };
      });
    }).catch(function (e) {
      console.warn('loadFailedVoice', e);
      return [];
    }).then(function (all) {
      return all.filter(function (r) { return r.threadId === threadId; });
    });
  }

  /* =========================================================
     Helpers
     ========================================================= */

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

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  /* =========================================================
     Scroll helpers
     ========================================================= */

  function isAtBottom() {
    return (chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight) < 80;
  }

  function scrollToBottomNow() {
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function scrollToBottomSmooth() {
    try {
      chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' });
    } catch (e) {
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }

  function updateScrollButton() {
    if (!scrollBottomBtn) return;
    if (isAtBottom()) {
      scrollBottomBtn.hidden = true;
      newMsgCount = 0;
    } else {
      scrollBottomBtn.hidden = false;
    }

    if (scrollBadge) {
      if (newMsgCount > 0) {
        scrollBadge.hidden = false;
        scrollBadge.textContent = newMsgCount > 99 ? '99+' : String(newMsgCount);
      } else {
        scrollBadge.hidden = true;
      }
    }
  }

  function pinToBottomAfterImages() {
    const imgs = chatLog.querySelectorAll('img');
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      if (!img.complete) {
        img.addEventListener('load', function () {
          if (isAtBottom()) scrollToBottomNow();
        }, { once: true });
      }
    }
    setTimeout(function () { scrollToBottomNow(); updateScrollButton(); }, 60);
    setTimeout(function () { scrollToBottomNow(); updateScrollButton(); }, 240);
    setTimeout(function () { scrollToBottomNow(); updateScrollButton(); }, 700);
  }

  /* =========================================================
     Paint header / banners
     ========================================================= */

  function paintHeader() {
    if (!other) return;
    chatAvatar.innerHTML = other.avatar_url
      ? '<img src="' + esc(other.avatar_url) + '" alt="">'
      : esc(initials(other.name));
    chatName.textContent = other.name || 'Someone';
    chatStatus.textContent = other.role || '';
    chatMuteIcon.hidden = !isMuted;

    const profileUrl = other.username ? '/profile.html?u=' + encodeURIComponent(other.username) : '#';
    const deskUrl    = other.username ? '/u/' + encodeURIComponent(other.username) : '#';
    chatHead.href = profileUrl;
    menuViewProfile.href = profileUrl;
    menuOpenDesk.href = deskUrl;
  }

  function paintMuteMenu() {
    if (!menuMuteLabel || !menuMuteIcon) return;
    if (isMuted) {
      menuMuteLabel.textContent = 'Unmute notifications';
      menuMuteIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/><path d="M3 3l18 18"/></svg>';
    } else {
      menuMuteLabel.textContent = 'Mute notifications';
      menuMuteIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';
    }
  }

  function paintBlockMenu() {
    if (!menuBlockLabel) return;
    menuBlockLabel.textContent = blockedState.me ? 'Unblock' : 'Block';
  }

  function paintBlockedBanner() {
    if (!blockedBanner) return;

    if (blockedState.me) {
      blockedBanner.hidden = false;
      blockedBannerText.textContent = 'You blocked ' + (other.name || 'this user') + '.';
      blockedUnblock.hidden = false;
      chatComposer.hidden = true;
    } else if (blockedState.them) {
      blockedBanner.hidden = false;
      blockedBannerText.textContent = 'You cannot reply to this conversation.';
      blockedUnblock.hidden = true;
      chatComposer.hidden = true;
    } else {
      blockedBanner.hidden = true;
    }
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
    } else {
      acceptBar.hidden = true;
      pendingBar.hidden = false;
      pendingBar.innerHTML = '<span>This conversation is closed.</span>';
      chatComposer.hidden = true;
    }

    paintBlockedBanner();
  }

  /* =========================================================
     Message rendering
     ========================================================= */

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

  function audioHtmlFor(m) {
    if (!m.audio_url || m.deleted_at) return '';
    const dur = Math.max(1, Math.round(Number(m.audio_duration) || 0));
    const id = esc(m.id);
    return '' +
      '<div class="chat-audio" data-id="' + id + '" data-src="' + esc(m.audio_url) + '" data-duration="' + dur + '">' +
        '<button type="button" class="chat-audio-play" aria-label="Play voice note">' +
          '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
          '<svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="4" height="14" rx="1"/><rect x="13" y="5" width="4" height="14" rx="1"/></svg>' +
        '</button>' +
        '<div class="chat-audio-track">' +
          '<div class="chat-audio-track-fill"></div>' +
          '<div class="chat-audio-dot"></div>' +
        '</div>' +
        '<span class="chat-audio-time" data-total="' + dur + '">' + fmtDur(dur) + '</span>' +
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
      const isAuto = !!m.is_auto;
      const cls = mine ? 'me' : 'them';
      const wrapCls = mine ? 'chat-row mine' : 'chat-row theirs';

      let replyHtml = '';
      if (m.reply_to_id) {
        const src = findMessageById(m.reply_to_id);
        const srcName = src ? (src.sender_id === me.id ? 'You' : (other.name || 'Them')) : 'Message';
        let srcText;
        if (!src) srcText = 'Original not available';
        else if (src.deleted_at) srcText = 'Message deleted';
        else if (src.body) srcText = src.body;
        else if (src.photo_url) srcText = '📷 Photo';
        else if (src.audio_url) srcText = '🎤 Voice note';
        else srcText = '';
        replyHtml = '<div class="chat-bubble-reply">' +
          '<strong>' + esc(srcName) + '</strong>' +
          '<span>' + esc(srcText) + '</span>' +
        '</div>';
      }

      const hasPhoto = !!m.photo_url && !m.deleted_at;
      const hasAudio = !!m.audio_url && !m.deleted_at;

      let contentHtml;
      if (m.deleted_at) {
        contentHtml = '<em>Message deleted</em>';
      } else if (hasPhoto) {
        contentHtml = '<img class="chat-bubble-photo" src="' + esc(m.photo_url) + '" alt="" data-src="' + esc(m.photo_url) + '">';
      } else if (hasAudio) {
        contentHtml = audioHtmlFor(m);
      } else {
        const autoChip = isAuto ? '<span class="auto-chip">Auto</span>' : '';
        contentHtml = autoChip + (m.body ? esc(m.body) : '');
      }

      const bodyCls = m.deleted_at
        ? ' chat-bubble deleted'
        : (isAuto ? ' chat-bubble-auto' : '');

      const photoCls = hasPhoto ? ' has-photo' : '';
      const audioCls = hasAudio ? ' has-audio' : '';
      const stateCls = m.__failed ? ' is-failed' : (m.__pending ? ' is-pending' : '');

      const time = timeShort(m.created_at);
      const dot = (mine && !m.deleted_at) ? dotHtml(m) : '';
      const meta = m.deleted_at ? '' :
        '<div class="chat-bubble-meta"><span>' + esc(time) + '</span>' + dot + '</div>';

      const reactionsHtml = (m.__pending || m.__failed) ? '' : reactionsHtmlFor(m.id);

      return divider +
        '<div class="' + wrapCls + '">' +
          '<div class="chat-bubble ' + cls + bodyCls + photoCls + audioCls + stateCls + '" data-id="' + esc(m.id) + '" data-sender="' + esc(m.sender_id) + '">' +
            replyHtml +
            contentHtml +
            meta +
          '</div>' +
          reactionsHtml +
        '</div>';
    }).join('');

    chatLog.innerHTML = html;

    // If we were playing, restore UI state and repaint
    if (playingMsgId) {
      const player = chatLog.querySelector('.chat-audio[data-id="' + playingMsgId + '"]');
      if (player) {
        player.classList.add('is-playing');
        paintAudioProgress();
      } else {
        stopAudio();
      }
    }
  }

  /* =========================================================
     Refresh / load
     ========================================================= */

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

      const wasAtBottom = isAtBottom();

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

      if (wasAtBottom) {
        scrollToBottomNow();
        newMsgCount = 0;
      } else {
        chatLog.scrollTop = prevScrollTop;
        if (hasNew && prevNewest) {
          const idx = messages.findIndex(function (m) { return m.id === prevNewest; });
          if (idx >= 0) {
            newMsgCount += (messages.length - 1 - idx);
          } else {
            newMsgCount += 1;
          }
        } else if (hasNew && !prevNewest) {
          newMsgCount += 1;
        }
      }

      updateScrollButton();

      if (thread.status === 'accepted' && !blockedState.me && !blockedState.them) {
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
    const hasText = !!chatInput.value.trim();
    sendBtn.disabled = !hasText;
    sendBtn.hidden = !hasText;
    micBtn.hidden = hasText;
  }

  /* =========================================================
     Send text
     ========================================================= */

  function makeTempMessage(body, replyId) {
    return {
      id: 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      sender_id: me.id,
      body: body,
      photo_url: null,
      audio_url: null,
      audio_duration: null,
      read_at: null,
      delivered_at: null,
      created_at: new Date().toISOString(),
      reply_to_id: replyId || null,
      deleted_at: null,
      deleted_for: null,
      is_auto: false,
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
      var msg = res.error && (res.error.message || res.error.error_description) || 'unknown error';
      flashToast('Send failed: ' + msg);
      return;
    }

    allMessages[idx] = res.message;
    renderMessages();
    scrollToBottomNow();
  }

  async function handleSend(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!thread) return;

    if (blockedState.me || blockedState.them) {
      alert(blockedState.me ? 'You blocked this user.' : 'You cannot reply to this conversation.');
      return;
    }

    const body = chatInput.value.trim();
    if (!body) return;

    const savedReplyId = replyToId;
    const temp = makeTempMessage(body, savedReplyId);

    allMessages.push(temp);
    renderMessages();
    scrollToBottomNow();

    chatInput.value = '';
    cancelReply();
    autoGrow();

    actuallySend(temp.id, body, savedReplyId);
  }

  function retryMessage(messageId) {
    const m = findMessageById(messageId);
    if (!m || !m.__failed) return;

    if (m.audio_url) {
      retryVoiceMessage(messageId);
      return;
    }

    m.__failed = false;
    m.__pending = true;
    renderMessages();

    actuallySend(m.id, m.body, m.reply_to_id);
  }

  async function retryVoiceMessage(messageId) {
    const m = findMessageById(messageId);
    if (!m || !m.__failed) return;
    if (!m.__blob) {
      flashToast('Cannot retry — recording lost');
      return;
    }

    m.__failed = false;
    m.__pending = true;
    renderMessages();

    const res = await AUTH.sendVoiceMessage(thread.id, m.__blob, m.audio_duration);

    let idx = allMessages.findIndex(function (x) { return x.id === messageId; });

    if (idx === -1) {
      allMessages.push(m);
      idx = allMessages.length - 1;
    }

    if (!res.ok) {
      allMessages[idx].__pending = false;
      allMessages[idx].__failed = true;
      renderMessages();
      var msg = res.error && (res.error.message || res.error.error_description) || 'unknown error';
      flashToast('Voice failed: ' + msg);
      return;
    }

    const oldUrl = m.audio_url;
    allMessages[idx] = res.message;
    renderMessages();
    scrollToBottomNow();

    if (oldUrl && String(oldUrl).indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(oldUrl); } catch (e) {}
    }

    deleteFailedVoice(messageId);
  }

  /* =========================================================
     Reply
     ========================================================= */

  function startReply(messageId) {
    const m = findMessageById(messageId);
    if (!m) return;
    replyToId = messageId;
    replyName.textContent = m.sender_id === me.id ? 'You' : (other.name || 'Them');
    let preview = '';
    if (m.body) preview = m.body;
    else if (m.photo_url) preview = '📷 Photo';
    else if (m.audio_url) preview = '🎤 Voice note';
    replyPreview.textContent = preview;
    replyBar.hidden = false;
    chatInput.focus();
  }

  function cancelReply() {
    replyToId = null;
    replyBar.hidden = true;
    replyName.textContent = '';
    replyPreview.textContent = '';
  }

  /* =========================================================
     Context menu
     ========================================================= */

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

    if (starLabel) starLabel.textContent = 'Star';

    contextMenu.hidden = false;
  }

  function closeContext() {
    contextMenu.hidden = true;
    contextMessageId = null;
  }

  /* =========================================================
     Pending replies from service worker
     ========================================================= */

  async function flushPendingReplies() {
    try {
      const db = await new Promise(function (resolve, reject) {
        const req = indexedDB.open('stmdeskly-sw', 1);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });

      if (!db.objectStoreNames.contains('pending-replies')) {
        db.close();
        return;
      }

      const tx = db.transaction('pending-replies', 'readwrite');
      const store = tx.objectStore('pending-replies');

      const all = await new Promise(function (resolve) {
        const req = store.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
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
        scrollToBottomNow();
      }
    } catch (e) {
      console.warn('[chat] pending replies failed:', e);
    }
  }

  /* =========================================================
     Safety actions
     ========================================================= */

  async function doMuteToggle() {
    if (!thread) return;
    if (isMuted) {
      const res = await AUTH.unmuteThread(thread.id);
      if (!res.ok) { alert('Could not unmute. Try again.'); return; }
      isMuted = false;
    } else {
      const res = await AUTH.muteThread(thread.id);
      if (!res.ok) { alert('Could not mute. Try again.'); return; }
      isMuted = true;
    }
    chatMuteIcon.hidden = !isMuted;
    paintMuteMenu();
    chatMenuPanel.hidden = true;
  }

  async function doReport() {
    chatMenuPanel.hidden = true;
    if (!other) return;

    const reasons = ['Spam', 'Harassment', 'Scam or fraud', 'Inappropriate content', 'Other'];
    const choice = prompt(
      'Report ' + (other.name || 'this user') + ':\n\n' +
      reasons.map(function (r, i) { return (i + 1) + '. ' + r; }).join('\n') +
      '\n\nType the number:'
    );
    if (!choice) return;

    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= reasons.length) {
      alert('Please pick a number from the list.');
      return;
    }

    const notes = prompt('Add anything else (optional):') || '';

    const res = await AUTH.reportUser(other.user_id, reasons[idx], notes, thread.id);
    if (!res.ok) { alert('Could not send report. Try again.'); return; }
    alert('Thanks. We will review this report.');
  }

  async function doBlockToggle() {
    chatMenuPanel.hidden = true;
    if (!other) return;

    if (blockedState.me) {
      const res = await AUTH.unblockUser(other.user_id);
      if (!res.ok) { alert('Could not unblock. Try again.'); return; }
      blockedState.me = false;
      paintBlockMenu();
      paintBlockedBanner();
      if (thread.status === 'accepted') chatComposer.hidden = false;
      return;
    }

    if (!confirm('Block ' + (other.name || 'this user') + '?\n\nThey won\'t be able to message you.')) return;

    const res = await AUTH.blockUser(other.user_id);
    if (!res.ok) { alert('Could not block. Try again.'); return; }
    blockedState.me = true;
    paintBlockMenu();
    paintBlockedBanner();
    chatComposer.hidden = true;
  }

  /* =========================================================
     Quick replies
     ========================================================= */

  function renderQuickList() {
    if (!quickList) return;
    quickList.innerHTML = '';

    if (!quickRepliesCache.length) {
      const empty = document.createElement('div');
      empty.className = 'quick-empty';
      empty.textContent = 'No quick replies yet. Tap Add below to save your first one.';
      quickList.appendChild(empty);
      return;
    }

    quickRepliesCache.forEach(function (qr) {
      const row = document.createElement('div');
      row.className = 'quick-row';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-item';
      btn.textContent = qr.body;
      btn.addEventListener('click', function () {
        insertQuickReply(qr.body);
      });
      row.appendChild(btn);

      const menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'quick-item-menu';
      menu.setAttribute('aria-label', 'Options');
      menu.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
      menu.addEventListener('click', function (e) {
        e.stopPropagation();
        openQuickItemMenu(qr);
      });
      row.appendChild(menu);

      quickList.appendChild(row);
    });
  }

  function openQuickItemMenu(qr) {
    const preview = qr.body.slice(0, 40) + (qr.body.length > 40 ? '…' : '');
    const action = prompt(
      'Reply: "' + preview + '"\n\n' +
      'Type:\n' +
      '1 — Edit\n' +
      '2 — Delete\n' +
      '3 — Cancel'
    );
    if (!action) return;

    if (action === '1') {
      const next = prompt('Edit reply:', qr.body);
      if (!next || next.trim() === qr.body) return;
      AUTH.updateQuickReply(qr.id, next.trim()).then(function () {
        loadQuickReplies();
      });
    } else if (action === '2') {
      if (!confirm('Delete this quick reply?')) return;
      AUTH.deleteQuickReply(qr.id).then(function () {
        loadQuickReplies();
      });
    }
  }

  async function loadQuickReplies() {
    const res = await AUTH.getQuickReplies();
    quickRepliesCache = res.ok ? res.data : [];
    renderQuickList();
  }

  function insertQuickReply(text) {
    if (!chatInput) return;
    const current = chatInput.value;
    const next = current ? (current + ' ' + text) : text;
    chatInput.value = next;
    autoGrow();
    chatInput.focus();
    closeQuickSheet();
  }

  function openQuickSheet() {
    if (!quickOverlay) return;
    quickOverlay.hidden = false;
    loadQuickReplies();
  }

  function closeQuickSheet() {
    if (!quickOverlay) return;
    quickOverlay.hidden = true;
  }

  async function doAddQuickReply() {
    const text = prompt(
      'Write the message you want to save as a quick reply:\n\n' +
      'Examples:\n' +
      '• What is your address?\n' +
      '• My rate is ₦15,000 per session.\n' +
      '• Service times are 8am and 10am.'
    );
    if (!text) return;
    const clean = text.trim();
    if (!clean) return;

    const res = await AUTH.createQuickReply(clean, quickRepliesCache.length);
    if (!res.ok) {
      alert((res.error && res.error.message) || 'Could not save.');
      return;
    }
    loadQuickReplies();
  }

  function doSendDeskLink() {
    const username = me && me.user_metadata && me.user_metadata.username;
    const fallback = other && other.username;
    const link = location.origin + '/desk.html?u=' + encodeURIComponent(username || fallback || '');
    insertQuickReply(link);
  }

  function doShareLocation() {
    if (!navigator.geolocation) {
      const manual = prompt('Type your location:', '');
      if (!manual) return;
      insertQuickReply('📍 ' + manual.trim() + '\nhttps://maps.google.com/?q=' + encodeURIComponent(manual.trim()));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const url = 'https://maps.google.com/?q=' + lat + ',' + lng;
        insertQuickReply('📍 My location:\n' + url);
      },
      function () {
        const manual = prompt('Location access denied. Type your location:', '');
        if (!manual) return;
        insertQuickReply('📍 ' + manual.trim() + '\nhttps://maps.google.com/?q=' + encodeURIComponent(manual.trim()));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  /* =========================================================
     Search
     ========================================================= */

  function openSearch() {
    if (!searchOverlay) return;
    searchOverlay.hidden = false;
    searchInput.value = '';
    renderSearchResults('');
    searchInput.focus();
  }

  function closeSearch() {
    if (!searchOverlay) return;
    searchOverlay.hidden = true;
    searchResults.innerHTML = '';
  }

  function escapeForRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function renderSearchResults(q) {
    if (!searchResults) return;

    const term = String(q || '').trim().toLowerCase();

    if (!term) {
      searchResults.innerHTML = '<div class="search-empty">Type to search this conversation.</div>';
      searchCount.textContent = '';
      return;
    }

    const hits = allMessages.filter(function (m) {
      if (m.audio_url && !m.body) return false;
      if (!m.body) return false;
      return m.body.toLowerCase().indexOf(term) !== -1;
    });

    searchCount.textContent = hits.length ? hits.length + ' found' : 'none';

    if (!hits.length) {
      searchResults.innerHTML = '<div class="search-empty">No matches.</div>';
      return;
    }

    const re = new RegExp('(' + escapeForRegex(term) + ')', 'ig');

    searchResults.innerHTML = hits.map(function (m) {
      const mine = m.sender_id === me.id;
      const who = mine ? 'You' : (other.name || 'Them');
      const safe = esc(m.body).replace(re, '<mark>$1</mark>');
      const when = dayLabel(m.created_at) + ' · ' + timeShort(m.created_at);
      return '<button type="button" class="search-hit" data-msg-id="' + esc(m.id) + '">' +
        '<div class="search-hit-meta">' + esc(who) + ' · ' + esc(when) + '</div>' +
        '<div class="search-hit-body">' + safe + '</div>' +
      '</button>';
    }).join('');
  }

  /* =========================================================
     Starred
     ========================================================= */

  async function openStarred() {
    if (!starredOverlay) return;
    starredOverlay.hidden = false;
    starredList.innerHTML = '<div class="search-empty">Loading…</div>';

    const res = await AUTH.getStarredMessages();
    if (!res.ok || !res.data.length) {
      starredList.innerHTML = '<div class="search-empty">No starred messages yet. Long-press a message and tap Star.</div>';
      return;
    }

    starredList.innerHTML = res.data.map(function (row) {
      const m = row.message;
      const mine = m.sender_id === me.id;
      const who = mine ? 'You' : (other.name || 'Them');
      const when = dayLabel(m.created_at) + ' · ' + timeShort(m.created_at);
      let body;
      if (m.deleted_at) body = '<em>Message deleted</em>';
      else if (m.body) body = esc(m.body);
      else if (m.photo_url) body = '📷 Photo';
      else if (m.audio_url) body = '🎤 Voice note';
      else body = '';
      return '<button type="button" class="starred-item" data-msg-id="' + esc(m.id) + '">' +
        '<div class="starred-item-meta">' + esc(who) + ' · ' + esc(when) + '</div>' +
        '<div class="starred-item-body">' + body + '</div>' +
      '</button>';
    }).join('');
  }

  function closeStarred() {
    if (!starredOverlay) return;
    starredOverlay.hidden = true;
  }

  function scrollToMessage(messageId) {
    const el = chatLog.querySelector('.chat-bubble[data-id="' + messageId + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('chat-bubble-highlight');
    setTimeout(function () {
      el.classList.remove('chat-bubble-highlight');
    }, 1800);
  }

  async function toggleStarFromContext(messageId) {
    const res = await AUTH.toggleStarMessage(messageId);
    if (!res.ok) {
      alert('Could not update star.');
      return;
    }
    closeContext();
  }

  /* =========================================================
     VOICE RECORDING — tap to start
     ========================================================= */

  function micSupported() {
    return (
      typeof MediaRecorder !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      (location.protocol === 'https:' || location.hostname === 'localhost')
    );
  }

  function pickAudioMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (let i = 0; i < candidates.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (e) {}
    }
    return '';
  }

  function paintRecWave(levels) {
    if (!recWave) return;
    if (!recWave.childElementCount) {
      let html = '';
      for (let i = 0; i < REC_WAVE_BARS; i++) html += '<span></span>';
      recWave.innerHTML = html;
    }
    const spans = recWave.children;
    for (let i = 0; i < spans.length; i++) {
      const h = levels[i] || 0;
      spans[i].style.height = Math.max(2, Math.min(24, 2 + h * 22)) + 'px';
    }
  }

  function resetRecWave() {
    if (!recWave) return;
    recWave.innerHTML = '';
    paintRecWave(new Array(REC_WAVE_BARS).fill(0));
  }

  function startRecording() {
    if (!thread || recState) return;
    if (blockedState.me || blockedState.them) {
      alert('Cannot record while blocked.');
      return;
    }
    if (!micSupported()) {
      alert('Voice notes are not supported on this browser.');
      return;
    }

    const mime = pickAudioMime();

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = AudioCtx ? new AudioCtx() : null;
      let analyser = null;
      let source = null;
      let data = null;

      if (ctx) {
        try {
          source = ctx.createMediaStreamSource(stream);
          analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.6;
          source.connect(analyser);
          data = new Uint8Array(analyser.frequencyBinCount);
        } catch (e) { ctx = null; }
      }

      let recorder;
      try {
        recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
      } catch (e) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        alert('Could not start recorder.');
        return;
      }

      const chunks = [];
      const startedAt = Date.now();
      const localLevels = new Array(REC_WAVE_BARS).fill(0);

      const state = {
        recorder: recorder,
        stream: stream,
        ctx: ctx,
        analyser: analyser,
        data: data,
        chunks: chunks,
        startedAt: startedAt,
        localLevels: localLevels,
        tickId: null,
        cancelled: false
      };
      recState = state;

      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size) chunks.push(e.data);
      };

      recorder.onstop = function () {
        const durationSec = (Date.now() - state.startedAt) / 1000;
        try { state.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        try { if (state.ctx) state.ctx.close(); } catch (e) {}
        if (state.tickId) clearInterval(state.tickId);
        recState = null;

        hideRecorder();

        if (state.cancelled) return;

        if (durationSec < REC_MIN_SECONDS) {
          flashToast('Too short');
          return;
        }

        const blob = new Blob(chunks, { type: (recorder.mimeType || mime || 'audio/webm') });
        if (!blob.size) {
          flashToast('Empty recording');
          return;
        }

        sendVoiceBlob(blob, durationSec);
      };

      try {
        recorder.start();
      } catch (e) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        recState = null;
        hideRecorder();
        alert('Could not start recorder.');
        return;
      }

      showRecorder();
      updateRecTimer(0);
      paintRecWave(localLevels);

      state.tickId = setInterval(function () {
        const elapsed = (Date.now() - state.startedAt) / 1000;
        updateRecTimer(elapsed);

        if (state.analyser && state.data) {
          state.analyser.getByteFrequencyData(state.data);
          let sum = 0;
          for (let i = 0; i < state.data.length; i++) sum += state.data[i];
          const avg = sum / state.data.length / 255;
          state.localLevels.shift();
          state.localLevels.push(avg);
          paintRecWave(state.localLevels);
        }

        if (elapsed >= REC_MAX_SECONDS) {
          try { recorder.stop(); } catch (e) {}
        }
      }, 100);
    }).catch(function (err) {
      recState = null;
      hideRecorder();
      var msg = (err && err.name) ? err.name : 'Could not access microphone';
      if (msg === 'NotAllowedError' || msg === 'SecurityError') {
        alert('Microphone permission denied. Allow it in your browser settings, then try again.');
      } else if (msg === 'NotFoundError' || msg === 'DevicesNotFoundError') {
        alert('No microphone found on this device.');
      } else {
        alert('Could not start recording: ' + msg);
      }
    });
  }

  async function sendVoiceBlob(blob, durationSec) {
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const objectUrl = URL.createObjectURL(blob);

    const temp = {
      id: tempId,
      sender_id: me.id,
      body: null,
      photo_url: null,
      audio_url: objectUrl,
      audio_duration: Math.max(1, Math.round(durationSec)),
      read_at: null,
      delivered_at: null,
      created_at: new Date().toISOString(),
      reply_to_id: null,
      deleted_at: null,
      deleted_for: null,
      is_auto: false,
      __pending: true,
      __blob: blob
    };
    allMessages.push(temp);
    renderMessages();
    scrollToBottomNow();

    const res = await AUTH.sendVoiceMessage(thread.id, blob, durationSec);

    let idx = allMessages.findIndex(function (m) { return m.id === tempId; });

    if (idx === -1) {
      allMessages.push(temp);
      idx = allMessages.length - 1;
    }

    if (!res.ok) {
      allMessages[idx].__pending = false;
      allMessages[idx].__failed = true;

      saveFailedVoice({
        id: tempId,
        threadId: thread.id,
        audioDuration: temp.audio_duration,
        blob: blob,
        createdAt: Date.now()
      });

      renderMessages();
      var msg = res.error && (res.error.message || res.error.error_description) || 'unknown error';
      flashToast('Voice failed: ' + msg);
      return;
    }

    allMessages[idx] = res.message;
    renderMessages();
    scrollToBottomNow();
    try { URL.revokeObjectURL(objectUrl); } catch (e) {}

    deleteFailedVoice(tempId);
  }

  function showRecorder() {
    if (composerInner) composerInner.hidden = true;
    if (chatRecorder) chatRecorder.hidden = false;
    resetRecWave();
  }

  function hideRecorder() {
    if (chatRecorder) chatRecorder.hidden = true;
    if (composerInner) composerInner.hidden = false;
  }

  function updateRecTimer(sec) {
    if (!recTimer) return;
    const total = Math.min(REC_MAX_SECONDS, Math.floor(sec));
    recTimer.textContent = fmtDur(total);
  }

  function cancelRecording() {
    if (!recState) return;
    recState.cancelled = true;
    try { recState.recorder.stop(); } catch (e) {}
  }

  function finishRecordingAndSend() {
    if (!recState) return;
    try { recState.recorder.stop(); } catch (e) {}
  }

  let toastEl = null;
  let toastTimer = null;
  function flashToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:calc(100px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:90vw;background:rgba(23,43,58,.94);color:#fff;padding:10px 18px;border-radius:14px;font-size:12.5px;font-weight:600;z-index:220;pointer-events:none;opacity:0;transition:opacity .2s ease;text-align:center;line-height:1.4;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toastEl) toastEl.style.opacity = '0';
    }, 2600);
  }

  /* =========================================================
     VOICE PLAYBACK — wall-clock driven progress
     ========================================================= */

  function stopProgressLoop() {
    if (progressRaf) {
      cancelAnimationFrame(progressRaf);
      progressRaf = null;
    }
  }

  function startProgressLoop() {
    stopProgressLoop();
    const tick = function () {
      if (!playingMsgId) { progressRaf = null; return; }
      paintAudioProgress();
      progressRaf = requestAnimationFrame(tick);
    };
    progressRaf = requestAnimationFrame(tick);
  }

  // Wall-clock elapsed since playback started
  function getElapsedSeconds() {
    return playStartOffset + (Date.now() - playStartedAt) / 1000;
  }

  function paintAudioProgress() {
    if (!playingMsgId) return;
    const el = chatLog.querySelector('.chat-audio[data-id="' + playingMsgId + '"]');
    if (!el) return;
    const fill = el.querySelector('.chat-audio-track-fill');
    const dot  = el.querySelector('.chat-audio-dot');
    const timeEl = el.querySelector('.chat-audio-time');

    const dur = playTotalDur || parseFloat(el.dataset.duration) || 0;
    if (!dur) return;

    let cur = getElapsedSeconds();
    if (cur > dur) cur = dur;

    const pct = Math.min(100, (cur / dur) * 100);

    if (fill) fill.style.width = pct + '%';
    if (dot)  dot.style.left  = pct + '%';
    if (timeEl) timeEl.textContent = fmtDur(cur);

    // Auto-finish when we've reached the end
    if (cur >= dur - 0.05) {
      finishPlayback();
    }
  }

  function finishPlayback() {
    if (!playingMsgId) return;
    const el = chatLog.querySelector('.chat-audio[data-id="' + playingMsgId + '"]');
    if (el) {
      el.classList.remove('is-playing');
      const fill = el.querySelector('.chat-audio-track-fill');
      const dot  = el.querySelector('.chat-audio-dot');
      const timeEl = el.querySelector('.chat-audio-time');
      if (fill) fill.style.width = '0%';
      if (dot)  dot.style.left = '0%';
      if (timeEl) timeEl.textContent = fmtDur(parseFloat(el.dataset.duration) || 0);
    }
    playingMsgId = null;
    playStartOffset = 0;
    playStartedAt = 0;
    playTotalDur = 0;
    stopProgressLoop();
    try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch (e) {}
  }

  function stopAudio() {
    stopProgressLoop();
    try { audioEl.pause(); } catch (e) {}
    audioEl.removeAttribute('src');
    try { audioEl.load(); } catch (e) {}
    if (playingMsgId) {
      const el = chatLog.querySelector('.chat-audio[data-id="' + playingMsgId + '"]');
      if (el) {
        el.classList.remove('is-playing');
        const fill = el.querySelector('.chat-audio-track-fill');
        const dot  = el.querySelector('.chat-audio-dot');
        const timeEl = el.querySelector('.chat-audio-time');
        if (fill) fill.style.width = '0%';
        if (dot)  dot.style.left = '0%';
        if (timeEl) timeEl.textContent = fmtDur(parseFloat(el.dataset.duration) || 0);
      }
    }
    playingMsgId = null;
    playStartOffset = 0;
    playStartedAt = 0;
    playTotalDur = 0;
  }

  function toggleAudioPlayback(msgId) {
    if (playingMsgId === msgId) {
      stopAudio();
      return;
    }
    stopAudio();

    const el = chatLog.querySelector('.chat-audio[data-id="' + msgId + '"]');
    if (!el) return;

    const src = el.dataset.src;
    if (!src) return;

    const dur = parseFloat(el.dataset.duration) || 0;

    playingMsgId = msgId;
    playStartedAt = Date.now();
    playStartOffset = 0;
    playTotalDur = dur;

    el.classList.add('is-playing');

    const fill = el.querySelector('.chat-audio-track-fill');
    const dot  = el.querySelector('.chat-audio-dot');
    const timeEl = el.querySelector('.chat-audio-time');
    if (fill) fill.style.width = '0%';
    if (dot)  dot.style.left = '0%';
    if (timeEl) timeEl.textContent = fmtDur(0);

    audioEl.src = src;
    const p = audioEl.play();
    if (p && p.catch) {
      p.catch(function (err) {
        stopAudio();
        flashToast('Cannot play: ' + (err && err.name ? err.name : 'unknown'));
      });
    }

    startProgressLoop();
  }

  // Safety net: if the audio element somehow ends before the wall clock,
  // or after, end playback cleanly.
  audioEl.addEventListener('ended', function () {
    finishPlayback();
  });

  /* =========================================================
     Events
     ========================================================= */

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
    const audioBtn = e.target.closest('.chat-audio-play');
    if (photo || audioBtn || !bubble) return;
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

  chatLog.addEventListener('scroll', function () {
    updateScrollButton();
  }, { passive: true });

  if (scrollBottomBtn) {
    scrollBottomBtn.addEventListener('click', function () {
      scrollToBottomSmooth();
      newMsgCount = 0;
      updateScrollButton();
    });
  }

  chatLog.addEventListener('click', function (e) {
    const playBtn = e.target.closest('.chat-audio-play');
    if (playBtn) {
      const wrap = playBtn.closest('.chat-audio');
      if (wrap && wrap.dataset.id) toggleAudioPlayback(wrap.dataset.id);
      return;
    }

    const audioWrap = e.target.closest('.chat-audio');
    if (audioWrap && audioWrap.dataset.id) {
      toggleAudioPlayback(audioWrap.dataset.id);
      return;
    }

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

    if (action === 'star') {
      await toggleStarFromContext(msgId);
      return;
    }

    if (action === 'copy') {
      try { await navigator.clipboard.writeText(msg.body || ''); closeContext(); }
      catch (err) { prompt('Copy:', msg.body || ''); closeContext(); }
      return;
    }

    if (action === 'delete-me') {
      closeContext();
      await AUTH.deleteMessageForMe(msgId);
      if (msg.__failed || String(msg.id).indexOf('temp-') === 0) {
        deleteFailedVoice(msgId);
      }
      await refreshMessages();
      return;
    }

    if (action === 'delete-all') {
      if (!confirm('Delete this message for everyone?')) { closeContext(); return; }
      closeContext();
      const res = await AUTH.deleteMessageForEveryone(msgId);
      if (!res.ok) { alert('Could not delete. Try again.'); return; }
      if (playingMsgId === msgId) stopAudio();
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
    if (blockedState.me || blockedState.them) {
      alert('Cannot send while blocked.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) { alert('Max 5 MB.'); return; }
    attachBtn.disabled = true;
    const res = await AUTH.sendPhotoMessage(thread.id, file);
    attachBtn.disabled = false;
    if (!res.ok) {
      var msg = res.error && (res.error.message || res.error.error_description) || 'unknown error';
      alert('Could not send photo: ' + msg);
      return;
    }
    await refreshMessages();
    scrollToBottomNow();
  });

  if (micBtn) {
    micBtn.addEventListener('click', function (e) {
      e.preventDefault();
      startRecording();
    });
  }

  if (recCancel) {
    recCancel.addEventListener('click', function (e) {
      e.preventDefault();
      cancelRecording();
    });
  }

  if (recSend) {
    recSend.addEventListener('click', function (e) {
      e.preventDefault();
      finishRecordingAndSend();
    });
  }

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

  if (menuMute)   menuMute.addEventListener('click', doMuteToggle);
  if (menuReport) menuReport.addEventListener('click', doReport);
  if (menuBlock)  menuBlock.addEventListener('click', doBlockToggle);

  if (blockedUnblock) {
    blockedUnblock.addEventListener('click', doBlockToggle);
  }

  if (quickBtn)      quickBtn.addEventListener('click', openQuickSheet);
  if (quickClose)    quickClose.addEventListener('click', closeQuickSheet);
  if (quickAdd)      quickAdd.addEventListener('click', doAddQuickReply);
  if (quickDeskLink) quickDeskLink.addEventListener('click', doSendDeskLink);
  if (quickLocation) quickLocation.addEventListener('click', doShareLocation);

  if (quickOverlay) {
    quickOverlay.addEventListener('click', function (e) {
      if (e.target === quickOverlay) closeQuickSheet();
    });
  }

  if (chatSearchBtn) chatSearchBtn.addEventListener('click', openSearch);
  if (searchClose)   searchClose.addEventListener('click', closeSearch);

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      renderSearchResults(searchInput.value);
    });
  }

  if (searchResults) {
    searchResults.addEventListener('click', function (e) {
      const hit = e.target.closest('.search-hit');
      if (!hit) return;
      const msgId = hit.dataset.msgId;
      closeSearch();
      setTimeout(function () { scrollToMessage(msgId); }, 100);
    });
  }

  if (menuStarred) {
    menuStarred.addEventListener('click', function () {
      chatMenuPanel.hidden = true;
      openStarred();
    });
  }
  if (starredClose) starredClose.addEventListener('click', closeStarred);

  if (starredList) {
    starredList.addEventListener('click', function (e) {
      const item = e.target.closest('.starred-item');
      if (!item) return;
      const msgId = item.dataset.msgId;
      closeStarred();
      setTimeout(function () { scrollToMessage(msgId); }, 100);
    });
  }

  if (starredOverlay) {
    starredOverlay.addEventListener('click', function (e) {
      if (e.target === starredOverlay) closeStarred();
    });
  }

  if (searchOverlay) {
    searchOverlay.addEventListener('click', function (e) {
      if (e.target === searchOverlay) closeSearch();
    });
  }

  chatMenu.addEventListener('click', function (e) {
    e.stopPropagation();
    chatMenuPanel.hidden = !chatMenuPanel.hidden;
  });

  document.addEventListener('click', function (e) {
    if (!chatMenuPanel.hidden && !chatMenuPanel.contains(e.target) && e.target !== chatMenu) {
      chatMenuPanel.hidden = true;
    }
  });

  /* =========================================================
     Realtime
     ========================================================= */

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

  /* =========================================================
     Boot
     ========================================================= */

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
          chatMissing.hidden = false;
          return;
        }
        thread = res.thread;
        other = res.other;
      } else if (toUserId) {
        const res = await AUTH.startThread(toUserId);
        if (!res.ok) {
          chatMissing.hidden = false;
          return;
        }
        const full = await AUTH.loadThread(res.thread.id);
        if (!full.ok) {
          chatMissing.hidden = false;
          return;
        }
        thread = full.thread;
        other = full.other;
      } else {
        chatMissing.hidden = false;
        return;
      }

      try {
        isMuted = await AUTH.isThreadMuted(thread.id);
      } catch (e) { isMuted = false; }

      try {
        blockedState = await AUTH.isBlocked(other.user_id);
      } catch (e) { blockedState = { me: false, them: false }; }

      paintHeader();
      paintMuteMenu();
      paintBlockMenu();
      paintBanners();

      chatLog.hidden = false;

      const failedVoice = await loadFailedVoice(thread.id);

      await refreshMessages();

      if (failedVoice.length) {
        let added = 0;
        for (let i = 0; i < failedVoice.length; i++) {
          const f = failedVoice[i];
          if (allMessages.some(function (m) { return m.id === f.id; })) continue;
          const objectUrl = URL.createObjectURL(f.blob);
          allMessages.push({
            id: f.id,
            sender_id: me.id,
            body: null,
            photo_url: null,
            audio_url: objectUrl,
            audio_duration: f.audioDuration,
            read_at: null,
            delivered_at: null,
            created_at: new Date(f.createdAt).toISOString(),
            reply_to_id: null,
            deleted_at: null,
            deleted_for: null,
            is_auto: false,
            __failed: true,
            __blob: f.blob
          });
          added++;
        }
        if (added) {
          allMessages.sort(function (a, b) {
            return new Date(a.created_at) - new Date(b.created_at);
          });
          renderMessages();
        }
      }

      scrollToBottomNow();
      pinToBottomAfterImages();
      updateScrollButton();

      autoGrow();
      updatePresence();
      initTyping();
      initMessagesRealtime();

      await flushPendingReplies();

      if (thread.status === 'accepted' && !blockedState.me && !blockedState.them) {
        chatInput.focus();
      }

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
    if (recState) {
      recState.cancelled = true;
      try { recState.recorder.stop(); } catch (e) {}
    }
    try { stopAudio(); } catch (e) {}
    try { if (messagesChannel) AUTH.sb.removeChannel(messagesChannel); } catch (e) {}
    try { if (typingChannel) typingChannel.unsubscribe(); } catch (e) {}
  });
})();
