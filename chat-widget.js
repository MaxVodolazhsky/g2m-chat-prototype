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
    bodyEl.scrollTop = bodyEl.scrollHeight;
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

    var chips = C.TOPIC_CODES.map(function (code) {
      var active = draft.topicCode === code;
      return '<button type="button" class="g2m-chat-chip' + (active ? ' g2m-chat-chip--active' : '') + '" ' +
        'data-action="pick-topic" data-code="' + code + '" role="radio" aria-checked="' + active + '">' +
        esc(t('topics.' + code)) + '</button>';
    }).join('');

    var errorLine = function (key) { return key ? '<div class="g2m-chat-error">' + esc(t(key)) + '</div>' : ''; };
    var customTopic = draft.topicCode === 'other'
      ? '<input class="g2m-chat-input' + (draft.errors.topicTitle ? ' g2m-chat-input--error' : '') + '" name="topicTitle" maxlength="60" ' +
        'placeholder="' + esc(t('customTopicPlaceholder')) + '" value="' + esc(draft.topicTitle) + '">' + errorLine(draft.errors.topicTitle)
      : '';

    bodyEl.innerHTML =
      '<form class="g2m-chat-form" novalidate onsubmit="return false">' +
        '<div class="g2m-chat-label">' + esc(t('topicLabel')) + '</div>' +
        '<div class="g2m-chat-chips" role="radiogroup">' + chips + '</div>' + errorLine(draft.errors.topic) +
        customTopic +
        '<textarea class="g2m-chat-textarea' + (draft.errors.text ? ' g2m-chat-input--error' : '') + '" name="text" rows="5" ' +
          'placeholder="' + esc(t('firstMessagePlaceholder')) + '">' + esc(draft.text) + '</textarea>' + errorLine(draft.errors.text) +
      '</form>';

    footerEl.innerHTML = '<button type="button" class="g2m-chat-btn g2m-chat-btn--primary" data-action="start">' + esc(t('startChat')) + '</button>';
  }

  function startChat() {
    var errors = {};
    if (!draft.topicCode) errors.topic = 'topicRequired';
    if (draft.topicCode === 'other' && !draft.topicTitle.trim()) errors.topicTitle = 'customTopicRequired';
    if (!draft.text.trim()) errors.text = 'messageRequired';
    draft.errors = errors;
    if (Object.keys(errors).length) { renderNew(); return; }
    var chat = store.createChat({
      userId: user.id, topicCode: draft.topicCode, topicTitle: draft.topicTitle, createdBy: 'user', text: draft.text
    });
    draft = { topicCode: null, topicTitle: '', text: '', errors: {} };
    composer = { text: '', image: null, error: null };
    setScreen('chat', chat.id);
  }

  function renderChat() {
    var chat = store.getChat(ui.chatId);
    if (!chat) { setScreen('list'); return; }
    headerEl.innerHTML = iconButton('back', 'back', ICONS.back) +
      '<div class="g2m-chat-header-text"><div class="g2m-chat-title">' + esc(C.topicTitle(chat)) + '</div>' +
      '<div class="g2m-chat-subtitle g2m-chat-status g2m-chat-status--' + chat.status + '">' + esc(t(chat.status)) + '</div></div>' +
      iconButton('close', 'close', ICONS.close);
    bodyEl.innerHTML = '<div class="g2m-chat-messages"></div>';
    renderChatMessages(chat);
    renderChatFooter(chat);
    scrollToBottom();
  }

  function renderChatUpdate() {
    var chat = store.getChat(ui.chatId);
    if (!chat) { setScreen('list'); return; }
    var list = bodyEl.querySelector('.g2m-chat-messages');
    if (!list) { renderChat(); return; }
    var statusEl = headerEl.querySelector('.g2m-chat-status');
    var wasClosed = !!(statusEl && statusEl.classList.contains('g2m-chat-status--closed'));
    if (statusEl) {
      statusEl.textContent = t(chat.status);
      statusEl.className = 'g2m-chat-subtitle g2m-chat-status g2m-chat-status--' + chat.status;
    }
    var atBottom = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight < 40;
    renderChatMessages(chat);
    if (chat.status === 'closed' && !wasClosed) renderChatFooter(chat);
    if (atBottom) scrollToBottom();
  }

  function renderChatMessages(chat) {
    var list = bodyEl.querySelector('.g2m-chat-messages');
    if (!list) return;
    var groups = C.groupByDay(store.getMessages(chat.id));
    list.innerHTML = groups.map(function (g) {
      var prevFrom = null;
      var items = g.items.map(function (m) {
        var html = renderMessage(m, prevFrom !== m.from);
        prevFrom = m.from;
        return html;
      }).join('');
      return '<div class="g2m-chat-day">' + esc(C.dayLabel(g.day)) + '</div>' + items;
    }).join('');
  }

  function renderMessage(m, first) {
    if (m.from === 'system') return '<div class="g2m-chat-system">' + esc(C.messagePreview(m)) + '</div>';
    var mine = m.from === 'user';
    var ticks = '';
    if (mine) {
      ticks = '<span class="g2m-chat-ticks' + (m.readAt ? ' g2m-chat-ticks--read' : '') + '" title="' +
        esc(t(m.readAt ? 'reads.read' : 'reads.sent')) + '">' + (m.readAt ? ICONS.checkDouble : ICONS.check) + '</span>';
    }
    return '<div class="g2m-chat-msg g2m-chat-msg--' + (mine ? 'me' : 'them') + (first ? ' g2m-chat-msg--first' : '') + '">' +
      (!mine && first ? '<div class="g2m-chat-msg-author">' + esc(t('support')) + '</div>' : '') +
      '<div class="g2m-chat-bubble">' +
        (m.image ? '<img class="g2m-chat-msg-img" src="' + esc(m.image) + '" alt="" data-action="lightbox" data-src="' + esc(m.image) + '">' : '') +
        (m.text ? '<div class="g2m-chat-msg-text">' + esc(m.text).replace(/\n/g, '<br>') + '</div>' : '') +
      '</div>' +
      '<div class="g2m-chat-msg-meta">' + esc(C.timeLabel(m.createdAt)) + ticks + '</div>' +
    '</div>';
  }

  function renderChatFooter(chat) {
    if (chat.status === 'closed') {
      footerEl.innerHTML = '<div class="g2m-chat-closed-note">' + esc(t('closedNote')) + '</div>' +
        '<button type="button" class="g2m-chat-btn g2m-chat-btn--primary" data-action="new">' + esc(t('newChat')) + '</button>';
      return;
    }
    var active = document.activeElement;
    var hadFocus = !!(active && active.name === 'message' && rootEl.contains(active));
    footerEl.innerHTML = '<div class="g2m-chat-composer">' +
      (composer.image
        ? '<div class="g2m-chat-attachment"><img src="' + esc(composer.image) + '" alt="">' +
          '<button type="button" class="g2m-chat-attachment-remove" data-action="remove-image" aria-label="' + esc(t('removeImage')) + '">' + ICONS.close + '</button></div>'
        : '') +
      '<div class="g2m-chat-composer-row">' +
        iconButton('attach', 'attach', ICONS.attach) +
        '<textarea class="g2m-chat-composer-input" name="message" rows="1" placeholder="' + esc(t('messagePlaceholder')) + '">' + esc(composer.text) + '</textarea>' +
        '<button type="button" class="g2m-chat-sendbtn" data-action="send" aria-label="' + esc(t('send')) + '"' + (canSend() ? '' : ' disabled') + '>' + ICONS.send + '</button>' +
        '<input type="file" accept="image/*" class="g2m-chat-file" hidden>' +
      '</div>' +
      (composer.error ? '<div class="g2m-chat-error">' + esc(t(composer.error)) + '</div>' : '') +
    '</div>';
    var ta = footerEl.querySelector('textarea[name="message"]');
    autosize(ta);
    if (hadFocus) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
    footerEl.querySelector('.g2m-chat-file').addEventListener('change', onFileChosen);
  }

  function canSend() { return !!(composer.text.trim() || composer.image); }
  function updateSendState() {
    var b = footerEl.querySelector('.g2m-chat-sendbtn');
    if (b) b.disabled = !canSend();
  }
  function autosize(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
  }
  function showComposerError(key) {
    composer.error = key;
    var chat = store.getChat(ui.chatId);
    if (chat) renderChatFooter(chat);
    clearTimeout(errorTimer);
    errorTimer = setTimeout(function () {
      composer.error = null;
      var c = store.getChat(ui.chatId);
      if (c && ui.screen === 'chat' && ui.open) renderChatFooter(c);
    }, 4000);
  }
  function onFileChosen(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    C.readImageFile(file).then(function (dataUrl) {
      composer.image = dataUrl;
      composer.error = null;
      var chat = store.getChat(ui.chatId);
      if (chat) renderChatFooter(chat);
    }).catch(function (err) {
      showComposerError(err && err.message === 'imageTooLarge' ? 'imageTooLarge' : 'imageOnly');
    });
  }
  function sendCurrent() {
    if (!canSend() || !ui.chatId) return;
    try {
      store.sendMessage(ui.chatId, { from: 'user', text: composer.text, image: composer.image });
    } catch (err) {
      return; // чат закрыт или пуст — UI уже это не позволяет
    }
    composer = { text: '', image: null, error: null };
    var chat = store.getChat(ui.chatId);
    renderChatFooter(chat);
    scrollToBottom();
    var ta = footerEl.querySelector('textarea[name="message"]');
    if (ta) ta.focus();
  }

  /* ---------- navigation ---------- */
  function setScreen(screen, chatId) {
    ui.screen = screen;
    ui.chatId = chatId || null;
    saveUi();
    render();
  }
  function openPanel() {
    ui.open = true;
    saveUi();
    if (ui.screen === 'chat' && ui.chatId) store.markRead(ui.chatId, 'user');
    render();
  }
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
      case 'pick-topic':
        draft.topicCode = target.getAttribute('data-code');
        draft.errors = {};
        renderNew();
        if (draft.topicCode === 'other') { var ti = bodyEl.querySelector('input[name="topicTitle"]'); if (ti) ti.focus(); }
        break;
      case 'start': startChat(); break;
      case 'send': sendCurrent(); break;
      case 'attach': { var f = footerEl.querySelector('.g2m-chat-file'); if (f) f.click(); break; }
      case 'remove-image': {
        composer.image = null;
        var cc = store.getChat(ui.chatId);
        if (cc) renderChatFooter(cc);
        break;
      }
      default: break;
    }
  });

  rootEl.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.name) return;
    if (el.name === 'topicTitle') draft.topicTitle = el.value;
    else if (el.name === 'text') draft.text = el.value;
    else if (el.name === 'message') { composer.text = el.value; autosize(el); updateSendState(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!lightbox.hidden) { lightbox.hidden = true; return; }
    if (ui.open) closePanel();
  });

  rootEl.addEventListener('keydown', function (e) {
    if (e.target && e.target.name === 'message' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCurrent();
    }
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

  if (ui.screen === 'chat' && ui.chatId) store.markRead(ui.chatId, 'user');
  render();

  root.G2MChatWidget = { store: store, open: openPanel, close: closePanel, render: render };
})(window);
