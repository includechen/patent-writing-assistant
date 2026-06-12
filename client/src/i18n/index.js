import { useState, useEffect } from 'react';
import { translations } from './translations';

const DEFAULT_LOCALE = 'zh';
let locale = DEFAULT_LOCALE;
const listeners = new Set();

function normalize(loc) {
  return loc === 'en' ? 'en' : 'zh';
}

function resolve(key) {
  const parts = key.split('.');
  let node = translations[locale] || translations.zh;
  for (const p of parts) {
    if (node?.[p] === undefined) {
      node = translations.zh;
      for (const q of parts) node = node?.[q];
      return node;
    }
    node = node[p];
  }
  return node;
}

export function getLocale() {
  return locale;
}

export function setLocale(next) {
  const normalized = normalize(next);
  if (normalized === locale) return locale;
  const prev = locale;
  locale = normalized;
  document.documentElement.lang = locale;
  // #region agent log
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'i18n-verify',
      hypothesisId: 'H-propagate',
      location: 'i18n/index.js:setLocale',
      message: 'locale changed',
      data: { prev, next: locale, listenerCount: listeners.size },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  listeners.forEach((fn) => fn(locale));
  return locale;
}

export function tr(key) {
  return resolve(key);
}

export function t(key, vars = {}) {
  const val = resolve(key);
  if (typeof val !== 'string') return key;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    val,
  );
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(locale);
  return () => listeners.delete(fn);
}

export function useI18n() {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  return { t, tr, locale: getLocale() };
}

export async function initLocale() {
  if (window.patentApp?.getLocale) {
    try {
      const saved = await window.patentApp.getLocale();
      setLocale(saved);
    } catch {
      setLocale(DEFAULT_LOCALE);
    }
    window.patentApp.onLocaleChange?.((loc) => setLocale(loc));
    window.patentApp.onNavigate?.((page) => {
      window.dispatchEvent(new CustomEvent('patent-nav', { detail: page }));
    });
  } else {
    setLocale(localStorage.getItem('patent_locale') || DEFAULT_LOCALE);
  }
  return locale;
}

export async function changeLocale(next) {
  const normalized = normalize(next);
  if (window.patentApp?.setLocale) {
    await window.patentApp.setLocale(normalized);
  } else {
    localStorage.setItem('patent_locale', normalized);
    setLocale(normalized);
  }
  return normalized;
}
