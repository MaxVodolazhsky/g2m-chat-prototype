/* gift2money chat prototype — demo data */
(function (root) {
  'use strict';

  var TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAIAAADBrGu+AAAAPklEQVR42u3PQQkAAAgEsOtfzbcBbGIGn8JgBZbqeS0CAgICAgICAgICAgICAgICAgICAgICAgICAgICAhcLKogLeNRcJecAAAAASUVORK5CYII=';

  var MIN = 60000, HOUR = 3600000, DAY = 86400000;

  function buildSeed(now) {
    now = now || Date.now();
    var chats = [];
    var messages = [];
    var counter = 0;

    function chat(id, userId, code, title, status, createdBy, createdAt) {
      var c = {
        id: id, userId: userId, topic: { code: code, title: title }, status: status, createdBy: createdBy,
        createdAt: createdAt, updatedAt: createdAt, closedAt: null, unreadForUser: 0, unreadForAdmin: 0
      };
      chats.push(c);
      return c;
    }

    function msg(c, from, text, at, opts) {
      opts = opts || {};
      counter += 1;
      messages.push({
        id: 'm_seed' + counter, chatId: c.id, from: from, text: text, image: opts.image || null,
        createdAt: at, readAt: opts.unread ? null : at + MIN
      });
      c.updatedAt = at;
      if (opts.unread) {
        if (from === 'admin') c.unreadForUser += 1;
        if (from === 'user') c.unreadForAdmin += 1;
      }
    }

    function close(c, at) {
      c.status = 'closed';
      c.closedAt = at;
      c.updatedAt = at;
      counter += 1;
      messages.push({ id: 'm_seed' + counter, chatId: c.id, from: 'system', text: 'closed', image: null, createdAt: at, readAt: null });
    }

    // 1. u1, payout, open, начат пользователем 2 дня назад, последний ответ поддержки не прочитан
    var c1 = chat('c_seed1', 'u1', 'payout', null, 'open', 'user', now - 2 * DAY);
    msg(c1, 'user', 'Hi! I requested a payout to my card yesterday but it is still pending. Is everything OK?', now - 2 * DAY);
    msg(c1, 'admin', 'Hello! Payouts are processed within 24 hours on business days. Let me check yours.', now - 2 * DAY + 15 * MIN);
    msg(c1, 'user', 'Thanks. The request ID is #48213.', now - 2 * DAY + 20 * MIN);
    msg(c1, 'user', 'Any update?', now - DAY + 3 * HOUR);
    msg(c1, 'admin', 'Your payout was sent 10 minutes ago, it should arrive within an hour.', now - 10 * MIN, { unread: true });

    // 2. u1, account, open, начат админом вчера
    var c2 = chat('c_seed2', 'u1', 'account', null, 'open', 'admin', now - DAY + 5 * HOUR);
    msg(c2, 'admin', 'We noticed a login from a new device (Windows, Berlin). Was that you? If not, reply here and we will secure your account.', now - DAY + 5 * HOUR, { unread: true });

    // 3. u1, other, закрыт 5 дней назад
    var c3 = chat('c_seed3', 'u1', 'other', 'Bonus for referrals?', 'open', 'user', now - 5 * DAY);
    msg(c3, 'user', 'Do you have a referral bonus?', now - 5 * DAY);
    msg(c3, 'admin', 'Not yet, but we are working on it. Stay tuned!', now - 5 * DAY + 8 * MIN);
    msg(c3, 'user', 'Great, thanks!', now - 5 * DAY + 12 * MIN);
    msg(c3, 'admin', "You're welcome. Closing this one.", now - 5 * DAY + 20 * MIN);
    close(c3, now - 5 * DAY + 30 * MIN);

    // 4. u2, code_issue, open, час назад, с картинкой, не прочитан админом
    var c4 = chat('c_seed4', 'u2', 'code_issue', null, 'open', 'user', now - HOUR);
    msg(c4, 'user', 'This code shows as already redeemed, but I never used it. Screenshot attached.', now - HOUR, { unread: true, image: TINY_PNG });

    // 5. u3, payout, закрыт неделю назад
    var c5 = chat('c_seed5', 'u3', 'payout', null, 'open', 'user', now - 7 * DAY);
    msg(c5, 'user', 'Can I change my payout method to USDT?', now - 7 * DAY);
    msg(c5, 'admin', 'Sure, set it on the Payouts page and it applies to new requests.', now - 7 * DAY + 25 * MIN);
    close(c5, now - 7 * DAY + HOUR);

    return { version: 1, chats: chats, messages: messages };
  }

  function seedIfEmpty(store) {
    if (!store.isEmpty()) return false;
    store.reset(buildSeed());
    return true;
  }

  var api = { buildSeed: buildSeed, seedIfEmpty: seedIfEmpty, TINY_PNG: TINY_PNG };
  root.G2MChatSeed = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
