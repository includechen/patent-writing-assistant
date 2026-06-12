const fs = require('fs');
const path = require('path');

function getUserDataRoot() {
  const dir = process.env.PATENT_USER_DATA
    ? path.join(process.env.PATENT_USER_DATA, 'data')
    : path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const dataDir = getUserDataRoot();
const dbFile = path.join(dataDir, 'store.json');

const DEFAULT = {
  users: [],
  dailyActive: [],
  conversations: [],
  messages: [],
  usageEvents: [],
  nextUserId: 1,
  nextMessageId: 1,
};

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function load() {
  if (!fs.existsSync(dbFile)) return structuredClone(DEFAULT);
  try {
    return { ...structuredClone(DEFAULT), ...JSON.parse(fs.readFileSync(dbFile, 'utf8')) };
  } catch {
    return structuredClone(DEFAULT);
  }
}

function save(data) {
  const tmp = dbFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, dbFile);
}

let store = load();

function persist() {
  save(store);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function recordDailyActive(userId) {
  const date = todayStr();
  const exists = store.dailyActive.some((r) => r.user_id === userId && r.active_date === date);
  if (!exists) {
    store.dailyActive.push({
      user_id: userId,
      active_date: date,
      first_login_at: new Date().toISOString(),
    });
    persist();
  }
}

function recordChatUsage(userId, conversationId) {
  store.usageEvents.push({
    user_id: userId,
    event_type: 'chat',
    event_date: todayStr(),
    conversation_id: conversationId,
    created_at: new Date().toISOString(),
  });
  persist();
}

function getDauStats(days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const map = new Map();
  for (const row of store.dailyActive) {
    if (row.active_date >= cutoffStr) {
      map.set(row.active_date, (map.get(row.active_date) || new Set()));
      map.get(row.active_date).add(row.user_id);
    }
  }

  return [...map.entries()]
    .map(([date, users]) => ({ date, dau: users.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getChatUsageStats(days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const map = new Map();
  for (const row of store.usageEvents) {
    if (row.event_type === 'chat' && row.event_date >= cutoffStr) {
      map.set(row.event_date, (map.get(row.event_date) || 0) + 1);
    }
  }

  return [...map.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getOverviewStats() {
  const today = todayStr();
  const todayDau = new Set(
    store.dailyActive.filter((r) => r.active_date === today).map((r) => r.user_id)
  ).size;
  const todayChats = store.usageEvents.filter(
    (r) => r.event_type === 'chat' && r.event_date === today
  ).length;

  return {
    todayDau,
    todayChats,
    totalUsers: store.users.length,
    totalConversations: store.conversations.length,
  };
}

function buildMessagePreview(content, maxLen = 64) {
  if (!content) return '';
  let raw = String(content);
  const appendixIdx = raw.indexOf('\n\n---\n');
  if (appendixIdx >= 0) raw = raw.slice(0, appendixIdx);
  raw = raw.replace(/\n\n📎[\s\S]*/, '');
  let s = raw
    .replace(/```[\s\S]*?```/g, ' […] ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '[图片]')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*`_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > maxLen) return `${s.slice(0, maxLen)}…`;
  return s;
}

function extractConvPreviews(msgs = []) {
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
  const last = msgs[msgs.length - 1];
  return {
    last_user_preview: lastUser ? buildMessagePreview(lastUser.content, 56) : '',
    last_assistant_preview: lastAssistant ? buildMessagePreview(lastAssistant.content, 80) : '',
    last_message_at: last?.created_at || null,
  };
}

const db = {
  get users() { return store.users; },
  get dailyActive() { return store.dailyActive; },
  get conversations() { return store.conversations; },
  get messages() { return store.messages; },
  get usageEvents() { return store.usageEvents; },

  findUser(query) {
    if (query.id != null) return store.users.find((u) => u.id === query.id);
    if (query.username) return store.users.find((u) => u.username === query.username);
    return null;
  },

  insertUser(row) {
    const user = { id: store.nextUserId++, ...row, created_at: new Date().toISOString() };
    store.users.push(user);
    persist();
    return { lastInsertRowid: user.id };
  },

  insertConversation(row) {
    store.conversations.push({ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    persist();
  },

  updateConversation(id, fields) {
    const conv = store.conversations.find((c) => c.id === id);
    if (conv) Object.assign(conv, fields, { updated_at: new Date().toISOString() });
    persist();
  },

  insertMessage(row) {
    const msg = { id: store.nextMessageId++, ...row, created_at: new Date().toISOString() };
    store.messages.push(msg);
    persist();
    return msg;
  },

  getConversationsByUser(userId, limit = 50) {
    return store.conversations
      .filter((c) => c.user_id === userId)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
      .slice(0, limit)
      .map((c) => {
        const msgs = store.messages
          .filter((m) => m.conversation_id === c.id)
          .sort((a, b) => a.id - b.id);
        const previews = extractConvPreviews(msgs);
        return {
          ...c,
          message_count: msgs.length,
          ...previews,
          last_message_at: previews.last_message_at || c.updated_at,
        };
      });
  },

  getConversation(id, userId) {
    const conv = store.conversations.find((c) => c.id === id && c.user_id === userId);
    if (!conv) return null;
    const messages = store.messages
      .filter((m) => m.conversation_id === id)
      .sort((a, b) => a.id - b.id)
      .map(({ role, content, created_at }) => ({ role, content, created_at }));
    return { ...conv, messages };
  },

  getMessages(conversationId) {
    return store.messages
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.id - b.id)
      .map(({ role, content }) => ({ role, content }));
  },

  searchConversationMessages(userId, query, limit = 30) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const convMap = new Map(
      store.conversations
        .filter((c) => c.user_id === userId)
        .map((c) => [c.id, c]),
    );
    if (!convMap.size) return [];

    const grouped = new Map();
    for (const msg of store.messages) {
      if (!convMap.has(msg.conversation_id)) continue;
      if (!grouped.has(msg.conversation_id)) grouped.set(msg.conversation_id, []);
      grouped.get(msg.conversation_id).push(msg);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.id - b.id);
    }

    const results = [];
    for (const [convId, msgs] of grouped) {
      const conv = convMap.get(convId);
      const previews = extractConvPreviews(msgs);
      msgs.forEach((msg, messageIndex) => {
        const content = msg.content || '';
        if (!content.toLowerCase().includes(q)) return;
        const idx = content.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 24);
        const end = Math.min(content.length, idx + q.length + 48);
        let snippet = content.slice(start, end).replace(/\s+/g, ' ');
        if (start > 0) snippet = `…${snippet}`;
        if (end < content.length) snippet = `${snippet}…`;
        results.push({
          conversationId: convId,
          messageIndex,
          role: msg.role,
          snippet,
          title: conv?.title || '',
          updated_at: conv?.updated_at || msg.created_at,
          ...previews,
        });
      });
    }

    return results
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
      .slice(0, limit);
  },

  /** 仅删除对话与消息记录，不删除 outputs 目录中的文件 */
  deleteConversation(id, userId) {
    const idx = store.conversations.findIndex((c) => c.id === id && c.user_id === userId);
    if (idx === -1) return false;
    store.conversations.splice(idx, 1);
    store.messages = store.messages.filter((m) => m.conversation_id !== id);
    persist();
    return true;
  },
};

module.exports = {
  db,
  recordDailyActive,
  recordChatUsage,
  getDauStats,
  getChatUsageStats,
  getOverviewStats,
  todayStr,
};
