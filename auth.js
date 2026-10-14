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

  const MSG_COLS = 'id, sender_id, body, photo_url, audio_url, audio_duration, read_at, delivered_at, created_at, reply_to_id, deleted_at, deleted_for, is_auto';

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
     EDITOR
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
        contentType: 'image/jpeg', upsert: true,
      });
      if (up.error) return { ok: false, error: up.error };
      const pub = sb.storage.from('desk-photos').getPublicUrl(path);
      return { ok: true, url: pub.data.publicUrl + '?t=' + Date.now() };
    } catch (err) { return { ok: false, error: err }; }
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
    const meId = userRes.data.user ? userRes.data.user.id : null;

    const map = {};
    (res.data || []).forEach(function (r) {
      if (!map[r.post_id]) map[r.post_id] = { count: 0, mine: {} };
      map[r.post_id].count += 1;
      if (meId && r.user_id === meId) map[r.post_id].mine[r.emoji] = true;
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
     POST REPLIES
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
     CHAT — threads
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

    if (tRes.error || !tRes.data) return { ok: false, error: tRes.error || { message: 'Thread not found' } };
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
    limit = limit || 100;
    const userRes = await sb.auth.getUser();
    const me = userRes.data.user ? userRes.data.user.id : null;

    const res = await sb
      .from('chat_messages')
      .select(MSG_COLS)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (res.error) return { ok: false, error: res.error };

    const all = res.data || [];
    const visible = all.filter(function (m) {
      if (!me) return true;
      const df = Array.isArray(m.deleted_for) ? m.deleted_for : [];
      return df.indexOf(me) === -1;
    });

    return { ok: true, data: visible, all: all };
  }

  async function sendMessage(threadId, body) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb
      .from('chat_messages')
      .insert({ thread_id: threadId, sender_id: user.id, body: body })
      .select(MSG_COLS)
      .single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, message: res.data };
  }

  async function sendReply(threadId, body, replyToId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('chat_messages').insert({
      thread_id: threadId,
      sender_id: user.id,
      body: body,
      reply_to_id: replyToId
    }).select(MSG_COLS).single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, message: res.data };
  }

  async function sendPhotoMessage(threadId, file) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    try {
      const blob = await compressImage(file, 1400);
      const id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(36).slice(2, 9);

      const path = user.id + '/chat/' + threadId + '/' + id + '.jpg';

      const up = await sb.storage.from('desk-photos').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false
      });
      if (up.error) return { ok: false, error: up.error };

      const pub = sb.storage.from('desk-photos').getPublicUrl(path);

      const ins = await sb.from('chat_messages').insert({
        thread_id: threadId,
        sender_id: user.id,
        photo_url: pub.data.publicUrl
      }).select(MSG_COLS).single();

      if (ins.error) return { ok: false, error: ins.error };
      return { ok: true, message: ins.data };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  async function sendVoiceMessage(threadId, blob, durationSec) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    try {
      if (!blob || !blob.size) return { ok: false, error: { message: 'Empty recording' } };

      const id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(36).slice(2, 9);

      const type = blob.type || 'audio/webm';
      let ext = 'webm';
      if (type.indexOf('mp4') !== -1) ext = 'm4a';
      else if (type.indexOf('ogg') !== -1) ext = 'ogg';
      else if (type.indexOf('webm') !== -1) ext = 'webm';
      else if (type.indexOf('mpeg') !== -1) ext = 'mp3';

      const path = user.id + '/voice/' + threadId + '/' + id + '.' + ext;

      const up = await sb.storage.from('desk-photos').upload(path, blob, {
        contentType: type,
        upsert: false
      });
      if (up.error) return { ok: false, error: up.error };

      const pub = sb.storage.from('desk-photos').getPublicUrl(path);

      const duration = Math.max(1, Math.round(Number(durationSec) || 1));

      const ins = await sb.from('chat_messages').insert({
        thread_id: threadId,
        sender_id: user.id,
        audio_url: pub.data.publicUrl,
        audio_duration: duration
      }).select(MSG_COLS).single();

      if (ins.error) return { ok: false, error: ins.error };
      return { ok: true, message: ins.data };
    } catch (err) {
      return { ok: false, error: err };
    }
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

    const res = await sb
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .is('read_at', null)
      .neq('sender_id', user.id);

    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async function markMessagesDelivered(threadIds) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false };

    let ids = threadIds;

    if (!ids) {
      const asA = await sb.from('chat_threads').select('id').eq('user_a', user.id);
      const asB = await sb.from('chat_threads').select('id').eq('user_b', user.id);
      ids = [...(asA.data || []), ...(asB.data || [])].map(function (t) { return t.id; });
    } else if (typeof ids === 'string') {
      ids = [ids];
    }

    if (!ids.length) return { ok: true };

    const res = await sb
      .from('chat_messages')
      .update({ delivered_at: new Date().toISOString() })
      .in('thread_id', ids)
      .is('delivered_at', null)
      .neq('sender_id', user.id);

    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  /* =========================================================
     CHAT — reactions, delete, presence
     ========================================================= */

  async function toggleMessageReaction(messageId, emoji) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const existing = await sb
      .from('chat_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
      .maybeSingle();

    if (existing.data) {
      const del = await sb.from('chat_reactions').delete().eq('id', existing.data.id);
      if (del.error) return { ok: false, error: del.error };
      return { ok: true, removed: true };
    }

    const ins = await sb.from('chat_reactions').insert({
      message_id: messageId,
      user_id: user.id,
      emoji: emoji
    });
    if (ins.error) return { ok: false, error: ins.error };
    return { ok: true, added: true };
  }

  async function getMessageReactions(messageIds) {
    if (!Array.isArray(messageIds) || !messageIds.length) return { ok: true, data: {} };

    const res = await sb
      .from('chat_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds);

    if (res.error) return { ok: false, error: res.error };

    const userRes = await sb.auth.getUser();
    const meId = userRes.data.user ? userRes.data.user.id : null;

    const map = {};
    (res.data || []).forEach(function (r) {
      if (!map[r.message_id]) map[r.message_id] = {};
      if (!map[r.message_id][r.emoji]) map[r.message_id][r.emoji] = { count: 0, mine: false };
      map[r.message_id][r.emoji].count += 1;
      if (meId && r.user_id === meId) map[r.message_id][r.emoji].mine = true;
    });

    return { ok: true, data: map };
  }

  async function deleteMessageForMe(messageId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const cur = await sb.from('chat_messages').select('deleted_for').eq('id', messageId).maybeSingle();
    if (cur.error) return { ok: false, error: cur.error };

    const list = Array.isArray(cur.data && cur.data.deleted_for) ? cur.data.deleted_for.slice() : [];
    if (list.indexOf(user.id) === -1) list.push(user.id);

    const res = await sb.from('chat_messages').update({ deleted_for: list }).eq('id', messageId);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async function deleteMessageForEveryone(messageId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const cur = await sb.from('chat_messages').select('sender_id, created_at').eq('id', messageId).maybeSingle();
    if (cur.error || !cur.data) return { ok: false, error: cur.error || { message: 'Not found' } };
    if (cur.data.sender_id !== user.id) return { ok: false, error: { message: 'Only the sender can delete for everyone' } };
    if (Date.now() - new Date(cur.data.created_at).getTime() > 24 * 60 * 60 * 1000) {
      return { ok: false, error: { message: 'Too late to delete for everyone' } };
    }

    const res = await sb.from('chat_messages').update({
      deleted_at: new Date().toISOString(),
      body: null,
      photo_url: null,
      audio_url: null
    }).eq('id', messageId);

    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async function touchPresence() {
    try {
      await sb.rpc('touch_presence');
      return { ok: true };
    } catch (e) {
      return { ok: false };
    }
  }

  async function getPresence(userId) {
    const res = await sb.from('desks').select('last_seen_at').eq('user_id', userId).maybeSingle();
    if (res.error || !res.data) return { online: false, lastSeen: null };
    const t = res.data.last_seen_at;
    if (!t) return { online: false, lastSeen: null };
    const diff = Date.now() - new Date(t).getTime();
    return { online: diff < 90000, lastSeen: t };
  }

  /* =========================================================
     SAFETY — mute, block, report
     ========================================================= */

  async function muteThread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('chat_mutes').insert({
      user_id: user.id,
      thread_id: threadId
    });
    if (res.error && res.error.code !== '23505') {
      return { ok: false, error: res.error };
    }
    return { ok: true };
  }

  async function unmuteThread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('chat_mutes')
      .delete()
      .eq('user_id', user.id)
      .eq('thread_id', threadId);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async function isThreadMuted(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return false;

    const res = await sb.from('chat_mutes')
      .select('id')
      .eq('user_id', user.id)
      .eq('thread_id', threadId)
      .maybeSingle();
    return !!res.data;
  }

  async function getMutedThreads() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: true, data: [] };

    const res = await sb.from('chat_mutes')
      .select('thread_id')
      .eq('user_id', user.id);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: (res.data || []).map(function (r) { return r.thread_id; }) };
  }

  async function blockUser(userId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };
    if (user.id === userId) return { ok: false, error: { message: 'You cannot block yourself' } };

    const res = await sb.from('user_blocks').insert({
      blocker_id: user.id,
      blocked_id: userId
    });
    if (res.error && res.error.code !== '23505') {
      return { ok: false, error: res.error };
    }
    return { ok: true };
  }

  async function unblockUser(userId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('user_blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', userId);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async function isBlocked(userId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { me: false, them: false };

    const mineRes = await sb.from('user_blocks')
      .select('id')
      .eq('blocker_id', user.id)
      .eq('blocked_id', userId)
      .maybeSingle();

    const theirRes = await sb.from('user_blocks')
      .select('id')
      .eq('blocker_id', userId)
      .eq('blocked_id', user.id)
      .maybeSingle();

    return {
      me: !!mineRes.data,
      them: !!theirRes.data
    };
  }

  async function getBlockedUsers() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: true, data: [] };

    const res = await sb.from('user_blocks')
      .select('blocked_id, created_at')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: res.data || [] };
  }

  async function reportUser(userId, reason, notes, threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };
    if (user.id === userId) return { ok: false, error: { message: 'You cannot report yourself' } };

    const res = await sb.from('user_reports').insert({
      reporter_id: user.id,
      reported_id: userId,
      reason: reason,
      notes: notes || null,
      thread_id: threadId || null
    });
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  /* =========================================================
     QUICK REPLIES
     ========================================================= */

  async function getQuickReplies() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: true, data: [] };

    const res = await sb.from('quick_replies')
      .select('id, body, sort_order, created_at')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: res.data || [] };
  }

  async function createQuickReply(body, sortOrder) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const clean = String(body || '').trim();
    if (!clean) return { ok: false, error: { message: 'Empty reply' } };
    if (clean.length > 500) return { ok: false, error: { message: 'Too long (max 500)' } };

    const res = await sb.from('quick_replies').insert({
      user_id: user.id,
      body: clean,
      sort_order: sortOrder || 0
    }).select('id, body, sort_order, created_at').single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: res.data };
  }

  async function updateQuickReply(id, body) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const clean = String(body || '').trim();
    if (!clean) return { ok: false, error: { message: 'Empty reply' } };
    if (clean.length > 500) return { ok: false, error: { message: 'Too long (max 500)' } };

    const res = await sb.from('quick_replies')
      .update({ body: clean })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, body, sort_order, created_at')
      .single();

    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: res.data };
  }

  async function deleteQuickReply(id) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('quick_replies')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  /* =========================================================
     AWAY AUTO-REPLY
     ========================================================= */

  async function getAwaySettings() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, enabled: false, message: '' };

    const res = await sb.from('desks')
      .select('away_enabled, away_message')
      .eq('user_id', user.id)
      .maybeSingle();

    if (res.error) return { ok: false, enabled: false, message: '' };
    return {
      ok: true,
      enabled: !!(res.data && res.data.away_enabled),
      message: (res.data && res.data.away_message) || ''
    };
  }

  async function setAwaySettings(enabled, message) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const clean = String(message || '').trim();
    if (clean.length > 300) {
      return { ok: false, error: { message: 'Message too long (max 300)' } };
    }

    const res = await sb.from('desks')
      .update({
        away_enabled: !!enabled,
        away_message: clean || null
      })
      .eq('user_id', user.id);

    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  /* =========================================================
     BATCH 3 — stars, archives, pins, forced unread
     ========================================================= */

  async function toggleStarMessage(messageId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const existing = await sb.from('chat_stars')
      .select('id')
      .eq('user_id', user.id)
      .eq('message_id', messageId)
      .maybeSingle();

    if (existing.data) {
      await sb.from('chat_stars').delete().eq('id', existing.data.id);
      return { ok: true, starred: false };
    }

    const ins = await sb.from('chat_stars').insert({
      user_id: user.id,
      message_id: messageId
    });
    if (ins.error && ins.error.code !== '23505') {
      return { ok: false, error: ins.error };
    }
    return { ok: true, starred: true };
  }

  async function getStarredMessages() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: true, data: [] };

    const res = await sb.from('chat_stars')
      .select('id, message_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (res.error) return { ok: false, error: res.error };
    if (!res.data || !res.data.length) return { ok: true, data: [] };

    const messageIds = res.data.map(function (s) { return s.message_id; });

    const msgRes = await sb.from('chat_messages')
      .select('id, thread_id, sender_id, body, photo_url, audio_url, audio_duration, created_at, deleted_at, is_auto')
      .in('id', messageIds);

    if (msgRes.error) return { ok: false, error: msgRes.error };

    const msgMap = {};
    (msgRes.data || []).forEach(function (m) { msgMap[m.id] = m; });

    const rows = res.data.map(function (s) {
      const m = msgMap[s.message_id];
      if (!m) return null;
      return {
        star_id: s.id,
        starred_at: s.created_at,
        message: m
      };
    }).filter(Boolean);

    return { ok: true, data: rows };
  }

  async function archiveThread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('chat_archives').insert({
      user_id: user.id,
      thread_id: threadId
    });
    if (res.error && res.error.code !== '23505') return { ok: false, error: res.error };
    return { ok: true };
  }

  async function unarchiveThread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('chat_archives')
      .delete()
      .eq('user_id', user.id)
      .eq('thread_id', threadId);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async function getArchivedThreads() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: true, data: [] };

    const res = await sb.from('chat_archives').select('thread_id').eq('user_id', user.id);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: (res.data || []).map(function (r) { return r.thread_id; }) };
  }

  async function pinThread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('chat_pins').insert({
      user_id: user.id,
      thread_id: threadId
    });
    if (res.error && res.error.code !== '23505') return { ok: false, error: res.error };
    return { ok: true };
  }

  async function unpinThread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('chat_pins')
      .delete()
      .eq('user_id', user.id)
      .eq('thread_id', threadId);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async function getPinnedThreads() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: true, data: [] };

    const res = await sb.from('chat_pins')
      .select('thread_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: res.data || [] };
  }

  async function markThreadUnread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('chat_forced_unread').insert({
      user_id: user.id,
      thread_id: threadId
    });
    if (res.error && res.error.code !== '23505') return { ok: false, error: res.error };
    return { ok: true };
  }

  async function clearThreadUnread(threadId) {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, error: { message: 'Not signed in' } };

    const res = await sb.from('chat_forced_unread')
      .delete()
      .eq('user_id', user.id)
      .eq('thread_id', threadId);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async function getForcedUnreadThreads() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: true, data: [] };

    const res = await sb.from('chat_forced_unread').select('thread_id').eq('user_id', user.id);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, data: (res.data || []).map(function (r) { return r.thread_id; }) };
  }

  /* =========================================================
     PUSH NOTIFICATIONS
     ========================================================= */

  let swRegistration = null;

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return { ok: false, reason: 'unsupported' };
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      return { ok: true, registration: swRegistration };
    } catch (err) {
      return { ok: false, reason: 'register-failed', error: err };
    }
  }

  function isPushSupported() {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  function getPushPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function getCurrentSubscription() {
    try {
      if (!swRegistration && 'serviceWorker' in navigator) {
        swRegistration = await navigator.serviceWorker.getRegistration('/');
      }
      if (!swRegistration) return null;
      return await swRegistration.pushManager.getSubscription();
    } catch (e) {
      return null;
    }
  }

  async function enablePush() {
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (!user) return { ok: false, reason: 'not-signed-in' };

    if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

    if (!swRegistration) {
      const reg = await registerServiceWorker();
      if (!reg.ok) return { ok: false, reason: reg.reason, error: reg.error };
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };

    const vapidPublic = cfg.vapidPublicKey;
    if (!vapidPublic) return { ok: false, reason: 'no-vapid-key' };

    let sub;
    try {
      sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic),
      });
    } catch (err) {
      return { ok: false, reason: 'subscribe-failed', error: err };
    }

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys || !json.keys.p256dh || !json.keys.auth) {
      return { ok: false, reason: 'bad-subscription' };
    }

    await sb.from('push_subscriptions').delete().eq('endpoint', json.endpoint);

    const save = await sb
      .from('push_subscriptions')
      .insert({
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent || null,
      });

    if (save.error) {
      return {
        ok: false,
        reason: 'save-failed',
        error: {
          message: (save.error.message || 'unknown') +
            ' [' + (save.error.code || '') + ']'
        }
      };
    }

    return { ok: true, endpoint: json.endpoint };
  }

  async function disablePush() {
    const sub = await getCurrentSubscription();
    if (sub) {
      try { await sub.unsubscribe(); } catch (e) {}
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }
    const userRes = await sb.auth.getUser();
    const user = userRes.data.user;
    if (user) {
      await sb.from('push_subscriptions').delete().eq('user_id', user.id);
    }
    return { ok: true };
  }

  async function getPushState() {
    const supported = isPushSupported();
    const permission = getPushPermission();
    const sub = await getCurrentSubscription();
    return {
      supported,
      permission,
      subscribed: !!sub,
    };
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.AUTH = {
    sb: sb,

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

    updateDesk: updateDesk,
    uploadAvatar: uploadAvatar,
    uploadCover: uploadCover,
    uploadPhoto: uploadPhoto,
    removePhoto: removePhoto,

    createPost: createPost,
    uploadPostPhoto: uploadPostPhoto,
    toggleReaction: toggleReaction,
    getPostReactions: getPostReactions,
    deletePost: deletePost,

    getPostReplies: getPostReplies,
    createReply: createReply,
    getReplyCounts: getReplyCounts,
    deleteReply: deleteReply,

    startThread: startThread,
    loadThread: loadThread,
    loadMessages: loadMessages,
    sendMessage: sendMessage,
    sendReply: sendReply,
    sendPhotoMessage: sendPhotoMessage,
    sendVoiceMessage: sendVoiceMessage,
    acceptThread: acceptThread,
    declineThread: declineThread,
    markMessagesRead: markMessagesRead,
    markMessagesDelivered: markMessagesDelivered,

    toggleMessageReaction: toggleMessageReaction,
    getMessageReactions: getMessageReactions,
    deleteMessageForMe: deleteMessageForMe,
    deleteMessageForEveryone: deleteMessageForEveryone,
    touchPresence: touchPresence,
    getPresence: getPresence,

    muteThread: muteThread,
    unmuteThread: unmuteThread,
    isThreadMuted: isThreadMuted,
    getMutedThreads: getMutedThreads,
    blockUser: blockUser,
    unblockUser: unblockUser,
    isBlocked: isBlocked,
    getBlockedUsers: getBlockedUsers,
    reportUser: reportUser,

    getQuickReplies: getQuickReplies,
    createQuickReply: createQuickReply,
    updateQuickReply: updateQuickReply,
    deleteQuickReply: deleteQuickReply,

    getAwaySettings: getAwaySettings,
    setAwaySettings: setAwaySettings,

    toggleStarMessage: toggleStarMessage,
    getStarredMessages: getStarredMessages,
    archiveThread: archiveThread,
    unarchiveThread: unarchiveThread,
    getArchivedThreads: getArchivedThreads,
    pinThread: pinThread,
    unpinThread: unpinThread,
    getPinnedThreads: getPinnedThreads,
    markThreadUnread: markThreadUnread,
    clearThreadUnread: clearThreadUnread,
    getForcedUnreadThreads: getForcedUnreadThreads,

    registerServiceWorker: registerServiceWorker,
    isPushSupported: isPushSupported,
    getPushPermission: getPushPermission,
    enablePush: enablePush,
    disablePush: disablePush,
    getPushState: getPushState,
  };
})();
