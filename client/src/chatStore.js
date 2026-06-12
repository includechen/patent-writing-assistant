/** 跨 Tab / 刷新后保持当前对话；支持多对话并发生成 */

const STORAGE_KEY = 'patent_last_conversation_id';



const state = {

  generatingIds: new Set(),

  listeners: new Set(),

};



function notify(extra = {}) {

  const payload = {

    generatingIds: [...state.generatingIds],

    pending: state.generatingIds.size > 0,

    conversationId: chatStore.getLastConversationId(),

    ...extra,

  };

  state.listeners.forEach((fn) => fn(payload));

}



export const chatStore = {

  get pending() {

    return state.generatingIds.size > 0;

  },



  get generatingIds() {

    return [...state.generatingIds];

  },



  /** @deprecated 使用 isGenerating(id) */

  get generatingConversationId() {

    return state.generatingIds.values().next().value ?? null;

  },



  isGenerating(id) {

    if (!id) return false;

    return state.generatingIds.has(id);

  },



  setConversationId(conversationId) {

    if (conversationId) {

      localStorage.setItem(STORAGE_KEY, conversationId);

    } else {

      localStorage.removeItem(STORAGE_KEY);

    }

    notify();

  },



  getLastConversationId() {

    return localStorage.getItem(STORAGE_KEY);

  },



  startGenerating(conversationId) {

    if (!conversationId) return;

    state.generatingIds.add(conversationId);

    notify({ startedId: conversationId });

    // #region agent log

    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },

      body: JSON.stringify({

        sessionId: '36d6f3',

        runId: 'multi-task',

        hypothesisId: 'H-multi-start',

        location: 'chatStore.js:startGenerating',

        message: 'task started',

        data: { conversationId, active: [...state.generatingIds] },

        timestamp: Date.now(),

      }),

    }).catch(() => {});

    // #endregion

  },



  finishGenerating(conversationId, { force = false } = {}) {

    if (!conversationId) return;

    const had = state.generatingIds.delete(conversationId);

    if (!had && !force) return;

    notify({ lastFinishedId: conversationId });

    // #region agent log

    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },

      body: JSON.stringify({

        sessionId: '36d6f3',

        runId: 'multi-task',

        hypothesisId: 'H-multi-finish',

        location: 'chatStore.js:finishGenerating',

        message: 'task finished',

        data: { conversationId, remaining: [...state.generatingIds] },

        timestamp: Date.now(),

      }),

    }).catch(() => {});

    // #endregion

  },



  /** 删除对话后清理：移除已删会话及无效 generating 项 */
  pruneGenerating(validConvIds = []) {
    const valid = new Set(validConvIds);
    let changed = false;
    for (const gid of [...state.generatingIds]) {
      if (String(gid).startsWith('new:')) continue;
      if (!valid.has(gid)) {
        state.generatingIds.delete(gid);
        changed = true;
      }
    }
    if (changed) notify({ pruned: true });
  },

  clearEphemeralGenerating() {
    let changed = false;
    for (const gid of [...state.generatingIds]) {
      if (String(gid).startsWith('new:')) {
        state.generatingIds.delete(gid);
        changed = true;
      }
    }
    if (changed) notify({ prunedEphemeral: true });
  },



  /** 兼容旧调用 — 映射到 start/finish */

  setPending(pending, generatingConversationId = null) {

    if (pending && generatingConversationId) {

      chatStore.startGenerating(generatingConversationId);

    } else if (!pending && generatingConversationId) {

      chatStore.finishGenerating(generatingConversationId);

    }

  },



  subscribe(fn) {

    state.listeners.add(fn);

    fn({

      generatingIds: [...state.generatingIds],

      pending: state.generatingIds.size > 0,

      conversationId: chatStore.getLastConversationId(),

    });

    return () => state.listeners.delete(fn);

  },

};


