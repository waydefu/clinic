// 主題切換：自動（跟隨系統）／淺色／護眼暖色／深色。
// 必須是 <head> 內同步載入的一般 script（CSP 禁止 inline script），
// 在首次繪製前把 data-theme 蓋到 <html> 上，避免主題閃爍。
(() => {
  'use strict';
  const STORAGE_KEY = 'beauessence_theme';
  const THEME_COLORS = { light: '#155c48', warm: '#1d5c48', dark: '#101714' };
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const storedPreference = () => {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return ['light', 'warm', 'dark', 'auto'].includes(value) ? value : 'auto';
    } catch {
      return 'auto';
    }
  };

  const apply = (preference) => {
    const theme =
      preference === 'auto' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta !== null) meta.setAttribute('content', THEME_COLORS[theme]);
  };

  apply(storedPreference());
  media.addEventListener('change', () => apply(storedPreference()));

  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.getElementById('theme-picker');
    if (picker === null) return;
    picker.value = storedPreference();
    picker.addEventListener('change', () => {
      try {
        window.localStorage.setItem(STORAGE_KEY, picker.value);
      } catch {
        /* 無痕模式等情境下不持久化，仍即時套用 */
      }
      apply(picker.value);
    });
  });
})();
