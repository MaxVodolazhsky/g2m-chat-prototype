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

  var state = { filter: 'all', selectedId: null, modal: null, editingId: null, editText: '' }; // modal: null | { userId, userQuery, userOpen, userIndex, topicCode, topicTitle, text, errors }
  var composer = { text: '', image: null, error: null };
  var errorTimer = null;

  var ICONS = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>',
    attach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"/></svg>',
    checkDouble: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l4 4 8-9"/><path d="M10 16l2 2 10-11"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
  };

  var tabsEl = document.getElementById('tabs');
  var listEl = document.getElementById('chat-list');
  var convEl = document.getElementById('conversation');
  var modalEl = document.getElementById('modal');
  var modalCard = document.getElementById('modal-card');
  var bannerEl = document.getElementById('banner');
  var lightbox = document.getElementById('lightbox');
  var chatOffBanner = document.getElementById('chat-off-banner');
  var chatToggle = document.querySelector('input[name="chatEnabled"]');

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
  chatOffBanner.textContent = t('chatOffBanner');

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
    if (mine && state.editingId === m.id) {
      return '<div class="msg msg--me' + (first ? ' msg--first' : '') + '"><div class="msg-edit">' +
        (m.image ? '<img class="msg-img" src="' + esc(m.image) + '" alt="">' : '') +
        '<textarea class="composer-input msg-edit-input" name="editText" rows="1" placeholder="' + esc(t('messagePlaceholder')) + '">' + esc(state.editText) + '</textarea>' +
        '<div class="msg-edit-actions">' +
          '<button type="button" class="btn btn-sm" data-action="cancel-edit">' + esc(t('cancel')) + '</button>' +
          '<button type="button" class="btn btn-sm btn-primary" data-action="save-edit">' + esc(t('save')) + '</button>' +
        '</div></div></div>';
    }
    var ticks = '';
    var actions = '';
    if (mine) {
      ticks = '<span class="ticks' + (m.readAt ? ' ticks--read' : '') + '" title="' + esc(t(m.readAt ? 'reads.read' : 'reads.sent')) + '">' +
        (m.readAt ? ICONS.checkDouble : ICONS.check) + '</span>';
      // правка/удаление только своих (админских) сообщений
      actions = '<div class="msg-actions">' +
        '<button type="button" class="msg-action" data-action="edit-msg" data-id="' + esc(m.id) + '" title="' + esc(t('edit')) + '" aria-label="' + esc(t('edit')) + '">' + ICONS.edit + '</button>' +
        '<button type="button" class="msg-action msg-action--danger" data-action="delete-msg" data-id="' + esc(m.id) + '" title="' + esc(t('delete')) + '" aria-label="' + esc(t('delete')) + '">' + ICONS.trash + '</button>' +
      '</div>';
    }
    return '<div class="msg msg--' + (mine ? 'me' : 'them') + (first ? ' msg--first' : '') + '">' +
      (!mine && first ? '<div class="msg-author">' + esc(userName(chat.userId)) + '</div>' : '') +
      actions +
      '<div class="bubble">' +
        (m.image ? '<img class="msg-img" src="' + esc(m.image) + '" alt="" data-action="lightbox" data-src="' + esc(m.image) + '">' : '') +
        (m.text ? '<div class="msg-text">' + esc(m.text).replace(/\n/g, '<br>') + '</div>' : '') +
      '</div>' +
      '<div class="msg-meta">' + esc(C.timeLabel(m.createdAt)) +
        (m.editedAt ? '<span class="msg-edited">' + esc(t('edited')) + '</span>' : '') + ticks + '</div>' +
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
    var editFocused = !!(active && active.name === 'editText');
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
    var et = convEl.querySelector('textarea[name="editText"]');
    if (et) {
      autosize(et);
      if (editFocused) { et.focus(); et.selectionStart = et.selectionEnd = et.value.length; }
    }
    scrollToBottom();
  }

  function renderChatSwitch() {
    var on = store.isChatEnabled();
    chatToggle.checked = on;
    chatOffBanner.hidden = on;
  }

  function startEdit(id) {
    var msg = store.getMessages(state.selectedId || '').filter(function (x) { return x.id === id; })[0];
    if (!msg || msg.from !== 'admin') return;
    state.editingId = msg.id;
    state.editText = msg.text;
    renderConversation();
    var et = convEl.querySelector('textarea[name="editText"]');
    if (et) { et.focus(); et.selectionStart = et.selectionEnd = et.value.length; }
  }

  function cancelEdit() {
    state.editingId = null;
    state.editText = '';
    renderConversation();
  }

  function saveEdit() {
    var id = state.editingId;
    if (!id) return;
    var msg = store.getMessages(state.selectedId || '').filter(function (x) { return x.id === id; })[0];
    if (!msg) { cancelEdit(); return; }
    var text = state.editText;
    if (!text.trim() && !msg.image) return; // пустой текст без картинки не сохраняем
    if (text.trim() === msg.text) { cancelEdit(); return; }
    state.editingId = null;
    state.editText = '';
    try {
      store.editMessage(id, text); // persist → notify → renderConversation с уже закрытой формой
    } catch (err) {
      state.editingId = id;
      state.editText = text;
    }
    renderConversation();
  }

  function highlightMatch(name, q) {
    if (!q) return esc(name);
    var i = name.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return esc(name);
    return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
  }

  function userResultsHtml(m) {
    if (!m.userOpen) return '';
    var q = m.userQuery.trim();
    var results = S.findUsers(q, 8);
    if (!results.length) return '<div class="user-results"><div class="user-empty">' + esc(t('noUsersFound')) + '</div></div>';
    return '<div class="user-results" role="listbox">' + results.map(function (u, i) {
      return '<button type="button" class="user-result' + (i === m.userIndex ? ' user-result--active' : '') + '" role="option" ' +
        'aria-selected="' + (i === m.userIndex) + '" data-action="pick-user" data-id="' + esc(u.id) + '">' + highlightMatch(u.name, q) + '</button>';
    }).join('') + '</div>';
  }

  function userPickerHtml(m) {
    if (m.userId) {
      return '<div class="user-chip"><span>' + esc(userName(m.userId)) + '</span>' +
        '<button type="button" class="user-chip-remove" data-action="clear-user" aria-label="' + esc(t('changeUser')) + '">' + ICONS.close + '</button></div>';
    }
    return '<div class="user-picker">' +
      '<input class="input' + (m.errors.user ? ' input--error' : '') + '" name="userQuery" autocomplete="off" role="combobox" aria-expanded="' + !!m.userOpen + '" ' +
        'placeholder="' + esc(t('userSearchPlaceholder')) + '" value="' + esc(m.userQuery) + '">' +
      '<div class="user-results-host">' + userResultsHtml(m) + '</div>' +
    '</div>';
  }

  // Перерисовать только список совпадений, не трогая input (иначе теряется фокус и каретка).
  function renderUserResults() {
    var host = modalCard.querySelector('.user-results-host');
    if (!host || !state.modal) return;
    host.innerHTML = userResultsHtml(state.modal);
    var input = modalCard.querySelector('input[name="userQuery"]');
    if (input) input.setAttribute('aria-expanded', String(!!state.modal.userOpen));
  }

  function renderUserPicker() {
    var host = modalCard.querySelector('.user-picker-host');
    if (!host || !state.modal) return;
    host.innerHTML = userPickerHtml(state.modal);
  }

  function pickUser(id) {
    var m = state.modal;
    if (!m || !S.USERS.some(function (u) { return u.id === id; })) return;
    m.userId = id;
    m.userOpen = false;
    delete m.errors.user;
    renderModal();
  }

  function renderModal() {
    if (!state.modal) { modalEl.hidden = true; return; }
    var m = state.modal;
    var err = function (k) { return k ? '<div class="error">' + esc(t(k)) + '</div>' : ''; };
    var chips = C.TOPIC_CODES.map(function (code) {
      return '<button type="button" class="chip' + (m.topicCode === code ? ' chip--active' : '') + '" data-action="pick-topic" data-code="' + code + '">' + esc(t('topics.' + code)) + '</button>';
    }).join('');
    modalCard.innerHTML =
      '<div class="modal-title">' + esc(t('newChat')) + '</div>' +
      '<label class="label">' + esc(t('user')) + '</label>' +
      '<div class="user-picker-host">' + userPickerHtml(m) + '</div>' + err(m.errors.user) +
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
    renderChatSwitch();
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
    state.editingId = null;
    state.editText = '';
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
    if (!m.userId) errors.user = 'userRequired';
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
    if (state.modal && state.modal.userOpen && !e.target.closest('.user-picker')) {
      state.modal.userOpen = false;
      renderUserResults();
    }
    var target = e.target.closest('[data-action]');
    if (!target) return;
    // клики внутри карточки модалки не должны закрывать модалку через оверлей
    if (target.id === 'modal' && e.target !== modalEl) return;
    var action = target.getAttribute('data-action');
    switch (action) {
      case 'filter': state.filter = target.getAttribute('data-filter'); renderTabs(); renderList(); break;
      case 'select': selectChat(target.getAttribute('data-id')); break;
      case 'open-modal':
        state.modal = { userId: null, userQuery: '', userOpen: false, userIndex: 0, topicCode: null, topicTitle: '', text: '', errors: {} };
        renderModal();
        { var uq = modalCard.querySelector('input[name="userQuery"]'); if (uq) uq.focus(); }
        break;
      case 'pick-user': pickUser(target.getAttribute('data-id')); break;
      case 'clear-user':
        state.modal.userId = null;
        state.modal.userQuery = '';
        state.modal.userOpen = false;
        state.modal.userIndex = 0;
        renderUserPicker();
        { var uq2 = modalCard.querySelector('input[name="userQuery"]'); if (uq2) uq2.focus(); }
        break;
      case 'close-modal': state.modal = null; renderModal(); break;
      case 'pick-topic': state.modal.topicCode = target.getAttribute('data-code'); state.modal.errors = {}; renderModal(); break;
      case 'start': startChat(); break;
      case 'close-chat':
        if (state.selectedId && window.confirm(t('closeChatConfirm'))) store.closeChat(state.selectedId);
        break;
      case 'edit-msg': startEdit(target.getAttribute('data-id')); break;
      case 'cancel-edit': cancelEdit(); break;
      case 'save-edit': saveEdit(); break;
      case 'delete-msg':
        if (window.confirm(t('deleteConfirm'))) {
          try { store.deleteMessage(target.getAttribute('data-id')); } catch (err) { /* чужое сообщение: кнопки у него нет */ }
        }
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
    } else if (el.name === 'editText') {
      state.editText = el.value;
      autosize(el);
    } else if (el.name === 'chatEnabled') {
      if (e.type === 'change') store.setChatEnabled(el.checked); // checkbox шлёт и input, и change
    } else if (state.modal) {
      if (el.name === 'userQuery') {
        if (e.type !== 'input') return; // 'change' на blur не должен заново открывать список
        state.modal.userQuery = el.value;
        state.modal.userOpen = true;
        state.modal.userIndex = 0;
        renderUserResults();
      }
      else if (el.name === 'topicTitle') state.modal.topicTitle = el.value;
      else if (el.name === 'text') state.modal.text = el.value;
    }
  }
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);

  document.addEventListener('focusin', function (e) {
    if (state.modal && e.target && e.target.name === 'userQuery' && !state.modal.userOpen) {
      state.modal.userOpen = true;
      state.modal.userIndex = 0;
      renderUserResults();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.name === 'editText') {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); return; }
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); return; }
    }
    if (state.modal && e.target && e.target.name === 'userQuery') {
      var m = state.modal;
      var results = S.findUsers(m.userQuery, 8);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!m.userOpen) { m.userOpen = true; m.userIndex = 0; }
        else if (results.length) {
          m.userIndex = e.key === 'ArrowDown' ? Math.min(m.userIndex + 1, results.length - 1) : Math.max(m.userIndex - 1, 0);
        }
        renderUserResults();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (m.userOpen && results[m.userIndex]) pickUser(results[m.userIndex].id);
        return;
      }
      if (e.key === 'Escape' && m.userOpen) {
        e.preventDefault();
        m.userOpen = false;
        renderUserResults();
        return;
      }
    }
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
    renderChatSwitch();
    if (state.selectedId) {
      if (!store.getChat(state.selectedId)) state.selectedId = null;
      else store.markRead(state.selectedId, 'admin'); // no-op, если нечего отмечать
    }
    if (state.editingId && !store.getMessages(state.selectedId || '').some(function (x) { return x.id === state.editingId; })) {
      state.editingId = null; // редактируемое сообщение исчезло (удалено в другой вкладке)
      state.editText = '';
    }
    renderList();
    renderConversation();
  });

  render();
  window.G2MChatAdmin = { store: store, render: render };
})();
