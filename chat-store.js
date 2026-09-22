/* gift2money chat prototype — data layer over localStorage */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'g2m_chat_v1';
  var VERSION = 1;
  var USERS = [
    { id: 'u1', name: 'demo@gift2money.com' },
    { id: 'u2', name: 'alice@example.com' },
    { id: 'u3', name: 'bob@example.com' },
    { id: 'u4', name: 'carol.smith@example.com' },
    { id: 'u5', name: 'dave.miller@gmail.com' },
    { id: 'u6', name: 'erin.jones@example.com' },
    { id: 'u7', name: 'frank.wu@outlook.com' },
    { id: 'u8', name: 'grace.lee@example.com' },
    { id: 'u9', name: 'heidi.k@proton.me' },
    { id: 'u10', name: 'ivan.petrov@example.com' },
    { id: 'u11', name: 'judy.chen@example.com' },
    { id: 'u12', name: 'kai.nakamura@example.com' },
    { id: 'u13', name: 'liam.oconnor@example.com' },
    { id: 'u14', name: 'maria.garcia@example.com' },
    { id: 'u15', name: 'noah.b@example.com' }
  ];
  var CURRENT_USER = USERS[0];
  var TOPIC_CODES = ['code_issue', 'payout', 'account', 'other'];

  // Поиск пользователя по подстроке email (без учёта регистра), порядок как в USERS.
  function findUsers(query, limit) {
    var q = String(query == null ? '' : query).trim().toLowerCase();
    var max = limit == null ? 8 : limit;
    var out = [];
    for (var i = 0; i < USERS.length && out.length < max; i++) {
      if (!q || USERS[i].name.toLowerCase().indexOf(q) !== -1) out.push({ id: USERS[i].id, name: USERS[i].name });
    }
    return out;
  }

  function genId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function defaultSettings() { return { chatEnabled: true }; }
  function emptyState() { return { version: VERSION, chats: [], messages: [], settings: defaultSettings() }; }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function defaultStorage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  function createChatStore(options) {
    options = options || {};
    var storage = options.storage !== undefined ? options.storage : defaultStorage();
    var now = options.now || function () { return Date.now(); };
    var listeners = [];
    var degraded = !storage;
    var state = load();

    function load() {
      if (!storage) return emptyState();
      try {
        var raw = storage.getItem(STORAGE_KEY);
        if (!raw) return emptyState();
        var parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.chats) || !Array.isArray(parsed.messages)) {
          return emptyState();
        }
        parsed.settings = Object.assign(defaultSettings(), parsed.settings || {}); // старые данные без settings
        return parsed;
      } catch (e) {
        return emptyState();
      }
    }

    function notify() {
      listeners.slice().forEach(function (cb) {
        try { cb(); } catch (e) { if (typeof console !== 'undefined') console.error('[g2m-chat] listener failed', e); }
      });
    }

    function persist() {
      if (storage) {
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(state));
          degraded = false;
        } catch (e) {
          degraded = true;
        }
      }
      notify();
    }

    function reload() {
      if (degraded) return;
      state = load();
      notify();
    }

    function find(id) {
      for (var i = 0; i < state.chats.length; i++) {
        if (state.chats[i].id === id) return state.chats[i];
      }
      return null;
    }

    function sortChats(list) {
      return list.slice().sort(function (a, b) {
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
    }

    function validateTopic(code, title) {
      if (TOPIC_CODES.indexOf(code) === -1) throw new Error('invalid topic code');
      if (code !== 'other') return null;
      var clean = String(title || '').trim();
      if (!clean) throw new Error('topic title required');
      if (clean.length > 60) throw new Error('topic title too long');
      return clean;
    }

    function cleanText(text) { return String(text || '').trim(); }

    function assertContent(text, image) {
      if (!cleanText(text) && !image) throw new Error('empty message');
    }

    function pushMessage(chatId, from, text, image, ts) {
      var msg = { id: genId('m_'), chatId: chatId, from: from, text: cleanText(text), image: image || null, createdAt: ts, readAt: null, editedAt: null };
      state.messages.push(msg);
      return msg;
    }

    function listChats(filter) {
      filter = filter || {};
      var list = state.chats.filter(function (c) { return !filter.userId || c.userId === filter.userId; });
      return sortChats(list).map(clone);
    }

    function getChat(id) {
      var c = find(id);
      return c ? clone(c) : null;
    }

    function createChat(input) {
      input = input || {};
      var title = validateTopic(input.topicCode, input.topicTitle);
      assertContent(input.text, input.image);
      var createdBy = input.createdBy === 'admin' ? 'admin' : 'user';
      var ts = now();
      var chat = {
        id: genId('c_'),
        userId: input.userId || CURRENT_USER.id,
        topic: { code: input.topicCode, title: title },
        status: 'open',
        createdBy: createdBy,
        createdAt: ts,
        updatedAt: ts,
        closedAt: null,
        unreadForUser: createdBy === 'admin' ? 1 : 0,
        unreadForAdmin: createdBy === 'user' ? 1 : 0
      };
      state.chats.push(chat);
      pushMessage(chat.id, createdBy, input.text, input.image, ts);
      persist();
      return clone(chat);
    }

    function getMessages(chatId) {
      return state.messages
        .filter(function (m) { return m.chatId === chatId; })
        .sort(function (a, b) { return a.createdAt - b.createdAt; })
        .map(clone);
    }

    function sendMessage(chatId, input) {
      input = input || {};
      var chat = find(chatId);
      if (!chat) throw new Error('chat not found');
      if (chat.status === 'closed') throw new Error('chat is closed');
      assertContent(input.text, input.image);
      var from = input.from === 'admin' ? 'admin' : 'user';
      var ts = now();
      var msg = pushMessage(chatId, from, input.text, input.image, ts);
      chat.updatedAt = ts;
      if (from === 'admin') chat.unreadForUser += 1; else chat.unreadForAdmin += 1;
      persist();
      return clone(msg);
    }

    function markRead(chatId, role) {
      var chat = find(chatId);
      if (!chat) return;
      var other = role === 'admin' ? 'user' : 'admin';
      var changed = false;
      if (role === 'admin' && chat.unreadForAdmin) { chat.unreadForAdmin = 0; changed = true; }
      if (role === 'user' && chat.unreadForUser) { chat.unreadForUser = 0; changed = true; }
      var ts = now();
      state.messages.forEach(function (m) {
        if (m.chatId === chatId && m.from === other && !m.readAt) { m.readAt = ts; changed = true; }
      });
      if (changed) persist();
    }

    function closeChat(chatId) {
      var chat = find(chatId);
      if (!chat || chat.status === 'closed') return;
      var ts = now();
      chat.status = 'closed';
      chat.closedAt = ts;
      chat.updatedAt = ts;
      pushMessage(chatId, 'system', 'closed', null, ts);
      persist();
    }

    // ----- выключатель чата (виджет у пользователей скрыт, пока false) -----
    function isChatEnabled() { return state.settings.chatEnabled !== false; }
    function setChatEnabled(enabled) {
      var next = !!enabled;
      if (isChatEnabled() === next) return;
      state.settings.chatEnabled = next;
      persist();
    }

    // ----- правка и удаление админом СВОИХ сообщений -----
    function findMessage(id) {
      for (var i = 0; i < state.messages.length; i++) {
        if (state.messages[i].id === id) return { msg: state.messages[i], index: i };
      }
      return null;
    }

    function editMessage(messageId, text) {
      var found = findMessage(messageId);
      if (!found) throw new Error('message not found');
      if (found.msg.from !== 'admin') throw new Error('only own (admin) messages can be edited');
      var clean = cleanText(text);
      if (!clean && !found.msg.image) throw new Error('empty message');
      found.msg.text = clean;
      found.msg.editedAt = now();
      persist();
      return clone(found.msg);
    }

    function deleteMessage(messageId) {
      var found = findMessage(messageId);
      if (!found) return false;
      if (found.msg.from !== 'admin') throw new Error('only own (admin) messages can be deleted');
      var chat = find(found.msg.chatId);
      if (chat && !found.msg.readAt && chat.unreadForUser > 0) chat.unreadForUser -= 1;
      state.messages.splice(found.index, 1);
      persist();
      return true;
    }

    function unreadTotal(role, userId) {
      return state.chats.reduce(function (sum, c) {
        if (userId && c.userId !== userId) return sum;
        return sum + (role === 'admin' ? c.unreadForAdmin : c.unreadForUser);
      }, 0);
    }

    function subscribe(cb) {
      listeners.push(cb);
      return function () {
        var i = listeners.indexOf(cb);
        if (i > -1) listeners.splice(i, 1);
      };
    }

    function reset(data) {
      state = data
        ? { version: VERSION, chats: clone(data.chats || []), messages: clone(data.messages || []), settings: defaultSettings() }
        : emptyState();
      persist();
    }

    function isDegraded() { return degraded; }
    function isEmpty() { return state.chats.length === 0; }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', function (e) {
        if (e.key === null || e.key === STORAGE_KEY) reload();
      });
    }

    return {
      listChats: listChats,
      getChat: getChat,
      createChat: createChat,
      getMessages: getMessages,
      sendMessage: sendMessage,
      markRead: markRead,
      closeChat: closeChat,
      unreadTotal: unreadTotal,
      subscribe: subscribe,
      reset: reset,
      reload: reload,
      isDegraded: isDegraded,
      isEmpty: isEmpty,
      isChatEnabled: isChatEnabled,
      setChatEnabled: setChatEnabled,
      editMessage: editMessage,
      deleteMessage: deleteMessage
    };
  }

  var api = {
    createChatStore: createChatStore,
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    USERS: USERS,
    CURRENT_USER: CURRENT_USER,
    TOPIC_CODES: TOPIC_CODES,
    findUsers: findUsers
  };

  root.G2MChatStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
