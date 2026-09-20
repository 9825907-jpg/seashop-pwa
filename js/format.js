// Форматирование чисел, денег и дат — аналог Support/Utilities.swift.

// "12.500" -> "12.5", "12.000" -> "12" (обрезка незначащих нулей после точки).
export function formatQuantity(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  let s = Number(value).toFixed(3);
  s = s.replace(/0+$/, '');
  s = s.replace(/\.$/, '');
  return s;
}

// Ввод из калькулятора/поля: запятая как разделитель, невалидное -> 0.
export function normalizedDouble(str) {
  if (str === null || str === undefined) return 0;
  const normalized = String(str).replace(',', '.').trim();
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatCurrency(value) {
  const rounded = Math.round(Number(value) || 0);
  return `${currencyFormatter.format(rounded)} ₽`;
}

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// Даты хранятся как ISO-строки (Date.toISOString()).
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function formatDateShort(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Комбинирует дату (год/месяц/день) из одного значения со временем
// (часы/минуты) из другого — аналог Date.combine(date:time:).
export function combineDateAndTime(datePart, timePart) {
  const d = new Date(datePart);
  const t = new Date(timePart);
  const result = new Date(d);
  result.setHours(t.getHours(), t.getMinutes(), 0, 0);
  return result;
}

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Фолбэк для очень старых WebView без crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function initials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}
