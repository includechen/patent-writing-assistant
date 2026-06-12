const API_BASE = (typeof window !== 'undefined' && window.patentApp?.apiBase)

  ? window.patentApp.apiBase

  : '/api';



async function request(path, options = {}) {

  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {

    throw new Error(data.error || data.message || `请求失败 (${res.status})`);

  }

  return data;

}



export const api = {

  getLlmSettings: () => request('/settings/llm'),

  updateLlmSettings: (settings) =>

    request('/settings/llm', { method: 'PUT', body: JSON.stringify(settings) }),



  getStats: (days = 30) => request(`/stats/combined?days=${days}`),



  getConversations: () => request('/chat/conversations'),

  searchConversations: (q, limit = 30) =>

    request(`/chat/conversations/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  getConversation: (id) => request(`/chat/conversations/${id}`),

  deleteConversation: (id) => request(`/chat/conversations/${id}`, { method: 'DELETE' }),



  sendMessage: async (message, conversationId, forceNew = false, files = [], modelOpts = {}) => {

    const { modelSelection, settingsModels, locale } = modelOpts || {};

    if (files?.length) {

      const form = new FormData();

      form.append('message', message || '');

      if (conversationId) form.append('conversationId', conversationId);

      form.append('forceNew', String(!!forceNew));

      if (locale) form.append('locale', locale);

      if (modelSelection) form.append('modelSelection', modelSelection);

      if (settingsModels?.length) form.append('settingsModels', JSON.stringify(settingsModels));

      files.forEach((f) => form.append('attachments', f, f.name));

      const res = await fetch(`${API_BASE}/chat/send`, { method: 'POST', body: form });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.error || data.message || `请求失败 (${res.status})`);

      return data;

    }

    return request('/chat/send', {

      method: 'POST',

      body: JSON.stringify({ message, conversationId, forceNew, modelSelection, settingsModels, locale }),

    });

  },



  createConversation: () => request('/chat/new', { method: 'POST' }),



  openOutputPath: (filePath) =>

    request('/chat/open-path', { method: 'POST', body: JSON.stringify({ filePath }) }),



  openOutputFile: (filePath) =>

    request('/chat/open-file', { method: 'POST', body: JSON.stringify({ filePath }) }),



  openOutputFolder: () => request('/chat/open-folder', { method: 'POST' }),



  getOutputs: () => request('/chat/outputs'),



  exportPatent: (content, title) =>

    request('/chat/export', { method: 'POST', body: JSON.stringify({ content, title }) }),



  reexportConversation: (conversationId) =>

    request(`/chat/conversations/${conversationId}/reexport`, { method: 'POST' }),



  getDepsStatus: () => request('/deps/status'),

  ensureDeps: () => request('/deps/ensure', { method: 'POST' }),



  getFeedbackStatus: () => request('/feedback/status'),



  sendFeedback: async (formData) => {

    const res = await fetch(`${API_BASE}/feedback/send`, { method: 'POST', body: formData });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {

      throw new Error(data.error || data.message || `发送失败 (${res.status})`);

    }

    return data;

  },



  getSmtpSettings: () => request('/settings/smtp'),

  updateSmtpSettings: (settings) =>

    request('/settings/smtp', { method: 'PUT', body: JSON.stringify(settings) }),



  getUpdateSettings: () => request('/settings/update'),

  updateUpdateSettings: (settings) =>

    request('/settings/update', { method: 'PUT', body: JSON.stringify(settings) }),

};


