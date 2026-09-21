const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../chat-common.js');

test('escapeHtml экранирует спецсимволы', () => {
  assert.equal(C.escapeHtml('<b>"x" & \'y\'</b>'), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  assert.equal(C.escapeHtml(null), '');
});

test('t: язык по умолчанию en, неизвестный ключ возвращается как есть', () => {
  assert.equal(C.getLang(), 'en');
  assert.equal(C.t('newChat'), 'New chat');
  assert.equal(C.t('nope.key'), 'nope.key');
});

test('setLang переключает словарь и падает на en для незнакомого языка', () => {
  C.setLang('ru');
  assert.equal(C.t('newChat'), 'Новый чат');
  C.setLang('xx');
  assert.equal(C.t('newChat'), 'New chat');
});

test('topicTitle: код из словаря, свой заголовок для other', () => {
  assert.equal(C.topicTitle({ topic: { code: 'payout', title: null } }), 'Payout');
  assert.equal(C.topicTitle({ topic: { code: 'other', title: 'Bonus?' } }), 'Bonus?');
  assert.equal(C.topicTitle({ topic: { code: 'other', title: null } }), 'Other');
  assert.equal(C.topicTitle(null), '');
});

test('messagePreview: текст, фото, системное', () => {
  assert.equal(C.messagePreview({ from: 'user', text: 'hi', image: null }), 'hi');
  assert.equal(C.messagePreview({ from: 'user', text: '', image: 'data:...' }), '📷 Photo');
  assert.equal(C.messagePreview({ from: 'system', text: 'closed' }), 'Chat closed by support');
  assert.equal(C.messagePreview(null), '');
});

test('dayLabel: Today / Yesterday / дата', () => {
  const now = new Date(2026, 8, 21, 15, 0).getTime();
  assert.equal(C.dayLabel(new Date(2026, 8, 21, 1, 0).getTime(), now), 'Today');
  assert.equal(C.dayLabel(new Date(2026, 8, 20, 23, 59).getTime(), now), 'Yesterday');
  assert.equal(C.dayLabel(new Date(2026, 8, 1, 10, 0).getTime(), now), '1 Sep 2026');
});

test('timeLabel и listTimeLabel', () => {
  const now = new Date(2026, 8, 21, 15, 0).getTime();
  const today = new Date(2026, 8, 21, 9, 5).getTime();
  const old = new Date(2026, 7, 3, 9, 5).getTime();
  assert.equal(C.timeLabel(today), '09:05');
  assert.equal(C.listTimeLabel(today, now), '09:05');
  assert.equal(C.listTimeLabel(old, now), '3 Aug');
});

test('groupByDay группирует подряд идущие сообщения по дню', () => {
  const d1 = new Date(2026, 8, 20, 10, 0).getTime();
  const d2 = new Date(2026, 8, 21, 10, 0).getTime();
  const groups = C.groupByDay([
    { id: 'a', createdAt: d1 }, { id: 'b', createdAt: d1 + 1000 }, { id: 'c', createdAt: d2 },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].items.map((m) => m.id), ['a', 'b']);
  assert.deepEqual(groups[1].items.map((m) => m.id), ['c']);
  assert.equal(groups[0].day, new Date(2026, 8, 20).getTime());
});

test('TOPIC_CODES и MAX_IMAGE_BYTES', () => {
  assert.deepEqual(C.TOPIC_CODES, ['code_issue', 'payout', 'account', 'other']);
  assert.equal(C.MAX_IMAGE_BYTES, 1048576);
});
