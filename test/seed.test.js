const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatStore } = require('../chat-store.js');
const { buildSeed, seedIfEmpty, TINY_PNG } = require('../seed.js');

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); } };
}

test('buildSeed: 5 чатов, 3 у u1, времена относительно now', () => {
  const now = new Date(2026, 8, 21, 12, 0).getTime();
  const seed = buildSeed(now);
  assert.equal(seed.version, 1);
  assert.equal(seed.chats.length, 5);
  assert.equal(seed.chats.filter((c) => c.userId === 'u1').length, 3);
  const ids = new Set(seed.chats.map((c) => c.id));
  assert.equal(ids.size, 5);
  seed.messages.forEach((m) => {
    assert.ok(ids.has(m.chatId), 'сообщение ссылается на существующий чат');
    assert.ok(m.createdAt <= now);
  });
  const msgIds = new Set(seed.messages.map((m) => m.id));
  assert.equal(msgIds.size, seed.messages.length);
});

test('buildSeed: статусы, инициаторы и счётчики по спеку', () => {
  const now = Date.now();
  const seed = buildSeed(now);
  const byId = Object.fromEntries(seed.chats.map((c) => [c.id, c]));
  const c1 = byId.c_seed1, c2 = byId.c_seed2, c3 = byId.c_seed3, c4 = byId.c_seed4, c5 = byId.c_seed5;
  assert.equal(c1.topic.code, 'payout'); assert.equal(c1.status, 'open'); assert.equal(c1.createdBy, 'user'); assert.equal(c1.unreadForUser, 1);
  assert.equal(c2.topic.code, 'account'); assert.equal(c2.createdBy, 'admin'); assert.equal(c2.unreadForUser, 1);
  assert.equal(c3.topic.code, 'other'); assert.equal(c3.topic.title, 'Bonus for referrals?'); assert.equal(c3.status, 'closed'); assert.ok(c3.closedAt);
  assert.equal(c4.userId, 'u2'); assert.equal(c4.topic.code, 'code_issue'); assert.equal(c4.unreadForAdmin, 1);
  assert.equal(c5.userId, 'u3'); assert.equal(c5.status, 'closed');
  const c1msgs = seed.messages.filter((m) => m.chatId === 'c_seed1');
  assert.equal(c1msgs.length, 5);
  assert.equal(c1msgs[c1msgs.length - 1].from, 'admin');
  assert.equal(c1msgs[c1msgs.length - 1].readAt, null);
  assert.equal(c1.updatedAt, c1msgs[c1msgs.length - 1].createdAt);
  const c3last = seed.messages.filter((m) => m.chatId === 'c_seed3').pop();
  assert.equal(c3last.from, 'system');
  const c4img = seed.messages.find((m) => m.chatId === 'c_seed4');
  assert.equal(c4img.image, TINY_PNG);
});

test('seedIfEmpty: заполняет пустой store один раз', () => {
  const store = createChatStore({ storage: memStorage() });
  assert.equal(seedIfEmpty(store), true);
  assert.equal(store.listChats().length, 5);
  assert.equal(store.unreadTotal('user', 'u1'), 2);
  assert.equal(store.unreadTotal('admin'), 1);
  assert.equal(seedIfEmpty(store), false);
  assert.equal(store.listChats().length, 5);
  assert.deepEqual(store.listChats({ userId: 'u1' }).map((c) => c.id), ['c_seed1', 'c_seed2', 'c_seed3']);
});

test('TINY_PNG — валидный PNG 64x40', () => {
  const b64 = TINY_PNG.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(buf.readUInt32BE(16), 64);
  assert.equal(buf.readUInt32BE(20), 40);
});
