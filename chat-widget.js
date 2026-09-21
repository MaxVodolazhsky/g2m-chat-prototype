/* gift2money chat prototype — user widget. Self-contained: injects its own DOM at the end of <body>. */
(function (root) {
  'use strict';

  var C = root.G2MChatCommon;
  var S = root.G2MChatStore;
  if (!C || !S) {
    console.error('[g2m-chat] load chat-common.js and chat-store.js before chat-widget.js');
    return;
  }
  var t = C.t;
  var esc = C.escapeHtml;
  var UI_KEY = 'g2m_chat_ui';

  var store = S.createChatStore();
  if (root.G2MChatSeed) root.G2MChatSeed.seedIfEmpty(store);
  var user = S.CURRENT_USER;

  var scriptSrc = (document.currentScript && document.currentScript.src) || '';
  var assetBase = scriptSrc ? scriptSrc.replace(/[^\/]*$/, '') : '';

  /* ---------- UI state (persisted) ---------- */
  function loadUi() {
    try {
      var parsed = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
      if (parsed && typeof parsed === 'object') {
        return { open: !!parsed.open, screen: parsed.screen || 'list', chatId: parsed.chatId || null };
      }
    } catch (e) { /* ignore */ }
    return { open: false, screen: 'list', chatId: null };
  }
  function saveUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* ignore */ }
  }
  var ui = loadUi();
  if (ui.screen === 'chat' && !store.getChat(ui.chatId)) { ui.screen = 'list'; ui.chatId = null; }

  var draft = { topicCode: null, topicTitle: '', text: '', errors: {} };   // форма нового чата
  var composer = { text: '', image: null, error: null };                   // композер переписки
  var errorTimer = null;
  var lastUnread = store.unreadTotal('user', user.id);

  /* ---------- icons ---------- */
  var ICONS = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>',
    attach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"/></svg>',
    checkDouble: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l4 4 8-9"/><path d="M10 16l2 2 10-11"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/><path d="M8 11h8M8 15h5"/></svg>'
  };

  /* ---------- DOM ---------- */
  var rootEl = document.createElement('div');
  rootEl.className = 'g2m-chat';
  rootEl.innerHTML =
    '<button type="button" class="g2m-chat-launcher" data-action="toggle" aria-label="' + esc(t('title')) + '" aria-expanded="false">' +
      ICONS.chat + '<span class="g2m-chat-badge" hidden></span>' +
    '</button>' +
    '<div class="g2m-chat-panel" role="dialog" aria-label="' + esc(t('title')) + '" hidden>' +
      '<div class="g2m-chat-banner" hidden>' + esc(t('storageUnavailable')) + '</div>' +
      '<div class="g2m-chat-header"></div>' +
      '<div class="g2m-chat-body"></div>' +
      '<div class="g2m-chat-footer"></div>' +
    '</div>' +
    '<div class="g2m-chat-lightbox" data-action="lightbox-close" hidden><img alt=""></div>';
  document.body.appendChild(rootEl);

  var launcher = rootEl.querySelector('.g2m-chat-launcher');
  var badgeEl = rootEl.querySelector('.g2m-chat-badge');
  var panel = rootEl.querySelector('.g2m-chat-panel');
  var bannerEl = rootEl.querySelector('.g2m-chat-banner');
  var headerEl = rootEl.querySelector('.g2m-chat-header');
  var bodyEl = rootEl.querySelector('.g2m-chat-body');
  var footerEl = rootEl.querySelector('.g2m-chat-footer');
  var lightbox = rootEl.querySelector('.g2m-chat-lightbox');

  /* ---------- sound & pulse ---------- */
  var audio = null;
  function playSound() {
    try {
      if (!audio) audio = new Audio(assetBase + 'assets/alert_msg.mp3');
      audio.currentTime = 0;
      var p = audio.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked until first click */ });
    } catch (e) { /* ignore */ }
  }
  function pulse() {
    launcher.classList.remove('g2m-chat-launcher--pulse');
    void launcher.offsetWidth; // перезапуск анимации
    launcher.classList.add('g2m-chat-launcher--pulse');
  }

  /* ---------- helpers ---------- */
  function iconButton(action, labelKey, icon) {
    return '<button type="button" class="g2m-chat-iconbtn" data-action="' + action + '" aria-label="' + esc(t(labelKey)) + '">' + icon + '</button>';
  }
  function updateBadge() {
    var n = store.unreadTotal('user', user.id);
    badgeEl.textContent = n > 99 ? '99+' : String(n);
    badgeEl.hidden = n === 0;
  }
  function updateBanner() { bannerEl.hidden = !store.isDegraded(); }
  function scrollToBottom() {
    var list = bodyEl.querySelector('.g2m-chat-messages');
    if (list) list.scrollTop = list.scrollHeight;
  }

  /* ---------- render ---------- */
  function render() {
    rootEl.setAttribute('data-open', ui.open ? 'true' : 'false');
    panel.hidden = !ui.open;
    launcher.setAttribute('aria-expanded', ui.open ? 'true' : 'false');
    updateBadge();
    updateBanner();
    if (!ui.open) return;
    if (ui.screen === 'new') renderNew();
    else if (ui.screen === 'chat') renderChat();
    else renderList();
  }

  function renderList() {
    headerEl.innerHTML =
      '<div class="g2m-chat-header-text"><div class="g2m-chat-title">' + esc(t('title')) + '</div>' +
      '<div class="g2m-chat-subtitle">' + esc(t('subtitle')) + '</div></div>' +
      iconButton('close', 'close', ICONS.close);
    var chats = store.listChats({ userId: user.id });
    if (!chats.length) {
      bodyEl.innerHTML =
        '<div class="g2m-chat-empty">' + ICONS.empty +
        '<div class="g2m-chat-empty-title">' + esc(t('emptyTitle')) + '</div>' +
        '<div class="g2m-chat-empty-text">' + esc(t('emptyText')) + '</div></div>';
    } else {
      bodyEl.innerHTML = '<div class="g2m-chat-list">' + chats.map(renderListItem).join('') + '</div>';
    }
    footerEl.innerHTML = '<button type="button" class="g2m-chat-btn g2m-chat-btn--primary" data-action="new">' + esc(t('newChat')) + '</button>';
  }

  function renderListItem(chat) {
    var msgs = store.getMessages(chat.id);
    var last = msgs[msgs.length - 1];
    var unread = chat.unreadForUser;
    var cls = 'g2m-chat-item' + (unread ? ' g2m-chat-item--unread' : '') + (chat.status === 'closed' ? ' g2m-chat-item--closed' : '');
    return '<button type="button" class="' + cls + '" data-action="open-chat" data-id="' + esc(chat.id) + '">' +
      '<div class="g2m-chat-item-main">' +
        '<div class="g2m-chat-item-top"><span class="g2m-chat-item-title">' + esc(C.topicTitle(chat)) + '</span>' +
          (chat.status === 'closed' ? '<span class="g2m-chat-tag">' + esc(t('closed')) + '</span>' : '') +
        '</div>' +
        '<div class="g2m-chat-item-preview">' + esc(C.messagePreview(last)) + '</div>' +
      '</div>' +
      '<div class="g2m-chat-item-side"><span class="g2m-chat-item-time">' + esc(C.listTimeLabel(chat.updatedAt)) + '</span>' +
        (unread ? '<span class="g2m-chat-pill">' + unread + '</span>' : '') +
      '</div>' +
    '</button>';
  }

  // Заглушки: Task 6 и Task 7 заменяют эти три функции целиком.
  function renderNew() {
    headerEl.innerHTML = iconButton('back', 'back', ICONS.back) +
      '<div class="g2m-chat-header-text"><div class="g2m-chat-title">' + esc(t('newChat')) + '</div></div>' +
      iconButton('close', 'close', ICONS.close);
    bodyEl.innerHTML = '<div class="g2m-chat-empty">…</div>';
    footerEl.innerHTML = '';
  }
  function renderChat() {
    var chat = store.getChat(ui.chatId);
    if (!chat) { setScreen('list'); return; }
    headerEl.innerHTML = iconButton('back', 'back', ICONS.back) +
      '<div class="g2m-chat-header-text"><div class="g2m-chat-title">' + esc(C.topicTitle(chat)) + '</div></div>' +
      iconButton('close', 'close', ICONS.close);
    bodyEl.innerHTML = '<div class="g2m-chat-empty">…</div>';
    footerEl.innerHTML = '';
  }
  function renderChatUpdate() { renderChat(); }

  /* ---------- navigation ---------- */
  function setScreen(screen, chatId) {
    ui.screen = screen;
    ui.chatId = chatId || null;
    saveUi();
    render();
  }
  function openPanel() { ui.open = true; saveUi(); render(); }
  function closePanel() { ui.open = false; saveUi(); render(); }
  function openChat(id) {
    if (!store.getChat(id)) return;
    composer = { text: '', image: null, error: null };
    store.markRead(id, 'user');
    setScreen('chat', id);
  }

  /* ---------- events ---------- */
  rootEl.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    switch (action) {
      case 'toggle': if (ui.open) closePanel(); else openPanel(); break;
      case 'close': closePanel(); break;
      case 'back': setScreen('list'); break;
      case 'new': draft = { topicCode: null, topicTitle: '', text: '', errors: {} }; setScreen('new'); break;
      case 'open-chat': openChat(target.getAttribute('data-id')); break;
      case 'lightbox':
        lightbox.querySelector('img').src = target.getAttribute('data-src');
        lightbox.hidden = false;
        break;
      case 'lightbox-close': lightbox.hidden = true; break;
      default: break;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!lightbox.hidden) { lightbox.hidden = true; return; }
    if (ui.open) closePanel();
  });

  store.subscribe(function onStoreChange() {
    var unread = store.unreadTotal('user', user.id);
    if (unread > lastUnread) { pulse(); playSound(); }
    lastUnread = unread;
    updateBadge();
    updateBanner();
    if (!ui.open) return;
    if (ui.screen === 'chat') {
      if (!store.getChat(ui.chatId)) { setScreen('list'); return; }
      store.markRead(ui.chatId, 'user'); // no-op, если нечего отмечать
      renderChatUpdate();
    } else if (ui.screen === 'list') {
      renderList();
    }
    // на экране 'new' не перерисовываем, чтобы не сбивать ввод
  });

  render();

  root.G2MChatWidget = { store: store, open: openPanel, close: closePanel, render: render };
})(window);
