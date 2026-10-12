/* =========================================================
   STMDESKLY v2 — Dashboard
   Loads the user's Desk, wires copy / publish / logout.
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

  let desk = null;
  let deskUrl = '';
  let publishing = false;
  let copyTimer = null;

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
    if (!desk || !desk.username) return;

    deskUrl = location.origin + '/u/' + encodeURIComponent(desk.username);

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

  /* ---------- Boot ---------- */
  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }

    const row = await AUTH.currentDesk();
    if (!row) {
      // No Desk yet — show empty state
      if (emptyState) emptyState.hidden = false;
      const main = document.querySelector('main');
      if (main) {
        const hide = main.querySelectorAll('.intro, .publish-strip, .link-card, .main-actions');
        hide.forEach(function (el) { el.hidden = true; });
      }
      return;
    }

    // Fetch the full desk row (currentDesk only returns id/username/name)
    const res = await AUTH.sb.from('desks').select('*').eq('id', row.id).maybeSingle();
    if (res.error || !res.data) { location.replace('/'); return; }

    desk = res.data;
    if (typeof desk.published !== 'boolean') desk.published = false;

    paintGreeting();
    paintPublishStrip();
    paintLink();
  })();
})();
