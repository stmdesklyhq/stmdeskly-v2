/* =========================================================
   STMDESKLY v2 — Profile
   Clean modern profile. Public view. No login needed to read.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const loadingEl    = $('loading');
  const missingEl    = $('missing');
  const profileEl    = $('profile');
  const coverEl      = $('cover');
  const markEl       = $('mark');
  const nameEl       = $('name');
  const roleEl       = $('role');
  const bioEl        = $('bio');
  const topTitle     = $('profileTopTitle');
  const backBtn      = $('backBtn');
  const shareBtn     = $('shareBtn');

  const quickActions = $('quickActions');
  const deskCard     = $('deskCard');
  const deskLinkUrl  = $('deskLinkUrl');
  const copyDeskBtn  = $('copyDeskLink');

  const workSection      = $('workSection');
  const workGrid         = $('workGrid');
  const aboutSection     = $('aboutSection');
  const aboutText        = $('aboutText');
  const servicesSection  = $('servicesSection');
  const servicesList     = $('servicesList');
  const detailsSection   = $('detailsSection');
  const detailsList      = $('detailsList');
  const contactSection   = $('contactSection');
  const contactList      = $('contactList');
  const postsSection     = $('postsSection');
  const postsList        = $('postsList');

  const chatPill     = $('chatPill');
  const lightbox     = $('lightbox');
  const lightboxImg  = $('lightboxImage');
  const lightboxClose = $('lightboxClose');

  let currentUser = null;
  let desk = null;
  let sb = null;

  /* ---------- Helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function digitsOnly(s) {
    return String(s || '').replace(/[^\d]/g, '');
  }

  /* ---------- Lightbox ---------- */

  function openLightbox(src) {
    if (!src) return;
    lightboxImg.src = src;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = '';
    document.body.style.overflow = '';
  }
  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });

  /* ---------- Cover ---------- */

  function paintCover() {
    if (desk.cover_url) {
      coverEl.style.backgroundImage = 'url(' + desk.cover_url + ')';
      coverEl.classList.add('has-image');
    } else {
      coverEl.style.backgroundImage = '';
      coverEl.classList.remove('has-image');
    }
  }

  /* ---------- Identity ---------- */

  function paintIdentity() {
    if (desk.avatar_url) {
      markEl.innerHTML = '<img src="' + esc(desk.avatar_url) + '" alt="">';
    } else {
      markEl.textContent = initials(desk.name);
    }

    nameEl.textContent = desk.name || 'Someone';
    topTitle.textContent = desk.name || 'Profile';
    document.title = (desk.name || 'Profile') + ' — STMDeskly';

    if (desk.role) {
      roleEl.textContent = desk.role;
      roleEl.hidden = false;
    } else {
      roleEl.hidden = true;
    }

    const bio = String(desk.tagline || '').trim();
    if (bio) {
      bioEl.textContent = bio;
      bioEl.hidden = false;
    } else {
      bioEl.hidden = true;
    }
  }

  /* ---------- Quick actions ---------- */

  function paintQuickActions() {
    const actions = [];

    if (desk.whatsapp) {
      const num = digitsOnly(desk.whatsapp);
      actions.push({
        label: 'WhatsApp',
        href: 'https://wa.me/' + num,
        accent: true,
        icon: '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
      });
    }

    if (desk.website) {
      const url = /^https?:\/\//i.test(desk.website) ? desk.website : ('https://' + desk.website);
      actions.push({
        label: 'Website',
        href: url,
        icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>'
      });
    }

    if (desk.email) {
      actions.push({
        label: 'Email',
        href: 'mailto:' + desk.email,
        icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>'
      });
    }

    if (desk.phone) {
      actions.push({
        label: 'Phone',
        href: 'tel:' + digitsOnly(desk.phone),
        icon: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/></svg>'
      });
    }

    if (!actions.length) {
      quickActions.hidden = true;
      return;
    }

    quickActions.hidden = false;
    quickActions.innerHTML = actions.map(function (a) {
      return '<a class="profile-action' + (a.accent ? ' is-accent' : '') + '" href="' + esc(a.href) + '" target="_blank" rel="noopener" aria-label="' + esc(a.label) + '">' + a.icon + '</a>';
    }).join('');
  }

  /* ---------- Desk link card ---------- */

  function paintDeskCard() {
    if (!desk.username) {
      deskCard.hidden = true;
      return;
    }
    deskCard.hidden = false;
    const url = location.origin + '/u/' + desk.username;
    deskLinkUrl.textContent = url.replace(/^https?:\/\//, '');
  }

  if (copyDeskBtn) {
    copyDeskBtn.addEventListener('click', async function () {
      if (!desk || !desk.username) return;
      const url = location.origin + '/u/' + desk.username;
      try {
        await navigator.clipboard.writeText(url);
        copyDeskBtn.style.background = 'rgba(47, 109, 112, 0.14)';
        setTimeout(function () { copyDeskBtn.style.background = ''; }, 1200);
      } catch (e) {
        prompt('Copy Desk link:', url);
      }
    });
  }

  /* ---------- Work ---------- */

  function paintWork() {
    const photos = Array.isArray(desk.photos) ? desk.photos.filter(Boolean) : [];
    if (!photos.length) {
      workSection.hidden = true;
      return;
    }
    workSection.hidden = false;
    workGrid.innerHTML = photos.map(function (u) {
      return '<button type="button" class="profile-work-tile" data-src="' + esc(u) + '">' +
        '<img src="' + esc(u) + '" alt="" loading="lazy">' +
      '</button>';
    }).join('');

    workGrid.addEventListener('click', function (e) {
      const tile = e.target.closest('.profile-work-tile');
      if (!tile) return;
      openLightbox(tile.dataset.src);
    });
  }

  /* ---------- About ---------- */

  function paintAbout() {
    const about = String(desk.about || '').trim();
    if (!about) {
      aboutSection.hidden = true;
      return;
    }
    aboutSection.hidden = false;
    aboutText.textContent = about;
  }

  /* ---------- Services ---------- */

  function paintServices() {
    const raw = String(desk.services || '').trim();
    if (!raw) {
      servicesSection.hidden = true;
      return;
    }
    const lines = raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) {
      servicesSection.hidden = true;
      return;
    }
    servicesSection.hidden = false;
    servicesList.innerHTML = lines.map(function (l) {
      return '<li>' + esc(l) + '</li>';
    }).join('');
  }

  /* ---------- Details ---------- */

  function paintDetails() {
    const rows = [];

    if (desk.location) rows.push({ label: 'Location', value: desk.location });
    if (desk.opening_hours) rows.push({ label: 'Hours', value: desk.opening_hours });
    if (desk.service_times) rows.push({ label: 'Service times', value: desk.service_times });

    if (!rows.length) {
      detailsSection.hidden = true;
      return;
    }
    detailsSection.hidden = false;
    detailsList.innerHTML = rows.map(function (r) {
      return '<div class="profile-detail">' +
        '<span class="profile-detail-label">' + esc(r.label) + '</span>' +
        '<span class="profile-detail-value">' + esc(r.value) + '</span>' +
      '</div>';
    }).join('');
  }

  /* ---------- Contact ---------- */

  function paintContact() {
    const items = [];

    if (desk.whatsapp) {
      const num = digitsOnly(desk.whatsapp);
      items.push({
        label: 'Message on WhatsApp',
        href: 'https://wa.me/' + num,
        primary: true,
        icon: '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
      });
    }

    if (desk.email) {
      items.push({
        label: desk.email,
        href: 'mailto:' + desk.email,
        icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>'
      });
    }

    if (desk.phone) {
      items.push({
        label: desk.phone,
        href: 'tel:' + digitsOnly(desk.phone),
        icon: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/></svg>'
      });
    }

    if (desk.website) {
      const url = /^https?:\/\//i.test(desk.website) ? desk.website : ('https://' + desk.website);
      items.push({
        label: desk.website.replace(/^https?:\/\//i, ''),
        href: url,
        icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>'
      });
    }

    if (!items.length) {
      contactSection.hidden = true;
      return;
    }
    contactSection.hidden = false;
    contactList.innerHTML = items.map(function (i) {
      return '<a class="profile-contact-item' + (i.primary ? ' is-primary' : '') + '" href="' + esc(i.href) + '"' +
        (i.href.indexOf('mailto:') === 0 || i.href.indexOf('tel:') === 0 ? '' : ' target="_blank" rel="noopener"') + '>' +
        i.icon +
        '<span>' + esc(i.label) + '</span>' +
      '</a>';
    }).join('');
  }

  /* ---------- Recent posts ---------- */

  const CATEGORY_LABELS = {
    gig: 'Gig', business: 'Business', deal: 'Deal', skill: 'Skills'
  };

  async function paintPosts() {
    if (!desk || !desk.user_id) { postsSection.hidden = true; return; }

    const res = await sb
      .from('posts')
      .select('id, category, title, body, photos, price, created_at')
      .eq('user_id', desk.user_id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (res.error || !res.data || !res.data.length) {
      postsSection.hidden = true;
      return;
    }

    postsSection.hidden = false;

    postsList.innerHTML = res.data.map(function (p) {
      const cat = CATEGORY_LABELS[p.category] || p.category || 'Post';
      const title = p.title ? '<h3 class="profile-post-title">' + esc(p.title) + '</h3>' : '';
      const price = p.price ? '<div class="profile-post-price">' + esc(p.price) + '</div>' : '';

      let photosHtml = '';
      if (Array.isArray(p.photos) && p.photos.length) {
        const shown = p.photos.slice(0, 3);
        photosHtml = '<div class="profile-post-photos">' +
          shown.map(function (u) { return '<img src="' + esc(u) + '" alt="" loading="lazy">'; }).join('') +
        '</div>';
      }

      return '<article class="profile-post">' +
        '<div class="profile-post-head">' +
          '<span class="profile-post-cat">' + esc(cat) + '</span>' +
          '<span class="profile-post-time">' + esc(timeAgo(p.created_at)) + '</span>' +
        '</div>' +
        title +
        '<p class="profile-post-body">' + esc(p.body) + '</p>' +
        price +
        photosHtml +
      '</article>';
    }).join('');
  }

  /* ---------- Chat pill ---------- */

  function paintChat() {
    const isMe = currentUser && desk && currentUser.id === desk.user_id;
    const canChat = !!currentUser && !isMe;
    chatPill.hidden = !canChat;
    if (canChat) {
      chatPill.addEventListener('click', function () {
        location.href = '/chat.html?to=' + encodeURIComponent(desk.user_id);
      });
    }
  }

  /* ---------- Share ---------- */

  if (shareBtn) {
    shareBtn.addEventListener('click', async function () {
      const url = location.href;
      const title = (desk && desk.name) ? desk.name + ' — STMDeskly' : 'STMDeskly profile';
      try {
        if (navigator.share) {
          await navigator.share({ title: title, url: url });
        } else {
          await navigator.clipboard.writeText(url);
          shareBtn.style.color = 'var(--teal, #2F6D70)';
          setTimeout(function () { shareBtn.style.color = ''; }, 1200);
        }
      } catch (e) {}
    });
  }

  /* ---------- Back ---------- */

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      if (window.history.length > 1) history.back();
      else location.href = '/home';
    });
  }

  /* ---------- Show states ---------- */

  function showMissing() {
    loadingEl.hidden = true;
    profileEl.hidden = true;
    missingEl.hidden = false;
  }

  function showProfile() {
    loadingEl.hidden = true;
    missingEl.hidden = true;
    profileEl.hidden = false;
  }

  /* =========================================================
     BOOT
     ========================================================= */

  (async function boot() {
    try {
      sb = AUTH.sb;

      const params = new URLSearchParams(location.search);
      let username = (params.get('u') || '').trim().toLowerCase();

      if (!username) {
        const m = location.pathname.match(/^\/u\/([^\/?#]+)/);
        if (m) username = decodeURIComponent(m[1]).toLowerCase();
      }

      try { currentUser = await AUTH.currentUser(); } catch (e) { currentUser = null; }

      if (!username && currentUser) {
        try {
          const own = await AUTH.currentDesk();
          if (own && own.username) username = String(own.username).toLowerCase();
        } catch (e) {}
        if (!username) {
          const meta = currentUser.user_metadata || {};
          if (meta.username) username = String(meta.username).toLowerCase();
        }
      }

      if (!username) { showMissing(); return; }

      const res = await sb.from('desks').select('*').eq('username', username).maybeSingle();
      if (res.error || !res.data) { showMissing(); return; }

      desk = res.data;

      paintCover();
      paintIdentity();
      paintQuickActions();
      paintDeskCard();
      paintWork();
      paintAbout();
      paintServices();
      paintDetails();
      paintContact();
      paintChat();

      showProfile();

      paintPosts();

    } catch (err) {
      console.error('Profile load failed:', err);
      showMissing();
    }
  })();
})();
