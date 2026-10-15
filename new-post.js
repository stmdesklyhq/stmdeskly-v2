/* =========================================================
   STMDESKLY v2 — New post
   Category picker, text, photos, gig fields, publish.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const categoriesEl = $('categories');
  const titleEl      = $('title');
  const bodyEl       = $('body');
  const counterEl    = $('counter');
  const photoGrid    = $('photoGrid');
  const photoInput   = $('photoInput');
  const photoCountEl = $('photoCount');
  const priceEl      = $('price');
  const locationEl   = $('location');
  const whatsappEl   = $('whatsapp');
  const statusText   = $('statusText');
  const saveBtn      = $('saveBtn');
  const topPostBtn   = $('topPostBtn');

  const gigFields     = $('gigFields');
  const gigBudgetMin  = $('gigBudgetMin');
  const gigBudgetMax  = $('gigBudgetMax');
  const gigDeadline   = $('gigDeadline');

  const MAX_PHOTOS    = 6;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  let category = null;
  let photos = [];
  let posting = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- Validation ---------- */
  function isValid() {
    const body = bodyEl.value.trim();
    if (!category) return false;
    if (!body) return false;
    const uploading = photos.some(function (p) { return p.uploading; });
    if (uploading) return false;
    return true;
  }

  function refreshSubmit() {
    const ok = isValid();
    saveBtn.disabled = !ok || posting;
    topPostBtn.disabled = !ok || posting;
  }

  /* ---------- Category ---------- */
  function paintGigFields() {
    if (!gigFields) return;
    gigFields.hidden = category !== 'gig';
  }

  categoriesEl.addEventListener('click', function (e) {
    const btn = e.target.closest('.category');
    if (!btn) return;

    const next = btn.dataset.category;

    categoriesEl.querySelectorAll('.category').forEach(function (c) {
      const on = c.dataset.category === next;
      c.setAttribute('aria-pressed', String(on));
    });

    category = next;
    paintGigFields();
    refreshSubmit();
  });

  /* ---------- Counter ---------- */
  function updateCounter() {
    const len = bodyEl.value.length;
    counterEl.textContent = len + ' / 1000';
    counterEl.className = '';
    if (len > 1000) counterEl.classList.add('over');
    else if (len > 900) counterEl.classList.add('warning');
  }

  bodyEl.addEventListener('input', function () {
    updateCounter();
    refreshSubmit();
  });

  titleEl.addEventListener('input', refreshSubmit);

  /* ---------- Photos ---------- */
  function paintPhotos() {
    photoGrid.innerHTML = '';

    photos.forEach(function (p, i) {
      const tile = document.createElement('div');
      tile.className = 'photo photo-tile';

      if (p.uploading) {
        tile.innerHTML =
          '<div class="upload">' +
            '<i class="spinner"></i>' +
            '<b>Uploading…</b>' +
          '</div>';
      } else {
        tile.innerHTML =
          '<img src="' + esc(p.url) + '" alt="">' +
          '<button type="button" aria-label="Remove photo" data-remove="' + i + '">×</button>';
      }

      photoGrid.appendChild(tile);
    });

    if (photos.length < MAX_PHOTOS) {
      const addTile = document.createElement('button');
      addTile.type = 'button';
      addTile.className = 'photo add';
      addTile.innerHTML =
        '<i><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></i>' +
        '<span>Add photo</span>';
      addTile.addEventListener('click', function () {
        if (photos.length >= MAX_PHOTOS) return;
        photoInput.click();
      });
      photoGrid.appendChild(addTile);
    }

    const total = photos.length + (photos.length < MAX_PHOTOS ? 1 : 0);
    const filler = Math.max(0, 3 - (total % 3 === 0 ? 3 : total % 3));
    for (let i = 0; i < filler; i++) {
      const empty = document.createElement('div');
      empty.className = 'photo empty';
      empty.setAttribute('aria-hidden', 'true');
      empty.innerHTML =
        '<svg viewBox="0 0 24 24">' +
          '<rect x="3" y="4" width="18" height="16" rx="2"/>' +
          '<circle cx="8.5" cy="9" r="1.5"/>' +
          '<path d="m21 15-5-5L5 20"/>' +
        '</svg>';
      photoGrid.appendChild(empty);
    }

    photoCountEl.textContent = photos.length + ' of ' + MAX_PHOTOS;
    refreshSubmit();
  }

  photoGrid.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const idx = Number(btn.dataset.remove);
    photos.splice(idx, 1);
    paintPhotos();
  });

  photoInput.addEventListener('change', async function (e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';

    for (const file of files) {
      if (photos.length >= MAX_PHOTOS) {
        alert('You can add up to ' + MAX_PHOTOS + ' photos.');
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert('That image is too large. Max is 5 MB.');
        continue;
      }
      if (!file.type.startsWith('image/')) {
        alert('Only image files are allowed.');
        continue;
      }

      const slot = { url: null, uploading: true };
      photos.push(slot);
      paintPhotos();

      const res = await AUTH.uploadPostPhoto(file);

      if (!res.ok) {
        const i = photos.indexOf(slot);
        if (i !== -1) photos.splice(i, 1);
        paintPhotos();
        alert('Could not upload that photo. Try again.');
        continue;
      }

      slot.url = res.url;
      slot.uploading = false;
      paintPhotos();
    }
  });

  /* ---------- Status ---------- */
  function setStatus(text, tone) {
    statusText.textContent = text || '';
    const dot = document.querySelector('.savebar .status i');
    if (!dot) return;
    dot.style.background = tone === 'error' ? '#B33F43'
                        : tone === 'busy'  ? '#2F6D70'
                        : '#A5B4AE';
  }

  /* ---------- Post ---------- */
  async function submitPost() {
    if (!isValid() || posting) return;

    posting = true;
    refreshSubmit();
    setStatus('Posting…', 'busy');

    const payload = {
      category: category,
      title: titleEl.value.trim(),
      body: bodyEl.value.trim(),
      photos: photos.filter(function (p) { return !!p.url; }).map(function (p) { return p.url; }),
      price: priceEl.value.trim(),
      location: locationEl.value.trim(),
      whatsapp: whatsappEl.value.trim(),
    };

    if (category === 'gig') {
      const minVal = Number(gigBudgetMin.value);
      const maxVal = Number(gigBudgetMax.value);

      payload.gig_budget_min = isFinite(minVal) && minVal > 0 ? Math.round(minVal) : null;
      payload.gig_budget_max = isFinite(maxVal) && maxVal > 0 ? Math.round(maxVal) : null;
      payload.gig_deadline   = gigDeadline.value || null;
      payload.gig_status     = 'open';
    }

    const res = await AUTH.createPost(payload);

    if (!res.ok) {
      posting = false;
      refreshSubmit();
      setStatus('Couldn\u2019t post. Try again.', 'error');
      console.error('createPost:', res.error);
      return;
    }

    setStatus('Posted.', 'busy');
    setTimeout(function () { location.replace('/home.html'); }, 500);
  }

  saveBtn.addEventListener('click', submitPost);
  topPostBtn.addEventListener('click', submitPost);

  /* ---------- Boot ---------- */
  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }

    updateCounter();
    paintPhotos();
    paintGigFields();
    refreshSubmit();
  })();
})();
