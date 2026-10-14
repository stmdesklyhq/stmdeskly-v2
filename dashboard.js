/* =========================================================
   STMDESKLY v2 — Dashboard
   Loads the user's Desk, wires copy / publish / logout / push / away.
   Depends on: config.js, auth.js
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const greetingEl      = $('greeting');
  const publishStrip    = $('publishStrip');
  const publishLabel    = $('publishLabel');
  const publishTitle    = $('publishTitle');
  const publishDesc     = $('publishDescription');
  const publishButton   = $('publishButton');
  const deskUrlEl       = $('deskUrl');
  const copyButton      = $('copyButton');
  const copyFeedback    = $('copyFeedback');
  const openDeskButton  = $('openDeskButton');
  const seeDeskButton   = $('seeDeskButton');
  const logoutButton    = $('logoutButton');
  const emptyState      = $('emptyState');

  const notifStrip      = $('notifStrip');
  const notifTitle      = $('notifTitle');
  const notifBody       = $('notifBody');
  const notifButton     = $('notifButton');

  const awayStrip       = $('awayStrip');
  const awayTitle       = $('awayTitle');
  const awayBody        = $('awayBody');
  const awayButton      = $('awayButton');
  const awayEditor      = $('awayEditor');
  const awayMessage     = $('awayMessage');
  const awayCancel      = $('awayCancel');
  const awaySave        = $('awaySave');

  let desk = null;
  let deskUrl = '';
  let publishing = false;
  let copyTimer = null;
  let awayEnabled = false;

  function firstName(full) {
    const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[0] : '';
  }

  function paintGreeting() {
    if (!greetingEl) return;
    const name = firstName(desk && desk.name);
    greetingEl.textContent = name ? ('Hi, ' + name + '.') : 'Hi there.';
  }

  function paintPublishStrip() {
    if (!publishStrip) return;
    const isPublished = !!(desk && desk.published);

    publishStrip.classList.toggle('published', isPublished);
    publishStrip.classList.toggle('unpublished', !isPublished);

    if (isPublished) {
      publishLabel.textContent = 'LIVE';
      publishTitle.textContent = 'Anyone with this link can see your Desk.';
      publishDesc.textContent  = 'Unpublishing hides it from visitors. Your edits are kept.';
      publishButton.textContent = 'Unpublish';
    } else {
      publishLabel.textContent = 'NOT PUBLISHED';
      publishTitle.textContent = 'Only you can see this Desk.';
      publishDesc.textContent  = 'Publish when you\u2019re ready for people to visit.';
      publishButton.textContent = 'Publish my Desk';
    }
    publishButton.disabled = false;
  }

  function paintLink() {
    if (!desk) return;

    if (!desk.username) {
      console.warn('[dashboard] desk row has no username:', desk);
      if (deskUrlEl) deskUrlEl.textContent = 'Set a link in the editor \u2192';
      if (openDeskButton) openDeskButton.removeAttribute('href');
      if (seeDeskButton)  seeDeskButton.removeAttribute('href');
      return;
    }

    deskUrl = location.origin + '/desk.html?u=' + encodeURIComponent(desk.username);

    if (deskUrlEl)      deskUrlEl.textContent = deskUrl.replace(/^https?:\/\//, '');
    if (openDeskButton) openDeskButton.href = deskUrl;
    if (seeDeskButton)  seeDeskButton.href = deskUrl;
  }

  function flashCopied() {
    if (!copyFeedback) return;
    copyFeedback.classList.add('is-visible');
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () {
      copyFeedback.classList.remove('is-visible');
    }, 1600);
  }

  async function publishToggle() {
    if (publishing || !desk) return;
    publishing = true;
    const wasPublished = !!desk.published;
    publishButton.disabled = true;
    publishButton.textContent = wasPublished ? 'Unpublishing\u2026' : 'Publishing\u2026';

    const res = await AUTH.updateDesk({ published: !wasPublished });

    publishing = false;

    if (!res.ok) {
      publishButton.disabled = false;
      publishButton.textContent = wasPublished ? 'Unpublish' : 'Publish my Desk';
      alert('Could not update publication. Try again.');
      return;
    }

    desk.published = !wasPublished;
    paintPublishStrip();
  }

  /* ---------- Push notifications ---------- */

  async function paintNotif() {
    if (!notifStrip) return;

    const state = await AUTH.getPushState();

    if (!state.supported) {
      notifStrip.hidden = true;
      return;
    }

    notifStrip.hidden = false;
    notifStrip.classList.remove('is-on', 'is-off');

    if (state.permission === 'denied') {
      notifStrip.classList.add('is-off');
      notifTitle.textContent = 'Notifications blocked';
      notifBody.textContent = 'You blocked notifications for this site. Enable them in your browser settings to get messages.';
      notifButton.hidden = true;
      return;
    }

    if (state.subscribed) {
      notifStrip.classList.add('is-on');
      notifTitle.textContent = 'Notifications on';
      notifBody.textContent = 'You get a buzz when someone messages you on this device.';
      notifButton.hidden = false;
      notifButton.textContent = 'Turn off';
      notifButton.disabled = false;
      return;
    }

    notifTitle.textContent = 'Get notified';
    notifBody.textContent = 'Tap to get a buzz when someone messages you on this device.';
    notifButton.hidden = false;
    notifButton.textContent = 'Enable';
    notifButton.disabled = false;
  }

  /* ---------- Away mode ---------- */

  async function paintAway() {
    if (!awayStrip) return;
    const s = await AUTH.getAwaySettings();

    awayEnabled = !!s.enabled;

    awayStrip.classList.toggle('is-on', awayEnabled);

    if (awayEnabled) {
      awayTitle.textContent = 'Away mode is ON';
      awayBody.textContent = s.message
        ? 'Auto-replying: "' + s.message + '"'
        : 'Auto-replying with the default message.';
      awayButton.textContent = 'Turn off';
    } else {
      awayTitle.textContent = 'Away mode';
      awayBody.textContent = 'Auto-reply once when someone messages you. Off for now.';
      awayButton.textContent = 'Turn on';
    }

    awayEditor.hidden = true;
  }

  /* ---------- Events ---------- */

  if (copyButton) {
    copyButton.addEventListener('click', async function () {
      if (!deskUrl) return;
      try {
        await navigator.clipboard.writeText(deskUrl);
        flashCopied();
      } catch (err) {
        prompt('Copy your Desk link:', deskUrl);
      }
    });
  }

  if (publishButton) {
    publishButton.addEventListener('click', publishToggle);
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async function () {
      logoutButton.disabled = true;
      await AUTH.logout();
      location.replace('/');
    });
  }

  if (notifButton) {
    notifButton.addEventListener('click', async function () {
      notifButton.disabled = true;

      const state = await AUTH.getPushState();

      if (state.subscribed) {
        notifButton.textContent = 'Turning off\u2026';
        await AUTH.disablePush();
      } else {
        notifButton.textContent = 'Enabling\u2026';
        const res = await AUTH.enablePush();

        if (!res.ok) {
          notifButton.disabled = false;
          notifButton.textContent = 'Enable';

          if (res.reason === 'denied') {
            alert('Notifications were blocked. You can re-enable them in your browser settings.');
          } else if (res.reason === 'unsupported') {
            alert('This browser does not support push notifications.');
          } else if (res.reason === 'no-vapid-key') {
            alert('Push is not configured yet. Try again later.');
          } else {
            var detail = '';
            if (res.reason) detail += 'reason=' + res.reason;
            if (res.error && res.error.message) detail += ' | ' + res.error.message;
            alert('Could not enable notifications.\n\n' + detail);
          }

          await paintNotif();
          return;
        }
      }

      await paintNotif();
    });
  }

  if (awayButton) {
    awayButton.addEventListener('click', async function () {
      if (awayEnabled) {
        const res = await AUTH.setAwaySettings(false, '');
        if (!res.ok) { alert('Could not turn off away mode.'); return; }
        await paintAway();
        return;
      }

      const s = await AUTH.getAwaySettings();
      awayMessage.value = s.message || '';
      awayEditor.hidden = false;
      awayMessage.focus();
    });
  }

  if (awayCancel) {
    awayCancel.addEventListener('click', function () {
      awayEditor.hidden = true;
    });
  }

  if (awaySave) {
    awaySave.addEventListener('click', async function () {
      awaySave.disabled = true;
      const res = await AUTH.setAwaySettings(true, awayMessage.value);
      awaySave.disabled = false;
      if (!res.ok) {
        alert((res.error && res.error.message) || 'Could not save.');
        return;
      }
      await paintAway();
    });
  }

  /* ---------- Boot ---------- */

  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }

    const row = await AUTH.currentDesk();
    if (!row) {
      if (emptyState) emptyState.hidden = false;
      const main = document.querySelector('main');
      if (main) {
        const hide = main.querySelectorAll('.intro, .publish-strip, .link-card, .main-actions');
        hide.forEach(function (el) { el.hidden = true; });
      }
      if (notifStrip) notifStrip.hidden = true;
      if (awayStrip) awayStrip.hidden = true;
      if (awayEditor) awayEditor.hidden = true;
      return;
    }

    const res = await AUTH.sb.from('desks').select('*').eq('id', row.id).maybeSingle();
    if (res.error || !res.data) { location.replace('/'); return; }

    desk = res.data;
    if (typeof desk.published !== 'boolean') desk.published = false;

    paintGreeting();
    paintPublishStrip();
    paintLink();

    await paintNotif();
    await paintAway();
  })();
})();
