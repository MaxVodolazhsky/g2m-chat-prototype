const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatStore, STORAGE_KEY, CURRENT_USER } = require('../chat-store.js');

function memStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    raw: () => map.get(STORAGE_KEY),
  };
}

function makeStore(overrides) {
  let tick = 1000;
  const storage = memStorage();
  const store = createChatStore(Object.assign({ storage, now: () => (tick += 1000) }, overrides));
  return { store, storage };
}

const userChat = (store, extra) => store.createChat(Object.assign({
  topicCode: 'payout', createdBy: 'user', text: 'hello',
}, extra));

test('createChat пользователем: поля, счётчики, первое сообщение, запись в storage', () => {
  const { store, storage } = makeStore();
  const chat = userChat(store);
  assert.match(chat.id, /^c_/);
  assert.equal(chat.userId, CURRENT_USER.id);
  assert.deepEqual(chat.topic, { code: 'payout', title: null });
  assert.equal(chat.status, 'open');
  assert.equal(chat.createdBy, 'user');
  assert.equal(chat.unreadForAdmin, 1);
  assert.equal(chat.unreadForUser, 0);
  assert.equal(chat.createdAt, chat.updatedAt);
  assert.equal(chat.closedAt, null);
  const msgs = store.getMessages(chat.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].from, 'user');
  assert.equal(msgs[0].text, 'hello');
  assert.equal(msgs[0].image, null);
  assert.equal(msgs[0].readAt, null);
  const persisted = JSON.parse(storage.raw());
  assert.equal(persisted.version, 1);
  assert.equal(persisted.chats.length, 1);
  assert.equal(persisted.messages.length, 1);
});

test('createChat админом для другого пользователя: unreadForUser = 1', () => {
  const { store } = makeStore();
  const chat = store.createChat({ userId: 'u2', topicCode: 'account', createdBy: 'admin', text: 'Was that you?' });
  assert.equal(chat.userId, 'u2');
  assert.equal(chat.unreadForUser, 1);
  assert.equal(chat.unreadForAdmin, 0);
  assert.equal(store.getMessages(chat.id)[0].from, 'admin');
});

test('createChat: валидация темы и содержимого', () => {
  const { store } = makeStore();
  assert.throws(() => userChat(store, { topicCode: 'bogus' }), /topic/);
  assert.throws(() => userChat(store, { topicCode: 'other' }), /title/);
  assert.throws(() => userChat(store, { topicCode: 'other', topicTitle: 'x'.repeat(61) }), /title/);
  assert.throws(() => userChat(store, { text: '   ' }), /empty/);
  const ok = userChat(store, { topicCode: 'other', topicTitle: '  Bonus?  ' });
  assert.deepEqual(ok.topic, { code: 'other', title: 'Bonus?' });
  const img = userChat(store, { text: '', image: 'data:image/png;base64,AAAA' });
  assert.equal(store.getMessages(img.id)[0].image, 'data:image/png;base64,AAAA');
});

test('sendMessage: счётчики, updatedAt, запреты', () => {
  const { store } = makeStore();
  const chat = userChat(store);
  const m = store.sendMessage(chat.id, { from: 'admin', text: 'hi there' });
  assert.match(m.id, /^m_/);
  let c = store.getChat(chat.id);
  assert.equal(c.unreadForUser, 1);
  assert.equal(c.unreadForAdmin, 1);
  assert.ok(c.updatedAt > chat.updatedAt);
  store.sendMessage(chat.id, { from: 'user', text: 'thanks' });
  c = store.getChat(chat.id);
  assert.equal(c.unreadForAdmin, 2);
  assert.throws(() => store.sendMessage(chat.id, { from: 'user', text: '' }), /empty/);
  assert.throws(() => store.sendMessage('c_missing', { from: 'user', text: 'x' }), /not found/);
  assert.equal(store.getMessages(chat.id).length, 3);
});

test('markRead: обнуляет счётчик роли и ставит readAt сообщениям другой стороны', () => {
  const { store } = makeStore();
  const chat = userChat(store);
  store.sendMessage(chat.id, { from: 'admin', text: 'a1' });
  store.sendMessage(chat.id, { from: 'admin', text: 'a2' });
  store.markRead(chat.id, 'user');
  const c = store.getChat(chat.id);
  assert.equal(c.unreadForUser, 0);
  assert.equal(c.unreadForAdmin, 1);
  const msgs = store.getMessages(chat.id);
  assert.equal(msgs[0].readAt, null);          // сообщение пользователя не тронуто
  assert.ok(msgs[1].readAt && msgs[2].readAt);
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.markRead(chat.id, 'user');               // нечего менять
  assert.equal(calls, 0);
  store.markRead(chat.id, 'admin');
  assert.equal(calls, 1);
  assert.ok(store.getMessages(chat.id)[0].readAt);
});

test('closeChat: статус, системное сообщение, идемпотентность, запрет отправки', () => {
  const { store } = makeStore();
  const chat = userChat(store);
  store.closeChat(chat.id);
  const c = store.getChat(chat.id);
  assert.equal(c.status, 'closed');
  assert.ok(c.closedAt);
  assert.equal(c.updatedAt, c.closedAt);
  const msgs = store.getMessages(chat.id);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[1].from, 'system');
  assert.equal(msgs[1].text, 'closed');
  store.closeChat(chat.id);
  assert.equal(store.getMessages(chat.id).length, 2);
  assert.throws(() => store.sendMessage(chat.id, { from: 'admin', text: 'x' }), /closed/);
  assert.equal(c.unreadForUser, 0);              // системное не считается непрочитанным
});

test('listChats: open раньше closed, внутри по updatedAt desc, фильтр по userId', () => {
  const { store } = makeStore();
  const a = userChat(store, { text: 'a' });
  const b = userChat(store, { text: 'b', userId: 'u2' });
  const c = userChat(store, { text: 'c' });
  store.sendMessage(a.id, { from: 'admin', text: 'bump' });   // a стал самым свежим
  store.closeChat(c.id);                                       // c закрыт, хотя самый свежий
  assert.deepEqual(store.listChats().map((x) => x.id), [a.id, b.id, c.id]);
  assert.deepEqual(store.listChats({ userId: 'u1' }).map((x) => x.id), [a.id, c.id]);
  assert.equal(store.getChat('c_missing'), null);
});

test('unreadTotal по роли и пользователю', () => {
  const { store } = makeStore();
  const a = userChat(store);
  userChat(store, { userId: 'u2' });
  store.sendMessage(a.id, { from: 'admin', text: 'x' });
  store.sendMessage(a.id, { from: 'admin', text: 'y' });
  assert.equal(store.unreadTotal('user', 'u1'), 2);
  assert.equal(store.unreadTotal('user', 'u2'), 0);
  assert.equal(store.unreadTotal('admin'), 2);
});

test('subscribe вызывается на запись, unsubscribe отключает', () => {
  const { store } = makeStore();
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  userChat(store);
  assert.equal(calls, 1);
  off();
  userChat(store);
  assert.equal(calls, 1);
});

test('возвращаются копии, а не ссылки', () => {
  const { store } = makeStore();
  const chat = userChat(store);
  chat.status = 'closed';
  assert.equal(store.getChat(chat.id).status, 'open');
  const msgs = store.getMessages(chat.id);
  msgs[0].text = 'hacked';
  assert.equal(store.getMessages(chat.id)[0].text, 'hello');
});

test('degraded: setItem бросает → isDegraded, данные живут в памяти', () => {
  const storage = memStorage();
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const store = createChatStore({ storage });
  assert.equal(store.isDegraded(), false);
  const chat = userChat(store);
  assert.equal(store.isDegraded(), true);
  assert.equal(store.listChats().length, 1);
  assert.equal(store.getChat(chat.id).id, chat.id);
});

test('без storage вообще — degraded сразу, но работает', () => {
  const store = createChatStore({ storage: null });
  assert.equal(store.isDegraded(), true);
  userChat(store);
  assert.equal(store.listChats().length, 1);
});

test('битый JSON или чужая версия → пустое состояние', () => {
  const s1 = createChatStore({ storage: memStorage({ [STORAGE_KEY]: '{not json' }) });
  assert.equal(s1.isEmpty(), true);
  const s2 = createChatStore({ storage: memStorage({ [STORAGE_KEY]: JSON.stringify({ version: 2, chats: [{}], messages: [] }) }) });
  assert.equal(s2.isEmpty(), true);
});

test('reload подхватывает запись другой вкладки и уведомляет', () => {
  const { store, storage } = makeStore();
  const other = createChatStore({ storage });
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  other.createChat({ topicCode: 'account', createdBy: 'admin', text: 'from admin tab' });
  assert.equal(store.listChats().length, 0);
  store.reload();
  assert.equal(store.listChats().length, 1);
  assert.equal(calls, 1);
});

test('reload в degraded-режиме не затирает состояние из памяти', () => {
  const storage = memStorage();
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const store = createChatStore({ storage });
  const chat = userChat(store);
  store.reload();
  assert.equal(store.getChat(chat.id).id, chat.id);
  assert.equal(store.listChats().length, 1);
});

test('reset: с данными и без', () => {
  const { store } = makeStore();
  store.reset({ chats: [{ id: 'c_x', userId: 'u1', topic: { code: 'payout', title: null }, status: 'open', createdBy: 'user', createdAt: 1, updatedAt: 1, closedAt: null, unreadForUser: 0, unreadForAdmin: 0 }], messages: [] });
  assert.equal(store.listChats().length, 1);
  store.reset();
  assert.equal(store.isEmpty(), true);
});

const { USERS, findUsers } = require('../chat-store.js');

test('USERS: 15 демо-пользователей с уникальными id и email, первые три прежние', () => {
  assert.equal(USERS.length, 15);
  assert.equal(new Set(USERS.map((u) => u.id)).size, 15);
  assert.equal(new Set(USERS.map((u) => u.name)).size, 15);
  assert.deepEqual(USERS.slice(0, 3).map((u) => u.name), ['demo@gift2money.com', 'alice@example.com', 'bob@example.com']);
});

test('findUsers: пустой запрос → первые limit пользователей', () => {
  assert.deepEqual(findUsers('', 8).map((u) => u.id), USERS.slice(0, 8).map((u) => u.id));
  assert.equal(findUsers('   ').length, 8);          // limit по умолчанию 8
  assert.equal(findUsers(undefined, 3).length, 3);
});

test('findUsers: подстрока без учёта регистра, порядок как в USERS, лимит', () => {
  assert.deepEqual(findUsers('ALICE').map((u) => u.name), ['alice@example.com']);
  const ex = findUsers('example.com', 100);
  assert.ok(ex.length >= 10);
  assert.ok(ex.every((u) => u.name.indexOf('example.com') !== -1));
  assert.equal(findUsers('example.com', 4).length, 4);
  assert.deepEqual(findUsers('zzz-nobody'), []);
});

test('findUsers возвращает копии', () => {
  const [u] = findUsers('demo');
  u.name = 'hacked';
  assert.equal(USERS[0].name, 'demo@gift2money.com');
});

// ---------- выключатель чата ----------

test('chatEnabled: по умолчанию включён, сохраняется, setChatEnabled уведомляет и идемпотентен', () => {
  const { store, storage } = makeStore();
  assert.equal(store.isChatEnabled(), true);
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.setChatEnabled(false);
  assert.equal(store.isChatEnabled(), false);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(storage.raw()).settings.chatEnabled, false);
  store.setChatEnabled(false);                 // без изменений — без записи
  assert.equal(calls, 1);
  store.setChatEnabled(true);
  assert.equal(store.isChatEnabled(), true);
  assert.equal(calls, 2);
});

test('chatEnabled: старые данные без settings читаются как включённые; reset возвращает включённое', () => {
  const legacy = JSON.stringify({ version: 1, chats: [], messages: [] });
  const s1 = createChatStore({ storage: memStorage({ [STORAGE_KEY]: legacy }) });
  assert.equal(s1.isChatEnabled(), true);
  const { store } = makeStore();
  store.setChatEnabled(false);
  store.reset();
  assert.equal(store.isChatEnabled(), true);
});

// ---------- правка и удаление своих сообщений админом ----------

test('editMessage: меняет текст своего сообщения, ставит editedAt, обрезает пробелы', () => {
  const { store } = makeStore();
  const chat = userChat(store);
  const m = store.sendMessage(chat.id, { from: 'admin', text: 'draft' });
  assert.equal(m.editedAt, null);
  const edited = store.editMessage(m.id, '  fixed text  ');
  assert.equal(edited.text, 'fixed text');
  assert.ok(edited.editedAt > 0);
  const stored = store.getMessages(chat.id).find((x) => x.id === m.id);
  assert.equal(stored.text, 'fixed text');
  assert.equal(stored.editedAt, edited.editedAt);
});

test('editMessage: запрещено для чужих и системных, пустого текста и неизвестного id', () => {
  const { store } = makeStore();
  const chat = userChat(store);
  const userMsg = store.getMessages(chat.id)[0];
  const adminMsg = store.sendMessage(chat.id, { from: 'admin', text: 'a' });
  store.closeChat(chat.id);
  const sysMsg = store.getMessages(chat.id).find((x) => x.from === 'system');
  assert.throws(() => store.editMessage(userMsg.id, 'x'), /own/);
  assert.throws(() => store.editMessage(sysMsg.id, 'x'), /own/);
  assert.throws(() => store.editMessage(adminMsg.id, '   '), /empty/);
  assert.throws(() => store.editMessage('m_missing', 'x'), /not found/);
  assert.equal(store.getMessages(chat.id)[0].text, 'hello');
});

test('editMessage: сообщение только с картинкой можно оставить без текста', () => {
  const { store } = makeStore();
  const chat = userChat(store);
  const m = store.sendMessage(chat.id, { from: 'admin', text: '', image: 'data:image/png;base64,AAAA' });
  const edited = store.editMessage(m.id, '');
  assert.equal(edited.text, '');
  assert.ok(edited.editedAt);
});

test('deleteMessage: удаляет своё сообщение и уменьшает unreadForUser, если оно не прочитано', () => {
  const { store } = makeStore();
  const chat = userChat(store);
  const a1 = store.sendMessage(chat.id, { from: 'admin', text: 'one' });
  const a2 = store.sendMessage(chat.id, { from: 'admin', text: 'two' });
  assert.equal(store.getChat(chat.id).unreadForUser, 2);
  assert.equal(store.deleteMessage(a1.id), true);
  assert.equal(store.getChat(chat.id).unreadForUser, 1);
  assert.deepEqual(store.getMessages(chat.id).map((x) => x.text), ['hello', 'two']);
  store.markRead(chat.id, 'user');
  assert.equal(store.deleteMessage(a2.id), true);
  assert.equal(store.getChat(chat.id).unreadForUser, 0);     // прочитанное не трогает счётчик
  assert.equal(store.getMessages(chat.id).length, 1);
});

test('deleteMessage: чужие и системные не удаляются, неизвестный id → false, уведомление только при удалении', () => {
  const { store } = makeStore();
  const chat = userChat(store);
  const userMsg = store.getMessages(chat.id)[0];
  store.closeChat(chat.id);
  const sysMsg = store.getMessages(chat.id).find((x) => x.from === 'system');
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  assert.throws(() => store.deleteMessage(userMsg.id), /own/);
  assert.throws(() => store.deleteMessage(sysMsg.id), /own/);
  assert.equal(store.deleteMessage('m_missing'), false);
  assert.equal(calls, 0);
  assert.equal(store.getMessages(chat.id).length, 2);
  assert.equal(store.getChat(chat.id).unreadForAdmin, 1);
});
