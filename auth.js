// STMDESKLY v2 — Auth module
(function () {
  'use strict';

  const cfg = window.SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.anonKey || cfg.anonKey === 'PASTE_YOUR_ANON_KEY_HERE') {
    console.error('Set SUPABASE_CONFIG in config.js first.');
    return;
  }

  const { createClient } = window.supabase;
  const sb = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'stmdeskly-auth',
    },
  });

  /* ---------- Rate limit ---------- */
  const RL_KEY = 'stm_rl';
  function rlGet() {
    try { return JSON.parse(localStorage.getItem(RL_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function rlSet(obj) {
    try { localStorage.setItem(RL_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function rlCheck(key, max, windowMs) {
    const now = Date.now();
    const all = rlGet();
    const arr = (all[key] || []).filter(function (t) { return now - t < windowMs; });
    all[key] = arr;
    rlSet(all);
    return arr.length < max;
  }
  function rlRecord(key, windowMs) {
    const now = Date.now();
    const all = rlGet();
    const arr = (all[key] || []).filter(function (t) { return now - t < windowMs; });
    arr.push(now);
    all[key] = arr;
    rlSet(all);
  }

  /* ---------- Password strength ---------- */
  function pwStrength(pw) {
    if (!pw) return { score: 0, label: '', ok: false };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score > 4) score = 4;
    const labels = ['Very weak', 'Weak', 'Okay', 'Good', 'Strong'];
    return { score: score, label: labels[score], ok: pw.length >= 8 && score >= 2 };
  }

  /* ---------- Breach check (HIBP) ---------- */
  async function sha1Hex(str) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('crypto.subtle is not available.');
    }
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-1', buf);
    return Array.from(new Uint8Array(hash))
      .map(function (b) { return b.toString(16).padStart(2, '0'); })
      .join('')
      .toUpperCase();
  }

  async function pwBreached(pw) {
    try {
      const hash = await sha1Hex(pw);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      const res = await fetch('https://api.pwnedpasswords.com/range/' + prefix);
      if (!res.ok) return false;
      const text = await res.text();
      return text.split('\n').some(function (line) {
        return line.split(':')[0] === suffix;
      });
    } catch (e) { return false; }
  }

  /* ---------- Username availability ---------- */
  async function checkUsername(username) {
    const clean = String(username || '').trim().toLowerCase();
    if (!clean) return { ok: false, reason: 'empty' };
    if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/.test(clean)) {
      return { ok: false, reason: 'format' };
    }
    const res = await sb.from('desks').select('id').eq('username', clean).maybeSingle();
    if (res.error && res.error.code !== 'PGRST116') {
      return { ok: false, reason: 'error' };
    }
    if (res.data) return { ok: false, reason: 'taken' };
    return { ok: true, username: clean };
  }

  /* ---------- Signup with email ---------- */
  async function signupEmail(input) {
    const res = await sb.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: location.origin + '/signup.html',
        captchaToken: input.captchaToken || undefined,
        data: {
          name: input.name,
          username: input.username,
          role: input.role || null,
          whatsapp: input.whatsapp || null,
        },
      },
    });
    if (res.error) return { ok: false, error: res.error };

    const user = res.data.user;
    const session = res.data.session;

    if (!session) return { ok: true, needsConfirm: true, user: user };

    const deskRes = await sb.from('desks').insert({
      user_id: user.id,
      username: input.username,
      name: input.name,
      role: input.role || null,
      whatsapp: input.whatsapp || null,
      email: user.email,
    });

    if (deskRes.error) return { ok: false, error: deskRes.error, user: user };
    return { ok: true, user: user, session: session };
  }

  /* ---------- Login ---------- */
  async function loginEmail(input) {
    const res = await sb.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, user: res.data.user, session: res.data.session };
  }

  /* ---------- Google OAuth ---------- */
  async function signInGoogle(redirectTo) {
    const res = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || (location.origin + '/signup.html'),
      },
    });
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  /* ---------- Create desk ---------- */
  async function createDesk(input) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const deskRes = await sb.from('desks').insert({
      user_id: user.id,
      username: input.username,
      name: input.name,
      role: input.role || null,
      whatsapp: input.whatsapp || null,
      email: user.email,
    });
    if (deskRes.error) return { ok: false, error: deskRes.error };
    return { ok: true };
  }

  /* ---------- Current user / desk ---------- */
  async function currentUser() {
    const res = await sb.auth.getUser();
    return res.data.user || null;
  }

  async function currentDesk() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return null;
    const res = await sb.from('desks')
      .select('id, username, name')
      .eq('user_id', user.id)
      .maybeSingle();
    if (res.error) return null;
    return res.data;
  }

  /* ---------- Logout ---------- */
  async function logout() {
    await sb.auth.signOut();
  }

  /* ---------- Password reset ---------- */
  async function sendPasswordReset(email) {
    try {
      const res = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + '/reset.html',
      });
      if (res.error) return { ok: false, error: res.error };
      return { ok: true };
    } catch (err) { return { ok: false, error: err }; }
  }

  async function updatePassword(newPassword) {
    try {
      const res = await sb.auth.updateUser({ password: newPassword });
      if (res.error) return { ok: false, error: res.error };
      return { ok: true };
    } catch (err) { return { ok: false, error: err }; }
  }

  /* =========================================================
     EDITOR — desk updates and media
     ========================================================= */

  async function updateDesk(fields) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb
      .from('desks')
      .update(fields)
      .eq('user_id', user.id)
      .select('id')
      .single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: res.data };
  }

  async function compressImage(file, maxSize) {
    maxSize = maxSize || 1200;
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = function () {
        URL.revokeObjectURL(url);
        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          } else {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Could not process image'));
        }, 'image/jpeg', 0.85);
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image'));
      };

      img.src = url;
    });
  }

  async function uploadAvatar(file) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    try {
      const blob = await compressImage(file, 600);
      const path = user.id + '/avatar.jpg';
      const up = await sb.storage.from('desk-photos').upload(path, blob, {
        contentType: 'image/jpeg', upsert: true,
      });
      if (up.error) return { ok: false, error: up.error };
      const pub = sb.storage.from('desk-photos').getPublicUrl(path);
      return { ok: true, url: pub.data.publicUrl + '?t=' + Date.now() };
    } catch (err) { return { ok: false, error: err }; }
  }

  async function uploadCover(file) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    try {
      const blob = await compressImage(file, 1600);
      const path = user.id + '/cover.jpg';
      const up = await sb.storage.from('desk-photos').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (up.error) return { ok: false, error: up.error };
      const pub = sb.storage.from('desk-photos').getPublicUrl(path);
      return { ok: true, url: pub.data.publicUrl + '?t=' + Date.now() };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  async function uploadPhoto(file) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    try {
      const blob = await compressImage(file, 1400);
      const id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(36).slice(2, 9);
      const path = user.id + '/photos/' + id + '.jpg';

      const up = await sb.storage.from('desk-photos').upload(path, blob, {
        contentType: 'image/jpeg', upsert: false,
      });
      if (up.error) return { ok: false, error: up.error };
      const pub = sb.storage.from('desk-photos').getPublicUrl(path);
      return { ok: true, url: pub.data.publicUrl };
    } catch (err) { return { ok: false, error: err }; }
  }

  async function removePhoto(url) {
    try {
      const marker = '/desk-photos/';
      const idx = String(url).indexOf(marker);
      if (idx === -1) return { ok: true };
      let path = url.slice(idx + marker.length);
      const q = path.indexOf('?');
      if (q !== -1) path = path.slice(0, q);
      const res = await sb.storage.from('desk-photos').remove([path]);
      if (res.error) return { ok: false, error: res.error };
      return { ok: true };
    } catch (err) { return { ok: false, error: err }; }
  }

  /* =========================================================
     FEED — posts
     ========================================================= */

  async function createPost(input) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('posts').insert({
      user_id: user.id,
      category: input.category,
      title: input.title || null,
      body: input.body,
      photos: input.photos || [],
      contact_whatsapp: input.whatsapp || null,
      location: input.location || null,
      price: input.price || null,
    }).select('id').single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: res.data };
  }

  async function uploadPostPhoto(file) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    try {
      const blob = await compressImage(file, 1400);
      const id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(36).slice(2, 9);
      const path = user.id + '/posts/' + id + '.jpg';

      const up = await sb.storage.from('desk-photos').upload(path, blob, {
        contentType: 'image/jpeg', upsert: false,
      });
      if (up.error) return { ok: false, error: up.error };
      const pub = sb.storage.from('desk-photos').getPublicUrl(path);
      return { ok: true, url: pub.data.publicUrl };
    } catch (err) { return { ok: false, error: err }; }
  }

  async function toggleReaction(postId, emoji) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const existing = await sb
      .from('post_reactions')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
      .maybeSingle();

    if (existing.data) {
      const del = await sb.from('post_reactions').delete().eq('id', existing.data.id);
      if (del.error) return { ok: false, error: del.error };
      return { ok: true, removed: true };
    }

    const ins = await sb.from('post_reactions').insert({
      post_id: postId, user_id: user.id, emoji: emoji,
    });
    if (ins.error) return { ok: false, error: ins.error };
    return { ok: true, added: true };
  }

  async function getPostReactions(postIds) {
    if (!Array.isArray(postIds) || !postIds.length) return { ok: true, data: {} };

    const res = await sb
      .from('post_reactions')
      .select('post_id, emoji, user_id')
      .in('post_id', postIds);

    if (res.error) return { ok: false, error: res.error };

    const userRes = await sb.auth.getUser();
    const me = userRes.data.user ? userRes.data.user.id : null;

    const map = {};
    (res.data || []).forEach(function (r) {
      if (!map[r.post_id]) map[r.post_id] = { count: 0, mine: {} };
      map[r.post_id].count += 1;
      if (me && r.user_id === me) map[r.post_id].mine[r.emoji] = true;
    });

    return { ok: true, data: map };
  }

  async function deletePost(postId) {
    if (!postId) return { ok: false, error: { message: 'Missing post id' } };

    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', user.id);

    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  /* =========================================================
     REPLIES
     ========================================================= */

  async function getPostReplies(postId) {
    if (!postId) return { ok: true, data: [] };

    const res = await sb
      .from('post_replies')
      .select('id, user_id, body, created_at')
      .eq('post_id', postId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(100);

    if (res.error) return { ok: false, error: res.error };

    const replies = res.data || [];
    const userIds = [...new Set(replies.map(function (r) { return r.user_id; }).filter(Boolean))];
    let nameMap = {};
    if (userIds.length) {
      const aRes = await sb.from('desks').select('user_id, name').in('user_id', userIds);
      if (!aRes.error && aRes.data) {
        aRes.data.forEach(function (d) { nameMap[d.user_id] = d.name; });
      }
    }

    replies.forEach(function (r) {
      r.author_name = nameMap[r.user_id] || 'Someone';
    });

    return { ok: true, data: replies };
  }

  async function createReply(postId, body) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb
      .from('post_replies')
      .insert({ post_id: postId, user_id: user.id, body: body })
      .select('id, user_id, body, created_at')
      .single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: res.data };
  }

  async function getReplyCounts(postIds) {
    if (!Array.isArray(postIds) || !postIds.length) return { ok: true, data: {} };
    const res = await sb
      .from('post_replies')
      .select('post_id')
      .in('post_id', postIds)
      .is('deleted_at', null);
    if (res.error) return { ok: false, error: res.error };
    const map = {};
    (res.data || []).forEach(function (r) {
      map[r.post_id] = (map[r.post_id] || 0) + 1;
    });
    return { ok: true, data: map };
  }

  async function deleteReply(replyId) {
    if (!replyId) return { ok: false, error: { message: 'Missing reply id' } };

    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb
      .from('post_replies')
      .delete()
      .eq('id', replyId)
      .eq('user_id', user.id);

    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  /* =========================================================
     CHAT — threads and messages
     ========================================================= */

  function sortPair(a, b) {
    return a < b ? [a, b] : [b, a];
  }

  async function startThread(otherUserId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };
    if (user.id === otherUserId) return { ok: false, error: { message: 'You cannot chat with yourself' } };

    const pair = sortPair(user.id, otherUserId);
    const a = pair[0];
    const b = pair[1];

    // Look for existing
    const existing = await sb
      .from('chat_threads')
      .select('id, status, initiated_by, user_a, user_b')
      .eq('user_a', a)
      .eq('user_b', b)
      .maybeSingle();

    if (existing.error && existing.error.code !== 'PGRST116') {
      return { ok: false, error: existing.error };
    }
    if (existing.data) return { ok: true, thread: existing.data, created: false };

    const ins = await sb.from('chat_threads').insert({
      user_a: a,
      user_b: b,
      initiated_by: user.id,
      status: 'pending'
    }).select('id, status, initiated_by, user_a, user_b').single();

    if (ins.error) return { ok: false, error: ins.error };
    return { ok: true, thread: ins.data, created: true };
  }

  async function loadThread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const tRes = await sb
      .from('chat_threads')
      .select('id, user_a, user_b, status, initiated_by, last_message_at')
      .eq('id', threadId)
      .maybeSingle();

    if (tRes.error || !tRes.data) {
      return { ok: false, error: tRes.error || { message: 'Thread not found' } };
    }
    const thread = tRes.data;

    const otherId = thread.user_a === user.id ? thread.user_b : thread.user_a;

    const pRes = await sb
      .from('desks')
      .select('user_id, name, username, avatar_url, role')
      .eq('user_id', otherId)
      .maybeSingle();

    const other = pRes.data || { user_id: otherId, name: 'Someone' };

    return { ok: true, thread: thread, other: other, me: user };
  }

  async function loadMessages(threadId, limit) {
    limit = limit || 50;
    const res = await sb
      .from('chat_messages')
      .select('id, sender_id, body, photo_url, read_at, created_at, reply_to_id, deleted_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: res.data || [] };
  }

  async function sendMessage(threadId, body) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb
      .from('chat_messages')
      .insert({ thread_id: threadId, sender_id: user.id, body: body })
      .select('id, sender_id, body, photo_url, read_at, created_at, reply_to_id, deleted_at')
      .single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, message: res.data };
  }

  async function acceptThread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb
      .from('chat_threads')
      .update({ status: 'accepted' })
      .eq('id', threadId)
      .select('id, status')
      .single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, thread: res.data };
  }

  async function declineThread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb
      .from('chat_threads')
      .update({ status: 'declined' })
      .eq('id', threadId)
      .select('id, status')
      .single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, thread: res.data };
  }

  async function markMessagesRead(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false };

    await sb
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .is('read_at', null)
      .neq('sender_id', user.id);

    return { ok: true };
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.AUTH = {
    sb: sb,

    // Auth
    pwStrength: pwStrength,
    pwBreached: pwBreached,
    checkUsername: checkUsername,
    signupEmail: signupEmail,
    loginEmail: loginEmail,
    signInGoogle: signInGoogle,
    createDesk: createDesk,
    currentUser: currentUser,
    currentDesk: currentDesk,
    logout: logout,
    rlCheck: rlCheck,
    rlRecord: rlRecord,
    sendPasswordReset: sendPasswordReset,
    updatePassword: updatePassword,

    // Editor
    updateDesk: updateDesk,
    uploadAvatar: uploadAvatar,
    uploadCover: uploadCover,
    uploadPhoto: uploadPhoto,
    removePhoto: removePhoto,

    // Feed — posts
    createPost: createPost,
    uploadPostPhoto: uploadPostPhoto,
    toggleReaction: toggleReaction,
    getPostReactions: getPostReactions,
    deletePost: deletePost,

    // Replies
    getPostReplies: getPostReplies,
    createReply: createReply,
    getReplyCounts: getReplyCounts,
    deleteReply: deleteReply,

    // Chat
    startThread: startThread,
    loadThread: loadThread,
    loadMessages: loadMessages,
    sendMessage: sendMessage,
    acceptThread: acceptThread,
    declineThread: declineThread,
    markMessagesRead: markMessagesRead,
  };
})();
