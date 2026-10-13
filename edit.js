/* =========================================================
   STMDESKLY v2 — Editor (hash-routed sections)
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const form            = $('editForm');
  const saveStatus      = $('saveStatus');
  const saveBtn         = $('saveBtn');
  const previewBtn      = $('previewBtn');
  const previewClose    = $('previewClose');
  const previewOverlay  = $('previewOverlay');
  const previewFrame    = $('previewFrame');
  const copyBtn         = $('copyBtn');
  const avatarPreview   = $('avatarPreview');
  const avatarInput     = $('avatarInput');
  const avatarUploadBtn = $('avatarUploadBtn');
  const avatarRemoveBtn = $('avatarRemoveBtn');
  const coverPreview    = $('coverPreview');
  const coverInput      = $('coverInput');
  const coverUploadBtn  = $('coverUploadBtn');
  const coverRemoveBtn  = $('coverRemoveBtn');
  const photoGrid       = $('photoGrid');
  const addPhotoBtn     = $('addPhotoBtn');
  const photoInput      = $('photoInput');
  const deskLinkEl      = $('deskLink');
  const aboutCount      = $('aboutCount');
  const backBtn         = $('backBtn');
  const publishStrip    = $('publishStrip');
  const publishStripLabel = $('publishStripLabel');
  const publishStripTitle = $('publishStripTitle');
  const publishStripSub = $('publishStripSub');
  const publishAction   = $('publishAction');
  const publishActionText = $('publishActionText');
  const viewList        = $('viewList');

  const PANEL_IDS = {
    profile:    'panel-profile',
    about:      'panel-about',
    work:       'panel-work',
    details:    'panel-details',
    contact:    'panel-contact',
    appearance: 'panel-appearance',
    visibility: 'panel-visibility'
  };

  const MAX_PHOTOS    = 12;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  let desk = null;
  let dirty = false;
  let initialSnapshot = '';
  let saving = false;
  let publishing = false;

  function setStatus(kind, text) {
    if (!saveStatus) return;
    saveStatus.className = kind || '';
    saveStatus.textContent = text || '';
  }

  function snapshot() {
    const data = collectFields();
    data.avatar_url = desk.avatar_url || '';
    data.cover_url = desk.cover_url || '';
    data.photos = JSON.stringify(desk.photos || []);
    return JSON.stringify(data);
  }

  function markDirty() {
    if (saving) return;
    if (snapshot() === initialSnapshot) {
      dirty = false;
      setStatus('', '');
    } else {
      dirty = true;
      setStatus('dirty', 'Unsaved changes');
    }
  }

  function collectFields() {
    const appearance = (window.APPEARANCE && window.APPEARANCE.get)
      ? window.APPEARANCE.get()
      : {
          accent: '#2F6D50',
          background: 'cream',
          pattern: 'none',
          font_pair: 'modern',
          corner_style: 'rounded',
          layout_style: 'spacious',
          photo_layout: 'grid'
        };

    return {
      name:            $('name')            ? $('name').value.trim() : '',
      role:            $('role')            ? $('role').value.trim() : '',
      tagline:         $('tagline')         ? $('tagline').value.trim() : '',
      services:        $('services')        ? $('services').value : '',
      about:           $('about')           ? $('about').value : '',
      location:        $('location')        ? $('location').value.trim() : '',
      opening_hours:   $('opening_hours')   ? $('opening_hours').value : '',
      service_times:   $('service_times')   ? $('service_times').value : '',
      whatsapp:        $('whatsapp')        ? $('whatsapp').value.trim() : '',
      email:           $('email')           ? $('email').value.trim() : '',
      phone:           $('phone')           ? $('phone').value.trim() : '',
      website:         $('website')         ? $('website').value.trim() : '',
      show_in_explore: $('show_in_explore') ? $('show_in_explore').checked : true,

      cover_url:       desk.cover_url || null,
      avatar_url:      desk.avatar_url || null,
      photos:          desk.photos || [],

      accent:          appearance.accent,
      background:      appearance.background,
      pattern:         appearance.pattern,
      font_pair:       appearance.font_pair,
      corner_style:    appearance.corner_style,
      layout_style:    appearance.layout_style,
      photo_layout:    appearance.photo_layout,
    };
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ---------- Avatar ---------- */
  function paintAvatar() {
    if (!avatarPreview) return;
    if (desk.avatar_url) {
      avatarPreview.innerHTML = '<img src="' + desk.avatar_url + '" alt="">';
      if (avatarRemoveBtn) avatarRemoveBtn.hidden = false;
    } else {
      avatarPreview.textContent = initials(desk.name);
      if (avatarRemoveBtn) avatarRemoveBtn.hidden = true;
    }
  }

  /* ---------- Cover ---------- */
  function paintCover() {
    if (!coverPreview) return;
    if (desk.cover_url) {
      coverPreview.style.backgroundImage = 'url(' + desk.cover_url + ')';
      if (coverRemoveBtn) coverRemoveBtn.hidden = false;
    } else {
      coverPreview.style.backgroundImage = '';
      if (coverRemoveBtn) coverRemoveBtn.hidden = true;
    }
  }

  /* ---------- Photos ---------- */
  function paintPhotos() {
    if (!photoGrid) return;
    const photos = desk.photos || [];
    photoGrid.innerHTML = '';
    photos.forEach(function (url) {
      const tile = document.createElement('div');
      tile.className = 'photo';
      tile.dataset.url = url;
      tile.innerHTML =
        '<img src="' + url + '" alt="">' +
        '<button type="button" aria-label="Remove photo">×</button>';
      const btn = tile.querySelector('button');
      btn.addEventListener('click', function () { removePhotoTile(tile); });
      photoGrid.appendChild(tile);
    });
  }

  function removePhotoTile(tile) {
    const url = tile.dataset.url;
    desk.photos = (desk.photos || []).filter(function (u) { return u !== url; });
    tile.remove();
    markDirty();
  }

  function addPhotoTileUploading() {
    const tile = document.createElement('div');
    tile.className = 'photo uploading';
    tile.innerHTML = '<div><i></i>Uploading…</div>';
    photoGrid.appendChild(tile);
    return tile;
  }

  async function handlePhotoFile(file) {
    if (file.size > MAX_FILE_SIZE) { alert('Max 5 MB.'); return; }
    if (!file.type.startsWith('image/')) { alert('Only images.'); return; }
    const tile = addPhotoTileUploading();
    const res = await AUTH.uploadPhoto(file);
    if (!res.ok) {
      tile.remove();
      alert('Could not upload that photo. Try again.');
      return;
    }
    desk.photos = desk.photos || [];
    desk.photos.push(res.url);
    tile.remove();
    paintPhotos();
    markDirty();
  }

  /* ---------- Save ---------- */
  async function save() {
    if (saving) return;
    const values = collectFields();
    if (!values.name) { setStatus('error', 'Your name is required.'); return; }
    saving = true;
    setStatus('saving', 'Saving…');
    if (saveBtn) saveBtn.disabled = true;
    const oldPhotos = (desk.photos || []).slice();
    const res = await AUTH.updateDesk(values);
    if (!res.ok) {
      saving = false;
      if (saveBtn) saveBtn.disabled = false;
      const msg = (res.error && res.error.message) || 'unknown';
      setStatus('error', 'Couldn\u2019t save: ' + msg);
      return;
    }
    const newSet = {};
    (desk.photos || []).forEach(function (u) { newSet[u] = true; });
    const removed = oldPhotos.filter(function (u) { return !newSet[u]; });
    removed.forEach(function (u) { AUTH.removePhoto(u); });
    Object.assign(desk, values);
    desk.photos = values.photos;
    initialSnapshot = snapshot();
    dirty = false;
    saving = false;
    if (saveBtn) saveBtn.disabled = false;
    setStatus('saved', 'All changes saved');
    setTimeout(function () { if (!dirty) setStatus('', ''); }, 2500);
  }

  /* ---------- Publish ---------- */
  function paintPublishStrip() {
    if (!publishStrip) return;
    publishStrip.hidden = false;
    if (desk.published) {
      publishStrip.className = 'publish-strip published';
      publishStripLabel.textContent = 'LIVE';
      publishStripTitle.textContent = 'Anyone with this link can see your Desk.';
      publishStripSub.textContent = 'Unpublishing hides it from visitors. Your edits are kept.';
      publishActionText.textContent = 'Unpublish';
      publishAction.classList.remove('publish-action');
      publishAction.classList.add('unpublish-action');
    } else {
      publishStrip.className = 'publish-strip unpublished';
      publishStripLabel.textContent = 'NOT PUBLISHED';
      publishStripTitle.textContent = 'Only you can see this Desk.';
      publishStripSub.textContent = 'You can keep editing after you publish.';
      publishActionText.textContent = 'Publish my Desk';
      publishAction.classList.remove('unpublish-action');
      publishAction.classList.add('publish-action');
    }
    publishAction.disabled = false;
  }

  async function publishDesk() {
    if (publishing) return;
    publishing = true;
    publishAction.disabled = true;
    const wasPublished = !!desk.published;
    publishActionText.textContent = wasPublished ? 'Unpublishing…' : 'Publishing…';
    const res = await AUTH.updateDesk({ published: !wasPublished });
    if (!res.ok) {
      publishing = false;
      publishAction.disabled = false;
      publishActionText.textContent = wasPublished ? 'Unpublish' : 'Publish my Desk';
      alert('Could not update publication. Try again.');
      return;
    }
    desk.published = !wasPublished;
    publishing = false;
    if (desk.published) { location.href = '/publish.html'; return; }
    paintPublishStrip();
  }

  /* ---------- Preview ---------- */
  function openPreview() {
    if (!previewOverlay || !previewFrame) return;
    const draft = Object.assign({}, desk, collectFields());
    draft.photos = desk.photos || [];
    draft.avatar_url = desk.avatar_url || '';
    draft.cover_url = desk.cover_url || '';
    let encoded;
    try {
      const json = JSON.stringify(draft);
      encoded = btoa(unescape(encodeURIComponent(json)));
    } catch (err) { alert('Could not prepare preview.'); return; }
    previewFrame.src = '/preview.html?d=' + encodeURIComponent(encoded) + '&t=' + Date.now();
    previewOverlay.hidden = false;
    previewOverlay.style.display = 'flex';
  }

  function closePreview() {
    if (!previewOverlay || !previewFrame) return;
    previewOverlay.hidden = true;
    previewOverlay.style.display = 'none';
    previewFrame.src = 'about:blank';
  }

  /* ---------- Routing ---------- */

  function showList() {
    if (viewList) viewList.style.display = '';
    Object.keys(PANEL_IDS).forEach(function (key) {
      const el = $(PANEL_IDS[key]);
      if (el) el.hidden = true;
    });
    window.scrollTo(0, 0);
  }

  function showPanel(slug) {
    if (!PANEL_IDS[slug]) return showList();
    if (viewList) viewList.style.display = 'none';
    Object.keys(PANEL_IDS).forEach(function (key) {
      const el = $(PANEL_IDS[key]);
      if (el) el.hidden = key !== slug;
    });
    window.scrollTo(0, 0);
  }

  function route() {
    const slug = (location.hash || '').replace('#', '').trim();
    if (!slug || !PANEL_IDS[slug]) showList();
    else showPanel(slug);
  }

  window.addEventListener('hashchange', route);

  /* ---------- Boot ---------- */
  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }
    const row = await AUTH.currentDesk();
    if (!row) { location.replace('/signup.html'); return; }
    const res = await AUTH.sb.from('desks').select('*').eq('id', row.id).maybeSingle();
    if (res.error || !res.data) { location.replace('/'); return; }
    desk = res.data;
    if (!Array.isArray(desk.photos)) desk.photos = [];
    if (typeof desk.published !== 'boolean') desk.published = false;

    const fill = function (id, value) {
      const el = $(id);
      if (el) el.value = value || '';
    };
    fill('name', desk.name);
    fill('role', desk.role);
    fill('tagline', desk.tagline);
    fill('services', desk.services);
    fill('about', desk.about);
    fill('location', desk.location);
    fill('opening_hours', desk.opening_hours);
    fill('service_times', desk.service_times);
    fill('whatsapp', desk.whatsapp);
    fill('email', desk.email);
    fill('phone', desk.phone);
    fill('website', desk.website);
    if ($('show_in_explore')) $('show_in_explore').checked = !!desk.show_in_explore;

    paintAvatar();
    paintCover();
    paintPhotos();
    paintPublishStrip();

    if (window.APPEARANCE && window.APPEARANCE.load) {
      window.APPEARANCE.load(desk);
    }

    const url = location.origin + '/u/' + encodeURIComponent(desk.username);
    if (deskLinkEl) {
      deskLinkEl.textContent = url.replace(/^https?:\/\//, '');
      if (deskLinkEl.tagName === 'A') deskLinkEl.href = url;
    }

    function updateAboutCount() {
      if (!aboutCount) return;
      const el = $('about');
      const len = el ? el.value.length : 0;
      aboutCount.textContent = len + ' / 700';
    }
    const aboutEl = $('about');
    if (aboutEl) {
      aboutEl.addEventListener('input', updateAboutCount);
      updateAboutCount();
    }

    initialSnapshot = snapshot();
    dirty = false;
    setStatus('', '');

    function onUserChange(e) {
      if (!e.isTrusted) return;
      markDirty();
    }

    if (form) {
      form.addEventListener('input', onUserChange);
      form.addEventListener('change', onUserChange);
    }

    route();
  })();

  /* ---------- Events ---------- */
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      if (location.hash) {
        history.pushState('', document.title, location.pathname);
        route();
        return;
      }
      if (window.history.length > 1) history.back();
      else location.href = '/dashboard.html';
    });
  }

  document.querySelectorAll('[data-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      history.pushState('', document.title, location.pathname);
      route();
    });
  });

  if (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', function (e) { e.preventDefault(); save(); });
  }
  if (previewBtn)   previewBtn.addEventListener('click', openPreview);
  if (previewClose) previewClose.addEventListener('click', closePreview);
  if (previewOverlay) {
    previewOverlay.addEventListener('click', function (e) {
      if (e.target === previewOverlay) closePreview();
    });
  }
  if (publishAction) publishAction.addEventListener('click', publishDesk);
  if (copyBtn && deskLinkEl) {
    copyBtn.addEventListener('click', async function () {
      const link = deskLinkEl.href || deskLinkEl.textContent;
      try {
        await navigator.clipboard.writeText(link);
        copyBtn.classList.add('copied');
        setTimeout(function () { copyBtn.classList.remove('copied'); }, 1400);
      } catch (err) { prompt('Copy this link:', link); }
    });
  }

  /* Avatar */
  if (avatarUploadBtn && avatarInput) {
    avatarUploadBtn.addEventListener('click', function () { avatarInput.click(); });
  }
  if (avatarInput) {
    avatarInput.addEventListener('change', async function (e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > MAX_FILE_SIZE) { alert('Max 5 MB.'); return; }
      const res = await AUTH.uploadAvatar(file);
      if (!res.ok) { alert('Could not upload that photo.'); return; }
      desk.avatar_url = res.url;
      paintAvatar();
      markDirty();
    });
  }
  if (avatarRemoveBtn) {
    avatarRemoveBtn.addEventListener('click', function () {
      desk.avatar_url = null;
      paintAvatar();
      markDirty();
    });
  }

  /* Cover */
  if (coverUploadBtn && coverInput) {
    coverUploadBtn.addEventListener('click', function () { coverInput.click(); });
  }
  if (coverInput) {
    coverInput.addEventListener('change', async function (e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > MAX_FILE_SIZE) { alert('Max 5 MB.'); return; }
      const res = await AUTH.uploadCover(file);
      if (!res.ok) { alert('Could not upload cover.'); return; }
      desk.cover_url = res.url;
      paintCover();
      markDirty();
    });
  }
  if (coverRemoveBtn) {
    coverRemoveBtn.addEventListener('click', function () {
      desk.cover_url = null;
      paintCover();
      markDirty();
    });
  }

  /* Photos */
  if (addPhotoBtn && photoInput) {
    addPhotoBtn.addEventListener('click', function () {
      if ((desk.photos || []).length >= MAX_PHOTOS) { alert('Max ' + MAX_PHOTOS + ' photos.'); return; }
      photoInput.click();
    });
  }
  if (photoInput) {
    photoInput.addEventListener('change', async function (e) {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      for (const f of files) {
        if ((desk.photos || []).length >= MAX_PHOTOS) { alert('Max ' + MAX_PHOTOS + ' photos.'); break; }
        await handlePhotoFile(f);
      }
    });
  }
  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
})();
