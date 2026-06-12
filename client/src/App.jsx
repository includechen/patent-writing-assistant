import { useState, useEffect } from 'react';

import ChatPage from './components/ChatPage';
import FeedbackPage from './components/FeedbackPage';
import SettingsPage from './components/SettingsPage';
import GuidePage from './components/GuidePage';
import UpdateManager from './components/UpdateManager';
import UpdateBanner from './components/UpdateBanner';

import { chatStore } from './chatStore';

import { t, subscribe, initLocale } from './i18n';
import { initTheme, useTheme, changeThemeCycle } from './theme';

const THEME_ICONS = {
  midnight: '🌙',
  slate: '🪨',
  daylight: '☀️',
};

const NAV_IDS = ['chat', 'feedback', 'guide', 'settings'];

export default function App() {
  const [page, setPage] = useState('chat');
  const [booting, setBooting] = useState(true);
  const [chatPending, setChatPending] = useState(false);
  const [, setLocaleTick] = useState(0);
  const { theme } = useTheme();

  useEffect(() => {
    Promise.all([initLocale(), initTheme()]).finally(() => {
      setBooting(false);
      setLocaleTick((n) => n + 1);
    });
    return subscribe(() => setLocaleTick((n) => n + 1));
  }, []);

  useEffect(() => {
    const inset = window.patentApp?.titleBarInset;
    if (!inset?.top) return;
    const root = document.documentElement;
    root.classList.add('electron-frame-overlay');
    root.style.setProperty('--electron-titlebar-top', `${inset.top}px`);
    root.style.setProperty('--electron-titlebar-right', `${inset.right}px`);
    // #region agent log
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'titlebar-inset-v1',
        hypothesisId: 'H-ui-overlap',
        location: 'App.jsx:titleBarInset',
        message: 'applied title bar safe area',
        data: inset,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, []);

  useEffect(() => {
    const onNav = (e) => {
      if (NAV_IDS.includes(e.detail)) setPage(e.detail);
    };
    window.addEventListener('patent-nav', onNav);
    return () => window.removeEventListener('patent-nav', onNav);
  }, []);

  useEffect(() => {
    return chatStore.subscribe(({ pending }) => setChatPending(pending));
  }, []);

  if (booting) {
    return <div className="loading">{t('loading')}</div>;
  }

  return (
    <UpdateManager>
    <div className="app-layout">
      <aside className="sidebar">
        <div className="logo">
          <img src="/logo.png" alt="" className="logo-mark" width="28" height="28" />
          <span className="logo-text">{t('appName')}</span>
        </div>

        {NAV_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`nav-item ${page === id ? 'active' : ''}`}
            onClick={() => setPage(id)}
          >
            {t(`nav.${id}`)}
            {id === 'chat' && chatPending && page !== 'chat' && (
              <span className="nav-pending-dot" title={t('generating')}>●</span>
            )}
          </button>
        ))}

        <div className="user-bar">
          <button
            type="button"
            className="btn-theme-cycle"
            onClick={() => changeThemeCycle()}
            title={t('theme.cycleHint', { name: t(`theme.names.${theme}`) })}
          >
            <span className="btn-theme-cycle-icon" aria-hidden>{THEME_ICONS[theme] || '🎨'}</span>
            <span>{t(`theme.names.${theme}`)}</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <UpdateBanner />

        <div className={`page-panel ${page === 'chat' ? 'page-panel-active' : ''}`}>
          <ChatPage visible={page === 'chat'} />
        </div>

        <div className={`page-panel ${page === 'feedback' ? 'page-panel-active' : ''}`}>
          <FeedbackPage visible={page === 'feedback'} />
        </div>

        <div className={`page-panel ${page === 'guide' ? 'page-panel-active' : ''}`}>
          <GuidePage visible={page === 'guide'} />
        </div>

        <div className={`page-panel ${page === 'settings' ? 'page-panel-active' : ''}`}>
          <SettingsPage />
        </div>
      </main>
    </div>
    </UpdateManager>
  );
}
