import { ROLE_LABELS, TIME_ZONE, WEEKDAY_LABELS } from './constants.js';
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
export function formatDate(value) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeZone: TIME_ZONE
  }).format(new Date(value));
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
export function weekdayLabel(weekday) {
  return WEEKDAY_LABELS[weekday] ?? String(weekday);
}
export function emptyState(title, description) {
  return `<div class="empty-state"><span class="empty-state-icon" aria-hidden="true">○</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div></div>`;
}
