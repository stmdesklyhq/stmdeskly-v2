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
    },
  });

  /* ---------- Rate limit (client-side soft limit) ---------- */
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
    return {
      score: score,
      label: labels[score],
      ok: pw.length >= 8 && score >= 2,
    };
  }

  /* ---------- Breach check (HIBP k-anonymity) ---------- */
  async function sha1Hex(str) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('crypto.subtle is not available in this browser.');
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
    } catch (e) {
      // Network failure or missing crypto — don't block signup.
      return false;
    }
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
        // After the user clicks the confirmation link, send them back
        // to the signup page so they can finish creating their Desk.
        emailRedirectTo: location.origin + '/signup.html',
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

    // Email confirmation required — the desk row will be created later
    // (see the "finish setup" flow in signup.html).
    if (!session) {
      return { ok: true, needsConfirm: true, user: user };
    }

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

  /* ---------- Create desk (for users with no desk yet) ---------- */
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
  };
})();