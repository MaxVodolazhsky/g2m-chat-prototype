/* gift2money chat prototype — shared helpers (i18n, dates, html, images) */
(function (root) {
  'use strict';

  var DICT = {
    en: {
      title: 'Support',
      subtitle: 'We usually reply within a few minutes',
      newChat: 'New chat',
      startChat: 'Start chat',
      topicLabel: 'What is it about?',
      'topics.code_issue': 'Code issue',
      'topics.payout': 'Payout',
      'topics.account': 'Account',
      'topics.other': 'Other',
      customTopicPlaceholder: 'Your topic',
      messagePlaceholder: 'Write a message…',
      firstMessagePlaceholder: 'Describe your issue',
      send: 'Send',
      attach: 'Attach image',
      support: 'Support',
      you: 'You',
      open: 'Open',
      closed: 'Closed',
      closedNote: 'This chat was closed by support.',
      closedSystem: 'Chat closed by support',
      today: 'Today',
      yesterday: 'Yesterday',
      emptyTitle: 'No chats yet',
      emptyText: 'Have a question about a code or a payout? Start a chat and we will reply right here.',
      photo: 'Photo',
      imageTooLarge: 'Image is too large (max 1 MB)',
      imageOnly: 'Only images can be attached',
      storageUnavailable: 'Storage unavailable: chat history will be lost on reload',
      back: 'Back',
      close: 'Close',
      closeChat: 'Close chat',
      closeChatConfirm: 'Close this chat? The user will not be able to reply.',
      all: 'All',
      openOnly: 'Open',
      closedOnly: 'Closed',
      user: 'User',
      userSearchPlaceholder: 'Search user by email…',
      noUsersFound: 'No users found',
      userRequired: 'Choose a user',
      changeUser: 'Change user',
      chatEnabled: 'Chat enabled',
      chatOffBanner: 'Chat is OFF for users: the widget is hidden on the site',
      edit: 'Edit',
      delete: 'Delete',
      save: 'Save',
      edited: 'edited',
      deleteConfirm: 'Delete this message? The user will no longer see it.',
      resetDemo: 'Reset demo data',
      'reads.sent': 'Sent',
      'reads.read': 'Read',
      topicRequired: 'Choose a topic',
      customTopicRequired: 'Enter a topic',
      messageRequired: 'Enter a message',
      adminTitle: 'Support console',
      noChatSelected: 'Select a chat on the left',
      startedBy: 'Started by',
      admin: 'Admin',
      cancel: 'Cancel',
      removeImage: 'Remove image'
    },
    ru: {
      title: 'Поддержка',
      subtitle: 'Обычно отвечаем в течение нескольких минут',
      newChat: 'Новый чат',
      startChat: 'Начать чат',
      topicLabel: 'О чём вопрос?',
      'topics.code_issue': 'Проблема с кодом',
      'topics.payout': 'Выплата',
      'topics.account': 'Аккаунт',
      'topics.other': 'Другое',
      customTopicPlaceholder: 'Ваша тема',
      messagePlaceholder: 'Напишите сообщение…',
      firstMessagePlaceholder: 'Опишите проблему',
      send: 'Отправить',
      attach: 'Прикрепить картинку',
      support: 'Поддержка',
      you: 'Вы',
      open: 'Открыт',
      closed: 'Закрыт',
      closedNote: 'Этот чат закрыт поддержкой.',
      closedSystem: 'Чат закрыт поддержкой',
      today: 'Сегодня',
      yesterday: 'Вчера',
      emptyTitle: 'Чатов пока нет',
      emptyText: 'Вопрос по коду или выплате? Начните чат, и мы ответим прямо здесь.',
      photo: 'Фото',
      imageTooLarge: 'Картинка слишком большая (макс. 1 МБ)',
      imageOnly: 'Можно прикреплять только картинки',
      storageUnavailable: 'Хранилище недоступно: история чата пропадёт после перезагрузки',
      back: 'Назад',
      close: 'Закрыть',
      closeChat: 'Закрыть чат',
      closeChatConfirm: 'Закрыть этот чат? Пользователь не сможет ответить.',
      all: 'Все',
      openOnly: 'Открытые',
      closedOnly: 'Закрытые',
      user: 'Пользователь',
      userSearchPlaceholder: 'Поиск пользователя по email…',
      noUsersFound: 'Пользователи не найдены',
      userRequired: 'Выберите пользователя',
      changeUser: 'Сменить пользователя',
      chatEnabled: 'Чат включён',
      chatOffBanner: 'Чат ВЫКЛЮЧЕН для пользователей: виджет на сайте скрыт',
      edit: 'Изменить',
      delete: 'Удалить',
      save: 'Сохранить',
      edited: 'изменено',
      deleteConfirm: 'Удалить это сообщение? Пользователь его больше не увидит.',
      resetDemo: 'Сбросить демо-данные',
      'reads.sent': 'Отправлено',
      'reads.read': 'Прочитано',
      topicRequired: 'Выберите тему',
      customTopicRequired: 'Введите тему',
      messageRequired: 'Введите сообщение',
      adminTitle: 'Консоль поддержки',
      noChatSelected: 'Выберите чат слева',
      startedBy: 'Начал',
      admin: 'Админ',
      cancel: 'Отмена',
      removeImage: 'Убрать картинку'
    }
  };

  var MONTHS = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  };

  var TOPIC_CODES = ['code_issue', 'payout', 'account', 'other'];
  var MAX_IMAGE_BYTES = 1048576;

  function resolveLang() {
    var lang = null;
    if (typeof location !== 'undefined' && location.search) {
      var m = /[?&]lang=([a-zA-Z-]+)/.exec(location.search);
      if (m) lang = m[1].toLowerCase().slice(0, 2);
    }
    if (!lang && typeof document !== 'undefined' && document.documentElement) {
      lang = (document.documentElement.lang || '').toLowerCase().slice(0, 2);
    }
    return DICT[lang] ? lang : 'en';
  }

  var currentLang = resolveLang();

  function t(key) {
    var d = DICT[currentLang] || DICT.en;
    if (Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    if (Object.prototype.hasOwnProperty.call(DICT.en, key)) return DICT.en[key];
    return key;
  }

  function setLang(lang) { currentLang = DICT[lang] ? lang : 'en'; }
  function getLang() { return currentLang; }

  function topicTitle(chat) {
    if (!chat || !chat.topic) return '';
    if (chat.topic.code === 'other') return chat.topic.title || t('topics.other');
    return t('topics.' + chat.topic.code);
  }

  function messagePreview(msg) {
    if (!msg) return '';
    if (msg.from === 'system') return t('closedSystem');
    if (msg.text) return msg.text;
    if (msg.image) return '📷 ' + t('photo');
    return '';
  }

  function startOfDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dayLabel(ts, now) {
    now = now == null ? Date.now() : now;
    var diffDays = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
    if (diffDays === 0) return t('today');
    if (diffDays === 1) return t('yesterday');
    var d = new Date(ts);
    return d.getDate() + ' ' + MONTHS[currentLang][d.getMonth()] + ' ' + d.getFullYear();
  }

  function timeLabel(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function listTimeLabel(ts, now) {
    now = now == null ? Date.now() : now;
    if (startOfDay(ts) === startOfDay(now)) return timeLabel(ts);
    var d = new Date(ts);
    return d.getDate() + ' ' + MONTHS[currentLang][d.getMonth()];
  }

  function groupByDay(messages) {
    var groups = [];
    var last = null;
    (messages || []).forEach(function (m) {
      var day = startOfDay(m.createdAt);
      if (!last || last.day !== day) {
        last = { day: day, items: [] };
        groups.push(last);
      }
      last.items.push(m);
    });
    return groups;
  }

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) return reject(new Error('imageOnly'));
      if (file.size > MAX_IMAGE_BYTES) return reject(new Error('imageTooLarge'));
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('imageOnly')); };
      reader.readAsDataURL(file);
    });
  }

  var api = {
    DICT: DICT,
    t: t,
    setLang: setLang,
    getLang: getLang,
    TOPIC_CODES: TOPIC_CODES,
    MAX_IMAGE_BYTES: MAX_IMAGE_BYTES,
    topicTitle: topicTitle,
    messagePreview: messagePreview,
    dayLabel: dayLabel,
    timeLabel: timeLabel,
    listTimeLabel: listTimeLabel,
    groupByDay: groupByDay,
    escapeHtml: escapeHtml,
    readImageFile: readImageFile
  };

  root.G2MChatCommon = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
