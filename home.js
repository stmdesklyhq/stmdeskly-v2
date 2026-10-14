/* =========================================================
   STMDESKLY v2 — Home (feed)
   Avatar links are plain <a href>. Nothing intercepts them.
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const greetingEl       = $('greeting');
  const userAvatarEl     = $('userAvatar');
  const composerAvatarEl = $('composerAvatar');
  const feedEl           = $('feed');
  const loadingEl        = $('feedLoading');
  const emptyEl          = $('feedEmpty');
  const categoryNav      = $('categoryNav');

  const commentOverlay   = $('commentOverlay');
  const commentSheet     = $('commentSheet');
  const sheetClose       = $('sheetClose');
  const sheetPost        = $('sheetPost');
  const sheetReplies     = $('sheetReplies');
  const sheetComposer    = $('sheetComposer');
  const sheetInput       = $('sheetInput');
  const sheetSend        = $('sheetSend');

  const CATEGORY_LABELS = {
    gig:      'Gig',
    business: 'Business update',
    deal:     'Market deal',
    skill:    'Skills & work'
  };

  let currentUser = null;
  let currentUsername = '';
  let currentCategory = 'all';
  let sb = null;
  let activePostId = null;

  function firstName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[0] : '';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - then) / 1000));
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function paintGreeting() {
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let timeWord = 'Good evening';
    if (hour < 12) timeWord = 'Good morning';
    else if (hour < 17) timeWord = 'Good afternoon';

    const name = firstName(currentUser && currentUser.user_metadata && currentUser.user_metadata.name);
    greetingEl.innerHTML = esc(timeWord) + (name ? ', ' + esc(name) : '') + '<span>.</span>';
  }

  function paintAvatars() {
    const name = (currentUser && currentUser.user_metadata && currentUser.user_metadata.name) || '';
    const ini = initials(name);
    if (userAvatarEl) userAvatarEl.textContent = ini;
    if (composerAvatarEl) composerAvatarEl.textContent = ini;
  }

  function renderPhotoGrid(photos) {
    if (!Array.isArray(photos) || !photos.length) return '';

    const shown = photos.slice(0, 3);
    const extra = photos.length - shown.length;

    const tiles = shown.map(function (url) {
      return '<div class="post-photo-tile"><img src="' + esc(url) + '" alt="" loading="lazy"></div>';
    }).join('');

    const more = extra > 0
      ? '<div class="post-photo-tile post-photo-more">+' + extra + '</div>'
      : '';

    return '<div class="post-photos">' + tiles + more + '</div>';
  }

  function renderPost(post) {
    const photoGrid = renderPhotoGrid(post.photos);
    const categoryLabel = CATEGORY_LABELS[post.category] || post.category;
    const location = post.location
      ? '<span class="location"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>' + esc(post.location) + '</span>'
      : '';

    const title = post.title
      ? '<h3 class="post-title">' + esc(post.title) + '</h3>'
      : '';

    const price = post.price
      ? '<div class="post-price">' + esc(post.price) + '</div>'
      : '';

    const isMine = currentUser && post.user_id === currentUser.id;

    let authorUsername = post.author_username || '';
    if (!authorUsername && isMine && currentUsername) {
      authorUsername = currentUsername;
    }

    const profileUrl = authorUsername
      ? '/profile.html?u=' + encodeURIComponent(authorUsername)
      : '/profile.html';

    const menuButton = isMine
      ? '<button class="icon-button post-menu" data-action="menu" aria-label="Post options"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>'
      : '';

    return '<article class="post-card" data-id="' + esc(post.id) + '" data-owner="' + esc(post.user_id) + '">' +
      '<header class="post-header">' +
        '<a class="avatar post-avatar" href="' + profileUrl + '">' + esc(initials(post.author_name || '·')) + '</a>' +
        '<div class="post-author">' +
          '<a class="post-author-link" href="' + profileUrl + '"><strong>' + esc(post.author_name || 'Someone') + '</strong></a>' +
          '<div class="post-meta">' +
            '<span class="post-category">' + esc(categoryLabel) + '</span>' +
            '<span>' + esc(timeAgo(post.created_at)) + '</span>' +
            location +
          '</div>' +
        '</div>' +
        menuButton +
      '</header>' +
      title +
      '<p class="post-body">' + esc(post.body) + '</p>' +
      price +
      photoGrid +
      '<footer class="post-actions">' +
        '<button class="post-action" data-action="like" aria-label="Like"><svg viewBox="0 0 24 24"><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.3 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg><span class="reaction-count" data-count-for="' + esc(post.id) + '"></span></button>' +
        '<button class="post-action" data-action="comment" aria-label="Comment"><svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.5-.8L4 20l1.3-4.2a7.5 7.5 0 1 1 14.7-4.3Z"/></svg><span class="reply-count" data-reply-count-for="' + esc(post.id) + '"></span></button>' +
        '<button class="post-action" data-action="share" aria-label="Share"><svg viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg></button>' +
      '</footer>' +
    '</article>';
  }

  async function loadFeed() {
    if (!feedEl || !sb) return;

    loadingEl.hidden = false;
    emptyEl.hidden = true;

    feedEl.querySelectorAll('.post-card').forEach(function (n) { n.remove(); });

    let query = sb
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (currentCategory !== 'all') {
      query = query.eq('category', currentCategory);
    }

    const res = await query;

    loadingEl.hidden = true;

    if (res.error) {
      console.error('loadFeed:', res.error);
      feedEl.insertAdjacentHTML('beforeend',
        '<div style="text-align:center;padding:24px 0;color:#B3261E;font-size:12px;">Could not load posts.</div>');
      return;
    }

    const posts = res.data || [];

    if (!posts.length) {
      emptyEl.hidden = false;
      return;
    }

    const userIds = [...new Set(posts.map(function (p) { return p.user_id; }).filter(Boolean))];
    let authorMap = {};
    if (userIds.length) {
      const authorsRes = await sb
        .from('desks')
        .select('user_id, name, username')
        .in('user_id', userIds);
      if (!authorsRes.error && authorsRes.data) {
        authorsRes.data.forEach(function (d) {
          authorMap[d.user_id] = { name: d.name, username: d.username };
        });
      }
    }

    const html = posts.map(function (p) {
      const author = authorMap[p.user_id] || { name: 'Someone', username: '' };
      p.author_name = author.name;
      p.author_username = author.username;
      return renderPost(p);
    }).join('');

    feedEl.insertAdjacentHTML('afterbegin', html);

    const ids = posts.map(function (p) { return p.id; });

    const rx = await AUTH.getPostReactions(ids);
    if (rx.ok) {
      Object.keys(rx.data).forEach(function (postId) {
        const info = rx.data[postId];
        const el = feedEl.querySelector('[data-count-for="' + postId + '"]');
        if (el && info.count > 0) el.textContent = info.count;
        if (info.mine && Object.keys(info.mine).length) {
          const card = feedEl.querySelector('[data-id="' + postId + '"]');
          if (card) card.classList.add('is-liked');
        }
      });
    }

    const rc = await AUTH.getReplyCounts(ids);
    if (rc.ok) {
      Object.keys(rc.data).forEach(function (postId) {
        const el = feedEl.querySelector('[data-reply-count-for="' + postId + '"]');
        if (el && rc.data[postId] > 0) el.textContent = rc.data[postId];
      });
    }
  }

  function wireCategoryNav() {
    if (!categoryNav) return;
    categoryNav.addEventListener('click', function (e) {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;

      const cat = chip.dataset.category || 'all';
      if (cat === currentCategory) return;

      currentCategory = cat;

      categoryNav.querySelectorAll('.filter-chip').forEach(function (c) {
        const isActive = c.dataset.category === cat;
        c.classList.toggle('active', isActive);
        c.setAttribute('aria-pressed', String(isActive));
      });

      loadFeed();
    });
  }

  function openCommentSheet(postId) {
    if (!commentOverlay) return;
    activePostId = postId;

    const original = feedEl.querySelector('[data-id="' + postId + '"]');
    if (original && sheetPost) {
      const clone = original.cloneNode(true);
      const menu = clone.querySelector('.post-menu');
      if (menu) menu.remove();
      const actions = clone.querySelector('.post-actions');
      if (actions) actions.remove();
      sheetPost.innerHTML = '';
      sheetPost.appendChild(clone);
    } else if (sheetPost) {
      sheetPost.innerHTML = '';
    }

    if (sheetReplies) {
      sheetReplies.innerHTML = '<div class="sheet-empty">Loading…</div>';
    }

    commentOverlay.hidden = false;
    document.body.style.overflow = 'hidden';

    loadReplies();
  }

  function closeCommentSheet() {
    if (!commentOverlay) return;
    commentOverlay.hidden = true;
    document.body.style.overflow = '';
    activePostId = null;
    if (sheetInput) sheetInput.value = '';
    updateSendState();
  }

  async function loadReplies() {
    if (!sheetReplies || !activePostId) return;

    const res = await AUTH.getPostReplies(activePostId);

    if (!res.ok) {
      sheetReplies.innerHTML = '<div class="sheet-empty">Could not load replies.</div>';
      return;
    }

    const replies = res.data || [];

    if (!replies.length) {
      sheetReplies.innerHTML = '<div class="sheet-empty">No replies yet. Be the first.</div>';
      return;
    }

    const myId = currentUser ? currentUser.id : null;

    sheetReplies.innerHTML = replies.map(function (r) {
      const isMine = myId && r.user_id === myId;
      const removeBtn = isMine
        ? '<button type="button" class="reply-remove" data-reply-id="' + esc(r.id) + '" aria-label="Remove reply">×</button>'
        : '';

      return '<div class="reply" data-reply-id="' + esc(r.id) + '">' +
        '<span class="reply-avatar">' + esc(initials(r.author_name || '·')) + '</span>' +
        '<div class="reply-body">' +
          '<div class="reply-head">' +
            '<span class="reply-name">' + esc(r.author_name || 'Someone') + '</span>' +
            '<span class="reply-time">' + esc(timeAgo(r.created_at)) + '</span>' +
          '</div>' +
          '<p class="reply-text">' + esc(r.body) + '</p>' +
        '</div>' +
        removeBtn +
      '</div>';
    }).join('');
  }

  function updateSendState() {
    if (!sheetSend || !sheetInput) return;
    sheetSend.disabled = !sheetInput.value.trim();
  }

  async function submitReply(e) {
    e.preventDefault();
    if (!activePostId || !sheetInput) return;

    const body = sheetInput.value.trim();
    if (!body) return;

    sheetSend.disabled = true;
    sheetInput.disabled = true;

    const res = await AUTH.createReply(activePostId, body);

    sheetInput.disabled = false;

    if (!res.ok) {
      alert('Could not post reply. Try again.');
      updateSendState();
      return;
    }

    const r = res.data;
    const meName = (currentUser && currentUser.user_metadata && currentUser.user_metadata.name) || '';
    r.author_name = meName || 'You';

    if (sheetReplies && sheetReplies.querySelector('.sheet-empty')) {
      sheetReplies.innerHTML = '';
    }

    sheetReplies.insertAdjacentHTML('beforeend',
      '<div class="reply">' +
        '<span class="reply-avatar">' + esc(initials(r.author_name)) + '</span>' +
        '<div class="reply-body">' +
          '<div class="reply-head">' +
            '<span class="reply-name">' + esc(r.author_name) + '</span>' +
            '<span class="reply-time">just now</span>' +
          '</div>' +
          '<p class="reply-text">' + esc(r.body) + '</p>' +
        '</div>' +
      '</div>'
    );

    const sheetBody = $('sheetBody');
    if (sheetBody) sheetBody.scrollTop = sheetBody.scrollHeight;

    sheetInput.value = '';
    updateSendState();

    const countEl = feedEl.querySelector('[data-reply-count-for="' + activePostId + '"]');
    if (countEl) {
      const cur = Number(countEl.textContent) || 0;
      countEl.textContent = cur + 1;
    }
  }

  /* ---------- Post actions ---------- */

  if (feedEl) {
    feedEl.addEventListener('click', async function (e) {
      /* Do NOT touch avatar or author links — let the browser navigate */
      if (e.target.closest('.post-avatar') || e.target.closest('.post-author-link')) {
        return;
      }

      const btn = e.target.closest('.post-action, .post-menu');
      if (!btn) return;

      const card = btn.closest('.post-card');
      if (!card) return;
      const postId = card.dataset.id;
      const action = btn.dataset.action;

      if (action === 'menu') {
        const isMine = currentUser && card.dataset.owner === currentUser.id;
        if (!isMine) return;

        const confirmed = window.confirm('Delete this post?');
        if (!confirmed) return;

        card.style.opacity = '0.4';
        card.style.pointerEvents = 'none';

        const res = await AUTH.deletePost(postId);

        if (!res.ok) {
          card.style.opacity = '';
          card.style.pointerEvents = '';
          const msg = (res.error && res.error.message) || 'unknown';
          alert('Could not delete: ' + msg);
          return;
        }

        card.remove();
        return;
      }

      if (action === 'comment') {
        openCommentSheet(postId);
        return;
      }

      if (action === 'like') {
        const liked = card.classList.toggle('is-liked');
        const countEl = btn.querySelector('.reaction-count');
        const cur = Number(countEl.textContent) || 0;
        countEl.textContent = liked ? (cur + 1) || '' : Math.max(0, cur - 1) || '';

        const res = await AUTH.toggleReaction(postId, 'heart');
        if (!res.ok) {
          card.classList.toggle('is-liked');
          countEl.textContent = cur || '';
        }
      }

      if (action === 'share') {
        const url = location.origin + '/home.html#post-' + postId;
        try {
          if (navigator.share) {
            await navigator.share({ title: 'STMDeskly post', url: url });
          } else {
            await navigator.clipboard.writeText(url);
            btn.classList.add('copied');
            setTimeout(function () { btn.classList.remove('copied'); }, 1400);
          }
        } catch (err) {}
      }
    });
  }

  if (sheetReplies) {
    sheetReplies.addEventListener('click', async function (e) {
      const btn = e.target.closest('.reply-remove');
      if (!btn) return;

      const replyId = btn.dataset.replyId;
      if (!replyId) return;
      if (!window.confirm('Delete this reply?')) return;

      const row = sheetReplies.querySelector('[data-reply-id="' + replyId + '"]');
      if (row) {
        row.style.opacity = '0.4';
        row.style.pointerEvents = 'none';
      }

      const res = await AUTH.deleteReply(replyId);

      if (!res.ok) {
        if (row) {
          row.style.opacity = '';
          row.style.pointerEvents = '';
        }
        alert('Could not delete. Try again.');
        return;
      }

      if (row) row.remove();

      const countEl = feedEl.querySelector('[data-reply-count-for="' + activePostId + '"]');
      if (countEl) {
        const cur = Number(countEl.textContent) || 0;
        countEl.textContent = Math.max(0, cur - 1) || '';
      }
    });
  }

  if (sheetClose) sheetClose.addEventListener('click', closeCommentSheet);
  if (commentOverlay) {
    commentOverlay.addEventListener('click', function (e) {
      if (e.target === commentOverlay) closeCommentSheet();
    });
  }
  if (sheetInput) sheetInput.addEventListener('input', updateSendState);
  if (sheetComposer) sheetComposer.addEventListener('submit', submitReply);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && commentOverlay && !commentOverlay.hidden) {
      closeCommentSheet();
    }
  });

  (async function boot() {
    const user = await AUTH.currentUser();
    if (!user) { location.replace('/login.html'); return; }

    currentUser = user;
    currentUsername = (user.user_metadata && user.user_metadata.username) || '';
    sb = AUTH.sb;

    paintGreeting();
    paintAvatars();
    wireCategoryNav();

    await loadFeed();
  })();
})();
