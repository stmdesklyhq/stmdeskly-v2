/* =========================================================
   STMDESKLY v2 — Shared bottom navigation
   ========================================================= */
(function () {
  'use strict';

  var BLOCKED = [
    '/index.html',
    '/signup.html',
    '/login.html',
    '/forgot.html',
    '/reset.html',
    '/publish.html',
    '/terms.html',
    '/how.html',
    '/demo.html',
    '/desk.html',
    '/profile.html',
    '/preview.html'
  ];

  var path = location.pathname.replace(/\/$/, '') || '/index.html';

  for (var i = 0; i < BLOCKED.length; i++) {
    if (path === BLOCKED[i]) return;
  }
  if (path === '/' || path === '/index.html') return;

  var ITEMS = [
    { label: 'Home',    href: '/home.html',      match: ['/home.html'] },
    { label: 'Explore', href: '/explore.html',   match: ['/explore.html'] },
    { label: 'My Desk', href: '/dashboard.html', match: ['/dashboard.html'] },
    { label: 'Inbox',   href: '/chats.html',     match: ['/chats.html', '/chat.html'] }
  ];

  var ICONS = {
    Home:      '<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
    Explore:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.3 5.3-5.3 2.3 2.3-5.3z"/></svg>',
    'My Desk': '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
    Inbox:     '<svg viewBox="0 0 24 24"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5l-3 2-3-2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>'
  };

  document.body.classList.add('stm-nav-page');

  var nav = document.createElement('nav');
  nav.className = 'stm-nav';
  nav.setAttribute('aria-label', 'Main navigation');

  function isCurrent(item) {
    for (var i = 0; i < item.match.length; i++) {
      if (path === item.match[i]) return true;
    }
    return false;
  }

  nav.innerHTML = ITEMS.map(function (item) {
    var cls = 'stm-nav__item' + (isCurrent(item) ? ' is-current' : '');
    var aria = isCurrent(item) ? ' aria-current="page"' : '';
    var dot = (item.label === 'Inbox')
      ? '<span class="stm-nav__dot" hidden aria-hidden="true"></span>'
      : '';
    return '<a class="' + cls + '" href="' + item.href + '"' + aria + '>' +
      ICONS[item.label] +
      dot +
      '<span>' + item.label + '</span>' +
    '</a>';
  }).join('');

  document.body.appendChild(nav);

  document.querySelectorAll('.bottom-nav, .tabbar').forEach(function (el) {
    el.remove();
  });
})();
