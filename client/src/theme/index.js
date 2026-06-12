import { useState, useEffect } from 'react';

export const THEMES = ['midnight', 'slate', 'daylight'];
const DEFAULT_THEME = 'midnight';
const STORAGE_KEY = 'patent_theme';

let theme = DEFAULT_THEME;
const listeners = new Set();

function normalize(next) {
  return THEMES.includes(next) ? next : DEFAULT_THEME;
}

function applyDom(next) {
  document.documentElement.setAttribute('data-theme', next);
}

export function getTheme() {
  return theme;
}

export function setTheme(next) {
  const normalized = normalize(next);
  if (normalized === theme) return theme;
  theme = normalized;
  applyDom(theme);
  listeners.forEach((fn) => fn(theme));
  return theme;
}

export function cycleTheme() {
  const idx = THEMES.indexOf(theme);
  const next = THEMES[(idx + 1) % THEMES.length];
  return changeTheme(next);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(theme);
  return () => listeners.delete(fn);
}

export function useTheme() {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  return { theme: getTheme(), setTheme: changeTheme, cycleTheme: changeThemeCycle };
}

export async function initTheme() {
  if (window.patentApp?.getTheme) {
    try {
      const saved = await window.patentApp.getTheme();
      setTheme(saved);
    } catch {
      setTheme(DEFAULT_THEME);
    }
    window.patentApp.onThemeChange?.((id) => setTheme(id));
  } else {
    setTheme(localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME);
  }
  return theme;
}

export async function changeTheme(next) {
  const normalized = normalize(next);
  if (window.patentApp?.setTheme) {
    await window.patentApp.setTheme(normalized);
  } else {
    localStorage.setItem(STORAGE_KEY, normalized);
    setTheme(normalized);
  }
  return normalized;
}

export async function changeThemeCycle() {
  if (window.patentApp?.cycleTheme) {
    const next = await window.patentApp.cycleTheme();
    setTheme(next);
    return next;
  }
  return cycleTheme();
}
