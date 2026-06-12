import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import { chatStore } from '../chatStore';
import OutputPanel from './OutputPanel';
import ChatComposer from './ChatComposer';
import { useI18n } from '../i18n';
import {
  AUTO_ID,
  llmConfigStore,
  buildComposerCatalog,
  pickComposerModel,
} from '../llmConfig';

const COMPOSER_MODEL_KEY = 'patent_composer_model';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function extractDocxPath(text) {
  const m = text?.match(/Word:\s*`([^`]+)`/);
  return m ? m[1] : null;
}

function isImageFile(file) {
  return file.type.startsWith('image/');
}

export default function ChatPage({ visible = true }) {
  const { t, tr, locale } = useI18n();
  const suggestions = tr('chat.suggestions') || [];
  // #region agent log
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'i18n-verify',
      hypothesisId: 'H-reactive',
      location: 'ChatPage.jsx:render',
      message: 'chat render locale',
      data: { locale, titleKey: t('chat.title'), suggestionCount: suggestions.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [fetchingConvId, setFetchingConvId] = useState(null);
  const [generatingConvIds, setGeneratingConvIds] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [isNewChat, setIsNewChat] = useState(false);
  const [outputRefreshKey, setOutputRefreshKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);
  const [isWideLayout, setIsWideLayout] = useState(() => window.matchMedia('(min-width: 1281px)').matches);
  const [deletingConvId, setDeletingConvId] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [modelCatalog, setModelCatalog] = useState([]);
  const [settingsModels, setSettingsModels] = useState([]);
  const settingsModelsRef = useRef([]);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [composerModel, setComposerModel] = useState(() => localStorage.getItem(COMPOSER_MODEL_KEY) || AUTO_ID);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightMsgIndex, setHighlightMsgIndex] = useState(null);

  const composerCatalog = useMemo(
    () => buildComposerCatalog(modelCatalog, settingsModels),
    [modelCatalog, settingsModels],
  );

  useEffect(() => {
    const ids = new Set(composerCatalog.map((m) => m.id));
    if (composerModel && ids.has(composerModel)) return;
    const next = pickComposerModel({
      storedModel: null,
      composerCatalog,
      autoEnabled,
      forceDefault: false,
    });
    if (next && next !== composerModel) {
      setComposerModel(next);
      localStorage.setItem(COMPOSER_MODEL_KEY, next);
      // #region agent log
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'model-sync-v4',
          hypothesisId: 'H-stale-model',
          location: 'ChatPage.jsx:composerCatalog-sync',
          message: 'reset stale composer model',
          data: { prev: composerModel, next, catalogIds: [...ids] },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }
  }, [composerCatalog, composerModel, autoEnabled]);
  const bottomRef = useRef(null);
  const messageRefs = useRef([]);
  const composerFocusRef = useRef(null);
  const syncSeqRef = useRef(0);
  const conversationIdRef = useRef(null);
  const pendingComposerFocusRef = useRef(false);
  const pendingScrollMsgIndexRef = useRef(null);
  const scrollModeRef = useRef('bottom');

  const askConfirm = useCallback((message) => new Promise((resolve) => {
    setConfirmDialog({ message, resolve });
  }), []);

  const focusComposer = useCallback(async (reason = 'manual') => {
    try {
      await window.patentApp?.focusWindow?.();
    } catch { /* ignore */ }
    composerFocusRef.current?.();
    // #region agent log
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'electron-focus-fix',
        hypothesisId: 'H-confirm-steals-focus',
        location: 'ChatPage.jsx:focusComposer',
        message: 'composer focus requested',
        data: { reason, conversationId: conversationIdRef.current },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, []);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!pendingComposerFocusRef.current) return undefined;
    pendingComposerFocusRef.current = false;
    const run = () => { focusComposer('after-conv-switch'); };
    run();
    const t1 = setTimeout(run, 80);
    const t2 = setTimeout(run, 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [conversationId, focusComposer]);

  useEffect(() => {
    const mqWide = window.matchMedia('(min-width: 1281px)');
    const apply = () => {
      const wide = mqWide.matches;
      setIsWideLayout(wide);
      if (wide) {
        setOutputOpen(true);
        setHistoryOpen(true);
      }
    };
    apply();
    mqWide.addEventListener('change', apply);
    return () => mqWide.removeEventListener('change', apply);
  }, []);

  const toggleHistoryPanel = useCallback(() => {
    if (isWideLayout) return;
    setHistoryOpen((v) => !v);
  }, [isWideLayout]);

  const toggleOutputPanel = useCallback(() => {
    if (isWideLayout) return;
    setOutputOpen((v) => !v);
  }, [isWideLayout]);

  const refreshConversations = useCallback(async () => {
    try {
      const list = await api.getConversations();
      setConversations(list);
      // #region agent log
      const sample = list.slice(0, 3).map((c) => ({
        id: c.id,
        user: (c.last_user_preview || '').slice(0, 40),
        assistant: (c.last_assistant_preview || '').slice(0, 40),
        time: c.last_message_at || c.updated_at,
      }));
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'conv-card-ui',
          hypothesisId: 'H-preview-fields',
          location: 'ChatPage.jsx:refreshConversations',
          message: 'sidebar conv card previews',
          data: { count: list.length, sample },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch {
      /* ignore */
    }
  }, []);

  const loadConversation = useCallback(async (id, { silent = false, optimistic = false, scrollToMessageIndex = null } = {}) => {
    if (!id) return;
    const seq = ++syncSeqRef.current;
    if (scrollToMessageIndex != null) {
      scrollModeRef.current = 'message';
      pendingScrollMsgIndexRef.current = scrollToMessageIndex;
    } else if (!optimistic) {
      scrollModeRef.current = 'bottom';
      pendingScrollMsgIndexRef.current = null;
    }
    if (optimistic) {
      setConversationId(id);
      chatStore.setConversationId(id);
      setMessages([]);
      setIsNewChat(false);
      // #region agent log
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'conv-switch-fix',
          hypothesisId: 'H-stale-conv-id',
          location: 'ChatPage.jsx:loadConversation:optimistic',
          message: 'optimistic conversation switch',
          data: { id, silent, generating: chatStore.isGenerating(id) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }
    if (!silent) setFetchingConvId(id);
    try {
      const conv = await api.getConversation(id);
      if (seq !== syncSeqRef.current) return;
      setConversationId(conv.id);
      chatStore.setConversationId(conv.id);
      setMessages(conv.messages || []);
      setIsNewChat(false);
    } catch (err) {
      if (conversationIdRef.current === id) {
        setMessages([{ role: 'assistant', content: `❌ ${t('chat.loadFailed', { message: err.message })}` }]);
      }
    } finally {
      if (!silent) setFetchingConvId(null);
    }
  }, [t]);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.getConversations();
        setConversations(list);
        if (list.length > 0) {
          await loadConversation(list[0].id, { silent: true });
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [loadConversation]);

  useEffect(() => {
    const q = historySearch.trim();
    if (!q) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchConversations(q);
        setSearchResults(Array.isArray(res) ? res : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [historySearch]);

  const refreshLlmSettings = useCallback(async () => {
    try {
      const s = await api.getLlmSettings();
      const catalog = s.catalog || [];
      const selected = s.selectedModels || [];
      const cat = buildComposerCatalog(catalog, selected);
      const auto = !!s.autoEnabled;
      setModelCatalog(catalog);
      setSettingsModels(selected);
      settingsModelsRef.current = selected;
      setAutoEnabled(auto);
      const stored = localStorage.getItem(COMPOSER_MODEL_KEY);
      const forceDefault = llmConfigStore.consumeSavedFlag();
      const nextModel = pickComposerModel({
        storedModel: forceDefault ? null : stored,
        composerCatalog: cat,
        autoEnabled: auto,
        forceDefault,
      });
      setComposerModel(nextModel);
      localStorage.setItem(COMPOSER_MODEL_KEY, nextModel);
      // #region agent log
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'settings-sync',
          hypothesisId: 'H-settings-sync',
          location: 'ChatPage.jsx:refreshLlmSettings',
          message: 'composer catalog synced from settings',
          data: {
            autoEnabled: auto,
            settingsIds: selected,
            composerIds: cat.map((m) => m.id),
            composerModel: nextModel,
            apiKeySet: !!s.apiKeySet,
            forceDefault,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshLlmSettings();
    return llmConfigStore.subscribe(() => { refreshLlmSettings(); });
  }, [refreshLlmSettings]);

  useEffect(() => {
    localStorage.setItem(COMPOSER_MODEL_KEY, composerModel);
  }, [composerModel]);

  useEffect(() => {
    if (pendingScrollMsgIndexRef.current == null) return undefined;
    const idx = pendingScrollMsgIndexRef.current;
    if (messages.length <= idx) return undefined;
    const timer = setTimeout(() => {
      messageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightMsgIndex(idx);
      pendingScrollMsgIndexRef.current = null;
      scrollModeRef.current = 'bottom';
    }, 80);
    const clearHighlight = setTimeout(() => setHighlightMsgIndex(null), 3280);
    return () => {
      clearTimeout(timer);
      clearTimeout(clearHighlight);
    };
  }, [messages]);

  useEffect(() => {
    if (!visible) return;
    if (scrollModeRef.current === 'message') return;
    if (pendingScrollMsgIndexRef.current != null) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, generatingConvIds, visible]);

  useEffect(() => {
    const urls = attachments.map((f) => (isImageFile(f) ? URL.createObjectURL(f) : null));
    setPreviews(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [attachments]);

  useEffect(() => {
    return chatStore.subscribe(async ({ generatingIds, lastFinishedId }) => {
      setGeneratingConvIds(new Set(generatingIds));
      if (lastFinishedId) {
        setOutputRefreshKey((k) => k + 1);
        if (conversationIdRef.current === lastFinishedId) {
          try {
            await api.getConversation(lastFinishedId);
            await loadConversation(lastFinishedId, { silent: true });
          } catch {
            /* conversation may have been deleted while request was in flight */
          }
        }
        await refreshConversations();
      }
    });
  }, [visible, loadConversation, refreshConversations]);

  const handleDeleteConversation = async (id, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!id || deletingConvId) return;
    if (generatingConvIds.has(id)) {
      window.alert(t('chat.cannotDeleteGenerating'));
      return;
    }
    const confirmed = await askConfirm(t('chat.deleteConvConfirm'));
    if (!confirmed) return;

    setDeletingConvId(id);
    const wasCurrent = conversationIdRef.current === id;
    try {
      await api.deleteConversation(id);
      chatStore.finishGenerating(id, { force: true });
      const list = await api.getConversations();
      setConversations(list);
      const validIds = list.map((c) => c.id);
      chatStore.pruneGenerating(validIds);
      setFetchingConvId(null);
      if (wasCurrent) {
        if (list.length > 0) {
          const nextId = list[0].id;
          syncSeqRef.current += 1;
          setConversationId(nextId);
          chatStore.setConversationId(nextId);
          setMessages([]);
          setIsNewChat(false);
          chatStore.clearEphemeralGenerating();
          await loadConversation(nextId, { optimistic: true, silent: true });
        } else {
          syncSeqRef.current += 1;
          setConversationId(null);
          chatStore.setConversationId(null);
          setMessages([]);
          setIsNewChat(true);
          chatStore.clearEphemeralGenerating();
        }
      }
      // #region agent log
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'delete-conv-fix',
          hypothesisId: 'H-delete-stale-gen',
          location: 'ChatPage.jsx:handleDeleteConversation',
          message: 'conversation deleted and state pruned',
          data: {
            deletedId: id,
            wasCurrent,
            nextConversationId: conversationIdRef.current,
            remaining: validIds.length,
            generatingAfter: chatStore.generatingIds,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      pendingComposerFocusRef.current = true;
      await focusComposer('after-delete');
    } catch (err) {
      window.alert(`${t('chat.deleteConvFailed')}：${err.message || ''}`);
    } finally {
      setDeletingConvId(null);
    }
  };

  const startNewChat = async () => {
    try {
      const { conversationId: newId } = await api.createConversation();
      syncSeqRef.current += 1;
      setConversationId(newId);
      chatStore.setConversationId(newId);
      setMessages([]);
      setInput('');
      setIsNewChat(true);
      await refreshConversations();
    } catch {
      syncSeqRef.current += 1;
      setConversationId(null);
      chatStore.setConversationId(null);
      setMessages([]);
      setInput('');
      setIsNewChat(true);
    }
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const send = async (text) => {
    const msg = text || input.trim();
    const filesToSend = [...attachments];
    const trackId = conversationId || `new:${crypto.randomUUID()}`;
    if (generatingConvIds.has(trackId)) return;
    if (!msg && !filesToSend.length) return;

    const sendConvId = conversationId;
    const forceNew = !conversationId;

    const displayMsg = msg + (filesToSend.length
      ? `\n\n📎 ${filesToSend.map((f) => f.name).join(' · ')}`
      : '');

    setInput('');
    setAttachments([]);
    if (conversationIdRef.current === sendConvId || (!sendConvId && isNewChat)) {
      setMessages((prev) => [...prev, { role: 'user', content: displayMsg }]);
    }
    chatStore.startGenerating(trackId);

    // #region agent log
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'ui-nonblock-fix',
        hypothesisId: 'H7',
        location: 'ChatPage.jsx:send',
        message: 'optimistic user message appended',
        data: { sendConvId, trackId, forceNew, locale, msgLen: msg.length, fileCount: filesToSend.length, activeTasks: chatStore.generatingIds },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    try {
      const data = await api.sendMessage(msg, sendConvId, forceNew, filesToSend, {
        modelSelection: composerModel,
        settingsModels: settingsModelsRef.current.length ? settingsModelsRef.current : settingsModels,
        locale,
      });
      const resolvedId = data.conversationId;
      chatStore.finishGenerating(trackId);

      if (conversationIdRef.current === sendConvId || (forceNew && !sendConvId)) {
        setConversationId(resolvedId);
        chatStore.setConversationId(resolvedId);
        setIsNewChat(false);
        await loadConversation(resolvedId, { silent: true });
        setOutputRefreshKey((k) => k + 1);
      }
      await refreshConversations();
    } catch (err) {
      chatStore.finishGenerating(trackId);
      if (conversationIdRef.current === sendConvId || (forceNew && !sendConvId)) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `❌ ${t('chat.error')}：${err.message || t('chat.sendFailed')}` },
        ]);
      }
      await refreshConversations();
    }
  };

  const handleExport = async () => {
    if (!conversationId || exporting) return;
    setExporting(true);
    const progressText = t('chat.exportStarting');
    setMessages((prev) => [...prev, { role: 'assistant', content: progressText }]);
    scrollModeRef.current = 'bottom';
    // #region agent log
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'export-ux-v1',
        hypothesisId: 'H-export-feedback',
        location: 'ChatPage.jsx:handleExport',
        message: 'reexport started with progress bubble',
        data: { conversationId },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      const data = await api.reexportConversation(conversationId);
      await loadConversation(conversationId, { silent: true });
      if (data.export?.docxPath) setOutputRefreshKey((k) => k + 1);
      await refreshConversations();
    } catch (err) {
      setMessages((prev) => [
        ...prev.filter((m) => m.content !== progressText),
        { role: 'assistant', content: `❌ ${t('chat.error')}：${err.message || t('chat.exportFailed')}` },
      ]);
    } finally {
      setExporting(false);
    }
  };

  const openLastDocx = async () => {
    try {
      const outputs = await api.getOutputs();
      const docx = outputs.latestDocx?.path || extractDocxPath([...messages].reverse().find((m) => m.role === 'assistant')?.content);
      if (docx) await api.openOutputFile(docx);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${t('chat.openFileFailed', { message: err.message })}` }]);
    }
  };

  const locateLastDocx = async () => {
    try {
      const outputs = await api.getOutputs();
      const docx = outputs.latestDocx?.path || extractDocxPath([...messages].reverse().find((m) => m.role === 'assistant')?.content);
      if (docx) await api.openOutputPath(docx);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${t('chat.locateFailed', { message: err.message })}` }]);
    }
  };

  const conversationExists = conversationId
    ? conversations.some((c) => c.id === conversationId)
    : false;
  const isGeneratingHere = conversationId && conversationExists
    ? generatingConvIds.has(conversationId)
    : [...generatingConvIds].some((gid) => String(gid).startsWith('new:'));

  const isPatentDraftInput = (text) => {
    const t = (text || '').trim();
    if (!t) return false;
    return /^(随机)?生成(一个)?专利$|随机生成.*专利|撰写.*专利|交底书|帮我.*专利/.test(t)
      || (t.length >= 60 && !/[？?]$/.test(t) && !/[吗呢么]$/.test(t) && /方法|系统|专利|装置|算法/i.test(t));
  };

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || input;
  const statusHint = isPatentDraftInput(lastUserMsg) ? t('chat.generatingStatus') : t('chat.replyingStatus');
  const isSendingHere = isGeneratingHere;
  const isFetchingHere = fetchingConvId === conversationId;

  // #region agent log
  useEffect(() => {
    if (!visible) return;
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'conv-switch-fix',
        hypothesisId: 'H-input-disabled',
        location: 'ChatPage.jsx:composerState',
        message: 'composer disable state',
        data: {
          conversationId,
          conversationExists,
          isSendingHere,
          isFetchingHere,
          generatingConvIds: [...generatingConvIds],
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [visible, conversationId, isSendingHere, isFetchingHere, generatingConvIds]);
  // #endregion

  const hasPatent = messages.some((m) => m.role === 'assistant' && (m.content.includes('## 项 目') || m.content.includes('```markdown') || m.content.includes('Phase 6')));
  const lastDocx = extractDocxPath([...messages].reverse().find((m) => m.role === 'assistant')?.content);

  const formatConvTitle = useCallback((title) => (
    title === '新对话' || title === 'New chat' ? t('chat.newChatTitle') : (title || t('chat.unnamed'))
  ), [t]);

  const renderConvCard = useCallback((c, { generating = false } = {}) => {
    const userLine = c.last_user_preview || (c.message_count ? '' : t('chat.historyNoPreview'));
    const userLabel = userLine || formatConvTitle(c.title);
    const assistantLine = c.last_assistant_preview || '';
    const timeLabel = formatTime(c.last_message_at || c.updated_at);
    return (
      <>
        <div className="chat-history-user-line">
          {userLabel}
          {generating && <span className="chat-history-pending">{t('chat.generatingBadge')}</span>}
        </div>
        {assistantLine && (
          <div className="chat-history-assistant-line">{assistantLine}</div>
        )}
        <div className="chat-history-item-meta">{timeLabel}</div>
      </>
    );
  }, [formatConvTitle, t]);

  const activeConvTitle = useMemo(() => {
    const c = conversations.find((x) => x.id === conversationId);
    if (!c) return null;
    return c.last_user_preview || formatConvTitle(c.title);
  }, [conversations, conversationId, formatConvTitle]);

  const handleSearchJump = useCallback(async (result) => {
    setHistorySearch('');
    setSearchResults([]);
    await loadConversation(result.conversationId, {
      optimistic: true,
      silent: true,
      scrollToMessageIndex: result.messageIndex,
    });
  }, [loadConversation]);

  return (
    <div className="chat-page">
      <aside className={`chat-history-panel ${(isWideLayout || historyOpen) ? 'is-open' : ''}`}>
        <div className="chat-history-header">
          <span>{t('chat.history')}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={startNewChat}>
            {t('chat.newChat')}
          </button>
        </div>
        <div className="chat-history-search-wrap">
          <input
            type="search"
            className="chat-history-search"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder={t('chat.historySearchPh')}
            aria-label={t('chat.historySearchPh')}
          />
        </div>
        <div className="chat-history-list">
          {historySearch.trim() ? (
            <>
              {searchLoading && (
                <div className="chat-history-empty">{t('chat.loading')}</div>
              )}
              {!searchLoading && searchResults.length === 0 && (
                <div className="chat-history-empty">{t('chat.historySearchEmpty')}</div>
              )}
              {!searchLoading && searchResults.map((r, i) => (
                <button
                  key={`${r.conversationId}-${r.messageIndex}-${i}`}
                  type="button"
                  className="chat-history-search-item"
                  onClick={() => handleSearchJump(r)}
                >
                  {renderConvCard(r)}
                </button>
              ))}
            </>
          ) : (
            <>
          {loadingHistory && <div className="chat-history-empty">{t('chat.loading')}</div>}
          {!loadingHistory && conversations.length === 0 && (
            <div className="chat-history-empty">{t('chat.emptyHistory')}</div>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`chat-history-row ${c.id === conversationId ? 'active' : ''} ${generatingConvIds.has(c.id) ? 'generating' : ''}`}
            >
              <button
                type="button"
                className={`chat-history-item ${c.id === conversationId ? 'active' : ''} ${generatingConvIds.has(c.id) ? 'generating' : ''}`}
                onClick={() => loadConversation(c.id)}
              >
                {renderConvCard(c, { generating: generatingConvIds.has(c.id) })}
              </button>
              <button
                type="button"
                className="chat-history-delete"
                title={t('chat.deleteConvTitle')}
                aria-label={t('chat.deleteConvTitle')}
                disabled={deletingConvId === c.id || generatingConvIds.has(c.id)}
                onClick={(e) => handleDeleteConversation(c.id, e)}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4a1 1 0 1 1 0-2h4V4a1 1 0 0 1 1-1zm1 2v0h4V5h-4zm-2 4v12h10V9H8zm2 2h2v8h-2v-8zm4 0h2v8h-2v-8z"
                  />
                </svg>
              </button>
            </div>
          ))}
            </>
          )}
        </div>
        <p className="chat-history-tip">{t('chat.historyTip')}</p>
      </aside>

      <div className="chat-layout">
        {(isGeneratingHere || exporting) && (
          <div className="chat-progress-bar" role="progressbar" aria-label={exporting ? t('chat.exporting') : statusHint}>
            <div className="chat-progress-bar-fill" />
          </div>
        )}
        <div className="chat-header">
          <div className="chat-header-title">
            <h2>{activeConvTitle || t('chat.title')}</h2>
            <p>{t('chat.subtitle')}</p>
          </div>
          <div className="chat-header-toolbar">
            <button
              type="button"
              className="btn btn-secondary btn-sm chat-panel-toggle chat-panel-toggle-history"
              onClick={toggleHistoryPanel}
              aria-hidden={isWideLayout}
              tabIndex={isWideLayout ? -1 : 0}
            >
              {historyOpen ? t('chat.hideHistory') : t('chat.showHistory')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm chat-panel-toggle chat-panel-toggle-output"
              onClick={toggleOutputPanel}
              aria-hidden={isWideLayout}
              tabIndex={isWideLayout ? -1 : 0}
            >
              {outputOpen ? t('chat.hideOutput') : t('chat.showOutput')}
            </button>
          </div>
          <div className="chat-header-actions">
            {(lastDocx || hasPatent) && (
              <button type="button" className="btn btn-primary btn-sm" onClick={openLastDocx}>
                {t('chat.openLatestWord')}
              </button>
            )}
            {(lastDocx || hasPatent) && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={locateLastDocx}>
                {t('chat.showInFolder')}
              </button>
            )}
            {hasPatent && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting || isSendingHere}>
                {exporting ? t('chat.exporting') : t('chat.reexportWord')}
              </button>
            )}
            {conversationId && (
              <button
                type="button"
                className="btn btn-ghost-danger btn-sm"
                onClick={() => handleDeleteConversation(conversationId)}
                disabled={isSendingHere || deletingConvId === conversationId}
                title={t('chat.deleteConvTitle')}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="btn-icon">
                  <path
                    fill="currentColor"
                    d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4a1 1 0 1 1 0-2h4V4a1 1 0 0 1 1-1zm1 2v0h4V5h-4zm-2 4v12h10V9H8zm2 2h2v8h-2v-8zm4 0h2v8h-2v-8z"
                  />
                </svg>
                {deletingConvId === conversationId ? t('chat.deletingConv') : t('chat.deleteConv')}
              </button>
            )}
          </div>
        </div>

        {messages.length === 0 && !isGeneratingHere && !isFetchingHere && (
          <div className="suggestions">
            {suggestions.map((s) => (
              <button key={s} type="button" className="suggestion-chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="chat-messages">
          {messages.map((m, i) => (
            <div
              key={i}
              ref={(el) => { messageRefs.current[i] = el; }}
              className={`message ${m.role}${highlightMsgIndex === i ? ' message-highlight' : ''}`}
            >
              {m.role === 'assistant' ? (
                <ReactMarkdown>{m.content}</ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          ))}
          {isFetchingHere && (
            <div className="message assistant chat-status-hint">{t('chat.loadingConv')}</div>
          )}
          {isGeneratingHere && (
            <div className="message assistant">
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
              {statusHint}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          <ChatComposer
            conversationKey={conversationId || 'new-chat'}
            input={input}
            onInputChange={setInput}
            attachments={attachments}
            previews={previews}
            onAddFiles={setAttachments}
            onRemoveAttachment={removeAttachment}
            disabled={isSendingHere}
            onSend={() => send()}
            onFocusRequestRef={composerFocusRef}
            catalog={composerCatalog}
            autoEnabled={autoEnabled}
            composerModel={composerModel}
            onComposerModelChange={setComposerModel}
          />
        </div>
      </div>

      <OutputPanel
        pageVisible={visible}
        panelOpen={isWideLayout || outputOpen}
        refreshKey={outputRefreshKey}
        isGenerating={isGeneratingHere}
      />

      {confirmDialog && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              confirmDialog.resolve(false);
              setConfirmDialog(null);
              focusComposer('confirm-cancel-overlay');
            }
          }}
        >
          <div className="confirm-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <p id="confirm-dialog-title" className="confirm-dialog-text">{confirmDialog.message}</p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  confirmDialog.resolve(false);
                  setConfirmDialog(null);
                  focusComposer('confirm-cancel');
                }}
              >
                {t('chat.deleteConvCancel')}
              </button>
              <button
                type="button"
                className="btn btn-ghost-danger btn-sm"
                onClick={() => {
                  confirmDialog.resolve(true);
                  setConfirmDialog(null);
                }}
              >
                {t('chat.deleteConv')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
