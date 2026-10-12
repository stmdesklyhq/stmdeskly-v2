/* =========================================================
   STMDESKLY v2 — Editor
   Loads the desk, wires the form, handles uploads + save + preview.
   Depends on: config.js, auth.js, desk-render.js
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  /* ---------- Elements ---------- */
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
  const photoGrid       = $('photoGrid');
  const addPhotoBtn     = $('addPhotoBtn');
  const photoInput      = $('photoInput');
  const deskLinkEl      = $('deskLink');
  const aboutCount      = $('aboutCount');

  const MAX_PHOTOS    = 12;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  /* ---------- State ---------- */
  let desk = null;
  let dirty = false;
  let initialSnapshot = '';
  let saving = false;

  /* ---------- Utilities ---------- */
  function setStatus(kind, text) {
    if (!saveStatus) return;
    saveStatus.className = kind || '';
    saveStatus.textContent = text || '';
  }

  function snapshot() {
    const data = collectFields();
    data.avatar_url = desk.avatar_url || '';
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
    if (file.size > MAX_FILE_SIZE) {
      alert('That image is too large. Max is 5 MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Only image files are allowed.');
      return;
    }

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
    if (!values.name) {
      setStatus('error', 'Your name is required.');
      return;
    }

    saving = true;
    setStatus('saving', 'Saving…');
    if (saveBtn) saveBtn.disabled = true;

    const oldPhotos = (desk.photos || []).slice();

    values.avatar_url = desk.avatar_url || null;
    values.photos = desk.photos || [];

    const res = await AUTH.updateDesk(values);

    if (!res.ok) {
      saving = false;
      if (saveBtn) saveBtn.disabled = false;
      setStatus('error', 'Couldn\u2019t save. Try again.');
      return;
    }

    // Clean up removed photos from storage
    const newSet = {};
    (desk.photos || []).forEach(function (u) { newSet[u] = true; });
    const removed = oldPhotos.filter(function (u) { return !newSet[u]; });
    removed.forEach(function (u) { AUTH.removePhoto(u); });

    // Update local state
    Object.assign(desk, values);
    desk.photos = values.photos;

    initialSnapshot = snapshot();
    dirty = false;

    saving = false;
    if (saveBtn) saveBtn.disabled = false;
    setStatus('saved', 'All changes saved');

    setTimeout(function () {
      if (!dirty) setStatus('', '');
    }, 2500);
  }

  /* ---------- Preview ---------- */
  function openPreview() {
    if (!previewOverlay || !previewFrame) {
      alert('Preview is not available yet.');
      return;
    }

    const draft = Object.assign({}, desk, collectFields());
    draft.photos = desk.photos || [];
    draft.avatar_url = desk.avatar_url || '';

    try {
      sessionStorage.setItem('stm_draft', JSON.stringify(draft));
    } catch (err) {
      alert('Could not prepare preview.');
      return;
    }

    previewFrame.src = '/preview.html?v=' + Date.now();
    previewOverlay.hidden = false;
  }

  function closePreview() {
    if (!previewOverlay || !previewFrame) return;
    previewOverlay.hidden = true;
    previewFrame.src = 'about:blank';
    try { sessionStorage.removeItem('stm_draft'); } catch (err) {}
  }

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
    paintPhotos();

    const url = location.origin + '/desk.html?u=' + encodeURIComponent(desk.username);
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

    if (form) {
      form.addEventListener('input', markDirty);
      form.addEventListener('change', markDirty);
    }
  })();

  /* ---------- Events ---------- */
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      save();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function (e) {
      e.preventDefault();
      save();
    });
  }

  if (previewBtn)   previewBtn.addEventListener('click', openPreview);
  if (previewClose) previewClose.addEventListener('click', closePreview);

  if (previewOverlay) {
    previewOverlay.addEventListener('click', function (e) {
      if (e.target === previewOverlay) closePreview();
    });
  }

  if (copyBtn && deskLinkEl) {
    copyBtn.addEventListener('click', async function () {
      const link = deskLinkEl.href || deskLinkEl.textContent;
      try {
        await navigator.clipboard.writeText(link);
        copyBtn.classList.add('copied');
        setTimeout(function () { copyBtn.classList.remove('copied'); }, 1400);
      } catch (err) {
        prompt('Copy this link:', link);
      }
    });
  }

  if (avatarUploadBtn && avatarInput) {
    avatarUploadBtn.addEventListener('click', function () {
      avatarInput.click();
    });
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

  if (addPhotoBtn && photoInput) {
    addPhotoBtn.addEventListener('click', function () {
      if ((desk.photos || []).length >= MAX_PHOTOS) {
        alert('You\u2019ve reached the limit of ' + MAX_PHOTOS + ' photos.');
        return;
      }
      photoInput.click();
    });
  }

  if (photoInput) {
    photoInput.addEventListener('change', async function (e) {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      for (const f of files) {
        if ((desk.photos || []).length >= MAX_PHOTOS) {
          alert('You\u2019ve reached the limit of ' + MAX_PHOTOS + ' photos.');
          break;
        }
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
