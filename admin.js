/* gift2money chat prototype — support console (admin side) */
(function () {
  'use strict';

  var C = window.G2MChatCommon;
  var S = window.G2MChatStore;
  var Seed = window.G2MChatSeed;
  var t = C.t;
  var esc = C.escapeHtml;

  var store = S.createChatStore();
  Seed.seedIfEmpty(store);

  var state = { filter: 'all', selectedId: null, modal: null }; // modal: null | { userId, topicCode, topicTitle, text, errors }
  var composer = { text: '', image: null, error: null };
  var errorTimer = null;

  var ICONS = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>',
    attach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"/></svg>',
    checkDouble: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l4 4 8-9"/><path d="M10 16l2 2 10-11"/></svg>'
  };

  var tabsEl = document.getElementById('tabs');
  var listEl = document.getElementById('chat-list');
  var convEl = document.getElementById('conversation');
  var modalEl = document.getElementById('modal');
  var modalCard = document.getElementById('modal-card');
  var bannerEl = document.getElementById('banner');
  var lightbox = document.getElementById('lightbox');

  function userName(id) {
    for (var i = 0; i < S.USERS.length; i++) if (S.USERS[i].id === id) return S.USERS[i].name;
    return id;
  }
  function autosize(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }
  function canSend() { return !!(composer.text.trim() || composer.image); }
  function scrollToBottom() {
    var m = document.getElementById('messages');
    if (m) m.scrollTop = m.scrollHeight;
  }

  /* ---------- static labels ---------- */
  document.title = 'Gift2Money — ' + t('adminTitle');
  Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  bannerEl.textContent = t('storageUnavailable');

  /* ---------- render ---------- */
  function renderTabs() {
    var tabs = [['all', 'all'], ['open', 'openOnly'], ['closed', 'closedOnly']];
    tabsEl.innerHTML = tabs.map(function (p) {
      return '<button type="button" class="tab' + (state.filter === p[0] ? ' tab--active' : '') + '" data-action="filter" data-filter="' + p[0] + '">' + esc(t(p[1])) + '</button>';
    }).join('');
  }

  function renderList() {
    var chats = store.listChats().filter(function (c) { return state.filter === 'all' || c.status === state.filter; });
    if (!chats.length) { listEl.innerHTML = '<div class="empty">' + esc(t('emptyTitle')) + '</div>'; return; }
    listEl.innerHTML = chats.map(function (chat) {
      var msgs = store.getMessages(chat.id);
      var last = msgs[msgs.length - 1];
      var cls = 'chat-item' + (chat.id === state.selectedId ? ' chat-item--active' : '') +
        (chat.unreadForAdmin ? ' chat-item--unread' : '') + (chat.status === 'closed' ? ' chat-item--closed' : '');
      return '<button type="button" class="' + cls + '" data-action="select" data-id="' + esc(chat.id) + '">' +
        '<div class="chat-item-main">' +
          '<div class="chat-item-top"><span class="chat-item-user">' + esc(userName(chat.userId)) + '</span>' +
            (chat.status === 'closed' ? '<span class="tag">' + esc(t('closed')) + '</span>' : '') + '</div>' +
          '<div class="chat-item-topic">' + esc(C.topicTitle(chat)) + '</div>' +
          '<div class="chat-item-preview">' + esc(C.messagePreview(last)) + '</div>' +
        '</div>' +
        '<div class="chat-item-side"><span class="chat-item-time">' + esc(C.listTimeLabel(chat.updatedAt)) + '</span>' +
          (chat.unreadForAdmin ? '<span class="pill">' + chat.unreadForAdmin + '</span>' : '') + '</div>' +
      '</button>';
    }).join('');
  }

  function renderMessage(m, first, chat) {
    if (m.from === 'system') return '<div class="msg-system">' + esc(C.messagePreview(m)) + '</div>';
    var mine = m.from === 'admin';
    var ticks = '';
    if (mine) {
      ticks = '<span class="ticks' + (m.readAt ? ' ticks--read' : '') + '" title="' + esc(t(m.readAt ? 'reads.read' : 'reads.sent')) + '">' +
        (m.readAt ? ICONS.checkDouble : ICONS.check) + '</span>';
    }
    return '<div class="msg msg--' + (mine ? 'me' : 'them') + (first ? ' msg--first' : '') + '">' +
      (!mine && first ? '<div class="msg-author">' + esc(userName(chat.userId)) + '</div>' : '') +
      '<div class="bubble">' +
        (m.image ? '<img class="msg-img" src="' + esc(m.image) + '" alt="" data-action="lightbox" data-src="' + esc(m.image) + '">' : '') +
        (m.text ? '<div class="msg-text">' + esc(m.text).replace(/\n/g, '<br>') + '</div>' : '') +
      '</div>' +
      '<div class="msg-meta">' + esc(C.timeLabel(m.createdAt)) + ticks + '</div>' +
    '</div>';
  }

  function renderMessages(chat) {
    return C.groupByDay(store.getMessages(chat.id)).map(function (g) {
      var prevFrom = null;
      var items = g.items.map(function (m) {
        var html = renderMessage(m, prevFrom !== m.from, chat);
        prevFrom = m.from;
        return html;
      }).join('');
      return '<div class="day">' + esc(C.dayLabel(g.day)) + '</div>' + items;
    }).join('');
  }

  function renderComposer(chat) {
    if (chat.status === 'closed') return '<div class="closed-note">' + esc(t('closedNote')) + '</div>';
    return '<div class="composer">' +
      (composer.image
        ? '<div class="attachment"><img src="' + esc(composer.image) + '" alt=""><button type="button" class="attachment-remove" data-action="remove-image" aria-label="' + esc(t('removeImage')) + '">' + ICONS.close + '</button></div>'
        : '') +
      '<div class="composer-row">' +
        '<button type="button" class="iconbtn" data-action="attach" aria-label="' + esc(t('attach')) + '">' + ICONS.attach + '</button>' +
        '<textarea class="composer-input" name="message" rows="1" placeholder="' + esc(t('messagePlaceholder')) + '">' + esc(composer.text) + '</textarea>' +
        '<button type="button" class="sendbtn" data-action="send" aria-label="' + esc(t('send')) + '"' + (canSend() ? '' : ' disabled') + '>' + ICONS.send + '</button>' +
        '<input type="file" accept="image/*" class="file" hidden>' +
      '</div>' +
      (composer.error ? '<div class="error">' + esc(t(composer.error)) + '</div>' : '') +
    '</div>';
  }

  function renderConversation() {
    var chat = state.selectedId ? store.getChat(state.selectedId) : null;
    if (!chat) {
      state.selectedId = null;
      convEl.innerHTML = '<div class="empty empty--big">' + esc(t('noChatSelected')) + '</div>';
      return;
    }
    var active = document.activeElement;
    var hadFocus = !!(active && active.name === 'message');
    convEl.innerHTML =
      '<div class="conv-header">' +
        '<div class="conv-header-text">' +
          '<div class="conv-user">' + esc(userName(chat.userId)) + '</div>' +
          '<div class="conv-meta">' + esc(C.topicTitle(chat)) + ' · <span class="status status--' + chat.status + '">' + esc(t(chat.status)) + '</span> · ' +
            esc(t('startedBy')) + ' ' + esc(t(chat.createdBy === 'admin' ? 'admin' : 'user')).toLowerCase() + '</div>' +
        '</div>' +
        (chat.status === 'open' ? '<button type="button" class="btn btn-danger" data-action="close-chat">' + esc(t('closeChat')) + '</button>' : '') +
      '</div>' +
      '<div class="messages" id="messages">' + renderMessages(chat) + '</div>' +
      '<div class="composer-wrap">' + renderComposer(chat) + '</div>';
    var ta = convEl.querySelector('textarea[name="message"]');
    if (ta) {
      autosize(ta);
      if (hadFocus) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
    }
    var file = convEl.querySelector('input[type="file"]');
    if (file) file.addEventListener('change', onFileChosen);
    scrollToBottom();
  }

  function renderModal() {
    if (!state.modal) { modalEl.hidden = true; return; }
    var m = state.modal;
    var err = function (k) { return k ? '<div class="error">' + esc(t(k)) + '</div>' : ''; };
    var users = S.USERS.map(function (u) {
      return '<option value="' + u.id + '"' + (m.userId === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>';
    }).join('');
    var chips = C.TOPIC_CODES.map(function (code) {
      return '<button type="button" class="chip' + (m.topicCode === code ? ' chip--active' : '') + '" data-action="pick-topic" data-code="' + code + '">' + esc(t('topics.' + code)) + '</button>';
    }).join('');
    modalCard.innerHTML =
      '<div class="modal-title">' + esc(t('newChat')) + '</div>' +
      '<label class="label">' + esc(t('user')) + '</label>' +
      '<select class="input" name="userId">' + users + '</select>' +
      '<label class="label">' + esc(t('topicLabel')) + '</label>' +
      '<div class="chips">' + chips + '</div>' + err(m.errors.topic) +
      (m.topicCode === 'other'
        ? '<input class="input" name="topicTitle" maxlength="60" placeholder="' + esc(t('customTopicPlaceholder')) + '" value="' + esc(m.topicTitle) + '">' + err(m.errors.topicTitle)
        : '') +
      '<textarea class="input" name="text" rows="4" placeholder="' + esc(t('firstMessagePlaceholder')) + '">' + esc(m.text) + '</textarea>' + err(m.errors.text) +
      '<div class="modal-actions">' +
        '<button type="button" class="btn" data-action="close-modal">' + esc(t('cancel')) + '</button>' +
        '<button type="button" class="btn btn-primary" data-action="start">' + esc(t('startChat')) + '</button>' +
      '</div>';
    modalEl.hidden = false;
  }

  function render() {
    bannerEl.hidden = !store.isDegraded();
    renderTabs();
    renderList();
    renderConversation();
    renderModal();
  }

  /* ---------- actions ---------- */
  function selectChat(id) {
    if (!store.getChat(id)) return;
    state.selectedId = id;
    composer = { text: '', image: null, error: null };
    store.markRead(id, 'admin');
    renderList();
    renderConversation();
  }

  function showComposerError(key) {
    composer.error = key;
    renderConversation();
    clearTimeout(errorTimer);
    errorTimer = setTimeout(function () { composer.error = null; renderConversation(); }, 4000);
  }

  function onFileChosen(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    C.readImageFile(file).then(function (dataUrl) {
      composer.image = dataUrl;
      composer.error = null;
      renderConversation();
    }).catch(function (err) {
      showComposerError(err && err.message === 'imageTooLarge' ? 'imageTooLarge' : 'imageOnly');
    });
  }

  function sendCurrent() {
    if (!canSend() || !state.selectedId) return;
    try {
      store.sendMessage(state.selectedId, { from: 'admin', text: composer.text, image: composer.image });
    } catch (err) { return; }
    composer = { text: '', image: null, error: null };
    renderConversation();
    var ta = convEl.querySelector('textarea[name="message"]');
    if (ta) ta.focus();
  }

  function startChat() {
    var m = state.modal;
    var errors = {};
    if (!m.topicCode) errors.topic = 'topicRequired';
    if (m.topicCode === 'other' && !m.topicTitle.trim()) errors.topicTitle = 'customTopicRequired';
    if (!m.text.trim()) errors.text = 'messageRequired';
    m.errors = errors;
    if (Object.keys(errors).length) { renderModal(); return; }
    var chat = store.createChat({ userId: m.userId, topicCode: m.topicCode, topicTitle: m.topicTitle, createdBy: 'admin', text: m.text });
    state.modal = null;
    state.filter = 'all';
    renderModal();
    selectChat(chat.id);
    renderTabs();
  }

  document.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    // клики внутри карточки модалки не должны закрывать модалку через оверлей
    if (target.id === 'modal' && e.target !== modalEl) return;
    var action = target.getAttribute('data-action');
    switch (action) {
      case 'filter': state.filter = target.getAttribute('data-filter'); renderTabs(); renderList(); break;
      case 'select': selectChat(target.getAttribute('data-id')); break;
      case 'open-modal': state.modal = { userId: S.USERS[0].id, topicCode: null, topicTitle: '', text: '', errors: {} }; renderModal(); break;
      case 'close-modal': state.modal = null; renderModal(); break;
      case 'pick-topic': state.modal.topicCode = target.getAttribute('data-code'); state.modal.errors = {}; renderModal(); break;
      case 'start': startChat(); break;
      case 'close-chat':
        if (state.selectedId && window.confirm(t('closeChatConfirm'))) store.closeChat(state.selectedId);
        break;
      case 'reset':
        state.selectedId = null;
        composer = { text: '', image: null, error: null };
        store.reset(Seed.buildSeed());
        render();
        break;
      case 'send': sendCurrent(); break;
      case 'attach': { var f = convEl.querySelector('input[type="file"]'); if (f) f.click(); break; }
      case 'remove-image': composer.image = null; renderConversation(); break;
      case 'lightbox': lightbox.querySelector('img').src = target.getAttribute('data-src'); lightbox.hidden = false; break;
      case 'lightbox-close': lightbox.hidden = true; break;
      default: break;
    }
  });

  function onInput(e) {
    var el = e.target;
    if (!el || !el.name) return;
    if (el.name === 'message') {
      composer.text = el.value;
      autosize(el);
      var b = convEl.querySelector('.sendbtn');
      if (b) b.disabled = !canSend();
    } else if (state.modal) {
      if (el.name === 'userId') state.modal.userId = el.value;
      else if (el.name === 'topicTitle') state.modal.topicTitle = el.value;
      else if (el.name === 'text') state.modal.text = el.value;
    }
  }
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.name === 'message') {
      e.preventDefault();
      sendCurrent();
      return;
    }
    if (e.key === 'Escape') {
      if (!lightbox.hidden) { lightbox.hidden = true; return; }
      if (state.modal) { state.modal = null; renderModal(); }
    }
  });

  store.subscribe(function () {
    bannerEl.hidden = !store.isDegraded();
    if (state.selectedId) {
      if (!store.getChat(state.selectedId)) state.selectedId = null;
      else store.markRead(state.selectedId, 'admin'); // no-op, если нечего отмечать
    }
    renderList();
    renderConversation();
  });

  render();
  window.G2MChatAdmin = { store: store, render: render };
})();
