import { ROLE_LABELS, TIME_ZONE } from './constants.js';
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
export function formatFullDate(value) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'full',
    timeZone: TIME_ZONE
  }).format(new Date(value));
}
export function formatTime(value) {
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE
  }).format(new Date(value));
}
export function formatDateTime(value) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
    timeZone: TIME_ZONE
  }).format(new Date(value));
}
export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}
// 時段清單依日期分組，日期只在群組標題出現一次；平鋪清單會讓每一格都重複
// 一次日期，掃視時很難分辨「同一天有哪些時間」。
export function groupSlotsByDate(slots) {
  const groups = new Map();
  for (const slot of slots) {
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(slot.startsAt));
    const group = groups.get(key) ?? {
      key,
      label: formatFullDate(slot.startsAt),
      slots: []
    };
    group.slots.push(slot);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function emptyState(title, description) {
  return `<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">○</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div></div>`;
}
