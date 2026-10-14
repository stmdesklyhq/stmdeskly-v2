/* =========================================================
   STMDESKLY v2 — Settings
   Account, notifications, away mode, safety, logout.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const emailValue    = $('emailValue');
  const nameValue     = $('nameValue');
  const usernameValue = $('usernameValue');

  const pushSwitch  = $('pushSwitch');
  const awaySwitch  = $('awaySwitch');
  const awayEditor  = $('awayEditor');
  const awayMessage = $('awayMessage');
  const awayCancel  = $('awayCancel');
  const awaySave    = $('awaySave');

  const logoutButton = $('logoutButton');

  let pushSubscribed = false;
  let awayEnabled = false;

  /* ---------- Account ---------- */

  function paintAccount(user, desk) {
    if (emailValue) emailValue.textContent = user.email || '—';

    const displayName =
      (desk && desk.name) ||
      (user.user_metadata && user.user_metadata.name) ||
      '—';
    if (nameValue) nameValue.textContent = displayName;

    const username =
      (desk && desk.username) ||
      (user.user_metadata && user.user_metadata.username) ||
      '—';
    if (usernameValue) usernameValue.textContent = '@' + username;
  }

  /* ---------- Push ---------- */

  async function paintPush() {
    if (!pushSwitch) return;

    const state = await AUTH.getPushState();

    if (!state.supported) {
      pushSwitch.disabled = true;
      pushSwitch.setAttribute('aria-checked', 'false');
      return;
    }

    if (state.permission === 'denied') {
      pushSwitch.disabled = true;
      pushSwitch.setAttribute('aria-checked', 'false');
      return;
    }

    pushSubscribed = !!state.subscribed;
    pushSwitch.disabled = false;
    pushSwitch.setAttribute('aria-checked', String(pushSubscribed));
  }

  if (pushSwitch) {
    pushSwitch.addEventListener('click', async function () {
      if (pushSwitch.disabled) return;
      pushSwitch.disabled = true;

      const want = !pushSubscribed;

      if (want) {
        const res = await AUTH.enablePush();
        if (!res.ok) {
          pushSwitch.disabled = false;
          if (res.reason === 'denied') {
            alert('Notifications were blocked. Enable them in your browser settings, then try again.');
          } else if (res.reason === 'unsupported') {
            alert('This browser does not support notifications.');
          } else if (res.reason === 'no-vapid-key') {
            alert('Notifications are not set up yet.');
          } else {
            alert('Could not enable notifications. Please try again.');
          }
          await paintPush();
          return;
        }
        pushSubscribed = true;
        pushSwitch.setAttribute('aria-checked', 'true');
      } else {
        await AUTH.disablePush();
        pushSubscribed = false;
        pushSwitch.setAttribute('aria-checked', 'false');
      }

      pushSwitch.disabled = false;
    });
  }

  /* ---------- Away mode ---------- */

  async function paintAway() {
    if (!awaySwitch) return;
    const s = await AUTH.getAwaySettings();
    awayEnabled = !!s.enabled;
    awaySwitch.setAttribute('aria-checked', String(awayEnabled));
    if (awayMessage && s.message) awayMessage.value = s.message;
    if (awayEditor) awayEditor.hidden = true;
  }

  if (awaySwitch) {
    awaySwitch.addEventListener('click', async function () {
      if (awaySwitch.disabled) return;

      if (awayEnabled) {
        awaySwitch.disabled = true;
        const res = await AUTH.setAwaySettings(false, '');
        awaySwitch.disabled = false;
        if (!res.ok) { alert('Could not turn off away mode.'); return; }
        awayEnabled = false;
        awaySwitch.setAttribute('aria-checked', 'false');
        if (awayEditor) awayEditor.hidden = true;
        return;
      }

      const s = await AUTH.getAwaySettings();
      if (awayMessage) awayMessage.value = s.message || '';
      if (awayEditor) awayEditor.hidden = false;
      if (awayMessage) awayMessage.focus();
    });
  }

  if (awayCancel) {
    awayCancel.addEventListener('click', function () {
      if (awayEditor) awayEditor.hidden = true;
    });
  }

  if (awaySave) {
    awaySave.addEventListener('click', async function () {
      awaySave.disabled = true;
      const res = await AUTH.setAwaySettings(true, awayMessage.value);
      awaySave.disabled = false;
      if (!res.ok) {
        alert((res.error && res.error.message) || 'Could not save away mode.');
        return;
      }
      awayEnabled = true;
      awaySwitch.setAttribute('aria-checked', 'true');
      if (awayEditor) awayEditor.hidden = true;
    });
  }

  /* ---------- Logout ---------- */

  if (logoutButton) {
    logoutButton.addEventListener('click', async function () {
      if (!confirm('Log out of STMDeskly?')) return;
      logoutButton.disabled = true;
      try { await AUTH.logout(); } catch (e) {}
      location.replace('/login.html');
    });
  }

  /* ---------- Boot ---------- */

  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }

    const desk = await AUTH.currentDesk();

    paintAccount(user, desk);
    await paintPush();
    await paintAway();
  })();
})();
